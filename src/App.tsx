import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavStore, useUserStore } from './store';
import { supabase, getProfile } from './api/supabase';
import BottomNav from './components/BottomNav';
import AuthModal from './components/AuthModal';
import MapPage from './pages/MapPage';
import MemoryStreamPage from './pages/MemoryStreamPage';
import LedgerPage from './pages/LedgerPage';
import ProfilePage from './pages/ProfilePage';

function App() {
  const { currentPage } = useNavStore();
  const { currentUser, setCurrentUser } = useUserStore();
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(true);

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
              if (isMounted) setCurrentUser(profile);
            } else {
              // Profile doesn't exist yet, create temp data
              if (isMounted) {
                console.log('Profile not found, using temp data');
                setCurrentUser({
                  id: user.id,
                  email: user.email || '',
                  username: user.user_metadata?.username || '用户',
                  avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.id}`,
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
                avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.id}`,
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
          try {
            const profile = await getProfile(session.user.id, session.user.email || undefined);
            if (profile) {
              if (isMounted) {
                setCurrentUser(profile);
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
                  avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${session.user.id}`,
                  created_at: new Date().toISOString()
                });
                setShowAuth(false);
              }
            }
          } catch (profileError: any) {
            if (profileError.message?.includes('AbortError') || profileError.name === 'AbortError') return;
            
            if (isMounted) {
              console.log('Profile not found on sign in');
              setCurrentUser({
                id: session.user.id,
                email: session.user.email || '',
                username: session.user.user_metadata?.username || '用户',
                avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${session.user.id}`,
                created_at: new Date().toISOString()
              });
              setShowAuth(false);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setCurrentUser(null);
            setShowAuth(true);
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
          <AuthModal onSuccess={() => setShowAuth(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
