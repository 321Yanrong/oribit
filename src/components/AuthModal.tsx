import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaEnvelope, FaLock, FaUser, FaArrowRight, FaSpinner } from 'react-icons/fa';
import { supabase, signUp, signIn, sendPasswordReset, updatePasswordAfterRecovery } from '../api/supabase';
import { useUserStore } from '../store';

const EMAIL_ACTION_COOLDOWN_MS = 60 * 1000;

const getEmailActionCooldownKey = (action: 'signup' | 'reset', email: string) =>
  `orbit_email_cooldown:${action}:${email.trim().toLowerCase()}`;

const getEmailActionRemainingMs = (action: 'signup' | 'reset', email: string) => {
  if (typeof window === 'undefined') return 0;
  const key = getEmailActionCooldownKey(action, email);
  const lastTs = Number(localStorage.getItem(key) || 0);
  const remain = EMAIL_ACTION_COOLDOWN_MS - (Date.now() - lastTs);
  return remain > 0 ? remain : 0;
};

const markEmailActionTriggered = (action: 'signup' | 'reset', email: string) => {
  if (typeof window === 'undefined') return;
  const key = getEmailActionCooldownKey(action, email);
  localStorage.setItem(key, String(Date.now()));
};

interface AuthModalProps {
  onSuccess: () => void;
  onDemo: () => void;
}

export default function AuthModal({ onSuccess, onDemo }: AuthModalProps) {
  const isLightMode = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  const textPrimary = isLightMode ? 'text-neutral-900' : 'text-white';
  const textMuted = isLightMode ? 'text-neutral-600' : 'text-white/60';
  const iconColor = isLightMode ? 'text-neutral-400' : 'text-white/30';
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const { setCurrentUser } = useUserStore();

  useEffect(() => {
    const detectRecoveryFromUrl = () => {
      if (typeof window === 'undefined') return false;
      const queryParams = new URLSearchParams(window.location.search);
      const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const hashParams = new URLSearchParams(hashRaw);

      const queryType = queryParams.get('type') || queryParams.get('mode');
      const hashType = hashParams.get('type') || hashParams.get('mode');
      const hasAccessToken = Boolean(hashParams.get('access_token'));

      return queryType === 'recovery' || queryType === 'reset-password' || hashType === 'recovery' || hashType === 'reset-password' || hasAccessToken;
    };

    if (detectRecoveryFromUrl()) {
      setIsRecoveryMode(true);
      setError('🔐 欢迎回来，设置一个新密码就好啦～');
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
        setError('🔐 已进入密码重置模式，请设置新密码');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearRecoveryUrlMarks = () => {
    if (typeof window === 'undefined') return;
    const clean = window.location.pathname;
    window.history.replaceState({}, document.title, clean);
  };

  const handleCompleteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingPassword(true);
    setError(null);
    try {
      if (newPassword.length < 6) {
        throw new Error('新密码至少需要 6 位');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('两次输入的新密码不一致');
      }
      await updatePasswordAfterRecovery(newPassword);
      setError('✅ 密码更新成功，已经帮你回到 Orbit 啦！');
      setIsRecoveryMode(false);
      setNewPassword('');
      setConfirmPassword('');
      clearRecoveryUrlMarks();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || '密码更新失败，请重试');
    } finally {
      setUpdatingPassword(false);
    }
  };

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
        if (!agreed) {
          throw new Error('请先勾选同意用户协议');
        }
        if (!username.trim()) {
          throw new Error('请输入用户名');
        }
        if (password.length < 6) {
          throw new Error('密码至少需要 6 位');
        }

        const signupCooldown = getEmailActionRemainingMs('signup', email);
        if (signupCooldown > 0) {
          const seconds = Math.ceil(signupCooldown / 1000);
          throw new Error(`邮件发送太频繁，请 ${seconds} 秒后再试`);
        }

        const { betaJoinOrder } = await signUp(email, password, username, '');
        markEmailActionTriggered('signup', email);
        setError(`✅ 注册成功！你是第 ${betaJoinOrder}/50 位内测用户，请前往邮箱点击验证链接，再回来登录。`);
        setIsLogin(true);
      }
    } catch (err: any) {
      const msg: string = err?.message || '';
      const code: string = err?.code || '';
      if (msg.includes('Email not confirmed')) {
        setError('📧 邮箱尚未验证，请先点击注册邮件中的链接');
      } else if (msg.includes('User already registered') || msg.includes('already been registered')) {
        setError('该邮箱已注册，请直接登录');
      } else if (msg.includes('Invalid login credentials')) {
        setError('邮箱或密码错误，请重新输入');
      } else if (msg.includes('Email rate limit exceeded') || code === 'over_email_send_rate_limit' || msg.includes('over_email_send_rate_limit') || msg.includes('429')) {
        markEmailActionTriggered('signup', email);
        setError('邮件发送太频繁，请稍后再试');
      } else {
        setError(msg || '操作失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('请输入邮箱后再点“忘记密码”');
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const resetCooldown = getEmailActionRemainingMs('reset', email);
      if (resetCooldown > 0) {
        const seconds = Math.ceil(resetCooldown / 1000);
        throw new Error(`邮件发送太频繁，请 ${seconds} 秒后再试`);
      }

      await sendPasswordReset(email);
      markEmailActionTriggered('reset', email);
      setError('📧 已发送重置邮件，请查收邮箱并按指引设置新密码');
    } catch (err: any) {
      const msg: string = err?.message || '';
      const code: string = err?.code || '';
      if (msg.includes('Email rate limit exceeded') || code === 'over_email_send_rate_limit' || msg.includes('over_email_send_rate_limit') || msg.includes('429')) {
        markEmailActionTriggered('reset', email);
        setError('邮件发送太频繁，请稍后再试');
      } else {
        setError(msg || '发送失败，请稍后再试');
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isLightMode ? 'bg-white/60' : 'bg-orbit-black'}`}
      style={isLightMode ? { backdropFilter: 'blur(6px)' } : undefined}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`relative w-full max-w-md glass-card rounded-3xl p-8 ${isLightMode ? 'bg-white border border-neutral-200 text-neutral-900' : 'bg-[#121212] border border-white/10 text-white'}`}
      >
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="mx-auto mb-4"
          >
            <img src="/icons/icon-384.png" alt="Orbit 轨迹 Logo" className="w-24 h-24 object-contain drop-shadow-2xl" />
          </motion.div>
          <h1 className={`text-3xl font-bold ${textPrimary} mb-2`}>Orbit 轨迹</h1>
          <p className={`${textMuted}`}>记录与好友的每一个足迹 ✨</p>
        </div>

        {/* 表单 */}
        <form onSubmit={isRecoveryMode ? handleCompleteRecovery : handleSubmit} className="space-y-4">
          {isRecoveryMode ? (
            <>
              <div>
                <label className={`block ${textMuted} text-sm mb-2`}>新密码</label>
                <div className="relative">
                  <FaLock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${iconColor}`} />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-glass pl-12"
                    placeholder="至少6位密码"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`block ${textMuted} text-sm mb-2`}>确认新密码</label>
                <div className="relative">
                  <FaLock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${iconColor}`} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-glass pl-12"
                    placeholder="再输入一次新密码"
                    minLength={6}
                    required
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {!isLogin && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <label className={`block ${textMuted} text-sm mb-2`}>用户名</label>
                  <div className="relative">
                    <FaUser className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${iconColor}`} />
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
                <label className={`block ${textMuted} text-sm mb-2`}>邮箱</label>
                <div className="relative">
                  <FaEnvelope className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${iconColor}`} />
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
            </>
          )}

          <div>
            <label className={`block ${textMuted} text-sm mb-2`}>密码</label>
            <div className="relative">
              <FaLock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${iconColor}`} />
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
            className={`overflow-hidden rounded-xl text-sm ${error?.includes('成功')
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
          >
            <p className="p-3">{error}</p>
          </motion.div>

          {/* 协议勾选 */}
          {!isLogin && !isRecoveryMode && (
            <div className="flex items-start gap-2 mt-4 px-1">
              <input
                type="checkbox"
                id="agreed"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className={`mt-0.5 w-3.5 h-3.5 rounded border ${isLightMode ? 'border-neutral-300' : 'border-white/30'} bg-transparent checked:bg-current`}
                style={{ accentColor: isLightMode ? '#171717' : '#ffffff' }}
              />
              <label htmlFor="agreed" className={`text-xs ${textMuted} leading-relaxed select-none`}>
                我已阅读并同意 <a href="/terms" target="_blank" className="underline hover:opacity-80">《用户协议》</a> <a href="/privacy" target="_blank" className="underline hover:opacity-80">《隐私政策》</a> <a href="/privacy" target="_blank" className="underline hover:opacity-80">《未成年人个人信息保护规则》</a>
              </label>
            </div>
          )}

          {/* 提交按钮 */}
          <motion.button
            type="submit"
            disabled={isRecoveryMode ? updatingPassword : loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full py-3 px-6 rounded-2xl font-semibold flex items-center justify-center gap-2 mt-6 disabled:opacity-50 transition-all shadow-lg ${isLightMode
              ? 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-neutral-900/10'
              : 'bg-white text-black hover:bg-neutral-200 shadow-white/10'
              }`}
          >
            {(isRecoveryMode ? updatingPassword : loading) ? (
              <>
                <FaSpinner className="w-5 h-5 animate-spin" />
                <span>处理中...</span>
              </>
            ) : (
              <>
                <span>{isRecoveryMode ? '更新密码' : (isLogin ? '登录' : '注册')}</span>
                <FaArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>
        </form>

        {/* 切换登录/注册 */}
        {!isRecoveryMode && (
          <div className="text-center mt-6">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                setAgreed(false);
              }}
              className={`${textMuted} hover:opacity-80 transition-colors`}
            >
              {isLogin ? '还没有账号？去注册' : '已有账号？去登录'}
            </button>
            {isLogin && (
              <div className="mt-3 text-sm">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetting}
                  className={`${textMuted} hover:opacity-80 disabled:opacity-50`}
                >
                  {resetting ? '发送中…' : '忘记密码？发送重置邮件'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 演示模式 */}
        <div className="mt-6 pt-6 border-t border-white/10">
          <button
            onClick={onDemo}
            className={`${textMuted} w-full py-3 hover:opacity-80 text-sm transition-colors`}
          >
            暂不登录，先看看演示 ✨
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
