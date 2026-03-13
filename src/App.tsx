import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavStore, useUserStore, useMemoryStore, useLedgerStore } from './store';
import { supabase, getProfile, saveInviteCode } from './api/supabase';
import BottomNav from './components/BottomNav';
import AuthModal from './components/AuthModal';
import MapPage from './pages/MapPage';
import MemoryStreamPage from './pages/MemoryStreamPage';
import LedgerPage from './pages/LedgerPage';
import ProfilePage from './pages/ProfilePage';
import GamesPage from './pages/GamesPage';

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

function App() {
  const { currentPage } = useNavStore();
  const { currentUser, setCurrentUser } = useUserStore();
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

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
          photos: ['https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?w=400'],
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
          photos: ['https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400'],
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
          photos: [],
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

useEffect(() => {
    let isMounted = true;

    // 检查用户登录状态
    const checkAuth = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        // 过滤掉原生的获取用户时的 AbortError
        if (authError?.message?.includes('AbortError')) return;

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
            useMemoryStore.setState({ memories: [] });
            useLedgerStore.setState({ ledgers: [] });
            useUserStore.setState({ friends: [] });
          }
        }
      }
    );

    checkAuth();

    return () => {
      isMounted = false; // 组件卸载时，关掉开关
      subscription.unsubscribe();
    };
  }, [setCurrentUser]);

  const renderPage = () => {
    switch (currentPage) {
      case 'map':
        return <MapPage />;
      case 'memory':
        return <MemoryStreamPage />;
      case 'ledger':
        return <LedgerPage />;
      case 'games':
        return <GamesPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <MapPage />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-orbit-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 rounded-full border-4 border-orbit-mint/30 border-t-orbit-mint"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-orbit-black text-white overflow-hidden">
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
      <div className={isDemoMode ? 'pt-7' : ''}>
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
      
      <BottomNav />
      
      {/* 认证模态框 */}
      <AnimatePresence>
        {(!currentUser || showAuth) && (
          <AuthModal onSuccess={() => setShowAuth(false)} onDemo={handleDemo} />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

export default App;
