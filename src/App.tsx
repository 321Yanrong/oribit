import { useState, useEffect, useRef, useCallback } from 'react';
import Aegis from 'aegis-web-sdk';
import { AnimatePresence, motion } from 'framer-motion';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useNavStore, useUserStore, useMemoryStore, useLedgerStore, hydrateUserCache } from './store';
import { useAppStore } from './store/app';
import { usePushSetup } from './hooks/useOneSignal';
import { supabase, getProfile, saveInviteCode } from './api/supabase';
import { clearOrbitStorage, isLikelyInvalidSession, ORBIT_AUTH_INVALID_EVENT } from './utils/auth';
import BottomNav, { BOTTOM_NAV_CONTENT_GAP } from './components/BottomNav';
import AuthModal from './components/AuthModal';
import PWABanners from './components/PWABanners';
import MapPage from './pages/MapPage';
import MemoryStreamPage from './pages/MemoryStreamPage';
import ErrorBoundary from './components/ErrorBoundary';
import LedgerPage from './pages/LedgerPage';
import ProfilePage from './pages/ProfilePage';
import { shouldAllowRefresh, readSettings, SETTINGS_EVENT, setCachedConnectionType } from './utils/settings';
import { Analytics } from '@vercel/analytics/react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useAppWakeUp } from './hooks/useAppWakeUp';
import { Network } from '@capacitor/network';
import { runForegroundNetworkProbe } from './utils/webViewNetworkProbe';

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
  id: import.meta.env.VITE_AEGIS_ID as string,
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

// 1. 新增这个沉浸式状态栏的 Hook
const useNativeStatusBar = () => {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const initStatusBar = async () => {
        try {
          await StatusBar.setOverlaysWebView({ overlay: true });
          await StatusBar.setStyle({ style: Style.Dark });
        } catch (e) {
          console.warn('沉浸式状态栏初始化失败:', e);
        }
      };
      initStatusBar();
    }
  }, []);
};

const useNativeKeyboardGuard = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const configureKeyboard = async () => {
      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      } catch (err) {
        console.warn('Keyboard resize guard failed:', err);
      }
    };
    configureKeyboard();

    // When keyboard appears, scroll the focused input into view so it's not covered
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 350);
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);
};

const applyThemeFromSettings = (settings: ReturnType<typeof readSettings>) => {
  if (typeof document === 'undefined') return;

  const fontSize = settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '18px' : '16px';
  document.documentElement.style.fontSize = fontSize;

  const isSystemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = settings.themeMode || 'system';

  let finalTheme: 'light' | 'dark' | string = 'light';
  if (mode === 'system') {
    finalTheme = isSystemDark ? 'dark' : 'light';
  } else {
    finalTheme = mode;
  }

  document.documentElement.dataset.theme = finalTheme;
  document.body.style.backgroundColor = finalTheme === 'dark' ? '#0b1324' : '#ffffff';
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: finalTheme === 'dark' ? Style.Light : Style.Dark }).catch((err) => {
      console.warn('StatusBar setStyle failed:', err);
    });
    Capacitor.Plugins.ThemeSync?.setTheme({ theme: finalTheme }).catch(() => {});
  }
};

/** 与 applyThemeFromSettings 一致，供组件使用实色背景（地图页会把 --app-root-bg 设为 transparent） */
const resolveThemeForUi = (settings: ReturnType<typeof readSettings>): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = settings.themeMode || 'system';
  if (mode === 'system') return isSystemDark ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
};

function App() {
  const triggerResume = useAppStore((state) => state.triggerResume);
  const resumeTrigger = useAppStore((state) => state.resumeTrigger);
  // 注入心脏起搏器，代替之前的 usePWAKeeper(triggerResume)
  useAppWakeUp(triggerResume);

  const { currentPage, pendingAnnouncement, setPendingAnnouncement } = useNavStore();
  const { currentUser, setCurrentUser } = useUserStore();
  const [showAuth, setShowAuth] = useState(false);
  const [allowAuthModal, setAllowAuthModal] = useState(false);
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
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' ? resolveThemeForUi(readSettings()) : 'light',
  );
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastRefreshRef = useRef(0);
  const bootstrappedUserRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const shouldShowAuthModal = allowAuthModal && (!currentUser || showAuth);
  useAegisMonitor();
  usePushSetup();
  useNativeStatusBar();
  useNativeKeyboardGuard();

  // Populate the Wi-Fi connection cache using the native Network plugin so that
  // shouldAllowRefresh() / shouldAllowUpload() work correctly on iOS where
  // navigator.connection is not available.
  useEffect(() => {
    Network.getStatus()
      .then(s => setCachedConnectionType(s.connectionType))
      .catch(() => {});

    const listenerPromise = Network.addListener('networkStatusChange', (status) => {
      setCachedConnectionType(status.connectionType);
    });

    return () => {
      listenerPromise.then(handle => handle.remove()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.page = currentPage;
    const root = document.getElementById('root');
    if (root) root.setAttribute('data-page', currentPage);
  }, [currentPage]);

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

  const fetchCoreData = useCallback(async () => {
    await useMemoryStore.getState().fetchMemories();
    console.log('[fetchCoreData] memories 拉取完成，触发评论拉取');
    useMemoryStore.getState().fetchComments();
    useUserStore.getState().fetchFriends();
    useUserStore.getState().fetchPendingRequests();
    useLedgerStore.getState().fetchLedgers();
    console.log('[fetchCoreData] 全部触发完成');
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

  // 初始化主题，并感知系统深浅色切换
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const refreshTheme = (settings: ReturnType<typeof readSettings>) => {
      applyThemeFromSettings(settings);
      setResolvedTheme(resolveThemeForUi(settings));
    };

    refreshTheme(readSettings());

    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<ReturnType<typeof readSettings>>).detail;
      refreshTheme(detail || readSettings());
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => refreshTheme(readSettings());

    window.addEventListener(SETTINGS_EVENT, onSettings as EventListener);
    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    return () => {
      window.removeEventListener(SETTINGS_EVENT, onSettings as EventListener);
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

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

  useEffect(() => {
    if (loading || !firstScreenReady) return;
    if (document.visibilityState !== 'visible') return;

    const timer = setTimeout(() => {
      setAllowAuthModal(true);
    }, 150);

    return () => clearTimeout(timer);
  }, [loading, firstScreenReady]);
  useEffect(() => {
    if (loading) return;
    if (isDemoMode || !currentUser) {
      setFirstScreenReady(true);
    }
  }, [loading, isDemoMode, currentUser]);

  // 全局新手指引：冷启动登录后即弹，不依赖进入“我的”页
  // useEffect(() => {
  //   if (typeof window === 'undefined') return;
  //   if (loading) return;
  //   if (!currentUser?.id) {
  //     setShowNewbieGuide(false);
  //     return;
  //   }
  //   if (isDemoMode) return;
  //   const key = `orbit_newbie_guide_seen:${currentUser.id}`;
  //   const seen = window.localStorage.getItem(key);
  //   if (!seen) {
  //     setShowNewbieGuide(true);
  //     window.localStorage.setItem(key, '1');
  //   }
  // }, [currentUser?.id, isDemoMode, loading]);

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

  // 🚀 全局唤醒响应（终极融合版）：彻底解决切后台回来无限转圈的问题
  useEffect(() => {
    if (resumeTrigger === 0) return;

    let isCancelled = false;

    // 取消之前的定时器，防止多次触发
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
    }

    const performSafeResume = async () => {
      if (isDemoMode || !currentUser) return;

      const backgroundAtEarly = (typeof window !== 'undefined' ? (window as any).__orbit_background_at : null) || 0;
      if (backgroundAtEarly > 0 && Date.now() - backgroundAtEarly > 30 * 60 * 1000) {
        console.log(`🔁 离开超过 ${Math.round((Date.now() - backgroundAtEarly) / 60000)} 分钟，强制重启 App...`);
        window.location.reload();
        return;
      }

      if (backgroundAtEarly > 0) {
        console.log('[App] 从后台恢复流程：已调度 WebView/Supabase 探针（全 Tab 共用，非 MediaUploader 专属）');
      }
      void runForegroundNetworkProbe({ userId: currentUser.id, source: 'resume' });

      // ==========================================
      // 🛡️ 秒切免检通道：离开不足 10 秒直接放行
      // 手机底层网络根本没断，Token 也不可能过期，
      // 强行重连反而会主动破坏正在进行的请求和 WebSocket。
      // ==========================================
      const backgroundAt = (typeof window !== 'undefined' ? (window as any).__orbit_background_at : null) || 0;
      if (backgroundAt > 0) {
        const awayMs = Date.now() - backgroundAt;

        if (awayMs < 10000) {
          console.log(`⚡️ 极速切回（仅离开 ${Math.round(awayMs / 1000)}s），等待网络稳定后轻量刷新...`);
          // Fire a lightweight ping immediately to re-establish TCP during the wait
          void Promise.resolve(
            supabase.from('profiles').select('id', { count: 'exact', head: true })
              .eq('id', currentUser.id).limit(1)
          ).then(() => { (window as any).__orbit_session_valid_until = Date.now() + 30_000; })
            .catch(() => {});
          await new Promise(r => setTimeout(r, 3000));
          if (!isCancelled) {
            // 标记 fetchCoreData 运行时刻，供 tryAutoRefresh 跳过重复刷新
            (window as any).__orbit_last_core_data_refresh = Date.now();
            fetchCoreData();
          }
          return;
        }

        if (awayMs > 5 * 60 * 1000) {
          console.log(`🔄 长时离开（${Math.round(awayMs / 60000)}分钟），静默刷新数据...`);
          try { await supabase.auth.refreshSession(); } catch (e) { /* ignore */ }
          (window as any).__orbit_last_core_data_refresh = Date.now();
          fetchCoreData();
          return;
        }
      }

      // mark last resume time so auth-aware fetch can apply extra grace
      try { (window as any).__orbit_last_resume = Date.now(); } catch (e) { /* ignore */ }
      console.log('⚡️ 接收到长时唤醒信标，等待底层网络恢复...');

      // 0. Fire a pre-warm ping immediately — the TCP handshake starts while we
      //    wait for the 1.2s delay below, so the connection is already established
      //    by the time the user interacts (e.g. clicks "publish").
      const prewarmPing = Promise.resolve(
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('id', currentUser.id).limit(1)
      ).then(() => {
        (window as any).__orbit_session_valid_until = Date.now() + 30_000;
        console.log('[pre-warm] Supabase TCP connection re-established');
      }).catch(() => { /* silent — best-effort */ });

      // 1. 等待底层网络栈苏醒（延长到 1.2s，给手机系统分配 IP 和恢复 TCP 连接的时间）
      await new Promise(resolve => setTimeout(resolve, 1200));
      if (isCancelled) return;

      // 2. 调用 iOS/Android 底层系统 API 检查真实网络连通性
      try {
        const networkStatus = await Network.getStatus();
        if (!networkStatus.connected) {
          console.log('📴 原生系统报告当前无网络，仅回填缓存');
          hydrateUserCache(currentUser.id);
          return;
        }
      } catch (e) {
        // Network 插件调用失败时回退到 navigator.onLine
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          console.log('📴 navigator.onLine 报告断网，仅回填缓存');
          hydrateUserCache(currentUser.id);
          return;
        }
      }
      if (isCancelled) return;

      console.log('🔄 网络已真正连通，开始执行数据抢救...');

      // 3. 清理废弃的 WebSockets 连接
      try {
        await supabase.removeAllChannels();
      } catch (e) { }

      if (isCancelled) return;

      // Ensure the pre-warm ping has settled before we continue
      await prewarmPing;

      // 4. 先填缓存 + 立即拉数据，不等 refreshSession
      hydrateUserCache(currentUser.id);
      fetchCoreData();
      (window as any).__orbit_session_valid_until = Date.now() + 30_000;

      // 5. 按需刷新 Token：只有 token 即将过期（5 分钟内）才触发，
      //    且不阻塞数据拉取，超时 4s 后静默放弃。
      //    原因：refreshSession 走 WebView fetch，App 刚从后台唤醒时
      //    WebView 网络栈可能还未完全恢复，贸然调用会挂 10s 导致感知卡顿。
      const now = Date.now();
      if (now - lastRefreshRef.current > 10 * 1000) {
        lastRefreshRef.current = now;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const expiresAt = session?.expires_at ?? 0;
          const secondsUntilExpiry = expiresAt - Math.floor(now / 1000);
          if (secondsUntilExpiry < 300) {
            // token 5 分钟内到期，异步刷新（不 await，不阻塞）
            Promise.race([
              supabase.auth.refreshSession(),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Refresh Timeout')), 4000))
            ]).then(result => {
              if ((result as any)?.data?.session) {
                console.log('✅ Session 刷新成功，Token 已更新');
              }
            }).catch((e: any) => {
              console.warn('唤醒时刷新 Session 失败（已忽略）:', e?.message || e);
            });
          } else {
            console.log(`⚡️ Token 仍有 ${Math.round(secondsUntilExpiry / 60)} 分钟有效期，跳过 refreshSession`);
          }
        } catch (e: any) {
          console.warn('唤醒时检查 Session 失败（已忽略）:', e?.message || e);
        }
      }
    };

    performSafeResume();

    return () => {
      isCancelled = true;
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
      }
    };
  }, [resumeTrigger, currentUser, isDemoMode, fetchCoreData]);

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
                supabase.from('profiles').update({ avatar_url: cleanUrl }).eq('id', user.id).then(() => { });
              }
              // Fetch all data for this user
              useMemoryStore.getState().fetchMemories();
              useUserStore.getState().fetchFriends();
              useUserStore.getState().fetchPendingRequests();
              useLedgerStore.getState().fetchLedgers();
              // Ensure invite code is always persisted on login
              saveInviteCode(user.id, generateInviteCode(user.id));
              // 🚀 冷启动也触发一次唤醒流程，确保切屏后数据是最新的
              // 延迟 1s 等 fetchMemories 等先跑完，避免重复请求
              setTimeout(() => { if (isMounted) triggerResume(); }, 1000);
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
          const currentUserId = useUserStore.getState().currentUser?.id;
          const isSameUser = currentUserId === session.user.id;
          // Clear previous user's data immediately
          // 只有在真正“切换账号”时，才清空老数据
          if (!isSameUser) {
            useMemoryStore.setState({ memories: [] });
            useLedgerStore.setState({ ledgers: [] });
            useUserStore.setState({ friends: [] });
          }
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

  // const renderPage = () => {
  //   switch (currentPage) {
  //     case 'map':
  //       return <MapPage onFirstScreenReady={() => setFirstScreenReady(true)} />;
  //     case 'memory':
  //       return <MemoryStreamPage />;
  //     case 'ledger':
  //       return <LedgerPage />;
  //     case 'profile':
  //       return <ProfilePage />;
  //     default:
  //       return <MapPage onFirstScreenReady={() => setFirstScreenReady(true)} />;
  //   }
  // };

  // 全局内容区域顶部内边距：
  // - 默认：预留状态栏安全区 + 8px 额外间距，让页面文字不顶在最上方
  // - 演示横幅 / 内测横幅：在安全区基础上叠加各自高度
  const isMapPage = currentPage === 'map';

  const contentPaddingTop = isDemoMode && showEarlyAccessBanner
    ? 'calc(env(safe-area-inset-top, 0px) + 56px)'
    : (isDemoMode || showEarlyAccessBanner
      ? 'calc(env(safe-area-inset-top, 0px) + 28px)'
      : 'calc(env(safe-area-inset-top, 0px) + 8px)');

  const shouldOffsetContent = !isMapPage && (isDemoMode || showEarlyAccessBanner);
  const baseContentPaddingTop = '0px'; // 非地图页在没有横幅时内容直接顶在顶部，地图页始终不预留顶部内边距
  const effectiveContentPaddingTop = isMapPage ? '0px' : (shouldOffsetContent ? contentPaddingTop : baseContentPaddingTop);
  const effectiveContentPaddingBottom = isMapPage ? '0px' : BOTTOM_NAV_CONTENT_GAP;

  return (
    <div
      className="min-h-[100dvh] flex flex-col overflow-x-hidden"
      style={{ backgroundColor: 'var(--app-root-bg)', color: 'var(--orbit-text)' }}
    >
      {loading ? (
        <div
          className="h-[150dvh] flex items-center justify-center"
          style={{ backgroundColor: 'var(--app-root-bg)' }}
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
            <div
              className="fixed left-0 right-0 z-[999] bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white text-xs font-medium py-1.5 text-center flex items-center justify-center gap-2"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}
            >
              <span>✨ 演示模式 — 数据仅供展示，不会保存</span>
              <button
                onClick={() => { setIsDemoMode(false); setCurrentUser(null); useMemoryStore.setState({ memories: [] }); useLedgerStore.setState({ ledgers: [] }); useUserStore.setState({ friends: [] }); setShowAuth(true); }}
                className="underline opacity-80 hover:opacity-100"
              >退出演示</button>
            </div>
          )}

          <main
            className="flex-1 relative overflow-hidden"
            style={{
              height: '100dvh'
            }}
          >
            <div
              className={`absolute inset-0 w-full h-full ${currentPage === 'map' ? 'block z-0' : 'hidden z-[-1]'}`}
              style={{ touchAction: 'none' }}
            >
              {/* 地图组件永远不会被销毁，切换回来时 0 毫秒延迟 */}
              <MapPage onFirstScreenReady={() => setFirstScreenReady(true)} />
            </div>

            <AnimatePresence>
              {currentPage !== 'map' && (
                <motion.div
                  key={currentPage}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  // exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full flex flex-col overflow-hidden"
                  style={{
                    backgroundColor: 'var(--app-root-bg)',
                    paddingTop: effectiveContentPaddingTop,
                    // paddingBottom: effectiveContentPaddingBottom, // 移除这里的 paddingBottom，避免下方露出底色
                    touchAction: 'pan-y',
                  }}
                >
                  {currentPage === 'memory' && (
                    <ErrorBoundary key="memory-page-boundary">
                      <MemoryStreamPage />
                    </ErrorBoundary>
                  )}
                  {currentPage === 'ledger' && <LedgerPage />}
                  {currentPage === 'profile' && <ProfilePage />}
                </motion.div>
              )}
            </AnimatePresence>

            <PWABanners />
          </main>

          {!isSettingsOpen && currentUser && !showAuth && <BottomNav />}

          {swUpdateReady && (
            // <div className="fixed bottom-24 left-4 right-4 z-[9999] rounded-2xl border shadow-lg px-4 py-3 flex items-center justify-between gap-3"
            <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+85px)] left-4 right-4 z-[9999] rounded-2xl border shadow-lg px-4 py-3 flex items-center justify-between gap-3"
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
            <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+85px)] left-4 right-4 z-[9999] bg-red-600 text-white rounded-2xl shadow-lg p-3 flex items-center justify-between gap-3">
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
            {shouldShowAuthModal && (
              <AuthModal onSuccess={() => setShowAuth(false)} onDemo={handleDemo} />
            )}
          </AnimatePresence>

          {/* 推送/公告弹窗：禁止用 --app-root-bg（地图页会设为 transparent，导致透出底图） */}
          <AnimatePresence>
            {pendingAnnouncement && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
                style={{ background: 'rgba(0,0,0,0.55)' }}
                onClick={() => setPendingAnnouncement(null)}
              >
                <motion.div
                  initial={{ scale: 0.88, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.88, opacity: 0, y: 20 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                  onClick={e => e.stopPropagation()}
                  className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
                  style={{
                    background: resolvedTheme === 'dark' ? '#000000' : '#ffffff',
                    border: `1px solid ${resolvedTheme === 'dark' ? '#333333' : '#e5e5e5'}`,
                  }}
                >
                  {/* Header */}
                  <div
                    className="px-6 pt-6 pb-4 flex items-center gap-3 border-b"
                    style={{ borderColor: resolvedTheme === 'dark' ? '#333333' : '#e5e5e5' }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border"
                      style={{
                        background: resolvedTheme === 'dark' ? '#000000' : '#ffffff',
                        borderColor: resolvedTheme === 'dark' ? '#525252' : '#e5e5e5',
                      }}
                    >
                      <span className="text-base leading-none">📣</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[11px] font-medium mb-0.5"
                        style={{ color: resolvedTheme === 'dark' ? '#a3a3a3' : '#525252' }}
                      >
                        官方公告
                      </p>
                      <p
                        className="font-bold text-base leading-tight truncate"
                        style={{ color: resolvedTheme === 'dark' ? '#ffffff' : '#000000' }}
                      >
                        {pendingAnnouncement.title}
                      </p>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-6 py-5">
                    <p
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ color: resolvedTheme === 'dark' ? '#e5e5e5' : '#1a1a1a' }}
                    >
                      {pendingAnnouncement.body}
                    </p>
                  </div>

                  {/* Close button */}
                  <div className="px-6 pb-6">
                    <button
                      type="button"
                      onClick={() => setPendingAnnouncement(null)}
                      className="w-full py-3 rounded-2xl font-semibold text-sm"
                      style={
                        resolvedTheme === 'dark'
                          ? { background: '#ffffff', color: '#000000' }
                          : { background: '#000000', color: '#ffffff' }
                      }
                    >
                      我知道了
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <Analytics />
    </div>
  );
}

export default App;
