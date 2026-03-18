import { useState, useEffect, useRef, useCallback } from 'react';
import Aegis from 'aegis-web-sdk';
import { AnimatePresence, motion } from 'framer-motion';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useNavStore, useUserStore, useMemoryStore, useLedgerStore, hydrateUserCache } from './store';
import { useAppStore } from './store/app';
import { usePushSetup } from './hooks/useOneSignal';
import { supabase, getProfile, saveInviteCode } from './api/supabase';
import { clearOrbitStorage, isLikelyInvalidSession, ORBIT_AUTH_INVALID_EVENT } from './utils/auth';
import BottomNav from './components/BottomNav';
import AuthModal from './components/AuthModal';
import PWABanners from './components/PWABanners';
import SplashScreen from './components/SplashScreen';
import MapPage from './pages/MapPage';
import MemoryStreamPage from './pages/MemoryStreamPage';
import LedgerPage from './pages/LedgerPage';
import ProfilePage from './pages/ProfilePage';
import GamesPage from './pages/GamesPage';
import { shouldAllowRefresh, readSettings, SETTINGS_EVENT } from './utils/settings';
import { Analytics } from '@vercel/analytics/react';

// Repair old DiceBear URLs that had comma-separated hair values (caused 400 errors)
const sanitiseAvatarUrl = (url: string | null | undefined, userId?: string): string => {
  const fallback = `https://api.dicebear.com/9.x/adventurer/svg?seed=${userId || 'guest'}`;
  if (!url) return fallback;
  if (url.includes('hair=') && url.includes(',')) {
    // Old bad format — rebuild with just the seed
    const seedMatch = url.match(/[?&]seed=([^&,]+)/);
    const seed = seedMatch ? seedMatch[1] : (userId || 'guest');
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
  }
  return url;
};

// Deterministic invite code — same algorithm as ProfilePage
const generateInviteCode = (userId: string): string => {
  const hash = userId.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
  const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, '0');
  return `ORBIT${code.slice(0, 6)}`;
};

const resetClientData = () => {
  useMemoryStore.setState({ memories: [] });
  useLedgerStore.setState({ ledgers: [] });
  useUserStore.setState({ friends: [], pendingRequests: [] });
};

// RUM/日志：在应用层初始化，后续用户登录后再补充 uin
const aegis = new Aegis({
  id: 'nG8gnTK2972Drrb304',
  uin: '',
  reportApiSpeed: true,
  reportAssetSpeed: true,
  spa: true,
});

const useAegisMonitor = () => {
  const { currentUser } = useUserStore();

  useEffect(() => {
    if (currentUser?.id) {
      aegis.setConfig({ uin: currentUser.id });
    }
  }, [currentUser?.id]);
};

const applyThemeFromSettings = (settings: ReturnType<typeof readSettings>) => {
  if (typeof document === 'undefined') return;
  const fontSize = settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '18px' : '16px';
  document.documentElement.style.fontSize = fontSize;

  const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = settings.themeMode || 'system';
  if (mode === 'system') {
    document.documentElement.dataset.theme = isSystemDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = mode;
  }
};

const usePWAKeeper = (onResume: () => void) => {
  const lastHiddenAtRef = useRef<number>(Date.now());
  const hasReloadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 缩短唤醒硬刷新阈值，移动端 30s 即触发，避免长后台假连接
    const HARD_RELOAD_THRESHOLD_MS = 30 * 1000;
    const SESSION_TIMEOUT_MS = 5000;

    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('pwa-keeper-timeout')), ms)),
      ]);
    };

    const shouldHardReload = () => {
      const hiddenFor = Date.now() - lastHiddenAtRef.current;
      const isPickingMedia = sessionStorage.getItem('orbit_picking_media') === 'true';
      if (!hasReloadedRef.current && hiddenFor > HARD_RELOAD_THRESHOLD_MS && !isPickingMedia) {
        return true;
      }
      return false;
    };

    const handleWake = async (reason: string) => {
      if (shouldHardReload()) {
        hasReloadedRef.current = true;
        window.location.reload();
        return;
      }

      sessionStorage.removeItem('orbit_picking_media');

      try {
        await withTimeout(supabase.removeAllChannels(), 4000);
      } catch (err) {
        console.warn('[PWA keeper] removeAllChannels failed:', reason, err);
      }
      try {
        await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
      } catch (err) {
        console.warn('[PWA keeper] getSession failed:', reason, err);
      }
      try {
        await withTimeout(supabase.auth.refreshSession(), SESSION_TIMEOUT_MS);
      } catch (err) {
        console.warn('[PWA keeper] refreshSession failed:', reason, err);
      }
      onResume();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now();
        return;
      }
      void handleWake('visibility');
    };

    const handleOnline = () => {
      sessionStorage.removeItem('orbit_picking_media');
      void handleWake('online');
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [onResume]);
};

function App() {
  const { currentPage } = useNavStore();
  const { currentUser, setCurrentUser } = useUserStore();
  const [showAuth, setShowAuth] = useState(false);
  const [allowAuthModal, setAllowAuthModal] = useState(false); // 避免闪屏期间弹出登录窗
  const [showSplash, setShowSplash] = useState(true);
  const [splashMinimumElapsed, setSplashMinimumElapsed] = useState(false);
  const [firstScreenReady, setFirstScreenReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showEarlyAccessBanner, setShowEarlyAccessBanner] = useState(false);
  const [showNewbieGuide, setShowNewbieGuide] = useState(false);
  const [guideRun, setGuideRun] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastRefreshRef = useRef(0);
  const bootstrappedUserRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const triggerResume = useAppStore((state) => state.triggerResume);
  usePWAKeeper(triggerResume);
  useAegisMonitor();
  usePushSetup();

  // 注册 Service Worker 并监听更新
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        swRegistrationRef.current = reg;

        // 已有 waiting 的 worker（页面加载时）
        if (reg.waiting) {
          setSwUpdateReady(true);
        }

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setSwUpdateReady(true);
            }
          });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      } catch (err) {
        console.warn('SW register failed', err);
      }
    };

    registerSW();
  }, []);

  const activateSwUpdate = useCallback(() => {
    const waiting = swRegistrationRef.current?.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, []);

  const fetchCoreData = useCallback(() => {
    useMemoryStore.getState().fetchMemories();
    useUserStore.getState().fetchFriends();
    useUserStore.getState().fetchPendingRequests();
    useLedgerStore.getState().fetchLedgers();
  }, []);

  const refreshSessionAndData = useCallback(async (reason: string) => {
    if (isDemoMode) return;
    try {
      await supabase.removeAllChannels();
    } catch (err) {
      console.warn('[session-refresh] removeAllChannels failed:', reason, err);
    }
    try {
      await supabase.auth.refreshSession();
      fetchCoreData();
      setSessionInvalid(false);
    } catch (err) {
      console.warn('[session-refresh] refreshSession failed:', reason, err);
      setSessionInvalid(true);
    }
  }, [fetchCoreData, isDemoMode]);

  const onboardingSteps: Step[] = [
    {
      target: '[data-tour-id="nav-memory"]',
      content: '从这里进入「记忆流」主页，看看朋友们的最新动态。',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour-id="memory-create"]',
      content: '点这里「记录此刻」，开始创建你的第一条回忆。',
      placement: 'top',
      spotlightClicks: true,
    },
    {
      target: '[data-tour-id="memory-editor"]',
      content: '在这里写下文字，或继续添加照片、语音、地点和好友标签。',
      placement: 'top',
      spotlightClicks: true,
    },
    {
      target: '[data-tour-id="memory-submit"]',
      content: '准备好后点击发布，回忆就会出现在时间线里啦。',
      placement: 'bottom',
      spotlightClicks: true,
    },
  ];

  // 初始化主题，避免首屏落在深色
  useEffect(() => {
    const settings = readSettings();
    applyThemeFromSettings(settings);

    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<ReturnType<typeof readSettings>>).detail;
      applyThemeFromSettings(detail || readSettings());
    };
    window.addEventListener(SETTINGS_EVENT, onSettings as EventListener);
    return () => window.removeEventListener(SETTINGS_EVENT, onSettings as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SPLASH_MIN_DURATION = 2500;
    const splashTimer = window.setTimeout(() => {
      setSplashMinimumElapsed(true);
    }, SPLASH_MIN_DURATION);

    const startOnboarding = () => {
      setShowNewbieGuide(true);
      setGuideRun(true);
      setGuideStepIndex(0);
    };

    window.addEventListener('orbit:start-onboarding', startOnboarding);

    const hostname = window.location.hostname.toLowerCase();
    const referrer = (document.referrer || '').toLowerCase();
    const fromWehihiHost = hostname === 'wehihi.com' || hostname.endsWith('.wehihi.com');
    const fromWehihiReferrer = referrer.includes('://wehihi.com') || referrer.includes('.wehihi.com');

    if (fromWehihiHost || fromWehihiReferrer) {
      setShowEarlyAccessBanner(true);
    }

    return () => {
      window.clearTimeout(splashTimer);
      window.removeEventListener('orbit:start-onboarding', startOnboarding);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSettingsVisibility = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setIsSettingsOpen(Boolean(detail));
    };
    window.addEventListener('orbit:settings-visibility', handleSettingsVisibility as EventListener);
    return () => {
      window.removeEventListener('orbit:settings-visibility', handleSettingsVisibility as EventListener);
    };
  }, []);

  // 只有当加载完成且最短展示时间结束后才收起闪屏，避免加载过程外露
  useEffect(() => {
    if (!splashMinimumElapsed || loading || !firstScreenReady || !showSplash) return;
    const AUTH_DELAY = 500;
    setShowSplash(false);
    const authTimer = window.setTimeout(() => setAllowAuthModal(true), AUTH_DELAY);
    return () => window.clearTimeout(authTimer);
  }, [splashMinimumElapsed, loading, firstScreenReady, showSplash]);

  // 非登录态或演示模式下不阻塞闪屏
  useEffect(() => {
    if (loading) return;
    if (isDemoMode || !currentUser) {
      setFirstScreenReady(true);
    }
  }, [loading, isDemoMode, currentUser]);

  // 全局新手指引：冷启动登录后即弹，不依赖进入“我的”页
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loading) return;
    if (!currentUser?.id) {
      setShowNewbieGuide(false);
      return;
    }
    if (isDemoMode) return;
    const key = `orbit_newbie_guide_seen:${currentUser.id}`;
    const seen = window.localStorage.getItem(key);
    if (!seen) {
      setShowNewbieGuide(true);
      window.localStorage.setItem(key, '1');
    }
  }, [currentUser?.id, isDemoMode, loading]);

  useEffect(() => {
    if (!showNewbieGuide) return;
    setGuideRun(true);
    setGuideStepIndex(0);
  }, [showNewbieGuide]);

  // 🚑 兜底：加载完后如果没有用户也不是演示模式，强制弹出登录框
  useEffect(() => {
    if (loading) return;
    if (!currentUser && !isDemoMode) {
      setAllowAuthModal(true);
      setShowAuth(true);
    }
  }, [loading, currentUser, isDemoMode]);

  // 前台可见即尝试刷新 Session + 重拉核心数据，解决短暂后台后假连接的问题
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshSessionAndData('visibility');
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshSessionAndData]);

  const attemptReconnect = async () => {
    setSessionInvalid(false);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data?.session?.user) throw error || new Error('no-session');
      const user = data.session.user;
      const profile = await getProfile(user.id, user.email || undefined);
      if (profile) {
        setCurrentUser({ ...profile, avatar_url: sanitiseAvatarUrl(profile.avatar_url, user.id) });
        setShowAuth(false);
      }
      useMemoryStore.getState().fetchMemories();
      useUserStore.getState().fetchFriends();
      useUserStore.getState().fetchPendingRequests();
      useLedgerStore.getState().fetchLedgers();
      saveInviteCode(user.id, generateInviteCode(user.id));
    } catch (e) {
      console.warn('Reconnect failed, clearing session', e);
      try { await supabase.auth.signOut({ scope: 'local' }); } catch {
        // ignore
      }
      clearOrbitStorage();
      resetClientData();
      setCurrentUser(null);
      setShowAuth(true);
    }
  };

  const handleJoyrideCallback = ({ action, index, status, type }: CallBackProps) => {
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setGuideRun(false);
      setShowNewbieGuide(false);
      setGuideStepIndex(0);
      return;
    }
    if (type === 'step:after') {
      if (action === 'next') setGuideStepIndex(index + 1);
      if (action === 'prev') setGuideStepIndex(Math.max(index - 1, 0));
    }
  };

  // 登录态兜底：应用重开时保证缓存回填 + 核心数据拉取
  useEffect(() => {
    if (!currentUser?.id || isDemoMode) return;
    if (bootstrappedUserRef.current === currentUser.id) return;
    bootstrappedUserRef.current = currentUser.id;

    hydrateUserCache(currentUser.id);
    if (shouldAllowRefresh()) {
      useMemoryStore.getState().fetchMemories();
      useUserStore.getState().fetchFriends();
      useUserStore.getState().fetchPendingRequests();
      useLedgerStore.getState().fetchLedgers();
    }
  }, [currentUser?.id, isDemoMode]);

  // 页面从后台 / bfcache 回到前台时，若状态被系统回收则自动重拉
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rehydrateIfEmpty = async () => {
      const { currentUser } = useUserStore.getState();
      if (!currentUser) return;

      // 尝试从缓存回填
      hydrateUserCache(currentUser.id);

      if (!shouldAllowRefresh()) return;

      // 前台恢复时先刷新会话，避免“断线”后全部清空
      const now = Date.now();
      // 缩短会话刷新节流，移动端唤醒 30s 内也刷新一次
      if (now - lastRefreshRef.current > 30 * 1000) {
        lastRefreshRef.current = now;
        try {
          await supabase.auth.getSession();
          await supabase.auth.refreshSession();
        } catch {
          // ignore
        }
      }

      const { memories, fetchMemories } = useMemoryStore.getState();
      if (!memories || memories.length === 0) fetchMemories();

      const { friends, fetchFriends } = useUserStore.getState();
      if (!friends || friends.length === 0) fetchFriends();

      const { ledgers, fetchLedgers } = useLedgerStore.getState();
      if (!ledgers || ledgers.length === 0) fetchLedgers();
    };

    const handleResume = () => {
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
      }
      resumeTimerRef.current = window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          void rehydrateIfEmpty();
          triggerResume();
        }
      }, 800);
    };

    const handleOnline = () => {
      if (document.visibilityState === 'visible') {
        void rehydrateIfEmpty();
        triggerResume();
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('online', handleOnline);
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
      }
    };
  }, [triggerResume]);



  const handleDemo = () => {
    // 演示用户
    const demoUser = {
      id: 'demo-user',
      email: 'demo@orbit.app',
      username: '演示用户',
      avatar_url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=demo&backgroundColor=b6e3f4',
      created_at: new Date().toISOString(),
      invite_code: 'DEMO01',
    };
    setCurrentUser(demoUser);

    // 演示好友
    useUserStore.setState({
      friends: [
        {
          id: 'demo-friend-1',
          user_id: 'demo-user',
          friend_id: 'demo-f1',
          friend_name: '小林',
          remark: '',
          status: 'accepted',
          created_at: new Date().toISOString(),
          friend: {
            id: 'demo-f1',
            username: '小林',
            real_username: '小林',
            avatar_url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=xiaoLin&backgroundColor=ffd5dc',
          }
        },
        {
          id: 'demo-friend-2',
          user_id: 'demo-user',
          friend_id: 'demo-f2',
          friend_name: '阿杰',
          remark: '我的旅伴',
          status: 'accepted',
          created_at: new Date().toISOString(),
          friend: {
            id: 'demo-f2',
            username: '我的旅伴',
            real_username: '阿杰',
            avatar_url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=aJie&backgroundColor=c0aede',
          }
        },
      ]
    });

    // 演示记忆
    useMemoryStore.setState({
      memories: [
        {
          id: 'demo-m1',
          user_id: 'demo-user',
          content: '今天在外滩和朋友拍了好多照片！海风吹得头发乱飞，但笑容都是真实的 🌊',
          memory_date: '2026-03-10T14:00:00Z',
          created_at: '2026-03-10T14:00:00Z',
          location_id: 'demo-loc1',
          photos: [
            'https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=1400&q=80',
            'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=80',
            'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1400&q=80'
          ],
          videos: [], audios: [],
          tagged_friends: ['demo-f1', 'demo-f2'],
          has_ledger: true,
          ledger_id: 'demo-l1',
          is_owner: true,
          location: { id: 'demo-loc1', name: '外滩', address: '上海市黄浦区中山东一路', lat: 31.2397, lng: 121.4901, category: '景点' },
        },
        {
          id: 'demo-m2',
          user_id: 'demo-user',
          content: '探索了一家藏在弄堂里的咖啡馆，手冲耶加雪菲配上老上海的砖墙，完美 ☕',
          memory_date: '2026-03-08T10:30:00Z',
          created_at: '2026-03-08T10:30:00Z',
          location_id: 'demo-loc2',
          photos: [
            'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80'
          ],
          videos: [], audios: [],
          tagged_friends: ['demo-f1'],
          has_ledger: false,
          is_owner: true,
          location: { id: 'demo-loc2', name: '弄堂咖啡', address: '上海市静安区愚园路', lat: 31.2235, lng: 121.4431, category: '咖啡厅' },
        },
        {
          id: 'demo-m3',
          user_id: 'demo-user',
          content: '香港夜市觅食记，鱼蛋咖喱 + 格仔饼，老香港味道永远治愈 🍢',
          memory_date: '2026-02-20T19:00:00Z',
          created_at: '2026-02-20T19:00:00Z',
          location_id: 'demo-loc3',
          photos: [
            'https://images.unsplash.com/photo-1508057198894-247b23fe5ade?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1000&q=80&sat=-10'
          ],
          videos: [], audios: [],
          tagged_friends: ['demo-f2'],
          has_ledger: true,
          ledger_id: 'demo-l2',
          is_owner: true,
          location: { id: 'demo-loc3', name: '庙街夜市', address: '香港油麻地庙街', lat: 22.3064, lng: 114.1694, category: '美食' },
        },
      ]
    });

    // 演示账单
    useLedgerStore.setState({
      ledgers: [
        {
          id: 'demo-l1',
          creator_id: 'demo-user',
          total_amount: 368,
          currency: 'RMB',
          memory_id: 'demo-m1',
          expense_type: 'shared',
          status: 'pending',
          created_at: '2026-03-10T14:00:00Z',
          participants: [
            { user_id: 'demo-user', amount: 122.67, paid: true },
            { user_id: 'demo-f1', amount: 122.67, paid: false },
            { user_id: 'demo-f2', amount: 122.67, paid: false },
          ]
        },
        {
          id: 'demo-l2',
          creator_id: 'demo-user',
          total_amount: 85,
          currency: 'HKD',
          memory_id: 'demo-m3',
          expense_type: 'personal',
          status: 'settled',
          created_at: '2026-02-20T19:00:00Z',
          participants: [
            { user_id: 'demo-user', amount: 85, paid: true },
          ]
        }
      ]
    });

    setIsDemoMode(true);
    setShowAuth(false);
  };

  // 自动进入演示模式（仅供截图/演示用），避免登录态干扰
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loading || isDemoMode) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      handleDemo();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isDemoMode]);

  useEffect(() => {
    let isMounted = true;
    let invalidSessionHandled = false;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const handleInvalidSession = async (reason: string) => {
      if (invalidSessionHandled) return;
      invalidSessionHandled = true;
      console.warn('Detected invalid auth/session token, clearing Orbit caches.', reason);
      try {
        const attemptRefresh = async () => {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed?.session?.user) {
            const user = refreshed.session.user;
            const profile = await getProfile(user.id, user.email || undefined);
            if (profile && isMounted) {
              setCurrentUser({ ...profile, avatar_url: sanitiseAvatarUrl(profile.avatar_url, user.id) });
              setShowAuth(false);
            }
            useMemoryStore.getState().fetchMemories();
            useUserStore.getState().fetchFriends();
            useUserStore.getState().fetchPendingRequests();
            useLedgerStore.getState().fetchLedgers();
            saveInviteCode(user.id, generateInviteCode(user.id));
            invalidSessionHandled = false;
            return true;
          }
          return false;
        };

        if (await attemptRefresh()) return;
        await delay(1200);
        if (await attemptRefresh()) return;
      } catch (e) {
        console.warn('Session refresh failed, clearing local session:', e);
      }
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
        console.warn('Sign out while clearing stale session failed:', e);
      }
      clearOrbitStorage();
      resetClientData();
      if (isMounted) {
        setIsDemoMode(false);
        useNavStore.setState({ currentPage: 'map' });
        setCurrentUser(null);
        setShowAuth(true);
        setLoading(false);
      }
    };

    const onInvalidAuthEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      setSessionInvalid(true);
      void handleInvalidSession(detail?.reason || 'interceptor-invalid-token');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(ORBIT_AUTH_INVALID_EVENT, onInvalidAuthEvent as EventListener);
    }

    // 检查用户登录状态
    const checkAuth = async () => {
      try {
        // 先检查 Session 状态，出现无效/过期 Token 时自动清除缓存，避免“清浏览器缓存才能进”的情况
        const { error: sessionError } = await supabase.auth.getSession();
        if (sessionError && isLikelyInvalidSession(sessionError.message)) {
          await handleInvalidSession('getSession error');
          return;
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        // 过滤掉原生的获取用户时的 AbortError
        if (authError?.message?.includes('AbortError')) return;
        if (authError && isLikelyInvalidSession(authError.message)) {
          await handleInvalidSession('getUser invalid');
          return;
        }

        if (user) {
          try {
            const profile = await getProfile(user.id, user.email || undefined);
            if (profile) {
              const cleanUrl = sanitiseAvatarUrl(profile.avatar_url, user.id);
              if (isMounted) setCurrentUser({ ...profile, avatar_url: cleanUrl });
              // Silently patch the DB if the stored URL was the old broken format
              if (cleanUrl !== profile.avatar_url) {
                supabase.from('profiles').update({ avatar_url: cleanUrl }).eq('id', user.id).then(() => {});
              }
              // Fetch all data for this user
              useMemoryStore.getState().fetchMemories();
              useUserStore.getState().fetchFriends();
              useUserStore.getState().fetchPendingRequests();
              useLedgerStore.getState().fetchLedgers();
              // Ensure invite code is always persisted on login
              saveInviteCode(user.id, generateInviteCode(user.id));
            } else {
              // Profile doesn't exist yet, create temp data
              if (isMounted) {
                console.log('Profile not found, using temp data');
                setCurrentUser({
                  id: user.id,
                  email: user.email || '',
                  username: user.user_metadata?.username || '用户',
                  avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${user.id}`,
                  created_at: new Date().toISOString()
                });
              }
            }
          } catch (profileError: any) {
            // 🚨 核心拦截：如果是因为严格模式抢锁导致的报错，直接无视，不往下走！
            if (profileError.message?.includes('AbortError') || profileError.name === 'AbortError') {
              return; 
            }
            if (isLikelyInvalidSession(profileError.message)) {
              await handleInvalidSession('profile fetch invalid');
              return;
            }
            
            if (isMounted) {
              // Profile不存在，创建临时用户数据
              console.log('Profile not found, using temp data');
              setCurrentUser({
                id: user.id,
                email: user.email || '',
                username: user.user_metadata?.username || '用户',
                avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${user.id}`,
                created_at: new Date().toISOString()
              });
            }
          }
        } else {
          if (isMounted) setShowAuth(true);
        }
      } catch (error: any) {
        if (error.message?.includes('AbortError') || error.name === 'AbortError') return;
        if (isLikelyInvalidSession(error.message)) {
          await handleInvalidSession('checkAuth outer invalid');
          return;
        }
        
        if (isMounted) {
          console.error('Auth check failed:', error);
          setShowAuth(true);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // 避免和初始化的 checkAuth 撞车
        if (event === 'INITIAL_SESSION') return; 

        if (event === 'SIGNED_IN' && session?.user) {
          // Clear previous user's data immediately
          useMemoryStore.setState({ memories: [] });
          useLedgerStore.setState({ ledgers: [] });
          useUserStore.setState({ friends: [] });
          try {
            const profile = await getProfile(session.user.id, session.user.email || undefined);
            if (profile) {
              if (isMounted) {
                setCurrentUser({ ...profile, avatar_url: sanitiseAvatarUrl(profile.avatar_url, session.user.id) });
                setShowAuth(false);
              }
            } else {
              // Profile doesn't exist
              if (isMounted) {
                console.log('Profile not found on sign in');
                setCurrentUser({
                  id: session.user.id,
                  email: session.user.email || '',
                  username: session.user.user_metadata?.username || '用户',
                  avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${session.user.id}`,
                  created_at: new Date().toISOString()
                });
                setShowAuth(false);
              }
            }
            // Fetch all data for the newly signed-in user
            useMemoryStore.getState().fetchMemories();
            useUserStore.getState().fetchFriends();
            useUserStore.getState().fetchPendingRequests();
            useLedgerStore.getState().fetchLedgers();
            // Ensure invite code is persisted
            saveInviteCode(session.user.id, generateInviteCode(session.user.id));
          } catch (profileError: any) {
            if (profileError.message?.includes('AbortError') || profileError.name === 'AbortError') return;
            
            if (isMounted) {
              console.log('Profile not found on sign in');
              setCurrentUser({
                id: session.user.id,
                email: session.user.email || '',
                username: session.user.user_metadata?.username || '用户',
                avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${session.user.id}`,
                created_at: new Date().toISOString()
              });
              setShowAuth(false);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setCurrentUser(null);
            setShowAuth(true);
            // Clear all data so next user starts fresh
            resetClientData();
          }
        }
      }
    );

    checkAuth();

    return () => {
      isMounted = false; // 组件卸载时，关掉开关
      if (typeof window !== 'undefined') {
        window.removeEventListener(ORBIT_AUTH_INVALID_EVENT, onInvalidAuthEvent as EventListener);
      }
      subscription.unsubscribe();
    };
  }, [setCurrentUser]);

  const renderPage = () => {
    switch (currentPage) {
      case 'map':
        return <MapPage onFirstScreenReady={() => setFirstScreenReady(true)} />;
      case 'memory':
        return <MemoryStreamPage />;
      case 'ledger':
        return <LedgerPage />;
      case 'games':
        return <GamesPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <MapPage onFirstScreenReady={() => setFirstScreenReady(true)} />;
    }
  };

  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--orbit-surface, #ffffff)', color: 'var(--orbit-text, #0f172a)' }}
    >
      {loading ? (
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: 'var(--orbit-surface, #ffffff)' }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 rounded-full border-4"
            style={{ borderColor: 'var(--orbit-border, #e5e7eb)', borderTopColor: '#111827' }}
          />
        </div>
      ) : (
        <>
          {/* 演示模式横幅 */}
          {isDemoMode && (
            <div className="fixed top-0 left-0 right-0 z-[999] bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white text-xs font-medium py-1.5 text-center flex items-center justify-center gap-2">
              <span>✨ 演示模式 — 数据仅供展示，不会保存</span>
              <button
                onClick={() => { setIsDemoMode(false); setCurrentUser(null); useMemoryStore.setState({ memories: [] }); useLedgerStore.setState({ ledgers: [] }); useUserStore.setState({ friends: [] }); setShowAuth(true); }}
                className="underline opacity-80 hover:opacity-100"
              >退出演示</button>
            </div>
          )}
          {showEarlyAccessBanner && (
            <div className={`fixed left-0 right-0 ${isDemoMode ? 'top-7' : 'top-0'} z-[998] bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-[#06231c] text-xs font-semibold py-1.5 text-center flex items-center justify-center gap-2`}>
              <span>🎉 欢迎参与 Orbit 早期内测</span>
              <button
                onClick={() => setShowEarlyAccessBanner(false)}
                className="underline opacity-80 hover:opacity-100"
              >知道了</button>
            </div>
          )}
          <div className={isDemoMode && showEarlyAccessBanner ? 'pt-14' : (isDemoMode || showEarlyAccessBanner ? 'pt-7' : '')}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {renderPage()}
              </motion.div>
            </AnimatePresence>
            
            {!isSettingsOpen && <BottomNav />}
            <PWABanners />
            {swUpdateReady && (
              <div className="fixed bottom-24 left-4 right-4 z-[9999] rounded-2xl border shadow-lg px-4 py-3 flex items-center justify-between gap-3"
                style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
              >
                <div className="text-sm font-semibold">发现新版本，点击刷新立即使用</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSwUpdateReady(false)}
                    className="text-xs px-3 py-1 rounded-full border"
                    style={{ borderColor: 'var(--orbit-border)', color: 'var(--orbit-text-muted, #9ca3af)' }}
                  >稍后</button>
                  <button
                    onClick={activateSwUpdate}
                    className="text-xs px-3 py-1 rounded-full font-semibold"
                    style={{ background: 'linear-gradient(90deg, #00FFB3, #00D9FF)', color: '#0f172a' }}
                  >刷新</button>
                </div>
              </div>
            )}
            {sessionInvalid && (
              <div className="fixed bottom-16 left-4 right-4 z-[9999] bg-red-600 text-white rounded-2xl shadow-lg p-3 flex items-center justify-between gap-3">
                <div className="text-sm font-medium">登录状态已失效，请重新连接</div>
                <button
                  onClick={attemptReconnect}
                  className="bg-white text-red-600 font-semibold px-3 py-1 rounded-full text-sm shadow-sm"
                >重新连接</button>
              </div>
            )}
            <Joyride
              steps={onboardingSteps}
              run={guideRun}
              stepIndex={guideStepIndex}
              continuous
              showSkipButton
              showProgress
              scrollToFirstStep
              disableScrolling
              spotlightClicks
              callback={handleJoyrideCallback}
              styles={{ options: { zIndex: 9999 } }}
            />
            
            {/* 认证模态框 */}
            <AnimatePresence>
              {allowAuthModal && (!currentUser || showAuth) && (
                <AuthModal onSuccess={() => setShowAuth(false)} onDemo={handleDemo} />
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* 闪屏：覆盖全局，掩护首屏加载 */}
      <AnimatePresence>
        {showSplash && <SplashScreen />}
      </AnimatePresence>

      <Analytics />
    </div>
  );
}

export default App;
