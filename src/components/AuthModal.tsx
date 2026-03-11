import { useState } from 'react';
import { motion } from 'framer-motion';
import { FaEnvelope, FaLock, FaUser, FaArrowRight, FaSpinner } from 'react-icons/fa';
import { supabase, signUp, signIn } from '../api/supabase';
import { useUserStore } from '../store';

interface AuthModalProps {
  onSuccess: () => void;
}

export default function AuthModal({ onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { setCurrentUser } = useUserStore();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      if (isLogin) {
        const { user } = await signIn(email, password);
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          if (profile) {
            setCurrentUser(profile);
          }
          onSuccess();
        }
      } else {
        if (!username.trim()) {
          throw new Error('请输入用户名');
        }
        await signUp(email, password, username);
        setError('注册成功！请检查邮箱验证后登录。');
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-orbit-black p-4"
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute inset-0 opacity-40"
          style={{
            background: `
              radial-gradient(circle at 30% 20%, rgba(255, 20, 147, 0.35) 0%, transparent 50%),
              radial-gradient(circle at 70% 80%, rgba(192, 38, 211, 0.25) 0%, transparent 45%),
              radial-gradient(circle at 50% 50%, rgba(255, 105, 180, 0.15) 0%, transparent 60%)
            `
          }}
        />
      </div>
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md glass-card rounded-3xl p-8"
      >
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="mx-auto mb-4"
          >
            <img src="/lineart-dog.png" alt="Orbit" className="w-28 h-28 object-contain drop-shadow-2xl" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mb-2">Orbit 轨迹</h1>
          <p className="text-white/50">记录与好友的每一个足迹 ✨</p>
        </div>
        
        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <label className="block text-white/60 text-sm mb-2">用户名</label>
              <div className="relative">
                <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-glass pl-12"
                  placeholder="你的昵称"
                />
              </div>
            </motion.div>
          )}
          
          <div>
            <label className="block text-white/60 text-sm mb-2">邮箱</label>
            <div className="relative">
              <FaEnvelope className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-glass pl-12"
                placeholder="your@email.com"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-white/60 text-sm mb-2">密码</label>
            <div className="relative">
              <FaLock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-glass pl-12"
                placeholder="至少6位密码"
                minLength={6}
                required
              />
            </div>
          </div>
          
          {/* 错误提示 */}
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: error ? 'auto' : 0, opacity: error ? 1 : 0 }}
            className={`overflow-hidden rounded-xl text-sm ${
              error?.includes('成功') 
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            <p className="p-3">{error}</p>
          </motion.div>
          
          {/* 提交按钮 */}
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3 px-6 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-semibold flex items-center justify-center gap-2 mt-6 disabled:opacity-50 transition-all shadow-lg shadow-pink-500/20"
          >
            {loading ? (
              <>
                <FaSpinner className="w-5 h-5 animate-spin" />
                <span>处理中...</span>
              </>
            ) : (
              <>
                <span>{isLogin ? '登录' : '注册'}</span>
                <FaArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>
        </form>
        
        {/* 切换登录/注册 */}
        <div className="text-center mt-6">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-white/50 hover:text-pink-400 transition-colors"
          >
            {isLogin ? '还没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>
        
        {/* 演示模式 */}
        <div className="mt-6 pt-6 border-t border-white/10">
          <button
            onClick={onSuccess}
            className="w-full py-3 text-white/40 hover:text-white/60 text-sm transition-colors"
          >
            暂不登录，先看看演示 ✨
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
