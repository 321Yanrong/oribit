import { useState, useRef, useEffect, useCallback } from 'react';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { createPortal } from 'react-dom';
import { FaEdit, FaChevronRight, FaChevronLeft, FaSpinner, FaHeart, FaUsers, FaCamera, FaTimes, FaCheck, FaUserPlus, FaShareAlt, FaCopy, FaDice, FaMapMarkerAlt, FaFire, FaSearch, FaSyncAlt, FaComment, FaPaperPlane, FaInfoCircle, FaHeadset, FaEllipsisH, FaFont, FaMoon, FaWifi, FaAt, FaBell, FaUserShield, FaUserLock, FaStore, FaUndoAlt, FaTicketAlt, FaClipboardList, FaTruck, FaTrash, FaMicrophone, FaEnvelope, FaKey } from 'react-icons/fa';
import { FiLogOut, FiTrash2, FiInfo, FiHeadphones, FiMoreHorizontal, FiSettings } from 'react-icons/fi';
import { useUserStore, useMemoryStore, useLedgerStore } from '../store';
import { useAppStore } from '../store/app';
import { supabase, signOut, uploadAvatar, saveInviteCode, lookupProfileByInviteCode, bindVirtualFriend, addRealFriendByCode, updateFriendRemark, acceptFriendRequest, rejectFriendRequest, updateProfileUsername, getProfile, deleteMyAccount, getMemoryComments, addMemoryComment, submitHelpQuestionFeedback, updateAllowShare } from '../api/supabase';
import { DEFAULT_SETTINGS, readSettings, writeSettings, SETTINGS_EVENT, shouldAllowRefresh, shouldAllowUpload } from '../utils/settings';
import { TERMS_TEXT, PRIVACY_TEXT } from '../constants/appDocuments';
import { getTaggedDisplayName, getVisibleTaggedFriendIds } from '../utils/tagVisibility';
import PullToRefresh from '../components/PullToRefresh';
import { BOTTOM_NAV_CONTENT_GAP } from '../components/BottomNav';
import { useScrollLock } from '../hooks/useScrollLock';
import imageCompression from 'browser-image-compression';
import ReportPage from '../components/ReportPage';
import MemoryDetailModal from './MemoryStreamPage/components/MemoryDetailModal';
import PhotoUploader from '../components/PhotoUploader';

// Set to true once push notifications are fully configured (APNs + OneSignal)
const PUSH_NOTIFICATIONS_ENABLED = false;
import AdminReportsPage from '../components/AdminReportsPage';
import appIcon from '../../assets/icons/logo.png';

const stripOrbitMetaText = (content: string) => {
  const raw = content || '';

  const cleaned = raw
    .replace(/^\s*\[(?:orbit_meta|orbit_data):[\s\S]*?\}(?:\]|】)?\s*/i, '')
    .replace(/^\s*\[(?:orbit_meta|orbit_data):[\s\S]*?(?:\]|】)\s*/i, '')
    .replace(/^\s*['"]?orbit_data['"]?\s*[:=].*$/gim, '')
    .replace(/^\s*['"]?orbit_meta['"]?\s*[:=].*$/gim, '')
    .trim();

  return cleaned;
};

// 邮箱修改弹窗（亮色适配）
const ChangeEmailModal = ({ isOpen, onClose, onSubmit, loading }: any) => {
  useScrollLock(isOpen);
  const [email, setEmail] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  if (!isOpen) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm rounded-3xl p-6 border shadow-2xl"
        style={{ background: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[color:var(--orbit-text)]">更换邮箱</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full shadow-sm"
            style={{ background: 'color-mix(in srgb, var(--orbit-surface) 92%, rgba(255,255,255,0.9))', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
          >
            <FaTimes />
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--orbit-text-muted)' }}>我们将向新邮箱发送一封确认邮件，点击邮件中的链接后即可生效。</p>
        <input
          type="email"
          placeholder="输入新邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border outline-none mb-6"
          style={{ background: 'color-mix(in srgb, var(--orbit-card) 55%, transparent)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        />
        <input
          type="password"
          placeholder="输入当前密码以验证"
          value={currentPwd}
          onChange={(e) => setCurrentPwd(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border outline-none mb-6"
          style={{ background: 'color-mix(in srgb, var(--orbit-card) 55%, transparent)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        />
        <button
          onClick={() => onSubmit(email, currentPwd)}
          disabled={!email || !currentPwd || loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold disabled:opacity-30"
        >
          {loading ? <FaSpinner className="animate-spin mx-auto" /> : '发送确认邮件'}
        </button>
      </motion.div>
    </motion.div>
  );
};

// 密码修改弹窗（亮色适配）
const ChangePasswordModal = ({ isOpen, onClose, onSubmit, loading }: any) => {
  useScrollLock(isOpen);
  const [currentPwd, setCurrentPwd] = useState('');
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  if (!isOpen) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm rounded-3xl p-6 border shadow-2xl"
        style={{ background: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[color:var(--orbit-text)]">修改密码</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full shadow-sm"
            style={{ background: 'color-mix(in srgb, var(--orbit-surface) 92%, rgba(255,255,255,0.9))', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
          >
            <FaTimes />
          </button>
        </div>
        <div className="space-y-3 mb-6">
          <input
            type="password"
            placeholder="输入当前密码"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border outline-none"
            style={{ background: 'color-mix(in srgb, var(--orbit-card) 55%, transparent)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
          />
          <input
            type="password"
            placeholder="输入新密码（至少 6 位）"
            value={pwd1}
            onChange={(e) => setPwd1(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border outline-none"
            style={{ background: 'color-mix(in srgb, var(--orbit-card) 55%, transparent)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
          />
          <input
            type="password"
            placeholder="再次确认新密码"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border outline-none"
            style={{ background: 'color-mix(in srgb, var(--orbit-card) 55%, transparent)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
          />
        </div>
        <button
          onClick={() => onSubmit(currentPwd, pwd1, pwd2)}
          disabled={!currentPwd || !pwd1 || !pwd2 || loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white font-semibold disabled:opacity-30"
        >
          {loading ? <FaSpinner className="animate-spin mx-auto" /> : '确认修改'}
        </button>
      </motion.div>
    </motion.div>
  );
};

// 找回密码弹窗（亮色适配）
const ResetPasswordModal = ({ isOpen, onClose, onSubmit, loading }: any) => {
  useScrollLock(isOpen);
  const [email, setEmail] = useState('');
  if (!isOpen) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm rounded-3xl p-6 border shadow-2xl"
        style={{ background: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[color:var(--orbit-text)]">找回密码</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full shadow-sm"
            style={{ background: 'color-mix(in srgb, var(--orbit-surface) 92%, rgba(255,255,255,0.9))', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
          >
            <FaTimes />
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--orbit-text-muted)' }}>请输入你注册时的邮箱，我们将为你发送一封包含重置密码链接的邮件。</p>
        <input
          type="email"
          placeholder="输入注册邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border outline-none mb-6"
          style={{ background: 'color-mix(in srgb, var(--orbit-card) 55%, transparent)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        />
        <button
          onClick={() => onSubmit(email)}
          disabled={!email || loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold disabled:opacity-30"
        >
          {loading ? <FaSpinner className="animate-spin mx-auto" /> : '发送重置邮件'}
        </button>
      </motion.div>
    </motion.div>
  );
};

// 通用文档/协议展示弹窗
const DocumentModal = ({ isOpen, onClose, title, content, isDarkMode }: any) => {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  const lines = String(content || '').split('\n');
  const firstNonEmptyIndex = lines.findIndex(line => line.trim().length > 0);
  const documentMainTitle = firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex].trim() : '';
  const documentBody = firstNonEmptyIndex >= 0
    ? lines.filter((_, index) => index !== firstNonEmptyIndex).join('\n').replace(/^\s*\n/, '')
    : String(content || '');
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  const openDocLink = async (url: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url, presentationStyle: 'popover' });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.warn('Open document link failed:', err);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderLineWithLinks = (line: string) => {
    if (!line) return null;
    const chunks = line.split(urlRegex);
    return chunks.map((chunk, idx) => {
      if (/^https?:\/\//.test(chunk)) {
        return (
          <button
            key={`${chunk}-${idx}`}
            type="button"
            onClick={() => void openDocLink(chunk)}
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}
          >
            {chunk}
          </button>
        );
      }
      return <span key={`${chunk}-${idx}`}>{chunk}</span>;
    });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000]"
      style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7', fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div
          className="safe-top sticky top-0 z-20 px-4 pt-4 pb-2 flex items-center justify-center relative"
          style={{
            background: isDarkMode ? 'rgba(11, 19, 36, 0.94)' : 'rgba(245, 245, 247, 0.94)',
            backdropFilter: 'saturate(180%) blur(12px)',
            WebkitBackdropFilter: 'saturate(180%) blur(12px)',
            borderBottom: `1px solid ${isDarkMode ? '#1f2937' : '#e5e7eb'}`
          }}
        >
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>{title}</h2>
        </div>

        <div className="px-5 pt-2 pb-8" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>
          {documentMainTitle ? (
            <h3 className="text-center text-[26px] leading-9 font-extrabold mb-4" style={{ color: isDarkMode ? '#f8fafc' : '#000000' }}>
              {documentMainTitle}
            </h3>
          ) : null}
          <div className="text-[14px] leading-7">
            {documentBody.split('\n').map((line, idx) => (
              <div key={`line-${idx}`} className="whitespace-pre-wrap min-h-[28px]">
                {renderLineWithLinks(line)}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

const CommunityGuidelinesPage = ({
  isOpen,
  onClose,
  content,
  isDarkMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  isDarkMode: boolean;
}) => {
  useScrollLock(isOpen);
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000]"
      style={{ background: isDarkMode ? '#0b1324' : '#ffffff', fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <img src="assets/icons/icon-384.png" alt="Orbit" className="h-8 w-8 object-contain" />
        </div>

        <div className="px-4 pb-24">
          <div className="rounded-3xl p-6" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `2px solid ${isDarkMode ? '#1f2937' : '#87CEEB'}` }}>
            {/* <div className="mb-4 flex items-center justify-center">
              <img
                // src="/icons/orbit-wordmark.svg"
                alt="Orbit"
                className="h-6 w-auto object-contain"
                style={{ filter: isDarkMode ? 'brightness(0) invert(1)' : 'brightness(0)' }}
              />
            </div> */}

            <h1 className="text-[52px] leading-[1.02] font-extrabold tracking-tight" style={{ color: isDarkMode ? '#f8fafc' : '#000000' }}>
              Orbit<br />社区公约
            </h1>

            <p className="mt-3 text-[36px] leading-[1.05] font-extrabold" style={{ color: isDarkMode ? '#64748b' : '#9ca3af' }}>
              COMMUNITY<br />GUIDELINES
            </p>

            <div className="mt-5" style={{ borderTop: `2px solid ${isDarkMode ? '#1f2937' : '#87CEEB'}` }} />

            <p className="mt-4 text-[16px] leading-8 whitespace-pre-wrap" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>
              {content || '欢迎来到 Orbit 社区。请保持真诚、友善与尊重，一起维护健康交流环境。'}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

const HelpSupportPage = ({
  isOpen,
  onClose,
  currentUser,
  isDarkMode,
  onOpenResetPassword,
  onOpenChangeEmail,
  autoOpenFeedback,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  isDarkMode: boolean;
  onOpenResetPassword?: () => void;
  onOpenChangeEmail?: () => void;
  autoOpenFeedback?: boolean;
}) => {
  useScrollLock(isOpen);
  type QuestionTab = 'hot' | 'account' | 'settings';
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [selectedQuestionTab, setSelectedQuestionTab] = useState<QuestionTab>('hot');
  const [questionTab, setQuestionTab] = useState<QuestionTab>('hot');
  const [feedback, setFeedback] = useState<'useful' | 'not-useful' | null>(null);
  const [showFeedbackToast, setShowFeedbackToast] = useState(false);
  const [showFeedbackScenePage, setShowFeedbackScenePage] = useState(!!autoOpenFeedback);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showAccountCheckPage, setShowAccountCheckPage] = useState(false);
  const [showAccountRecoveryPage, setShowAccountRecoveryPage] = useState(false);
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);
  const [checkingStep, setCheckingStep] = useState(-1);
  const [feedbackCategory, setFeedbackCategory] = useState('功能建议');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackImages, setFeedbackImages] = useState<string[]>([]);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showSubmitToast, setShowSubmitToast] = useState(false);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // New feedback handler
  const handleSubmitFeedback = async () => {
    if (!feedbackContent.trim()) {
      alert('请输入反馈内容');
      return;
    }
    if (!currentUser?.id) {
      // Can handle guest feedback here if wanted, or alert
      alert('请先登录后提交反馈');
      return;
    }
    setSubmittingFeedback(true);
    try {
      const { error } = await (supabase.from('feedbacks' as any) as any).insert({
        user_id: currentUser.id,
        category: feedbackCategory,
        content: feedbackContent,
        images: feedbackImages, // PhotoUploader already uploaded them
        app_version: (import.meta as any)?.env?.VITE_APP_VERSION,
        device_info: navigator.userAgent
      });

      if (error) throw error;

      setShowSubmitToast(true);
      setTimeout(() => {
        setShowSubmitToast(false);
        setFeedbackContent('');
        setFeedbackImages([]);
        setFeedbackCategory('功能建议');
        setShowFeedbackScenePage(false);
      }, 2000);
    } catch (err: any) {
      console.error('Submit feedback failed', err);
      alert('提交失败: ' + err.message);
    } finally {
      setSubmittingFeedback(false);
    }
  };


  useEffect(() => {
    if (!feedback) return;
    setShowFeedbackToast(true);
    const timer = window.setTimeout(() => setShowFeedbackToast(false), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!showAccountCheckPage || !isCheckingAccount) return;
    if (checkingStep >= 10) {
      setIsCheckingAccount(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setCheckingStep((prev) => prev + 1);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [showAccountCheckPage, isCheckingAccount, checkingStep]);

  if (!isOpen) return null;

  const selfTools = [
    { icon: FaUserShield, label: '账号监测' },
    { icon: FaKey, label: '找回密码' },
    { icon: FaEnvelope, label: '更改邮箱' },
  ];

  const hotQuestions = [
    '换手机后怎么恢复我的回忆？',
    '为什么图片上传失败？',
    '评论发送失败怎么办？',
    '如何修改登录邮箱或密码？',
    '如何开启或关闭深色模式？',
    '字体大小设置后变化不明显怎么办？',
  ];

  const accountQuestions = [
    '忘记密码后怎么找回账号？',
    '为什么提示账号异常或登录受限？',
    '怎么修改绑定邮箱？',
    '可以同时在两台设备登录吗？',
    '注销账号后还能恢复吗？',
  ];

  const settingsQuestions = [
    '深色模式为什么没有生效？',
    '字体大小修改后为什么变化不明显？',
    '跟随系统设置是什么意思？',
    '仅 Wi‑Fi 上传开启后为什么发不出去？',
    '仅 Wi‑Fi 刷新开启后为什么看不到新内容？',
    '更换手机后设置会自动同步吗？',
  ];

  const displayedQuestions = questionTab === 'hot'
    ? hotQuestions
    : questionTab === 'account'
      ? accountQuestions
      : settingsQuestions;


  const accountCheckItems = [
    '登录状态校验',
    '账号信息读取',
    '回忆发布能力',
    '评论互动能力',
    '好友连接能力',
    '邀请绑定能力',
    '多端同步能力',
    '通知触达能力',
    '设置项读写能力',
    '数据安全能力',
  ];

  const [recentDeviceAccounts, setRecentDeviceAccounts] = useState<Array<{ id: string; username: string; avatar_url?: string; lastLoginAt: number }>>([]);

  useEffect(() => {
    if (!showAccountRecoveryPage || typeof window === 'undefined') return;
    const key = 'orbit_recent_accounts';
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    let parsed: Array<{ id: string; username: string; avatar_url?: string; lastLoginAt: number }> = [];
    try {
      const raw = window.localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        parsed = arr.filter((item) => item && item.id && item.username && item.lastLoginAt);
      }
    } catch {
      parsed = [];
    }

    const filtered = parsed.filter((item) => now - Number(item.lastLoginAt) <= sevenDaysMs);

    if (currentUser?.id && currentUser?.username) {
      const current = {
        id: String(currentUser.id),
        username: String(currentUser.username),
        avatar_url: currentUser.avatar_url || '/assets/icons/icon-384.png',
        lastLoginAt: now,
      };
      const deduped = [current, ...filtered.filter((item) => String(item.id) !== current.id)].slice(0, 10);
      setRecentDeviceAccounts(deduped);
      window.localStorage.setItem(key, JSON.stringify(deduped));
      return;
    }

    setRecentDeviceAccounts(filtered.slice(0, 10));
    window.localStorage.setItem(key, JSON.stringify(filtered.slice(0, 10)));
  }, [showAccountRecoveryPage, currentUser?.id, currentUser?.username, currentUser?.avatar_url]);

  const maskAccountName = (name: string) => {
    const safe = (name || '').trim();
    if (!safe) return '用户****';
    return `${safe.slice(0, 1)}****`;
  };

  const answerMap: Record<string, string> = {
    // 热门问题
    '换手机后怎么恢复我的回忆？':
      '只需在新设备上用同一账号重新登录，所有回忆会自动同步到新设备，无需任何额外操作。',
    '为什么图片上传失败？':
      '请先确认网络连接正常。若在设置中开启了「仅 Wi‑Fi 上传」，在移动数据网络下发布含图片的回忆会失败，请切换到 Wi‑Fi 后重试，或关闭该选项。图片文件过大也可能导致失败，建议压缩后重试。',
    '评论发送失败怎么办？':
      '通常是网络波动导致，请检查网络连接后重试。若问题持续出现，可尝试重启 App 或稍后再发送。',
    '如何修改登录邮箱或密码？':
      '进入「我的主页」→ 点击左上角设置图标 → 账户，即可找到「更换邮箱」和「更换密码」选项。',
    '如何开启或关闭深色模式？':
      '进入设置（左上角设置图标）→「显示」→「深色模式」，可在「浅色」「深色」「跟随系统」三种模式之间切换。',
    '字体大小设置后变化不明显怎么办？':
      '字体大小仅影响回忆正文内容区域，界面其他区域字号不变。设置后请下拉刷新或重启 App，若仍无变化请联系客服。',
    // 账号问题
    '忘记密码后怎么找回账号？':
      '在登录页面点击「忘记密码」，输入注册邮箱后我们会发送重置链接到邮箱，点击邮件中的链接即可重设密码。也可在帮助与客服的自助工具中点击「找回密码」。',
    '为什么提示账号异常或登录受限？':
      '账号异常通常由多次错误登录或异地登录触发。请稍等 30 分钟后重试，或通过「忘记密码」重置账号；如问题仍未解决，请联系官方客服。',
    '怎么修改绑定邮箱？':
      '进入设置 → 账户 → 更换邮箱，验证当前密码后输入新邮箱并发送确认邮件，点击邮件中的链接完成验证即可生效。',
    '可以同时在两台设备登录吗？':
      '可以，同一账号支持在多台设备同时登录，回忆和设置数据会自动同步。',
    '注销账号后还能恢复吗？':
      '注销后账号及所有数据将在 7 个工作日内被永久删除，此操作不可逆，请谨慎操作。',
    // 设置问题
    '深色模式为什么没有生效？':
      '请在设置 →「显示」→「深色模式」中确认已选择「深色」或「跟随系统」。若选择「跟随系统」，需同时确认设备系统已切换到深色模式。',
    '字体大小修改后为什么变化不明显？':
      '字体大小设置仅作用于回忆正文内容区域，界面框架字号不变。修改后刷新页面或重启 App 即可生效。',
    '跟随系统设置是什么意思？':
      '「跟随系统」表示 Orbit 会根据你设备的深色/浅色模式自动切换显示风格，无需在 App 内手动切换。',
    '仅 Wi‑Fi 上传开启后为什么发不出去？':
      '开启「仅 Wi‑Fi 上传」后，在移动数据网络下发布含图片/视频的回忆会失败。请切换到 Wi‑Fi 网络后重试，或在设置中关闭此选项。',
    '仅 Wi‑Fi 刷新开启后为什么看不到新内容？':
      '开启后在移动数据网络下不会自动拉取新内容。连接到 Wi‑Fi 后即可正常刷新，或在设置中关闭「仅 Wi‑Fi 刷新」选项。',
    '更换手机后设置会自动同步吗？':
      '会。设置数据与账号绑定，用同一账号登录新设备后，深色模式、字体大小、通知偏好等设置会自动同步，无需重新配置。',
  };

  const hsBg = isDarkMode ? '#0b1324' : '#f5f5f7';
  const hsCard = isDarkMode ? '#0f172a' : '#ffffff';
  const hsText = isDarkMode ? '#e5e7eb' : '#000000';
  const hsSubText = isDarkMode ? '#94a3b8' : '#9ca3af';
  const hsBorder = isDarkMode ? '#1f2937' : '#ececf1';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000]"
      style={{ background: hsBg, fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: hsText }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: hsText }}>帮助与客服</h2>
        </div>

        <div className="px-4 pb-28 space-y-3">
          <div className="rounded-3xl p-4" style={{ background: hsCard, border: `1px solid ${hsBorder}` }}>
            <p className="text-[16px] font-semibold mb-3" style={{ color: hsText }}>自助工具</p>
            <div className="grid grid-cols-5 gap-x-2 gap-y-4">
              {selfTools.map((tool, idx) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={`tool-${idx}`}
                    className="flex flex-col items-center gap-2"
                    onClick={() => {
                      if (tool.label === '账号监测') {
                        setShowAccountCheckPage(true);
                        setIsCheckingAccount(false);
                        setCheckingStep(-1);
                        return;
                      }
                      if (tool.label === '找回密码') {
                        onOpenResetPassword?.();
                        return;
                      }
                      if (tool.label === '更改邮箱') {
                        onOpenChangeEmail?.();
                        return;
                      }
                    }}
                  >
                    <Icon className="text-[24px]" style={{ color: hsText }} />
                    <span className="text-[12px] leading-4 text-center" style={{ color: hsText }}>{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl p-4" style={{ background: hsCard, border: `1px solid ${hsBorder}` }}>
            <p className="text-[16px] font-semibold mb-3" style={{ color: hsText }}>猜你想问</p>
            <div className="flex items-center gap-5 mb-2">
              <button
                className="text-[14px] font-semibold pb-1"
                style={{ color: questionTab === 'hot' ? hsText : hsSubText, borderBottom: questionTab === 'hot' ? '2px solid #ff2442' : '2px solid transparent' }}
                onClick={() => setQuestionTab('hot')}
              >
                热门问题
              </button>
              <button
                className="text-[14px] pb-1"
                style={{ color: questionTab === 'account' ? hsText : hsSubText, borderBottom: questionTab === 'account' ? '2px solid #ff2442' : '2px solid transparent' }}
                onClick={() => setQuestionTab('account')}
              >
                账号问题
              </button>
              <button
                className="text-[14px] pb-1"
                style={{ color: questionTab === 'settings' ? hsText : hsSubText, borderBottom: questionTab === 'settings' ? '2px solid #ff2442' : '2px solid transparent' }}
                onClick={() => setQuestionTab('settings')}
              >
                设置问题
              </button>
            </div>
            <div>
              {displayedQuestions.map((q, idx) => (
                <button
                  key={`q-${idx}`}
                  className="w-full py-3 flex items-center justify-between text-left"
                  style={{ borderBottom: idx === displayedQuestions.length - 1 ? 'none' : `0.5px solid ${hsBorder}` }}
                  onClick={() => {
                    setSelectedQuestion(q);
                    setSelectedQuestionTab(questionTab);
                    setFeedback(null);
                    setShowFeedbackToast(false);
                  }}
                >
                  <span className="text-[15px]" style={{ color: hsText }}>{q}</span>
                  <FaChevronRight className="text-[13px]" style={{ color: hsSubText }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2" style={{ background: hsBg }}>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="h-12 rounded-full border text-[24px]"
              style={{ borderColor: hsBorder, background: hsCard, color: hsText }}
              onClick={() => setShowFeedbackScenePage(true)}
            >
              <span className="inline-flex items-center gap-2 text-[15px]"><FaEdit className="text-[14px]" />意见反馈</span>
            </button>
            <button
              className="h-12 rounded-full border text-[24px]"
              style={{ borderColor: hsBorder, background: hsCard, color: hsText }}
              onClick={() => setShowContactModal(true)}
            >
              <span className="inline-flex items-center gap-2 text-[15px]"><FaHeadset className="text-[14px]" />联系官方客服</span>
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showFeedbackScenePage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[109]"
            style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7' }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="h-full w-full flex flex-col"
              style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7' }}
            >
              <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-between relative" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                {isTextareaFocused ? (
                  <button
                    onMouseDown={(e) => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); setIsTextareaFocused(false); }}
                    className="px-3 py-1.5 rounded-full text-sm font-medium border"
                    style={{ color: isDarkMode ? '#94a3b8' : '#6b7280', borderColor: isDarkMode ? '#334155' : '#d1d5db' }}
                  >
                    完成
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (autoOpenFeedback) {
                        onClose();
                      } else {
                        setShowFeedbackScenePage(false);
                      }
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center -ml-2"
                    style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
                  >
                    <FaChevronLeft className="text-base" />
                  </button>
                )}
                <h2 className="text-[17px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>意见反馈</h2>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={submittingFeedback || !feedbackContent.trim()}
                  className="px-4 py-1.5 rounded-full text-sm font-bold bg-[#00FFB3] text-black disabled:opacity-30 disabled:grayscale transition-all"
                >
                  {submittingFeedback ? <FaSpinner className="animate-spin" /> : '发送'}
                </button>
              </div>

              {/* 1. Category Chips — outside scroll container to avoid iOS touch conflict */}
              <div className="flex-shrink-0 pt-5 pb-1"
                onTouchMove={(e) => e.stopPropagation()}
              >
                <div
                  className="flex gap-3 pb-2 scrollbar-none flex-nowrap"
                  style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', paddingLeft: 20, paddingRight: 20 }}
                >
                  {['功能建议', 'Bug反馈', '体验吐槽', '其他'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFeedbackCategory(cat)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all shrink-0 border whitespace-nowrap ${feedbackCategory === cat
                        ? 'bg-[#00FFB3] text-black border-[#00FFB3] shadow-lg shadow-[#00FFB3]/20'
                        : (isDarkMode ? 'bg-white/5 text-white/60 border-white/10' : 'bg-black/5 text-black/60 border-black/5')
                        }`}
                    >
                      {cat === 'Bug反馈' && '🛠 '}
                      {cat === '功能建议' && '💡 '}
                      {cat === '体验吐槽' && '😤 '}
                      {cat === '其他' && '🤔 '}
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col">
                {/* 2. Content Input */}
                <textarea
                  value={feedbackContent}
                  onChange={(e) => setFeedbackContent(e.target.value)}
                  onFocus={() => setIsTextareaFocused(true)}
                  onBlur={() => setIsTextareaFocused(false)}
                  placeholder="详细描述一下你的想法..."
                  className="w-full flex-1 bg-transparent text-lg resize-none mb-6 leading-relaxed placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none"
                  style={{ color: isDarkMode ? '#fff' : '#111' }}
                />

                {/* 3. Photo Uploader */}
                <div className="mt-auto pt-4 border-t" style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}>
                  <p className="text-xs mb-4 font-medium" style={{ color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>上传截图（可选，最多 3 张）</p>
                  <PhotoUploader
                    userId={currentUser?.id || 'guest'}
                    photos={feedbackImages}
                    onPhotosChange={setFeedbackImages}
                    maxPhotos={3}
                  />
                </div>
              </div>

              {showSubmitToast && (
                <div className="absolute inset-0 flex items-center justify-center z-[50] pointer-events-none">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-6 py-3 rounded-2xl font-medium shadow-xl flex items-center gap-2 backdrop-blur-md"
                    style={{
                      background: isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                      color: isDarkMode ? '#e5e7eb' : '#1f2937',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`
                    }}
                  >
                    <FaCheck className={isDarkMode ? 'text-green-400' : 'text-green-600'} /> 感谢反馈！我们会认真阅读
                  </motion.div>
                </div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedQuestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[108]"
            style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7' }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="h-full w-full overflow-y-auto"
            >
              <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
                <button
                  onClick={() => setSelectedQuestion(null)}
                  className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
                >
                  <FaChevronLeft className="text-base" />
                </button>
                <h2 className="text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>问题详情</h2>
              </div>

              <div className="px-6 pt-10 pb-[max(18px,env(safe-area-inset-bottom))] min-h-[calc(100vh-92px)] flex flex-col justify-between">
                <div>
                  <p className="text-[18px] font-semibold mb-4 leading-7" style={{ color: isDarkMode ? '#f1f5f9' : '#111' }}>
                    {selectedQuestion}
                  </p>
                  <p className="text-[16px] leading-8 whitespace-pre-wrap" style={{ color: isDarkMode ? '#cbd5e1' : '#303133' }}>
                    {answerMap[selectedQuestion ?? ''] ?? '暂无解答，如有疑问请联系官方客服。'}
                  </p>

                  <button
                    className="mt-10 text-[16px]"
                    style={{ color: '#4ea7ff' }}
                    onClick={() => setShowContactModal(true)}
                  >
                    点击联系官方客服
                  </button>
                </div>

                <div className="text-center pb-24">
                  <p className="text-[14px]" style={{ color: isDarkMode ? '#94a3b8' : '#c4c4c8' }}>—— 以上回答对你有帮助吗 ——</p>
                  <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: isDarkMode ? '#0f172a' : '#f1f2f4', border: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                    <div className="grid grid-cols-2">
                      <button
                        className="py-4 text-[17px]"
                        disabled={feedback !== null}
                        style={{
                          borderRight: `0.5px solid ${isDarkMode ? '#1f2937' : '#e3e4e8'}`,
                          color: isDarkMode ? '#e5e7eb' : '#303133',
                          opacity: feedback === 'useful' ? 0.35 : 1,
                          filter: feedback === 'useful' ? 'grayscale(100%)' : 'none',
                        }}
                        onClick={async () => {
                          setFeedback('not-useful');
                          try {
                            await submitHelpQuestionFeedback({
                              question: selectedQuestion,
                              category: selectedQuestionTab,
                              vote: 'not_useful',
                              userId: currentUser?.id,
                              username: currentUser?.username,
                              appVersion: (import.meta as any)?.env?.VITE_APP_VERSION || null,
                              buildTime: (import.meta as any)?.env?.VITE_APP_BUILD_TIME || null,
                            });
                          } catch (e) {
                            console.warn('submitHelpQuestionFeedback failed', e);
                          }
                        }}
                      >
                        😡 没用
                      </button>
                      <button
                        className="py-4 text-[17px]"
                        disabled={feedback !== null}
                        style={{
                          color: isDarkMode ? '#e5e7eb' : '#303133',
                          opacity: feedback === 'not-useful' ? 0.35 : 1,
                          filter: feedback === 'not-useful' ? 'grayscale(100%)' : 'none',
                        }}
                        onClick={async () => {
                          setFeedback('useful');
                          try {
                            await submitHelpQuestionFeedback({
                              question: selectedQuestion,
                              category: selectedQuestionTab,
                              vote: 'useful',
                              userId: currentUser?.id,
                              username: currentUser?.username,
                              appVersion: (import.meta as any)?.env?.VITE_APP_VERSION || null,
                              buildTime: (import.meta as any)?.env?.VITE_APP_BUILD_TIME || null,
                            });
                          } catch (e) {
                            console.warn('submitHelpQuestionFeedback failed', e);
                          }
                        }}
                      >
                        😍 有用
                      </button>
                    </div>
                  </div>

                  {showFeedbackToast && (
                    <div className="mt-6 flex justify-center">
                      <div className="px-7 h-14 rounded-full flex items-center justify-center text-[21px]"
                        style={{ background: '#1f2333', color: '#ffffff' }}>
                        评价成功，感谢您的评论
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAccountRecoveryPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110]"
            style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="h-full w-full overflow-y-auto"
            >
              <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
                <button
                  onClick={() => setShowAccountRecoveryPage(false)}
                  className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
                >
                  <FaChevronLeft className="text-base" />
                </button>
                <h2 className="text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>选择账号找回方式</h2>
              </div>

              <div className="px-4 pt-6 pb-10">
                <p className="text-[15px] mb-2" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3ba' }}>通过以下任一方式定位到您需要找回的账号</p>
                <div className="rounded-2xl overflow-hidden mb-7" style={{ background: isDarkMode ? '#0f172a' : '#fff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                  <button className="w-full px-4 py-5 flex items-center justify-between text-left" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                    <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#303133' }}>通过绑定的手机号确认</span>
                    <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#64748b' : '#b6b8bd' }} />
                  </button>
                  <button className="w-full px-4 py-5 flex items-center justify-between text-left" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                    <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#303133' }}>通过邮箱认证信息确认</span>
                    <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#64748b' : '#b6b8bd' }} />
                  </button>

                </div>

                <p className="text-[15px] mb-2" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3ba' }}>此设备最近 7 天登录过的账户</p>
                <div className="rounded-2xl overflow-hidden" style={{ background: isDarkMode ? '#0f172a' : '#fff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                  {recentDeviceAccounts.length > 0 ? (
                    recentDeviceAccounts.map((account, index) => (
                      <button
                        key={account.id}
                        className="w-full flex items-center gap-3 px-4 py-4 text-left"
                        style={{ borderBottom: index === recentDeviceAccounts.length - 1 ? 'none' : `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}
                      >
                        <img
                          src={account.avatar_url || '/assets/icons/icon-384.png'}
                          alt="avatar"
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] font-medium truncate" style={{ color: isDarkMode ? '#e5e7eb' : '#303133' }}>{maskAccountName(account.username)}</p>
                        </div>
                        <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#64748b' : '#b6b8bd' }} />
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-[14px]" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3ba' }}>暂无近 7 天登录记录</div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAccountCheckPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110]"
            style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="h-full w-full overflow-y-auto"
            >
              <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
                <button
                  onClick={() => setShowAccountCheckPage(false)}
                  className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
                >
                  <FaChevronLeft className="text-base" />
                </button>
                <h2 className="text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>账号检测</h2>
                {/* 申诉中心按钮已移除 */}
              </div>

              <div className="px-6 pt-8 pb-10" style={{ background: isDarkMode ? '#0b1324' : '#fff' }}>
                <div className="flex flex-col items-center">
                  <div
                    className="relative w-[160px] h-[160px] rounded-full flex items-center justify-center"
                    style={{
                      background: isCheckingAccount
                        ? `conic-gradient(#4ea7ff ${Math.min(((checkingStep + 1) / accountCheckItems.length) * 360, 360)}deg, ${isDarkMode ? '#1f2937' : '#e5e7eb'} 0deg)`
                        : (isDarkMode ? '#1f2937' : '#e5e7eb'),
                    }}
                  >
                    <div className="w-[150px] h-[150px] rounded-full" style={{ background: isDarkMode ? '#0b1324' : '#fff' }} />
                    <img
                      src={currentUser?.avatar_url || '/assets/icons/icon-384.png'}
                      alt="avatar"
                      className="absolute w-[92px] h-[92px] rounded-full object-cover"
                    />
                  </div>

                  <h3 className="mt-6 text-[36px] font-bold text-center" style={{ color: isDarkMode ? '#f8fafc' : '#111' }}>
                    {isCheckingAccount ? '账号检测中…' : (currentUser?.username || '我的账号')}
                  </h3>
                  <p className="mt-1 text-[13px]" style={{ color: isDarkMode ? '#94a3b8' : '#222' }}>
                    Orbit号：{currentUser?.id ? String(currentUser.id).replace(/-/g, '').slice(0, 11) : '未登录'}
                  </p>
                </div>

                {!isCheckingAccount && checkingStep < 0 ? (
                  <>
                    <p className="mt-14 text-center text-[13px] leading-7" style={{ color: isDarkMode ? '#94a3b8' : '#222' }}>
                      可检测功能是否正常
                    </p>

                    <div className="mt-8 px-8">
                      <button
                        className="w-full h-14 rounded-full flex items-center justify-center"
                        style={{ background: isDarkMode ? '#1e40af' : '#0f2a4d', color: '#fff' }}
                        onClick={() => {
                          setIsCheckingAccount(true);
                          setCheckingStep(0);
                        }}
                      >
                        <span className="text-[15px] leading-none" style={{ position: 'relative', top: '-1px' }}>开始检测</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-12 space-y-3 px-2">
                    {accountCheckItems.map((item, idx) => {
                      const isDone = idx < checkingStep;
                      const isCurrent = idx === checkingStep && isCheckingAccount;
                      return (
                        <div key={item} className="flex items-center justify-between">
                          <span className="text-[14px]" style={{ color: isDarkMode ? '#e5e7eb' : '#111' }}>{item}</span>
                          {isDone ? (
                            <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ border: '2px solid #22c55e', color: '#22c55e' }}>
                              <FaCheck className="text-[12px]" />
                            </span>
                          ) : isCurrent ? (
                            <span className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid #60a5fa', borderTopColor: 'transparent' }} />
                          ) : (
                            <span className="text-[14px]" style={{ color: isDarkMode ? '#64748b' : '#9ca3baf' }}>待检测</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContactModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[111] bg-black/35"
            onClick={() => setShowContactModal(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="mx-5 mt-[22vh] rounded-3xl overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #0f2a4d 0%, #0a2140 100%)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <p className="text-[20px] font-bold" style={{ color: '#ffffff' }}>Orbit 客服中心</p>
                <p className="mt-2 text-[14px] leading-6" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  请选择联系方式，我们会尽快响应你的问题。
                </p>
              </div>

              <div className="px-5 py-4 space-y-3">
                <button
                  className="w-full h-11 rounded-xl text-[15px] font-medium"
                  style={{ background: '#87CEEB', color: '#0a2140' }}
                  onClick={() => { window.location.href = 'mailto:support@wehihi.com?subject=联系客服'; setShowContactModal(false); }}
                >
                  邮件联系：support@wehihi.com
                </button>
                <button
                  className="w-full h-11 rounded-xl text-[15px]"
                  style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
                  onClick={() => setShowContactModal(false)}
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
  );
};

// ─── 账户设置子页 ─────────────────────────────────────────────────────────────

const AccountPage = ({
  isOpen,
  onClose,
  onOpenEmail,
  onOpenPassword,
  isDarkMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenEmail: () => void;
  onOpenPassword: () => void;
  isDarkMode: boolean;
}) => {
  useScrollLock(isOpen);
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const bg = isDarkMode ? '#0b1324' : '#f5f5f7';
  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const cardBorder = isDarkMode ? '#1f2937' : '#ececf1';
  const labelColor = isDarkMode ? '#94a3b8' : '#9ca3af';
  const textColor = isDarkMode ? '#e5e7eb' : '#000000';
  const dividerColor = isDarkMode ? '#1f2937' : '#ececf1';
  const chevronColor = isDarkMode ? '#6b7280' : '#c4c4c8';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10001]"
      style={{ background: bg, fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 flex items-center justify-center"
            style={{ color: labelColor }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: textColor }}>账户</h2>
        </div>

        <div className="px-4 pt-2">
          <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
            <button
              onClick={onOpenEmail}
              className="w-full px-4 py-3.5 flex items-center justify-between"
              style={{ borderBottom: `0.5px solid ${dividerColor}` }}
            >
              <span className="text-[15px] flex items-center gap-3" style={{ color: textColor }}>
                <FaEnvelope className="text-[14px]" style={{ color: labelColor }} />
                更换邮箱
              </span>
              <FaChevronRight className="text-[13px]" style={{ color: chevronColor }} />
            </button>
            <button
              onClick={onOpenPassword}
              className="w-full px-4 py-3.5 flex items-center justify-between"
            >
              <span className="text-[15px] flex items-center gap-3" style={{ color: textColor }}>
                <FaKey className="text-[14px]" style={{ color: labelColor }} />
                更换密码
              </span>
              <FaChevronRight className="text-[13px]" style={{ color: chevronColor }} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

// ─── 更换邮箱子页 ──────────────────────────────────────────────────────────────

const ChangeEmailPage = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  isDarkMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string, currentPwd: string) => void;
  loading: boolean;
  isDarkMode: boolean;
}) => {
  useScrollLock(isOpen);
  const [email, setEmail] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setCurrentPwd('');
    }
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const bg = isDarkMode ? '#0b1324' : '#f5f5f7';
  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const cardBorder = isDarkMode ? '#1f2937' : '#ececf1';
  const labelColor = isDarkMode ? '#94a3b8' : '#9ca3af';
  const textColor = isDarkMode ? '#e5e7eb' : '#000000';
  const inputBg = isDarkMode ? '#1e293b' : '#f0f0f5';
  const inputBorder = isDarkMode ? '#334155' : '#e2e2e8';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10002]"
      style={{ background: bg, fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 flex items-center justify-center"
            style={{ color: labelColor }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: textColor }}>更换邮箱</h2>
        </div>

        <div className="px-4 pt-4 space-y-3">
          <p className="text-[13px] pb-1" style={{ color: labelColor }}>我们将向新邮箱发送一封确认邮件，点击邮件中的链接后即可生效。</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `0.5px solid ${cardBorder}` }}>
              <p className="text-[11px] mb-1.5" style={{ color: labelColor }}>新邮箱</p>
              <input
                type="email"
                placeholder="输入新邮箱地址"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-[15px] outline-none bg-transparent"
                style={{ color: textColor }}
              />
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] mb-1.5" style={{ color: labelColor }}>当前密码</p>
              <input
                type="password"
                placeholder="输入当前密码以验证"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                className="w-full text-[15px] outline-none bg-transparent"
                style={{ color: textColor }}
              />
            </div>
          </div>

          <button
            onClick={() => onSubmit(email, currentPwd)}
            disabled={!email || !currentPwd || loading}
            className="w-full py-3.5 rounded-2xl text-[15px] font-semibold disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #00FFB3, #00D9FF)', color: '#000000' }}
          >
            {loading ? <FaSpinner className="animate-spin mx-auto" /> : '发送确认邮件'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

// ─── 更换密码子页 ──────────────────────────────────────────────────────────────

const ChangePasswordPage = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  isDarkMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (currentPwd: string, pwd1: string, pwd2: string) => void;
  loading: boolean;
  isDarkMode: boolean;
}) => {
  useScrollLock(isOpen);
  const [currentPwd, setCurrentPwd] = useState('');
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setCurrentPwd('');
      setPwd1('');
      setPwd2('');
    }
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const bg = isDarkMode ? '#0b1324' : '#f5f5f7';
  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const cardBorder = isDarkMode ? '#1f2937' : '#ececf1';
  const labelColor = isDarkMode ? '#94a3b8' : '#9ca3af';
  const textColor = isDarkMode ? '#e5e7eb' : '#000000';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10002]"
      style={{ background: bg, fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 flex items-center justify-center"
            style={{ color: labelColor }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: textColor }}>更换密码</h2>
        </div>

        <div className="px-4 pt-4 space-y-3">
          <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `0.5px solid ${cardBorder}` }}>
              <p className="text-[11px] mb-1.5" style={{ color: labelColor }}>当前密码</p>
              <input
                type="password"
                placeholder="输入当前密码"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                className="w-full text-[15px] outline-none bg-transparent"
                style={{ color: textColor }}
              />
            </div>
            <div className="px-4 py-3" style={{ borderBottom: `0.5px solid ${cardBorder}` }}>
              <p className="text-[11px] mb-1.5" style={{ color: labelColor }}>新密码</p>
              <input
                type="password"
                placeholder="至少 6 位"
                value={pwd1}
                onChange={(e) => setPwd1(e.target.value)}
                className="w-full text-[15px] outline-none bg-transparent"
                style={{ color: textColor }}
              />
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] mb-1.5" style={{ color: labelColor }}>确认新密码</p>
              <input
                type="password"
                placeholder="再次输入新密码"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className="w-full text-[15px] outline-none bg-transparent"
                style={{ color: textColor }}
              />
            </div>
          </div>

          {pwd1 && pwd2 && pwd1 !== pwd2 && (
            <p className="text-[13px]" style={{ color: '#f87171' }}>两次输入的密码不一致</p>
          )}

          <button
            onClick={() => onSubmit(currentPwd, pwd1, pwd2)}
            disabled={!currentPwd || !pwd1 || !pwd2 || pwd1 !== pwd2 || loading}
            className="w-full py-3.5 rounded-2xl text-[15px] font-semibold disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #00FFB3, #00D9FF)', color: '#000000' }}
          >
            {loading ? <FaSpinner className="animate-spin mx-auto" /> : '确认修改'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const ResetPasswordPage = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  isDarkMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
  loading: boolean;
  isDarkMode: boolean;
}) => {
  useScrollLock(isOpen);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!isOpen) setEmail('');
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const bg = isDarkMode ? '#0b1324' : '#f5f5f7';
  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const cardBorder = isDarkMode ? '#1f2937' : '#ececf1';
  const labelColor = isDarkMode ? '#94a3b8' : '#9ca3af';
  const textColor = isDarkMode ? '#e5e7eb' : '#000000';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10003]"
      style={{ background: bg, fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 flex items-center justify-center"
            style={{ color: labelColor }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: textColor }}>找回密码</h2>
        </div>

        <div className="px-4 pt-6 space-y-3">
          <p className="text-[14px] leading-relaxed mb-2" style={{ color: labelColor }}>
            请输入注册时使用的邮箱，我们将发送一封包含重置密码链接的邮件。
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="px-4 py-3">
              <p className="text-[11px] mb-1.5" style={{ color: labelColor }}>注册邮箱</p>
              <input
                type="email"
                placeholder="输入注册邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-[15px] outline-none bg-transparent"
                style={{ color: textColor }}
              />
            </div>
          </div>

          <button
            onClick={() => onSubmit(email)}
            disabled={!email.trim() || loading}
            className="w-full py-3.5 rounded-2xl text-[15px] font-semibold disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #00FFB3, #00D9FF)', color: '#000000' }}
          >
            {loading ? <FaSpinner className="animate-spin mx-auto" /> : '发送重置邮件'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const FontSizePage = ({
  isOpen,
  onClose,
  currentFontSize,
  onSave,
  isDarkMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentFontSize: 'small' | 'normal' | 'large';
  onSave: (size: 'small' | 'normal' | 'large') => void;
  isDarkMode: boolean;
}) => {
  useScrollLock(isOpen);
  const [draftFontSize, setDraftFontSize] = useState<'small' | 'normal' | 'large'>(currentFontSize);
  const [followSystem, setFollowSystem] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraftFontSize(currentFontSize);
  }, [isOpen, currentFontSize]);

  if (!isOpen) return null;

  const options: Array<{ key: 'small' | 'normal' | 'large'; label: string }> = [
    { key: 'small', label: '标准' },
    { key: 'normal', label: '大号' },
    { key: 'large', label: '超大' },
  ];
  const currentIndex = options.findIndex(item => item.key === draftFontSize);
  const previewFontSize = followSystem
    ? '20px'
    : draftFontSize === 'small'
      ? '18px'
      : draftFontSize === 'large'
        ? '24px'
        : '20px';
  const previewLineHeight = followSystem
    ? '40px'
    : draftFontSize === 'small'
      ? '34px'
      : draftFontSize === 'large'
        ? '46px'
        : '40px';

  const overlayBg = isDarkMode ? '#0b1324' : '#f5f5f7';
  const headingColor = isDarkMode ? '#e5e7eb' : '#000000';
  const bodyColor = isDarkMode ? '#d5d9e5' : '#303133';
  const subtleTextColor = isDarkMode ? '#94a3b8' : '#9ca3af';
  const optionLabelColor = isDarkMode ? '#64748b' : '#b0b3b8';
  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const cardBorder = isDarkMode ? '#1f2937' : 'transparent';
  const sliderAccent = isDarkMode ? '#475569' : '#c8cdd3';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000]"
      style={{ background: overlayBg, fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 text-[16px]"
            style={{ color: subtleTextColor }}
          >
            取消
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: headingColor }}>字体大小</h2>
          <button
            onClick={() => {
              onSave(followSystem ? 'normal' : draftFontSize);
              onClose();
            }}
            className="absolute right-4 text-[16px] font-medium"
            style={{ color: '#ff7f9f' }}
          >
            保存
          </button>
        </div>

        <div className="px-6 pt-10 text-center">
          <p style={{ color: bodyColor, fontSize: previewFontSize, lineHeight: previewLineHeight }}>
            拖动下面的滑块，可设置 Orbit App 的字体大小。选择
            合适的档位后，点击右上角保存即可应用。
          </p>
        </div>

        <div
          className="fixed left-4 right-4 bottom-[max(16px,env(safe-area-inset-bottom))+20px] rounded-3xl p-5"
          style={{
            background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: '1.5rem',
            padding: '1.25rem'
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[20px] font-semibold" style={{ color: headingColor }}>跟随系统设置</span>
            <button
              onClick={() => setFollowSystem((prev) => !prev)}
              className="w-14 h-8 rounded-full transition-colors flex items-center"
              style={{ background: followSystem ? '#ff2442' : (isDarkMode ? '#1f2937' : '#d1d5db') }}
            >
              <motion.div
                animate={{ x: followSystem ? 30 : 2 }}
                className="w-7 h-7 rounded-full shadow"
                style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }}
              />
            </button>
          </div>
          <p className="mt-2 text-[13px]" style={{ color: subtleTextColor }}>开启后 Orbit App 的字体大小将跟随系统设置</p>

          <div className="mt-4">
            <div className="flex items-center justify-between px-1 mb-4">
              {options.map((item) => (
                <span key={item.key} className="text-[12px]" style={{ color: optionLabelColor }}>{item.label}</span>
              ))}
            </div>

            <input
              type="range"
              min={0}
              max={options.length - 1}
              step={1}
              value={currentIndex < 0 ? 1 : currentIndex}
              disabled={followSystem}
              onChange={(e) => setDraftFontSize(options[Number(e.target.value)]?.key || 'normal')}
              className="w-full"
              style={{ accentColor: sliderAccent }}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

const DarkModePage = ({
  isOpen,
  onClose,
  themeMode,
  onChangeTheme,
}: {
  isOpen: boolean;
  onClose: () => void;
  themeMode: 'light' | 'dark' | 'system';
  onChangeTheme: (mode: 'light' | 'dark' | 'system') => void;
}) => {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const followSystem = themeMode === 'system';
  const isDark = themeMode === 'dark' || (followSystem && prefersDark);
  const darkEnabled = !followSystem && themeMode === 'dark';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000]"
      style={{ background: isDark ? '#0b1324' : '#f5f5f7', fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif', overscrollBehaviorY: 'contain' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
        style={{ background: isDark ? '#0b1324' : undefined, WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: isDark ? '#e5e7eb' : '#000000' }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: isDark ? '#f9fafb' : '#000000' }}>深色模式</h2>
        </div>

        <div className="px-4 pt-3 space-y-3">
          <div className="rounded-2xl px-3 py-2.5 flex items-center justify-between" style={{ background: isDark ? '#0f172a' : '#ffffff', border: `1px solid ${isDark ? '#1f2937' : '#ececf1'}` }}>
            <span className="text-[13px]" style={{ color: isDark ? '#e5e7eb' : '#000000' }}>深色模式</span>
            <button
              onClick={() => onChangeTheme(darkEnabled ? 'light' : 'dark')}
              className="w-10 h-5 rounded-full transition-colors"
              style={{ background: darkEnabled ? '#38bdf8' : (isDark ? '#1f2937' : '#d1d5db') }}
            >
              <motion.div animate={{ x: darkEnabled ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDark ? '#0b1324' : '#ffffff' }} />
            </button>
          </div>

          <div className="rounded-2xl px-3 py-2.5" style={{ background: isDark ? '#0f172a' : '#ffffff', border: `1px solid ${isDark ? '#1f2937' : '#ececf1'}` }}>
            <div className="flex items-center justify-between">
              <span className="text-[13px]" style={{ color: isDark ? '#e5e7eb' : '#000000' }}>跟随系统设置</span>
              <button
                onClick={() => onChangeTheme(followSystem ? (darkEnabled ? 'dark' : 'light') : 'system')}
                className="w-10 h-5 rounded-full transition-colors"
                style={{ background: followSystem ? '#38bdf8' : (isDark ? '#1f2937' : '#d1d5db') }}
              >
                <motion.div animate={{ x: followSystem ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDark ? '#0b1324' : '#ffffff' }} />
              </button>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: isDark ? '#94a3b8' : '#9ca3baf' }}>开启后根据系统设置同步切换深/浅模式</p>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};


// 1. 添加好友弹窗（支持：临时好友 + 已注册真实好友）
const AddFriendModal = ({
  isOpen,
  onClose,
  onAddVirtual,
  onAddReal,
  virtualFriends,
  onBindExisting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAddVirtual: (name: string, remark: string) => Promise<void>;
  onAddReal: (code: string) => Promise<void>;
  virtualFriends: any[];
  onBindExisting: (friendId: string, code: string) => Promise<void>;
}) => {
  const [tab, setTab] = useState<'virtual' | 'real'>('virtual');
  const [name, setName] = useState('');
  const [remark, setRemark] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  // real tab state machine: 'input' | 'preview'
  const [realStep, setRealStep] = useState<'input' | 'preview'>('input');
  const [previewProfile, setPreviewProfile] = useState<any>(null);
  const [bindTarget, setBindTarget] = useState<string>('new'); // 'new' or friendshipId

  useScrollLock(isOpen);

  const handleAdd = async () => {
    if (loading) return;
    if (tab === 'virtual') {
      if (!name.trim()) return;
      setLoading(true);
      try {
        await onAddVirtual(name.trim(), remark.trim());
        setName('');
        setRemark('');
        onClose();
      } catch (err: any) {
        alert(err?.message || '添加失败');
      } finally {
        setLoading(false);
      }
    } else {
      if (realStep === 'input') {
        if (code.length < 11) return;
        setLoading(true);
        try {
          // lookup to preview
          const { lookupProfileByInviteCode } = await import('../api/supabase');
          const profile = await lookupProfileByInviteCode(code.trim().toUpperCase());
          setPreviewProfile(profile);
          setBindTarget('new');
          setRealStep('preview');
        } catch (err: any) {
          alert(err.message || '找不到该邀请码对应的用户');
        } finally {
          setLoading(false);
        }
      } else {
        // confirm step
        setLoading(true);
        try {
          if (bindTarget === 'new') {
            await onAddReal(code.trim().toUpperCase());
          } else {
            await onBindExisting(bindTarget, code.trim().toUpperCase());
          }
          setCode(''); setRealStep('input'); setPreviewProfile(null);
          onClose();
        } catch (err: any) {
          const message = err?.message || '操作失败';
          if (/好友申请已发送|等待对方确认|已经和.+建立好友关系/.test(message)) {
            setCode(''); setRealStep('input'); setPreviewProfile(null);
            onClose();
            alert(message);
            return;
          }
          alert(message);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm rounded-3xl p-6 shadow-2xl max-h-[calc(100vh-48px)] overflow-y-auto"
        style={{ background: 'var(--orbit-surface)', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ color: 'var(--orbit-text)' }}>添加好友</h2>
          <button onClick={onClose} className="p-2 rounded-full" style={{ background: 'color-mix(in srgb, var(--orbit-surface) 94%, rgba(0,0,0,0.05))', border: `1px solid var(--orbit-border)` }}>
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        {/* 标签切换 */}
        <div className="flex p-1 rounded-xl mb-5 border" style={{ background: 'color-mix(in srgb, var(--orbit-card) 70%, white)', borderColor: 'var(--orbit-border)' }}>
          <button
            onClick={() => setTab('virtual')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${tab === 'virtual' ? 'bg-white shadow' : ''}`}
            style={{ color: tab === 'virtual' ? '#ff3b30' : 'var(--orbit-text)' }}
          >
            🎭 临时好友
          </button>
          <button
            onClick={() => setTab('real')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${tab === 'real' ? 'bg-emerald-50 shadow' : ''}`}
            style={{ color: tab === 'real' ? '#ff3b30' : 'var(--orbit-text)' }}
          >
            ✅ 已注册好友
          </button>
        </div>

        {tab === 'virtual' ? (
          <div className="mb-6 space-y-3">
            <p className="text-sm text-gray-600">
              输入昵称创建临时好友（马甲），方便打卡记账。等他/她注册后可通过邀请码绑定为真实账号。
            </p>
            <input
              type="text"
              placeholder="好友昵称 *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-orbit-mint/40"
              style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
            />
            <input
              type="text"
              placeholder="备注（选填，如：大学室友）"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-orbit-mint/40"
              style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
            />
          </div>
        ) : realStep === 'input' ? (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              让对方在「我的」页面查看并分享邀请码，输入后可预览对方信息再确认添加。
            </p>
            <input
              type="text"
              placeholder="对方的邀请码（如 ORBIT123456）"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-xl border outline-none font-mono tracking-widest text-center text-base focus:ring-2 focus:ring-orbit-mint/40"
              style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
            />
          </div>
        ) : (
          // preview step
          <div className="mb-6">
            {/* 找到的用户预览 */}
            <div className="flex items-center gap-3 p-3 rounded-2xl mb-4" style={{ background: 'rgba(0, 255, 179, 0.1)', border: '1px solid rgba(0, 255, 179, 0.25)' }}>
              <img
                src={previewProfile?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${previewProfile?.id}`}
                alt={previewProfile?.username}
                className="w-12 h-12 rounded-xl ring-2 ring-[#00FFB3]/30"
              />
              <div>
                <p className="font-bold" style={{ color: 'var(--orbit-text)' }}>{previewProfile?.username}</p>
                <p className="text-xs mt-0.5 text-emerald-600">找到了 ✓</p>
              </div>
            </div>

            {/* 选择：新建 or 绑定已有虚拟好友 */}
            {virtualFriends.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs mb-2 text-gray-600">这是你已有的「{previewProfile?.username}」？选择绑定或新建：</p>
                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === 'new' ? 'border-emerald-400 bg-emerald-50' : 'border-[color:var(--orbit-border)] bg-[color:var(--orbit-card)]'}`} style={{ borderColor: bindTarget === 'new' ? undefined : 'var(--orbit-border)' }}>
                  <input type="radio" name="bindTarget" value="new" checked={bindTarget === 'new'} onChange={() => setBindTarget('new')} className="accent-[#00FFB3]" />
                  <span className="text-sm" style={{ color: 'var(--orbit-text)' }}>➕ 直接添加为新好友</span>
                </label>
                {virtualFriends.map((vf: any) => (
                  <label key={vf.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === vf.id ? 'border-[#FF9F43] bg-orange-50' : 'border-[color:var(--orbit-border)] bg-[color:var(--orbit-card)]'}`} style={{ borderColor: bindTarget === vf.id ? undefined : 'var(--orbit-border)' }}>
                    <input type="radio" name="bindTarget" value={vf.id} checked={bindTarget === vf.id} onChange={() => setBindTarget(vf.id)} className="accent-[#FF9F43]" />
                    <img src={vf.friend.avatar_url} alt={vf.friend.username} className="w-7 h-7 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--orbit-text)' }}>{vf.friend.username}</p>
                      {vf.remark && <p className="text-xs truncate text-gray-500">{vf.remark}</p>}
                    </div>
                    <span className="ml-auto text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded shrink-0">绑定</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {tab === 'real' && realStep === 'preview' && (
            <button
              onClick={() => { setRealStep('input'); setPreviewProfile(null); }}
              className="flex-1 py-3 rounded-xl font-semibold"
              style={{ background: 'var(--orbit-card)', color: 'var(--orbit-text-muted, #6b7280)', border: `1px solid var(--orbit-border)` }}
            >
              返回
            </button>
          )}
          <button
            onClick={handleAdd}
            disabled={loading || (tab === 'virtual' ? !name.trim() : realStep === 'input' ? code.length < 11 : false)}
            className={`flex-1 py-3 rounded-xl font-semibold disabled:opacity-30 flex items-center justify-center gap-2 ${tab === 'virtual'
              ? 'bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black'
              : 'bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white'
              }`}
          >
            {loading && <FaSpinner className="animate-spin" />}
            {tab === 'virtual' ? '添加临时好友' : realStep === 'input' ? '查找' : bindTarget === 'new' ? '确认添加' : '确认绑定'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 1.5 接受好友申请弹窗（与添加好友保持同款样式）
const AcceptFriendModal = ({
  isOpen,
  onClose,
  requester,
  virtualFriends,
  onConfirm,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  requester: any;
  virtualFriends: any[];
  onConfirm: (bindTarget: string) => void;
  loading: boolean;
}) => {
  const [bindTarget, setBindTarget] = useState<string>('new');

  useEffect(() => {
    if (isOpen) {
      setBindTarget('new');
    }
  }, [isOpen, requester?.id]);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm rounded-3xl p-6 shadow-2xl max-h-[calc(100vh-48px)] overflow-y-auto"
        style={{ background: 'var(--orbit-surface)', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ color: 'var(--orbit-text)' }}>接受好友申请</h2>
          <button onClick={onClose} className="p-2 rounded-full" style={{ background: 'color-mix(in srgb, var(--orbit-surface) 94%, rgba(0,0,0,0.05))', border: `1px solid var(--orbit-border)` }}>
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-2xl mb-4" style={{ background: 'rgba(0, 255, 179, 0.1)', border: '1px solid rgba(0, 255, 179, 0.25)' }}>
          <img
            src={requester?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${requester?.id}`}
            alt={requester?.username}
            className="w-12 h-12 rounded-xl ring-2 ring-[#00FFB3]/30"
          />
          <div>
            <p className="font-bold" style={{ color: 'var(--orbit-text)' }}>{requester?.username || '未知用户'}</p>
            <p className="text-xs mt-0.5 text-emerald-600">想添加你为好友</p>
          </div>
        </div>

        {virtualFriends.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs mb-2 text-gray-600">是否绑定到已有马甲好友？</p>
            <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === 'new' ? 'border-emerald-400 bg-emerald-50' : 'border-[color:var(--orbit-border)] bg-[color:var(--orbit-card)]'}`} style={{ borderColor: bindTarget === 'new' ? undefined : 'var(--orbit-border)' }}>
              <input type="radio" name="bindTarget" value="new" checked={bindTarget === 'new'} onChange={() => setBindTarget('new')} className="accent-[#00FFB3]" />
              <span className="text-sm" style={{ color: 'var(--orbit-text)' }}>✅ 直接接受（不绑定）</span>
            </label>
            <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '260px' }}>
              {virtualFriends.map((vf: any) => (
                <label key={vf.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === vf.id ? 'border-[#FF9F43] bg-orange-50' : 'border-[color:var(--orbit-border)] bg-[color:var(--orbit-card)]'}`} style={{ borderColor: bindTarget === vf.id ? undefined : 'var(--orbit-border)' }}>
                  <input type="radio" name="bindTarget" value={vf.id} checked={bindTarget === vf.id} onChange={() => setBindTarget(vf.id)} className="accent-[#FF9F43]" />
                  <img src={vf.friend.avatar_url} alt={vf.friend.username} className="w-7 h-7 rounded-lg" />
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--orbit-text)' }}>{vf.friend.username}</p>
                    {vf.remark && <p className="text-xs truncate text-gray-500">{vf.remark}</p>}
                  </div>
                  <span className="ml-auto text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded shrink-0">绑定</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold"
            style={{ background: 'var(--orbit-card)', color: 'var(--orbit-text-muted, #6b7280)', border: `1px solid var(--orbit-border)` }}
          >
            取消
          </button>
          <button
            disabled={loading}
            onClick={() => onConfirm(bindTarget)}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold disabled:opacity-50"
          >
            {loading ? <FaSpinner className="inline-block animate-spin" /> : '确认接受'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 2. 临时好友绑定弹窗 (新增：用于把临时好友绑定为真实账号)
const BindFriendModal = ({
  friend,
  isOpen,
  onClose,
  onBind
}: {
  friend: any;
  isOpen: boolean;
  onClose: () => void;
  onBind: (tempId: string, inviteCode: string) => void;
}) => {
  useScrollLock(isOpen);
  const [code, setCode] = useState('');

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm rounded-3xl p-6 shadow-2xl"
        style={{ background: 'var(--orbit-surface)', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--orbit-text)' }}>绑定真实账号</h2>
          <button onClick={onClose} className="p-2 rounded-full" style={{ background: 'color-mix(in srgb, var(--orbit-surface) 94%, rgba(0,0,0,0.05))', border: `1px solid var(--orbit-border)` }}>
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        <p className="text-sm mb-6 text-gray-600">
          【<span className="text-emerald-600">{friend.real_username || friend.username}</span>】目前是临时好友。当他/她注册后，输入他/她的邀请码，即可将过去的回忆和账单无缝同步过去！
        </p>

        <input
          type="text"
          placeholder="请输入对方的 6 位邀请码"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-orbit-mint/40 mb-6 font-mono tracking-widest text-center text-lg"
          style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        />

        <button
          onClick={() => { onBind(friend.id, code); }}
          disabled={code.length < 6}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white font-semibold disabled:opacity-30"
        >
          立即绑定关联
        </button>
      </motion.div>
    </motion.div>
  );
};

// 3. 邀请码展示弹窗 (保持不变，用来展示自己的码给别人看)
const InviteCodeModal = ({
  isOpen, onClose, inviteCode, username,
}: {
  isOpen: boolean; onClose: () => void; inviteCode: string; username: string;
}) => {
  useScrollLock(isOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteCode);
      } else {
        // Fallback for mobile/PWA where clipboard API is restricted
        const el = document.createElement('textarea');
        el.value = inviteCode;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Last resort: show the code in an alert so user can copy manually
      alert(`你的邀请码：${inviteCode}`);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm rounded-3xl p-6 shadow-2xl"
        style={{ background: 'var(--orbit-surface)', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--orbit-text)' }}>我的邀请码</h2>
          <button onClick={onClose} className="p-2 rounded-full" style={{ background: 'color-mix(in srgb, var(--orbit-surface) 94%, rgba(0,0,0,0.05))', border: `1px solid var(--orbit-border)` }}>
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        <div className="text-center mb-6">
          <p className="text-sm mb-4 text-gray-600">
            分享给你的临时好友，让他们在列表里点击你，并输入此邀请码进行绑定。
          </p>
          <div className="p-4 rounded-xl border" style={{ background: 'color-mix(in srgb, var(--orbit-card) 80%, white)', borderColor: 'var(--orbit-border)' }}>
            <p className="text-xs mb-2 text-gray-500">你的邀请码</p>
            <p className="text-3xl font-bold tracking-wider" style={{ color: 'var(--orbit-text)' }}>{inviteCode}</p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold flex items-center justify-center gap-2"
        >
          {copied ? <FaCheck /> : <FaCopy />}
          {copied ? '已复制' : '复制邀请码'}
        </button>
      </motion.div>
    </motion.div>
  );
};

// 4. 随机回忆弹窗
const RandomMemoryModal = ({
  memory,
  onClose,
  onShuffle,
  friends,
  currentUser,
  onReport,
  onBlock
}: {
  memory: any;
  onClose: () => void;
  onShuffle?: () => void;
  friends: any[];
  currentUser?: any;
  onReport?: (memory: any) => void;
  onBlock?: (userId: string) => void;
}) => {
  useScrollLock(!!memory);
  const META_PREFIX = '[orbit_meta:';
  const AUDIO_PREFIX = '[audio]';
  const AUDIO_SPLIT = '||';
  const [showMenu, setShowMenu] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [showQuickComment, setShowQuickComment] = useState(false);
  const [quickCommentText, setQuickCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const showH = Keyboard.addListener('keyboardWillShow', (info) => setKbHeight(info.keyboardHeight));
    const hideH = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
    return () => { showH.then(h => h.remove()); hideH.then(h => h.remove()); };
  }, []);
  const [listening, setListening] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const speechRef = useRef<any>(null);

  const decodeMemoryContent = (content: string): { text: string; weather: string; mood: string; route: string } => {
    if (!content?.startsWith(META_PREFIX)) return { text: stripOrbitMetaText(content || ''), weather: '', mood: '', route: '' };
    const end = content.indexOf(']\n');
    if (end === -1) return { text: stripOrbitMetaText(content), weather: '', mood: '', route: '' };
    try {
      const meta = JSON.parse(content.slice(META_PREFIX.length, end));
      return { text: stripOrbitMetaText(content.slice(end + 2)), weather: meta.weather || '', mood: meta.mood || '', route: meta.route || '' };
    } catch {
      return { text: stripOrbitMetaText(content), weather: '', mood: '', route: '' };
    }
  };
  const photos = [
    ...(Array.isArray(memory?.photos) ? memory.photos : []),
    ...(Array.isArray(memory?.media_urls) ? memory.media_urls : []),
  ].filter(Boolean);

  const decodeCommentContent = (content: string) => {
    let rest = content || '';
    let audioUrl: string | undefined;
    if (rest.startsWith(AUDIO_PREFIX)) {
      const idx = rest.indexOf(AUDIO_SPLIT);
      if (idx !== -1) {
        audioUrl = rest.slice(AUDIO_PREFIX.length, idx);
        rest = rest.slice(idx + AUDIO_SPLIT.length);
      }
    }
    return { text: rest, audioUrl };
  };
  const getVisibleTags = () => getVisibleTaggedFriendIds(
    memory?.tagged_friends || [],
    memory?.user_id,
    currentUser?.id,
    friends
  );

  const getTagName = (friendId: string) => getTaggedDisplayName(
    friendId,
    memory?.user_id,
    currentUser || null,
    friends
  );

  useEffect(() => {
    if (!memory?.id) {
      setCommentCount(0);
      return;
    }
    let cancelled = false;
    getMemoryComments([memory.id])
      .then((list: any[]) => {
        if (cancelled) return;
        setCommentCount(list.length || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setCommentCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [memory?.id]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [memory?.id]);

  useEffect(() => {
    if (!showCommentsPanel) return;
    void fetchComments();
  }, [showCommentsPanel]);

  const goPrevPhoto = () => {
    if (photos.length <= 1) return;
    setPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  const goNextPhoto = () => {
    if (photos.length <= 1) return;
    setPhotoIndex((i) => (i + 1) % photos.length);
  };

  const resolveCommentUser = (authorId?: string) => {
    if (!authorId) return { username: '好友', avatar: '' };
    if (currentUser?.id && authorId === currentUser.id) {
      return { username: currentUser.username || '我', avatar: currentUser.avatar_url || '' };
    }
    const friend = friends.find((item: any) => item.friend?.id === authorId)?.friend || friends.find((item: any) => item.id === authorId);
    if (friend) return { username: friend.username || '好友', avatar: friend.avatar_url || '' };
    if (memory?.user_id && authorId === memory.user_id) {
      return { username: memory?.username || '好友', avatar: memory?.avatar_url || '' };
    }
    return { username: '共同好友', avatar: '' };
  };

  const mapCommentList = (list: any[]) =>
    (list || []).map((item) => {
      const meta = resolveCommentUser(item.author_id);
      return { ...item, username: item.username || meta.username, user_avatar: item.user_avatar || meta.avatar };
    });

  const handleSubmitQuickComment = async () => {
    const text = quickCommentText.trim();
    if (!text || !memory?.id || !currentUser?.id || sendingComment) return;
    setSendingComment(true);
    try {
      await addMemoryComment(memory.id, currentUser.id, text);
      setQuickCommentText('');
      setCommentCount((c) => c + 1);
      setShowQuickComment(false);
      if (showCommentsPanel) {
        await fetchComments();
      }
    } catch (error: any) {
      alert(error?.message || '评论发送失败');
    } finally {
      setSendingComment(false);
    }
  };

  const fetchComments = async () => {
    if (!memory?.id) return;
    setLoadingComments(true);
    try {
      const list = await getMemoryComments([memory.id]);
      const mapped = mapCommentList(Array.isArray(list) ? list : []);
      setComments(mapped);
      setCommentCount(mapped.length);
    } catch (err) {
      console.error('load comments failed', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleOpenComments = () => {
    setShowCommentsPanel(true);
    setShowQuickComment(false);
    void fetchComments();
  };

  const handleSubmitComment = async () => {
    const text = quickCommentText.trim();
    if (!text || !memory?.id || !currentUser?.id || sendingComment) return;
    setSendingComment(true);
    try {
      const content = replyTo ? `@${replyTo.name} ${text}` : text;
      await addMemoryComment(memory.id, currentUser.id, content);
      setQuickCommentText('');
      setReplyTo(null);
      await fetchComments();
    } catch (error: any) {
      alert(error?.message || '评论发送失败');
    } finally {
      setSendingComment(false);
    }
  };

  const stopSpeech = () => {
    try {
      speechRef.current?.stop?.();
    } catch (_) { }
    setListening(false);
  };

  const handleVoiceToText = () => {
    if (listening) {
      stopSpeech();
      return;
    }
    const SpeechCtor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechCtor) {
      alert('当前设备不支持语音输入');
      return;
    }
    const recog = new SpeechCtor();
    speechRef.current = recog;
    recog.lang = 'zh-CN';
    recog.continuous = false;
    recog.interimResults = false;
    recog.onstart = () => setListening(true);
    recog.onerror = () => stopSpeech();
    recog.onend = () => stopSpeech();
    recog.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setQuickCommentText((prev) => `${prev ? `${prev} ` : ''}${transcript}`.trim());
      }
    };
    try {
      recog.start();
    } catch (_) {
      stopSpeech();
    }
  };

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  if (!memory) return null;
  const date = new Date(memory.memory_date || memory.created_at);
  const { text, weather, mood, route } = decodeMemoryContent(memory.content || '');
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xl flex items-center justify-center p-4"
      style={{
        paddingBottom: kbHeight > 0 ? `${kbHeight + 16}px` : undefined,
        transition: 'padding-bottom 200ms cubic-bezier(0.33, 1, 0.68, 1)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 250 }}
        className="w-full max-w-lg rounded-3xl border shadow-2xl min-h-[50vh] relative overflow-hidden flex flex-col touch-pan-y"
        style={{
          background: 'var(--orbit-surface)',
          borderColor: 'var(--orbit-border)',
          color: 'var(--orbit-text)',
          maxHeight: kbHeight > 0 ? `calc(100dvh - ${kbHeight + 32}px)` : '85vh',
          transition: 'max-height 200ms cubic-bezier(0.33, 1, 0.68, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — outside scroll area so it stays fixed while content scrolls */}
        <div className="flex justify-between items-start p-5 pb-3 flex-shrink-0" style={{ borderBottom: '0.5px solid var(--orbit-border)' }}>
          <div>
            <p className="text-[#0f9f6e] text-xs font-semibold tracking-wide mb-1">🎲 随机回忆</p>
            <h2 className="font-bold text-lg text-[color:var(--orbit-text)]">
              {date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            {memory.location && <p className="text-sm mt-0.5 text-[color:var(--orbit-text-muted)]">📍 {memory.location.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            {currentUser?.id !== memory.user_id && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 rounded-full shadow-sm"
                  style={{ background: 'color-mix(in srgb, var(--orbit-surface) 90%, rgba(255,255,255,0.9))', border: '1px solid var(--orbit-border)', color: 'var(--orbit-text)' }}
                  aria-label="更多"
                >
                  <FaEllipsisH />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-2 w-32 rounded-xl shadow-xl overflow-hidden z-[110] animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--orbit-card)', border: '1px solid var(--orbit-border)' }}>
                    <button
                      onClick={() => { setShowMenu(false); onReport?.(memory); }}
                      className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                      style={{ color: '#ef4444' }}
                    >
                      举报该内容
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); onBlock?.(memory.user_id); }}
                      className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                      style={{ color: 'var(--orbit-text)' }}
                    >
                      屏蔽作者
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => onShuffle?.()}
              className="p-2 rounded-full shadow-sm"
              style={{ background: 'color-mix(in srgb, var(--orbit-surface) 90%, rgba(255,255,255,0.9))', border: '1px solid var(--orbit-border)', color: 'var(--orbit-text)' }}
              title="换一条"
              aria-label="换一条随机回忆"
            >
              <FaSyncAlt />
            </button>
            <button
              onClick={() => handleOpenComments()}
              className="relative p-2 rounded-full shadow-sm"
              style={{ background: 'color-mix(in srgb, var(--orbit-surface) 90%, rgba(255,255,255,0.9))', border: '1px solid var(--orbit-border)', color: '#0f9f6e' }}
              aria-label="查看评论"
            >
              <FaComment />
              {commentCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#0f9f6e] text-white text-[10px] leading-4 font-bold text-center">
                  {commentCount > 99 ? '99+' : commentCount}
                </span>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full shadow-sm"
              style={{ background: 'color-mix(in srgb, var(--orbit-surface) 90%, rgba(255,255,255,0.9))', border: '1px solid var(--orbit-border)', color: 'var(--orbit-text)' }}
            >
              <FaTimes />
            </button>
          </div>
        </div>
        {/* Scrollable content area only */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar pb-12" style={{ overscrollBehaviorY: 'contain' }}>
          <div className="px-5 pb-35 w-full break-words">
            {photos.length > 0 && (
              <div
                className="relative w-full mb-4 overflow-hidden rounded-2xl border"
                style={{ borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 60%, transparent)' }}
                onTouchStart={(e) => {
                  touchStartXRef.current = e.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(e) => {
                  if (touchStartXRef.current == null) return;
                  const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
                  const delta = endX - touchStartXRef.current;
                  touchStartXRef.current = null;
                  if (Math.abs(delta) < 35) return;
                  if (delta > 0) goPrevPhoto(); else goNextPhoto();
                }}
              >
                <img src={photos[photoIndex]} className="w-full object-cover max-h-72" />
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={goPrevPhoto}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(17,24,39,0.45)', color: '#fff' }}
                      aria-label="上一张"
                    >
                      <FaChevronLeft className="text-xs" />
                    </button>
                    <button
                      onClick={goNextPhoto}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(17,24,39,0.45)', color: '#fff' }}
                      aria-label="下一张"
                    >
                      <FaChevronRight className="text-xs" />
                    </button>
                    <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
                      {photos.map((_: any, i: number) => (
                        <span key={`random-dot-${i}`} className="w-1.5 h-1.5 rounded-full" style={{ background: i === photoIndex ? '#ffffff' : 'rgba(255,255,255,0.45)' }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {(text || weather || mood || route) && (
              <div className="space-y-3 mb-4">
                {text && <p className="leading-relaxed whitespace-pre-wrap text-[color:var(--orbit-text)]">{text}</p>}
                {(weather || mood || route) && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    {weather && <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)', color: 'var(--orbit-text)' }}>天气：{weather}</span>}
                    {mood && <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)', color: 'var(--orbit-text)' }}>心情：{mood}</span>}
                    {route && <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)', color: 'var(--orbit-text)' }}>路线：{route}</span>}
                  </div>
                )}
              </div>
            )}
            {(showQuickComment || showCommentsPanel) && (
              <div className="mb-4 pt-3 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                {showCommentsPanel && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--orbit-text)' }}>全部评论</p>
                      <div className="text-xs" style={{ color: 'var(--orbit-text-muted)' }}>{loadingComments ? '加载中…' : `${commentCount} 条`}</div>
                    </div>
                    <div className="max-h-48 overflow-y-auto pr-1 space-y-3">
                      {loadingComments ? (
                        <p className="text-xs" style={{ color: 'var(--orbit-text-muted)' }}>正在加载评论…</p>
                      ) : comments.length ? (
                        comments.map((c) => {
                          const { text: commentText, audioUrl } = decodeCommentContent(c.content || c.text || '');
                          return (
                            <div key={c.id || c.created_at} className="flex gap-2">
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-[color:var(--orbit-card)] border" style={{ borderColor: 'var(--orbit-border)' }}>
                                {c.user_avatar ? <img src={c.user_avatar} alt={c.username || '用户'} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--orbit-text-muted)' }}>{(c.username || '?')[0]}</div>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold" style={{ color: 'var(--orbit-text)' }}>{c.username || '用户'}</span>
                                  <span className="text-[11px]" style={{ color: 'var(--orbit-text-muted)' }}>{c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                </div>
                                {commentText && (
                                  <p className="text-sm mt-0.5 whitespace-pre-wrap" style={{ color: 'var(--orbit-text)' }}>{commentText}</p>
                                )}
                                {audioUrl && (
                                  <audio controls className="mt-1 w-full" src={audioUrl} preload="metadata" />
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyTo({ id: c.user_id || c.userId, name: c.username || '用户' });
                                    setQuickCommentText((prev) => `@${c.username || '用户'} ${prev}`.trim());
                                  }}
                                  className="text-xs mt-1"
                                  style={{ color: '#0f9f6e' }}
                                >
                                  回复
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--orbit-text-muted)' }}>还没有评论，来抢沙发吧～</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={quickCommentText}
                    onChange={(e) => setQuickCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSubmitComment();
                      }
                    }}
                    onFocus={(e) => {
                      const el = e.target;
                      setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 350);
                    }}
                    placeholder={replyTo ? `回复 ${replyTo.name}...` : '写点什么，支持语音转文字'}
                    className="flex-1 rounded-xl px-3 py-2 text-sm border outline-none"
                    style={{ background: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                  />
                  <button
                    type="button"
                    onClick={handleVoiceToText}
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: listening ? 'rgba(59,130,246,0.16)' : 'rgba(15,159,110,0.12)', color: listening ? '#2563eb' : '#0f9f6e' }}
                    aria-label="语音转文字"
                  >
                    <FaMicrophone className="text-sm" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmitComment()}
                    disabled={!quickCommentText.trim() || sendingComment}
                    className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40"
                    style={{ background: 'rgba(15,159,110,0.16)', color: '#0f9f6e' }}
                    aria-label="发送评论"
                  >
                    <FaPaperPlane className="text-sm" />
                  </button>
                </div>
              </div>
            )}
            {memory.tagged_friends?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {getVisibleTags().map((id: string) => {
                  const name = getTagName(id);
                  if (!name) return null;
                  return <span key={id} className="text-[#0f9f6e] text-sm font-semibold">@{name}</span>;
                })}
              </div>
            )}
          </div>
        </div>
        {/* Scroll Hint Mask */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[var(--orbit-surface)] to-transparent pointer-events-none rounded-b-3xl" />
      </motion.div>
    </motion.div>
  );
};

// 5. 回忆录照片查看弹窗（独立于随机回忆）
const MemoirMemoryModal = ({
  memory,
  onClose,
  initialIndex = 0,
  onReport,
  onBlock,
}: {
  memory: any;
  onClose: () => void;
  initialIndex?: number;
  onReport?: (memory: any) => void;
  onBlock?: (userId: string) => void;
}) => {
  const { currentUser } = useUserStore();
  const [showMenu, setShowMenu] = useState(false);
  const META_PREFIX = '[orbit_meta:';
  const decodeMemoryContent = (content: string): { text: string; weather: string; mood: string; route: string } => {
    if (!content?.startsWith(META_PREFIX)) return { text: stripOrbitMetaText(content || ''), weather: '', mood: '', route: '' };
    const end = content.indexOf(']\n');
    if (end === -1) return { text: stripOrbitMetaText(content), weather: '', mood: '', route: '' };
    try {
      const meta = JSON.parse(content.slice(META_PREFIX.length, end));
      return { text: stripOrbitMetaText(content.slice(end + 2)), weather: meta.weather || '', mood: meta.mood || '', route: meta.route || '' };
    } catch {
      return { text: stripOrbitMetaText(content), weather: '', mood: '', route: '' };
    }
  };
  const photos = [
    ...(Array.isArray(memory?.photos) ? memory.photos : []),
    ...(Array.isArray(memory?.media_urls) ? memory.media_urls : []),
  ].filter(Boolean);
  const [photoIndex, setPhotoIndex] = useState(Math.max(0, Math.min(initialIndex, Math.max(photos.length - 1, 0))));
  const touchStartXRef = useRef<number | null>(null);

  useScrollLock(true);

  useEffect(() => {
    setPhotoIndex(Math.max(0, Math.min(initialIndex, Math.max(photos.length - 1, 0))));
  }, [memory?.id, initialIndex, photos.length]);

  const goPrev = () => {
    if (photos.length <= 1) return;
    setPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  const goNext = () => {
    if (photos.length <= 1) return;
    setPhotoIndex((i) => (i + 1) % photos.length);
  };

  if (!memory || photos.length === 0) return null;
  const date = new Date(memory.memory_date || memory.created_at || Date.now());
  const { text, weather, mood, route } = decodeMemoryContent(memory.content || '');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 10 }}
        className="w-full max-w-lg max-h-[85vh] rounded-3xl border shadow-2xl flex flex-col"
        style={{ background: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start p-5 pb-3 flex-shrink-0">
          <div>
            <p className="text-[#0f9f6e] text-xs font-semibold tracking-wide mb-1">📖 回忆录</p>
            <h2 className="font-bold text-lg text-[color:var(--orbit-text)]">
              {date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            {memory.location && <p className="text-sm mt-0.5 text-[color:var(--orbit-text-muted)]">📍 {memory.location.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            {photos.length > 1 && (
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--orbit-card) 60%, transparent)', color: 'var(--orbit-text-muted)' }}>
                {photoIndex + 1}/{photos.length}
              </span>
            )}
            {currentUser?.id !== memory.user_id && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--orbit-text)' }}
                >
                  <FaEllipsisH className="text-sm" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-2 w-32 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 border" style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}>
                    <button
                      onClick={() => { setShowMenu(false); onReport?.(memory); }}
                      className="w-full text-left px-4 py-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-red-500"
                    >
                      Report Content
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); onBlock?.(memory.user_id); }}
                      className="w-full text-left px-4 py-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-t"
                      style={{ color: 'var(--orbit-text)', borderColor: 'var(--orbit-border)' }}
                    >
                      Block User
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--orbit-text)' }}
              aria-label="Close"
            >
              <FaTimes className="text-lg" />
            </button>
          </div>
        </div>


        <div className="flex-1 overflow-y-auto" style={{ overscrollBehaviorY: 'contain' }}>
        <div
          className="relative w-full mb-4 overflow-hidden rounded-2xl border"
          style={{ minHeight: '42vh', maxHeight: '70vh', borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 60%, transparent)' }}
          onTouchStart={(e) => {
            touchStartXRef.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            if (touchStartXRef.current == null) return;
            const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
            const delta = endX - touchStartXRef.current;
            touchStartXRef.current = null;
            if (Math.abs(delta) < 35) return;
            if (delta > 0) goPrev(); else goNext();
          }}
        >
          <img
            src={photos[photoIndex]}
            alt={`memoir-${photoIndex + 1}`}
            className="w-full h-full object-contain"
            style={{ maxHeight: '70vh' }}
          />

          {photos.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(17,24,39,0.45)', color: '#fff' }}
                aria-label="上一张"
              >
                <FaChevronLeft className="text-sm" />
              </button>
              <button
                onClick={goNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(17,24,39,0.45)', color: '#fff' }}
                aria-label="下一张"
              >
                <FaChevronRight className="text-sm" />
              </button>
            </>
          )}
        </div>

        <div className="px-5 pb-5">
          {(text || weather || mood || route) && (
            <div className="space-y-3 mb-4">
              {text && (
                <div className="relative group max-h-[144px]">
                  <div className="max-h-[144px] overflow-y-auto pr-1 pb-6 custom-scrollbar">
                    <p className="leading-relaxed whitespace-pre-wrap text-[color:var(--orbit-text)]">{text}</p>
                  </div>
                  {/* Fade-out mask at the bottom to indicate more text */}
                  <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-[var(--orbit-surface)] via-[var(--orbit-surface)]/80 to-transparent" />
                </div>
              )}
              {(weather || mood || route) && (
                <div className="flex flex-wrap gap-2 text-sm">
                  {weather && <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)', color: 'var(--orbit-text)' }}>天气：{weather}</span>}
                  {mood && <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)', color: 'var(--orbit-text)' }}>心情：{mood}</span>}
                  {route && <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--orbit-border)', background: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)', color: 'var(--orbit-text)' }}>路线：{route}</span>}
                </div>
              )}
            </div>
          )}

          {photos.length > 1 && (
            <div className="pt-1 flex items-center justify-center gap-1.5">
              {photos.map((_: any, i: number) => (
                <span
                  key={`dot-${i}`}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: i === photoIndex ? '#111827' : '#d1d5db' }}
                />
              ))}
            </div>
          )}
          {!text && !weather && !mood && !route && (
            <p className="text-sm" style={{ color: 'var(--orbit-text-muted)' }}>这条回忆暂无文字描述</p>
          )}
        </div>
        </div>{/* end scrollable body */}
      </motion.div >
    </motion.div >
  );
};

// 5. 共同记忆弹窗 (已重构：支持右向左滑、安全区、亮色模式)
const SharedMemoriesModal = ({
  friend,
  memories,
  onClose,
  isDarkMode,
  onReportUser,
  onBlockUser,
}: {
  friend: any;
  memories: any[];
  onClose: () => void;
  isDarkMode: boolean;
  onReportUser?: (user: any) => void;
  onBlockUser?: (user: any) => void;
}) => {
  useScrollLock(true);
  const { currentUser } = useUserStore();
  const [showMenu, setShowMenu] = useState(false);
  const [activeMemoryId, setActiveMemoryId] = useState<string | null>(null);
  const hasRemark = friend?.username !== friend?.real_username;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xl"
      style={{ overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="h-[100dvh] w-full flex flex-col overflow-hidden"
        style={{
          backgroundColor: isDarkMode ? '#070707' : '#f5f5f7',
          color: isDarkMode ? '#f3f4f6' : '#111827',
          WebkitOverflowScrolling: 'touch'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header 适配亮色并加入安全区内边距 */}
        <div
          className="safe-top sticky top-0 z-20 flex items-center justify-between px-4 pb-4 border-b transition-colors"
          style={{
            background: isDarkMode ? '#1a1a1a' : '#ffffff',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)'
          }}
        >
          <button
            onClick={onClose}
            className="p-2 rounded-full active:opacity-60"
            style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}
          >
            <FaTimes />
          </button>
          <div className="text-center flex-1 mx-4 min-w-0">
            <h2 className="text-lg font-bold truncate">
              与 {friend?.username} 的共同记忆
            </h2>
            {hasRemark && (
              <p className="opacity-40 text-xs mt-0.5 truncate">账号名：{friend?.real_username}</p>
            )}
          </div>
          <div className="w-10 relative flex justify-end">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-full active:opacity-60"
              style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}
            >
              <FaEllipsisH />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-32 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200" style={{ background: isDarkMode ? '#1e293b' : '#ffffff', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
                <button
                  onClick={() => { setShowMenu(false); onReportUser?.(friend); }}
                  className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: '#ef4444' }}
                >
                  举报该用户
                </button>
                <button
                  onClick={() => { setShowMenu(false); onBlockUser?.(friend); }}
                  className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: isDarkMode ? '#e5e7eb' : '#111827' }}
                >
                  屏蔽该用户
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-y-auto p-4 pb-24">
          {memories.length > 0 ? (
            <div className="space-y-4">
              {memories.map((memory) => {
                const isMyMemory = memory.user_id === memory.friend?.id; // 这里判断逻辑可能需要微调，取决于 context，但 friend 通常是对方
                // 暂时简单点：只要不是自己就可以举报
                return (
                  <div
                    key={memory.id}
                    className="p-5 rounded-3xl border transition-all relative"
                    style={{
                      background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#ffffff',
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      boxShadow: isDarkMode ? 'none' : '0 4px 12px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div className="absolute top-4 right-4 z-10 flex">
                      {currentUser?.id !== memory.user_id && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMemoryId(activeMemoryId === memory.id ? null : memory.id);
                            }}
                            className="p-2 -mr-2 -mt-2 transition-opacity"
                            style={{ color: isDarkMode ? '#e5e7eb' : '#111827' }}
                          >
                            <FaEllipsisH className="text-sm" />
                          </button>
                          {activeMemoryId === memory.id && (
                            <div className="absolute right-0 top-full mt-1 w-28 rounded-xl shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200 border" style={{ background: isDarkMode ? '#1e293b' : '#ffffff', borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMemoryId(null);
                                  onReportUser?.(friend); // Always report the friend context in shared view
                                }}
                                className="w-full text-left px-4 py-2.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 text-red-500"
                              >
                                举报发布者
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMemoryId(null);
                                  onBlockUser?.(friend);
                                }}
                                className="w-full text-left px-4 py-2.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 border-t"
                                style={{ color: isDarkMode ? '#e5e7eb' : '#111827', borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}
                              >
                                屏蔽发布者
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-[15px] leading-relaxed mb-3">
                      {stripOrbitMetaText(memory.content) || '（无文字记录）'}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs opacity-40 font-medium">{memory.memory_date}</p>
                      {memory.location?.name && (
                        <span className="text-[10px] opacity-30 flex items-center gap-1">
                          <FaMapMarkerAlt /> {memory.location.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-20 opacity-30">
              <FaDice className="text-4xl mb-4" />
              <p>还没有共同记忆</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const AccountDiagnosticsModal = ({
  isOpen,
  onClose,
  currentUser,
  friendsCount,
  memoriesCount,
  ledgersCount,
  isDarkMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  friendsCount: number;
  memoriesCount: number;
  ledgersCount: number;
  isDarkMode: boolean;
}) => {
  useScrollLock(isOpen);
  const [checking, setChecking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState('点击“开始检测”后查看诊断结果。');
  const [items, setItems] = useState<Array<{ name: string; ok: boolean; detail: string }>>([]);
  const [reportText, setReportText] = useState('');

  const buildReportText = (
    checks: Array<{ name: string; ok: boolean; detail: string }>,
    summaryText: string,
    errorText?: string,
  ) => {
    const now = new Date().toLocaleString('zh-CN');
    const userLine = currentUser?.id
      ? `${currentUser.username || '未命名用户'} (${currentUser.id})`
      : '未登录用户';
    const lines = [
      `【Orbit 账号诊断报告】`,
      `时间: ${now}`,
      `用户: ${userLine}`,
      `环境: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
      `页面: ${typeof window !== 'undefined' ? window.location.href : 'unknown'}`,
      '',
      `总结: ${summaryText}`,
      '',
      ...checks.map((item) => `- [${item.ok ? '正常' : '异常'}] ${item.name}: ${item.detail}`),
    ];

    if (errorText) {
      lines.push('', `错误: ${errorText}`);
    }

    return lines.join('\n');
  };

  const handleCopyReport = async () => {
    if (!reportText) return;
    setCopying(true);
    setCopied(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportText);
      } else {
        const el = document.createElement('textarea');
        el.value = reportText;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('复制失败，请稍后再试');
    } finally {
      setCopying(false);
    }
  };

  const runDiagnostics = async () => {
    if (!isOpen) return;
    setChecking(true);
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      checks.push({
        name: '登录会话',
        ok: !sessionError && !!sessionData.session,
        detail: sessionError?.message || (sessionData.session ? '会话有效 ✅' : '未检测到有效会话'),
      });

      const { data: userData, error: userError } = await supabase.auth.getUser();
      checks.push({
        name: '认证用户',
        ok: !userError && !!userData.user,
        detail: userError?.message || (userData.user ? `UID: ${userData.user.id}` : '未获取到 auth 用户'),
      });

      if (currentUser?.id) {
        const profile = await getProfile(currentUser.id, currentUser.email || undefined);
        checks.push({
          name: 'Profile 数据',
          ok: !!profile,
          detail: profile ? `昵称：${profile.username || '未设置'}` : 'profiles 表暂无该用户行',
        });
      } else {
        checks.push({
          name: 'Profile 数据',
          ok: false,
          detail: '当前页面没有 currentUser，可能已掉线',
        });
      }

      checks.push({ name: '本地好友缓存', ok: friendsCount >= 0, detail: `共 ${friendsCount} 位` });
      checks.push({ name: '本地记忆缓存', ok: memoriesCount >= 0, detail: `共 ${memoriesCount} 条` });
      checks.push({ name: '本地账单缓存', ok: ledgersCount >= 0, detail: `共 ${ledgersCount} 笔` });

      const failed = checks.filter((c) => !c.ok).length;
      const summaryText = failed === 0 ? '看起来状态很健康，Orbit 正常运转中～' : `发现 ${failed} 个可能异常，建议截图这页给你排查`;
      setSummary(summaryText);
      setItems(checks);
      setReportText(buildReportText(checks, summaryText));
    } catch (e: any) {
      setSummary('诊断中断，请稍后再试');
      const fallbackChecks = [{ name: '系统异常', ok: false, detail: e?.message || '未知错误' }];
      setItems(fallbackChecks);
      setReportText(buildReportText(fallbackChecks, '诊断中断，请稍后再试', e?.message || '未知错误'));
    } finally {
      setChecking(false);
    }
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000]"
      style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7', fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif' }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="h-full w-full overflow-y-auto"
      >
        <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
          <button
            onClick={onClose}
            className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
          >
            <FaChevronLeft className="text-base" />
          </button>
          <h2 className="text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>网络诊断</h2>
          <button onClick={runDiagnostics} disabled={checking} className="absolute right-4 text-[13px] font-semibold disabled:opacity-50" style={{ color: '#0f9f6e' }}>
            {checking ? '检测中…' : items.length ? '重新检测' : '开始检测'}
          </button>
        </div>

        <div className="p-4 pb-24 space-y-3">
          <div className="rounded-2xl border p-4" style={{ borderColor: isDarkMode ? '#1f2937' : '#ececf1', background: isDarkMode ? '#0f172a' : '#ffffff' }}>
            <p className="text-[14px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>{checking ? '正在做健康检查，请稍等～' : summary}</p>
            <div className="mt-3">
              <button
                onClick={runDiagnostics}
                disabled={checking}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 mr-2"
                style={{ background: isDarkMode ? '#1e293b' : '#eef7ff', border: `1px solid ${isDarkMode ? '#334155' : '#d8e9ff'}`, color: isDarkMode ? '#93c5fd' : '#0f9f6e' }}
              >
                <FaSearch className="text-[11px]" />
                {checking ? '检测中…' : items.length ? '重新检测' : '开始检测'}
              </button>
              <button
                onClick={handleCopyReport}
                disabled={checking || !reportText || copying}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ background: isDarkMode ? '#111827' : '#f8fafc', border: `1px solid ${isDarkMode ? '#374151' : '#ececf1'}`, color: isDarkMode ? '#e5e7eb' : '#111827' }}
              >
                <FaCopy className="text-[11px]" />
                {copying ? '复制中…' : copied ? '已复制诊断报告' : '一键导出诊断报告（复制文本）'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.name} className="rounded-2xl border p-4" style={{ borderColor: isDarkMode ? '#1f2937' : '#ececf1', background: isDarkMode ? '#0f172a' : '#ffffff' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>{item.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.ok ? 'bg-[#10b981]/15 text-[#059669]' : 'bg-red-100 text-red-600'}`}>
                    {item.ok ? '正常' : '异常'}
                  </span>
                </div>
                <p className="text-sm break-all" style={{ color: isDarkMode ? '#94a3b8' : '#6b7280' }}>{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: isDarkMode ? '#334155' : '#e6f2ff', background: isDarkMode ? '#0f172a' : '#f8fbff', color: isDarkMode ? '#cbd5e1' : '#1f2937' }}>
            小贴士：当用户反馈“账号有问题”时，让 TA 打开这个页面并截图给你，通常能快速定位是登录、会话还是资料权限问题。
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

// ================= 主页面 =================
export default function ProfilePage() {
  const { currentUser, friends, pendingRequests, setCurrentUser, addFriend, deleteFriend } = useUserStore();
  const { memories } = useMemoryStore();
  const { ledgers } = useLedgerStore();
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(currentUser?.username || '');
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [bindingFriend, setBindingFriend] = useState<any>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [friendTab, setFriendTab] = useState<'all' | 'real' | 'virtual'>('all');
  const [showPostsCongrats, setShowPostsCongrats] = useState(false);
  const [showBillsCongrats, setShowBillsCongrats] = useState(false);
  const [showAccountDiagnostics, setShowAccountDiagnostics] = useState(false);
  const [randomMemory, setRandomMemory] = useState<any>(null);
  const [memoirMemory, setMemoirMemory] = useState<any>(null);
  const [detailMemory, setDetailMemory] = useState<any>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkInput, setRemarkInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAdminPage, setShowAdminPage] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [showFontSizePage, setShowFontSizePage] = useState(false);
  const [showDarkModePage, setShowDarkModePage] = useState(false);
  const [showAboutOrbit, setShowAboutOrbit] = useState(false);
  const [showEncouragePopup, setShowEncouragePopup] = useState(false);
  const [showMoreQuickMenu, setShowMoreQuickMenu] = useState(false);
  const [showCommunityGuidelines, setShowCommunityGuidelines] = useState(false);
  const [showHelpSupport, setShowHelpSupport] = useState(false);
  const [helpSupportOpenFeedback, setHelpSupportOpenFeedback] = useState(false);
  const [settings, setSettings] = useState(readSettings());
  const [refreshingHome, setRefreshingHome] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAccountPage, setShowAccountPage] = useState(false);
  const [showEmailPage, setShowEmailPage] = useState(false);
  const [showPasswordPage, setShowPasswordPage] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  // 找回密码状态
  const [showResetModal, setShowResetModal] = useState(false);
  const [showResetPage, setShowResetPage] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  // 文档弹窗状态
  const [docModal, setDocModal] = useState({ isOpen: false, title: '', content: '' });
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarAdjustScale, setAvatarAdjustScale] = useState(1);
  const [avatarAdjustOffsetX, setAvatarAdjustOffsetX] = useState(0);
  const [avatarAdjustOffsetY, setAvatarAdjustOffsetY] = useState(0);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef({
    isPinching: false,
    isDragging: false,
    startDistance: 0,
    startCenterX: 0,
    startCenterY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startScale: 1,
    boxSize: 0,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAutoRefreshRef = useRef(0);
  const [appVersion, setAppVersion] = useState<string>(
    import.meta.env.VITE_APP_VERSION || '0.0.0'
  );
  useEffect(() => {
    App.getInfo()
      .then(info => { if (info.version) setAppVersion(info.version); })
      .catch(() => { });
  }, []);
  const appBuildTime = import.meta.env.VITE_APP_BUILD_TIME || '';
  const appBuildLabel = appBuildTime
    ? new Date(appBuildTime).toLocaleString('zh-CN', { hour12: false })
    : '未知';
  // const isSystemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const shouldLockBackgroundScroll =
    showSideMenu ||
    showFontSizePage || // ✅ 补上
    showDarkModePage || // ✅ 补上
    showHelpSupport ||  // ✅ 补上
    showAllFriends ||   // ✅ 补上
    showAboutOrbit ||
    showMoreQuickMenu ||
    showSettings ||
    showAvatarPreview ||
    showAccountPage ||
    showEmailPage ||
    showPasswordPage ||
    showResetPage ||
    !!selectedFriend ||
    !!randomMemory ||
    !!memoirMemory ||
    docModal.isOpen;

  useScrollLock(!!shouldLockBackgroundScroll);
  // const isDarkMode = settings.themeMode === 'dark' || (settings.themeMode === 'system' && isSystemDark);
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: any) => setSystemIsDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
    };
  }, []);

  // ✨ 2. 使用动态的 systemIsDark 进行判断
  const isDarkMode = settings.themeMode === 'dark' || (settings.themeMode === 'system' && systemIsDark);
  // ===============================
  const modalSurfaceColor = isDarkMode ? '#0b0b0b' : '#ffffff';
  const modalPrimaryTextColor = isDarkMode ? '#f9fafb' : '#111';
  const modalSecondaryTextColor = isDarkMode ? '#9ca3af' : '#374151';
  const modalBorderColor = isDarkMode ? '#1f2937' : '#f3f4f6';
  const resetNicknameScroll = useCallback(() => {
    if (typeof window === 'undefined') return;
    document.body.style.overflow = 'hidden'; // 禁用滚动
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, []);
  const cancelNameEditing = useCallback(() => {
    setIsEditingName(false);
    setNewName(currentUser?.username || '');
    document.body.style.overflow = ''; // 恢复滚动
    resetNicknameScroll();
  }, [currentUser?.username, resetNicknameScroll]);

  const handleClearCache = async () => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm('确定清理本地缓存吗？\n这不会删除你的云端数据。');
    if (!confirmed) return;

    try {
      const localKeys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && /^orbit_/i.test(key)) localKeys.push(key);
      }
      localKeys.forEach((key) => window.localStorage.removeItem(key));

      const sessionKeys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key && /^orbit_/i.test(key)) sessionKeys.push(key);
      }
      sessionKeys.forEach((key) => window.sessionStorage.removeItem(key));

      if ('caches' in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => /orbit|workbox/i.test(name))
            .map((name) => window.caches.delete(name))
        );
      }

      alert('缓存清理完成');
    } catch (e) {
      alert('清理失败，请稍后再试');
    }
  };

  useEffect(() => {
    setNewName(currentUser?.username || '');
  }, [currentUser?.username]);

  useEffect(() => {
    writeSettings(settings);
    if (typeof window !== 'undefined') {
      const fontSize = settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '18px' : '16px';
      const textScale = settings.fontSize === 'small' ? '92%' : settings.fontSize === 'large' ? '112%' : '100%';
      document.documentElement.style.fontSize = fontSize;
      (document.documentElement.style as any).webkitTextSizeAdjust = textScale;
      if (document.body) {
        document.body.style.fontSize = fontSize;
        (document.body.style as any).webkitTextSizeAdjust = textScale;
      }

      const applyTheme = () => {
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const currentMode = settings.themeMode || 'system';

        if (currentMode === 'system') {
          document.documentElement.dataset.theme = isSystemDark ? 'dark' : 'light';
        } else {
          document.documentElement.dataset.theme = currentMode;
        }
      };

      applyTheme();

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        if (settings.themeMode === 'system' || !settings.themeMode) {
          applyTheme();
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings]);

  useEffect(() => {
    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<typeof DEFAULT_SETTINGS>).detail;
      if (detail) setSettings(detail);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(SETTINGS_EVENT, onSettings as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(SETTINGS_EVENT, onSettings as EventListener);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('orbit:settings-visibility', { detail: showSettings }));
    return () => {
      window.dispatchEvent(new CustomEvent('orbit:settings-visibility', { detail: false }));
    };
  }, [showSettings]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const incomingChannel = supabase
      .channel(`friend-requests-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${currentUser.id}` },
        () => {
          void useUserStore.getState().fetchPendingRequests();
        }
      )
      .subscribe();

    const friendsChannel = supabase
      .channel(`friendships-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_id=eq.${currentUser.id}` },
        () => {
          void useUserStore.getState().fetchFriends();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(incomingChannel);
      supabase.removeChannel(friendsChannel);
    };
  }, [currentUser?.id]);

  const updateSettings = (patch: Partial<typeof DEFAULT_SETTINGS>) => {
    setSettings((prev) => ({ ...prev, ...patch }));

    // If user is logged in, persist notification-related settings to Supabase
    const notifKeys = ['notifyAt', 'notifyComment', 'notifyFriendRequest'];
    const hasNotifPatch = Object.keys(patch).some((k) => notifKeys.includes(k));
    const userId = useUserStore.getState().currentUser?.id;
    if (hasNotifPatch && userId) {
      const store = useUserStore.getState();
      const serverPrefs = store.notificationPrefs || {};
      const patchPrefs: Record<string, any> = {};
      notifKeys.forEach((k) => {
        if ((patch as any)[k] !== undefined) patchPrefs[k] = (patch as any)[k];
      });
      const next = { ...serverPrefs, ...patchPrefs };
      if (store.updateNotificationPrefs) void store.updateNotificationPrefs(next);
    }
  };

  const handleRefreshHome = async () => {
    if (refreshingHome) return;
    if (!shouldAllowRefresh()) {
      alert('已开启仅 Wi‑Fi 刷新，请连接 Wi‑Fi 后重试。');
      return;
    }
    setRefreshingHome(true);
    try {
      await Promise.all([
        useMemoryStore.getState().fetchMemories(),
        useUserStore.getState().fetchFriends(),
        useLedgerStore.getState().fetchLedgers(),
      ]);
    } catch (err: any) {
      alert(`刷新失败：${err?.message || '请稍后再试'}`);
    } finally {
      setRefreshingHome(false);
    }
  };

  const refreshProfileData = useCallback(async () => {
    if (!shouldAllowRefresh()) return;
    await Promise.all([
      useMemoryStore.getState().fetchMemories(),
      useUserStore.getState().fetchFriends(),
      useUserStore.getState().fetchPendingRequests(),
      useLedgerStore.getState().fetchLedgers(),
    ]);
  }, []);

  const resumeTrigger = useAppStore((state) => state.resumeTrigger);

  useEffect(() => {
    const tryAutoRefresh = () => {
      if (!navigator.onLine) return;
      const now = Date.now();
      if (now - lastAutoRefreshRef.current < 30000) return;
      lastAutoRefreshRef.current = now;
      void refreshProfileData();
    };

    const interval = window.setInterval(tryAutoRefresh, 60000);
    window.addEventListener('online', tryAutoRefresh);

    if (resumeTrigger > 0) {
      tryAutoRefresh();
    }

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', tryAutoRefresh);
    };
  }, [refreshProfileData, resumeTrigger]);

  const handleSubmitEmail = async (nextEmail: string, currentPwd: string) => {
    if (!currentUser?.email) {
      alert('请重新登录后再尝试修改邮箱');
      return;
    }
    if (!nextEmail.trim()) return;
    setActionLoading(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: currentUser.email, password: currentPwd });
      if (reauthError) throw new Error(reauthError.message || '当前密码不正确');
      const { error } = await supabase.auth.updateUser({ email: nextEmail.trim() });
      if (error) throw error;
      alert('已发送确认邮件，请前往新邮箱完成验证。');
      setShowEmailModal(false);
    } catch (e: any) {
      alert(e?.message || '更换邮箱失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitPassword = async (currentPwd: string, p1: string, p2: string) => {
    if (p1 !== p2) {
      alert('两次输入的密码不一致！');
      return;
    }
    if (p1.length < 6) {
      alert('密码至少需要 6 位！');
      return;
    }
    if (!currentUser?.email) {
      alert('请重新登录后再尝试修改密码');
      return;
    }
    if (currentPwd === p1) {
      alert('新密码需要与当前密码不同');
      return;
    }
    setActionLoading(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: currentUser.email, password: currentPwd });
      if (reauthError) throw new Error(reauthError.message || '当前密码不正确');
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      alert('密码已更新！下次请使用新密码登录。');
      setShowPasswordModal(false);
    } catch (e: any) {
      alert(e?.message || '更换密码失败，出于安全原因，您可能需要退出重新登录后再修改。');
    } finally {
      setActionLoading(false);
    }
  };

  // 执行发送重置邮件
  const handleResetPassword = async (email: string) => {
    if (!email.trim()) return;
    setResetLoading(true);
    try {
      const { sendPasswordReset } = await import('../api/supabase');
      await sendPasswordReset(email.trim());
      alert('重置密码邮件已发送，请前往邮箱查看并修改密码！');
      setShowResetModal(false);
    } catch (e: any) {
      alert(e?.message || '发送失败，请检查该邮箱是否已注册');
    } finally {
      setResetLoading(false);
    }
  };

  const openDocument = (title: string, content: string) => {
    setDocModal({ isOpen: true, title, content });
  };


  const COMMUNITY_TEXT = "Orbit 是专属于熟人的温暖私密社交小天地。\n\n✨ 友善互动：依托共同回忆，畅聊吐槽，传递温暖\n✨ 尊重边界：不恶意关联他人真实账号，守护彼此隐私\n✨ 记录当下：告别刻意摆拍，珍藏真实鲜活的生活瞬间\n\n让我们携手守护这片纯粹的熟人社交净土。";

  const handleSaveRemark = async (friendshipId: string) => {
    try {
      await updateFriendRemark(friendshipId, remarkInput);
      await useUserStore.getState().fetchFriends();
    } catch (e) {
      alert('备注保存失败');
    }
    setEditingRemarkId(null);
  };
  const handleSaveName = async () => {
    if (!newName.trim() || newName === currentUser?.username) {
      setIsEditingName(false);
      resetNicknameScroll();
      return;
    }
    if (!currentUser?.id) return;
    try {
      await updateProfileUsername(currentUser.id, newName);
      const refreshedProfile = await getProfile(currentUser.id, currentUser.email || undefined);
      setCurrentUser({
        ...currentUser,
        username: refreshedProfile?.username || newName.trim(),
      } as any);
      setIsEditingName(false);
      setNewName(refreshedProfile?.username || newName.trim());
      resetNicknameScroll();
    } catch (e: any) {
      alert(e?.message || '昵称保存失败，请重试');
    }
  };
  // 生成邀请码
  const generateInviteCode = (userId: string) => {
    if (!userId) return 'ORBIT000';
    const hash = userId.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
    const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, '0');
    return `ORBIT${code.slice(0, 6)}`;
  };
  const inviteCode = currentUser ? generateInviteCode(currentUser.id) : 'ORBIT000';

  // 登录后将邀请码持久化到数据库，供他人绑定时反查
  useEffect(() => {
    if (currentUser?.id && inviteCode) {
      saveInviteCode(currentUser.id, inviteCode);
    }
  }, [currentUser?.id, inviteCode]);

  // ================= 核心逻辑交互 =================

  // ✨ 点击好友列表时的分发逻辑
  const handleFriendClick = (friend: any) => {
    if (!friend || !friend.id) return;
    if (String(friend.id).startsWith('temp-')) {
      // 如果是临时好友，弹出绑定账号框
      setBindingFriend(friend);
    } else {
      // 如果已经是真实好友，弹出共同回忆框
      setSelectedFriend(friend);
    }
  };
  // 添加马甲好友（支持备注）
  const handleAddFriend = async (name: string, remark: string) => {
    if (!currentUser) return;
    const friendshipData: Record<string, any> = {
      user_id: currentUser.id,
      friend_name: name,
      remark: remark || null,
      status: 'virtual',
    };
    await addFriend(friendshipData);
    setShowAddFriend(false);
  };

  // 通过邀请码发送好友申请
  const handleAddRealFriend = async (inviteCode: string) => {
    if (!currentUser) return;
    const code = inviteCode.trim().toUpperCase();
    const profile = await addRealFriendByCode(currentUser.id, code);
    alert(`📨 已向 ${profile.username} 发送好友申请，等待对方确认！`);
  };

  // 通过邀请码把已有虚拟好友绑定为真实账号
  const handleBindExisting = async (friendshipId: string, inviteCode: string) => {
    const code = inviteCode.trim().toUpperCase();
    const realProfile = await lookupProfileByInviteCode(code);
    if (currentUser?.id && realProfile.id === currentUser.id) {
      alert('不能绑定自己的邀请码');
      return;
    }
    const { syncedCount } = await bindVirtualFriend(friendshipId, realProfile.id);
    await useUserStore.getState().fetchFriends();
    await useMemoryStore.getState().fetchMemories();
    if (syncedCount > 0) {
      alert(`🎉 绑定成功！已经把 ${syncedCount} 条与 ${realProfile.username} 的共同记忆同步给 TA，TA 下次打开 Orbit 就能看到。`);
    } else {
      alert('绑定成功！不过在绑定之前你还没有用这个马甲 @ 过任何记忆，以后新记录的内容会立即同步给对方。');
    }
  };

  // 接受好友申请（可选绑定现有马甲）
  const [processingRequests, setProcessingRequests] = useState<Record<string, boolean>>({});
  const [acceptingRequest, setAcceptingRequest] = useState<any>(null);
  const [acceptingLoading, setAcceptingLoading] = useState(false);

  const handleAcceptRequest = (req: any) => {
    if (processingRequests[req.id]) return;
    setAcceptingRequest(req);
  };

  const handleConfirmAccept = async (bindTarget: string) => {
    if (!acceptingRequest) return;
    const req = acceptingRequest;
    if (processingRequests[req.id]) return;
    setProcessingRequests((s) => ({ ...s, [req.id]: true }));
    setAcceptingLoading(true);
    try {
      let bindVirtualFriendshipId: string | undefined;
      if (bindTarget && bindTarget !== 'new') {
        bindVirtualFriendshipId = bindTarget?.replace('temp-', '') || bindTarget;
      }

      await acceptFriendRequest(req.id, req.user_id, currentUser!.id, bindVirtualFriendshipId);
      // 本地先移除 pending，防重点击导致重复接受；同时按 user_id 兜底清理重复申请
      useUserStore.setState((state) => ({
        pendingRequests: state.pendingRequests.filter((p: any) => p.id !== req.id && p.user_id !== req.user_id)
      }));
      await useUserStore.getState().fetchFriends();
      await useUserStore.getState().fetchPendingRequests();
      await useMemoryStore.getState().fetchMemories();
      setAcceptingRequest(null);
    } catch (err: any) {
      alert('接受失败：' + err.message);
    } finally {
      setAcceptingLoading(false);
      setProcessingRequests((s) => {
        const copy = { ...s };
        delete copy[req.id];
        return copy;
      });
    }
  };

  // 拒绝好友申请
  const handleRejectRequest = async (req: any) => {
    try {
      await rejectFriendRequest(req.id);
      await useUserStore.getState().fetchPendingRequests();
    } catch (err: any) {
      alert('操作失败：' + err.message);
    }
  };

  // 删除好友（临时或真实）
  const handleDeleteFriend = async (friendshipId: string, username: string) => {
    if (!window.confirm(`确定删除好友「${username}」？相关记忆的标记不会删除。`)) return;
    try {
      await deleteFriend(friendshipId);
    } catch (err: any) {
      alert('删除失败：' + err.message);
    }
  };

  // 绑定真实好友：查邀请码 → 更新 friendships + memory_tags
  const handleBindFriend = async (tempId: string, inputCode: string) => {
    const code = inputCode.trim().toUpperCase();
    if (!code.startsWith('ORBIT') || code.length < 11) {
      alert('邀请码格式不正确，应为 ORBIT 开头的 11 位字符！');
      return;
    }
    try {
      // tempId 格式为 'temp-{friendshipId}'
      const friendshipId = tempId.replace('temp-', '');

      // 1. 反查真实用户
      const realProfile = await lookupProfileByInviteCode(code);
      if (currentUser?.id && realProfile.id === currentUser.id) {
        alert('不能绑定自己的邀请码');
        return;
      }

      // 2. 更新数据库：friendships + memory_tags
      const { syncedCount } = await bindVirtualFriend(friendshipId, realProfile.id);

      // 3. 刷新好友列表 + 记忆流
      await useUserStore.getState().fetchFriends();
      await useMemoryStore.getState().fetchMemories();

      setBindingFriend(null);
      if (syncedCount > 0) {
        alert(`🎉 绑定成功！已同步 ${syncedCount} 条与 ${realProfile.username} 的共同记忆，对方上线即可看到。`);
      } else {
        alert('绑定成功，但之前还没有把任何记忆 @ 给这个马甲，所以目前没有历史内容可以同步。之后的新回忆会直接推送给对方。');
      }
    } catch (error: any) {
      alert(`绑定失败：${error.message}`);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
    } catch {
      // ignore API errors — we still want to clear local session
    } finally {
      setCurrentUser(null);
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser?.email) {
      alert('当前账号未绑定邮箱，暂时无法执行邮箱注销');
      return;
    }

    const confirmEmail = window.prompt(`为避免误操作，请输入当前登录邮箱确认注销：\n${currentUser.email}`)?.trim();
    if (!confirmEmail) return;

    if (confirmEmail.toLowerCase() !== currentUser.email.toLowerCase()) {
      alert('输入邮箱不一致，已取消注销');
      return;
    }

    if (!window.confirm('⚠️ 你正在申请注销。提交后将立即退出登录，账号及数据将在 7 个工作日后永久删除。确定继续吗？')) {
      return;
    }

    setDeletingAccount(true);
    try {
      const result = await deleteMyAccount(confirmEmail);
      setCurrentUser(null);
      useMemoryStore.setState({ memories: [] });
      useLedgerStore.setState({ ledgers: [] });
      useUserStore.setState({ friends: [], pendingRequests: [] });
      const scheduledAt = result?.deletionScheduledAt
        ? new Date(result.deletionScheduledAt).toLocaleString()
        : '7 个工作日后';
      alert(`注销申请已提交，预计删除时间：${scheduledAt}`);
    } catch (error: any) {
      alert(error?.message || '注销失败，请稍后重试');
    } finally {
      setDeletingAccount(false);
    }
  };
  // 头像点击：打开圆形预览蒙层（可关闭）
  const handleAvatarClick = () => {
    if (uploadingAvatar) return;
    if (currentUser?.avatar_url) setPreviewAvatarUrl(currentUser.avatar_url);
    setAvatarAdjustScale(1);
    setAvatarAdjustOffsetX(0);
    setAvatarAdjustOffsetY(0);
    setPendingAvatarFile(null);
    setShowAvatarPreview(true);
  };

  const closeAvatarPreview = useCallback(() => {
    if (previewAvatarUrl && previewAvatarUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewAvatarUrl);
    }
    gestureRef.current = {
      isPinching: false,
      isDragging: false,
      startDistance: 0,
      startCenterX: 0,
      startCenterY: 0,
      startOffsetX: 0,
      startOffsetY: 0,
      startScale: 1,
      boxSize: 0,
    };
    setShowAvatarPreview(false);
    setPreviewAvatarUrl(null);
    setPendingAvatarFile(null);
    setAvatarAdjustScale(1);
    setAvatarAdjustOffsetX(0);
    setAvatarAdjustOffsetY(0);
  }, [previewAvatarUrl]);

  useEffect(() => {
    if (!showAvatarPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAvatarPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAvatarPreview, closeAvatarPreview]);

  useScrollLock(showAllFriends);

  useEffect(() => {
    if (showAllFriends) {
      // 弹窗打开时：禁止 body 滚动，并记录当前位置（防止 iOS 页面回弹）
      // document.body.style.overflow = 'hidden'; // handled by useScrollLock
      document.body.style.height = '100vh';
    } else {
      // 弹窗关闭时：恢复滚动
      // document.body.style.overflow = '';
      document.body.style.height = '';
    }

    // 组件卸载时安全清理
    return () => {
      // document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, [showAllFriends]);

  const handleUploadAvatarFromPicker = useCallback(() => {
    if (uploadingAvatar) return;
    setShowAvatarPicker(false);
    fileInputRef.current?.click();
  }, [uploadingAvatar]);

  const confirmPendingAvatar = useCallback(async () => {
    if (!pendingAvatarFile || !currentUser) {
      closeAvatarPreview();
      return;
    }
    if (!shouldAllowUpload()) {
      alert('已开启仅 Wi‑Fi 上传，请连接 Wi‑Fi 后重试。');
      return;
    }
    setUploadingAvatar(true);
    try {
      const cropped = await cropImageToSquare(pendingAvatarFile, avatarAdjustScale, avatarAdjustOffsetX, avatarAdjustOffsetY);
      const url = await uploadAvatar(currentUser.id, cropped);
      setCurrentUser({
        ...currentUser,
        avatar_url: url,
        storage_used: (currentUser.storage_used || 0) + cropped.size
      });
      setPreviewAvatarUrl(url);
      closeAvatarPreview();
    } catch (err: any) {
      console.error('头像上传失败', err);
      alert(err?.message || '上传失败，请重试');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [pendingAvatarFile, currentUser, avatarAdjustScale, avatarAdjustOffsetX, avatarAdjustOffsetY, closeAvatarPreview]);

  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!previewImgRef.current) return;
    const rect = previewImgRef.current.getBoundingClientRect();
    const boxSize = rect.width; // square
    const g = gestureRef.current;
    g.boxSize = boxSize;

    if (e.touches.length >= 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const dist = Math.hypot(dx, dy);
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;
      g.isPinching = true;
      g.isDragging = false;
      g.startDistance = dist;
      g.startCenterX = centerX;
      g.startCenterY = centerY;
      g.startOffsetX = avatarAdjustOffsetX;
      g.startOffsetY = avatarAdjustOffsetY;
      g.startScale = avatarAdjustScale;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      g.isDragging = true;
      g.isPinching = false;
      g.startCenterX = t.clientX;
      g.startCenterY = t.clientY;
      g.startOffsetX = avatarAdjustOffsetX;
      g.startOffsetY = avatarAdjustOffsetY;
      g.startScale = avatarAdjustScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!previewImgRef.current) return;
    const g = gestureRef.current;
    if (g.boxSize <= 0) return;

    if (e.touches.length >= 2 && g.isPinching) {
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const dist = Math.hypot(dx, dy);
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;
      const scale = clamp((g.startScale || 1) * (dist / Math.max(1, g.startDistance || 1)), 1, 2.5);
      const deltaX = (centerX - g.startCenterX) / (g.boxSize * 0.5);
      const deltaY = (centerY - g.startCenterY) / (g.boxSize * 0.5);
      setAvatarAdjustScale(scale);
      setAvatarAdjustOffsetX(clamp(g.startOffsetX + deltaX, -0.8, 0.8));
      setAvatarAdjustOffsetY(clamp(g.startOffsetY + deltaY, -0.8, 0.8));
    } else if (e.touches.length === 1 && g.isDragging) {
      e.preventDefault();
      const t = e.touches[0];
      const deltaX = (t.clientX - g.startCenterX) / (g.boxSize * 0.5);
      const deltaY = (t.clientY - g.startCenterY) / (g.boxSize * 0.5);
      setAvatarAdjustOffsetX(clamp(g.startOffsetX + deltaX, -0.8, 0.8));
      setAvatarAdjustOffsetY(clamp(g.startOffsetY + deltaY, -0.8, 0.8));
    }
  };

  const handleTouchEnd = () => {
    const g = gestureRef.current;
    g.isPinching = false;
    g.isDragging = false;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const g = gestureRef.current;
    if (!g.isDragging || g.boxSize <= 0) return;
    e.preventDefault();
    const deltaX = (e.clientX - g.startCenterX) / (g.boxSize * 0.5);
    const deltaY = (e.clientY - g.startCenterY) / (g.boxSize * 0.5);
    setAvatarAdjustOffsetX(clamp(g.startOffsetX + deltaX, -0.8, 0.8));
    setAvatarAdjustOffsetY(clamp(g.startOffsetY + deltaY, -0.8, 0.8));
  }, []);

  const handleMouseUp = useCallback(() => {
    const g = gestureRef.current;
    g.isDragging = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!previewImgRef.current) return;
    const rect = previewImgRef.current.getBoundingClientRect();
    const boxSize = rect.width;
    const g = gestureRef.current;
    g.boxSize = boxSize;
    g.isDragging = true;
    g.isPinching = false;
    g.startCenterX = e.clientX;
    g.startCenterY = e.clientY;
    g.startOffsetX = avatarAdjustOffsetX;
    g.startOffsetY = avatarAdjustOffsetY;
    g.startScale = avatarAdjustScale;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || uploadingAvatar) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPendingAvatarFile(file);
    setPreviewAvatarUrl(objectUrl);
    setAvatarAdjustScale(1);
    setAvatarAdjustOffsetX(0);
    setAvatarAdjustOffsetY(0);
    setShowAvatarPreview(true);
  };

  const cropImageToSquare = async (file: File, scale: number, offsetX: number, offsetY: number) => {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');

    const minSide = Math.min(bitmap.width, bitmap.height);
    const sampleSize = minSide / Math.max(0.5, scale); // scale >1 means放大
    const centerX = bitmap.width / 2 + offsetX * (minSide * 0.5);
    const centerY = bitmap.height / 2 + offsetY * (minSide * 0.5);
    let sx = centerX - sampleSize / 2;
    let sy = centerY - sampleSize / 2;
    // clamp to image bounds
    sx = Math.max(0, Math.min(sx, bitmap.width - sampleSize));
    sy = Math.max(0, Math.min(sy, bitmap.height - sampleSize));

    ctx.drawImage(bitmap, sx, sy, sampleSize, sampleSize, 0, 0, size, size);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!blob) throw new Error('生成头像失败，请重试');
    return new File([blob], file.name || 'avatar.jpg', { type: blob.type });
  };

  const handleRandomMemory = (excludeId?: string) => {
    if (memories.length === 0) return;
    const source = excludeId ? memories.filter((m: any) => m?.id !== excludeId) : memories;
    const pool = source.length > 0 ? source : memories;
    const idx = Math.floor(Math.random() * pool.length);
    setRandomMemory(pool[idx]);
  };

  const handleRandomAvatar = async (sex: 'male' | 'female') => {
    if (!currentUser) return;
    setShowAvatarPicker(false);
    setUploadingAvatar(true);
    try {
      const seed = Math.random().toString(36).slice(2, 10);
      const maleHairs = ['short01', 'short02', 'short03', 'short04', 'short05', 'short06', 'short07', 'short08', 'short09', 'short10', 'short11', 'short12', 'short13', 'short14', 'short15', 'short16', 'short17', 'short18', 'short19'];
      const femaleHairs = ['long01', 'long02', 'long03', 'long04', 'long05', 'long06', 'long07', 'long08', 'long09', 'long10', 'long11', 'long12', 'long13', 'long14', 'long15', 'long16', 'long17', 'long18', 'long19', 'long20', 'long21', 'long22', 'long23', 'long24', 'long25', 'long26'];
      const hairList = sex === 'male' ? maleHairs : femaleHairs;
      const hair = hairList[Math.floor(Math.random() * hairList.length)];
      const earringsProbability = sex === 'male' ? 0 : 40;
      const bg = sex === 'male' ? 'b6e3f4' : 'ffd5dc';
      const url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&hair=${hair}&earringsProbability=${earringsProbability}&backgroundColor=${bg}`;
      const { supabase } = await import('../api/supabase');
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
      setCurrentUser({ ...currentUser, avatar_url: url });
      setPreviewAvatarUrl(url);
      setPendingAvatarFile(null);
      setAvatarAdjustScale(1);
      setAvatarAdjustOffsetX(0);
      setAvatarAdjustOffsetY(0);
      setShowAvatarPreview(false);
    } catch (e) {
      console.error('随机头像失败', e);
    } finally {
      setUploadingAvatar(false);
    }
  };
  // 举报弹窗的显示状态
  const [showReportModal, setShowReportModal] = useState(false);
  // 记录当前正在举报哪一个好友/用户
  const [reportingFriend, setReportingFriend] = useState<any>(null);
  const filteredFriends = friends
    .filter((fs: any) => {
      const isVirtual = fs?.status === 'virtual' || fs?.friend?.id?.startsWith?.('temp-');
      if (friendTab === 'virtual' && !isVirtual) return false;
      if (friendTab === 'real' && isVirtual) return false;
      return true;
    })
    .filter((fs: any) => {
      if (!friendSearch.trim()) return true;
      const q = friendSearch.toLowerCase();
      const displayName = fs?.friend?.username?.toLowerCase?.() || '';
      const realName = fs?.friend?.real_username?.toLowerCase?.() || '';
      return displayName.includes(q) || realName.includes(q);
    });
  const shouldCollapseOnHome = friends.length > 5 && !friendSearch.trim();
  const homeFriends = shouldCollapseOnHome ? filteredFriends.slice(0, 5) : filteredFriends;
  const sortedMemories = [...memories].sort(
    (a: any, b: any) => new Date(b?.memory_date || b?.created_at || 0).getTime() - new Date(a?.memory_date || a?.created_at || 0).getTime()
  );
  const getCityFromMemory = (memory: any): string => {
    if (!memory) return '';
    const addr = memory?.location?.address || '';
    const name = memory?.location?.name || '';
    const cityField = memory?.location?.city || memory?.location?.district || '';
    const cityMatch = addr.match(/([\u4e00-\u9fa5]{2,8}(?:市|州))/);
    if (cityMatch) return cityMatch[1];
    const provinceMatch = addr.match(/([\u4e00-\u9fa5]{2,8}省)/);
    if (provinceMatch) return provinceMatch[1];
    if (cityField) return cityField;
    if (name) return `${name.slice(0, 4)}附近`;
    return '';
  };
  const getMemoryCover = (memory: any) => {
    if (!memory) return '';
    const firstPhoto = Array.isArray(memory.photos) ? memory.photos[0] : '';
    const firstMedia = Array.isArray(memory.media_urls) ? memory.media_urls.find(Boolean) : '';
    return firstPhoto || firstMedia || memory.photo_url || memory.image_url || memory.cover_url || '';
  };
  const recentMemoryCards = sortedMemories
    .map((m: any) => ({
      memory: m,
      cover: getMemoryCover(m),
      label: new Date(m?.memory_date || m?.created_at || Date.now()).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    }))
    .filter((item: any) => !!item.cover)
    .slice(0, 4);
  const memoryPreviewSlots = [...recentMemoryCards, null, null, null, null].slice(0, 4);
  const latestActiveAt = memories.length
    ? new Date(
      sortedMemories[0]?.memory_date || sortedMemories[0]?.created_at
    )
    : null;
  const latestActivePlace = memories.length ? getCityFromMemory(sortedMemories[0]) : '';

  const currentYear = new Date().getFullYear();
  const memoriesThisYear = memories.filter((m: any) => {
    const source = m?.memory_date || m?.created_at;
    if (!source) return false;
    const d = new Date(source);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === currentYear;
  });
  const memoryDaySetThisYear = new Set(
    memoriesThisYear.map((m: any) => {
      const d = new Date(m?.memory_date || m?.created_at || Date.now());
      const y = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    })
  );
  const memoryDaysThisYear = memoryDaySetThisYear.size;

  const locationCounter = new Map<string, number>();
  memoriesThisYear.forEach((m: any) => {
    const locationName = (m?.location?.name || m?.location_name || '').trim();
    if (!locationName) return;
    locationCounter.set(locationName, (locationCounter.get(locationName) || 0) + 1);
  });
  const mostFrequentLocation = locationCounter.size
    ? Array.from(locationCounter.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : '暂未记录地点';
  const mostFrequentLocationCount = locationCounter.size
    ? Array.from(locationCounter.entries()).sort((a, b) => b[1] - a[1])[0][1]
    : 0;

  const friendNameById = new Map<string, string>();
  friends.forEach((fs: any) => {
    const displayName = fs?.friend?.username || fs?.friend_name || '好友';
    if (fs?.friend?.id) friendNameById.set(String(fs.friend.id), displayName);
    if (fs?.friend_id) friendNameById.set(String(fs.friend_id), displayName);
  });

  const companionCounter = new Map<string, number>();
  memoriesThisYear.forEach((m: any) => {
    const tags = Array.isArray(m?.tagged_friends) ? m.tagged_friends : [];
    tags.forEach((fid: string) => {
      const key = String(fid || '').trim();
      if (!key) return;
      companionCounter.set(key, (companionCounter.get(key) || 0) + 1);
    });
  });
  const mostFrequentCompanion = companionCounter.size
    ? (friendNameById.get(Array.from(companionCounter.entries()).sort((a, b) => b[1] - a[1])[0][0]) || '好友')
    : '独自出没';
  const mostFrequentCompanionCount = companionCounter.size
    ? Array.from(companionCounter.entries()).sort((a, b) => b[1] - a[1])[0][1]
    : 0;

  // const renderFriendRow = (friendship: any, index: number, total: number) => {
  //   const friend = friendship?.friend || {};
  //   const friendId = String(friend.id || friendship.friend_id || '').trim();
  //   const isTemp = friendId.startsWith('temp-');
  //   const hasRemark = !!friendship?.remark;
  //   const rowKey = friendship?.id || friendId || `friend-${index}`;
  //   const displayName = friend?.username || friendship?.friend_name || '好友';
  //   const realName = friend?.real_username || '';
  //   const avatarSrc = friend?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=orbit';
  //   const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  //   const rowBg = index % 2 === 0 ? (isDarkMode ? '#0f172a' : '#f8fafc') : (isDarkMode ? '#0b1324' : '#ffffff');
  //   const divider = index === total - 1 ? 'transparent' : (isDarkMode ? '#1f2937' : '#e5e7eb');

  //   return (
  //     <motion.div
  //       key={rowKey}
  //       className={`w-full flex items-center gap-3 p-4 ${index !== total - 1 ? 'border-b' : ''}`}
  //       style={{ borderColor: divider, background: rowBg }}
  //     >
  //       <div className="flex items-center gap-3 flex-1 cursor-pointer min-w-0" onClick={() => { if (editingRemarkId !== friendship.id) handleFriendClick(friend); }}>
  //         <img src={avatarSrc} alt={displayName} className="w-12 h-12 rounded-full shrink-0 border" style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }} />
  //         <div className="text-left min-w-0 flex-1">
  //           <div className="flex items-center gap-2">
  //             <p className="font-medium truncate" style={{ color: isDarkMode ? '#e5e7eb' : '#111827' }}>{displayName}</p>
  //             {isTemp && <span className="px-1.5 py-0.5 rounded text-[10px] shrink-0" style={{ background: isDarkMode ? 'rgba(253,224,71,0.16)' : '#fff7ed', color: isDarkMode ? '#fcd34d' : '#9a3412' }}>临时</span>}
  //           </div>
  //           {editingRemarkId === friendship.id ? (
  //             <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
  //               <input
  //                 autoFocus
  //                 value={remarkInput}
  //                 onChange={e => setRemarkInput(e.target.value)}
  //                 onKeyDown={e => { if (e.key === 'Enter') handleSaveRemark(friendship.id); if (e.key === 'Escape') setEditingRemarkId(null); }}
  //                 placeholder="输入备注..."
  //                 className="flex-1 text-xs px-2 py-1 rounded-lg outline-none border min-w-0"
  //                 style={{ background: isDarkMode ? '#0f172a' : '#fff', color: isDarkMode ? '#e5e7eb' : '#111827', borderColor: isDarkMode ? '#1f2937' : '#d1d5db' }}
  //               />
  //               <button onClick={() => handleSaveRemark(friendship.id)} className="shrink-0 p-1 bg-[#00FFB3] text-black rounded-md"><FaCheck className="text-[10px]" /></button>
  //               <button onClick={() => setEditingRemarkId(null)} className="shrink-0 p-1 rounded-md" style={{ background: isDarkMode ? '#111827' : '#f3f4f6', color: isDarkMode ? '#cbd5e1' : '#6b7280' }}><FaTimes className="text-[10px]" /></button>
  //             </div>
  //           ) : (
  //             <div className="flex items-center gap-1 mt-1">
  //               <p className="text-sm truncate" style={{ color: isDarkMode ? '#cbd5e1' : '#6b7280' }}>
  //                 {hasRemark ? realName || displayName : (isTemp ? '点击绑定真实账号' : '查看共同记忆')}
  //               </p>
  //               <button
  //                 className="p-1.5 -my-1 opacity-60 hover:opacity-100 transition-opacity"
  //                 onClick={(e) => {
  //                   e.stopPropagation();
  //                   setRemarkInput(friendship.remark || '');
  //                   setEditingRemarkId(friendship.id);
  //                 }}
  //               >
  //                 <FaEdit className="text-[11px]" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3af' }} />
  //               </button>
  //             </div>
  //           )}
  //         </div>
  //       </div>

  //       <div className="flex items-center gap-1 shrink-0">
  //         <button
  //           onClick={() => handleFriendClick(friend)}
  //           className="px-3 py-1.5 rounded-xl text-sm font-semibold"
  //           style={{ background: isTemp ? (isDarkMode ? 'rgba(59,130,246,0.15)' : '#eef2ff') : (isDarkMode ? 'rgba(52,211,153,0.12)' : '#eef2ff'), color: isTemp ? '#3b82f6' : (isDarkMode ? '#34d399' : '#1d4ed8') }}
  //         >
  //           {isTemp ? '绑定' : '查看'}
  //         </button>
  //         <button
  //           onClick={() => handleDeleteFriend(friendship.id, displayName)}
  //           className="p-2 rounded-full transition-colors"
  //           style={{ color: isDarkMode ? '#94a3b8' : '#6b7280' }}
  //           title="删除好友"
  //         >
  //           <FaTrash className="text-xs" />
  //         </button>
  //       </div>
  //     </motion.div>
  //   );
  // };
  const handleBlockUser = async (targetUser: any, skipConfirm = false) => {
    if (!targetUser) return;
    const name = targetUser.username || targetUser.friend_name || '该用户';
    const targetId = targetUser.friend_id || targetUser.id;

    if (!targetId || targetId === currentUser.id) {
      alert('无法屏蔽自己或未知用户');
      return;
    }

    if (!skipConfirm && !window.confirm(`确定要屏蔽 ${name} 吗？屏蔽后你们将互不可见。`)) return;

    try {
      const { error } = await (supabase.from('blocked_users' as any) as any)
        .insert({
          user_id: currentUser.id,
          blocked_user_id: targetId
        });

      if (error) throw error;
      alert('已屏蔽该用户。');
      await useUserStore.getState().fetchFriends();
      // Close modals if likely open
      if (selectedFriend && (selectedFriend.id === targetId || selectedFriend.friend_id === targetId)) {
        setSelectedFriend(null);
      }
      if (memoirMemory && memoirMemory.user_id === targetId) {
        setMemoirMemory(null);
      }
      // Also refresh memories to hide content from blocked user
      // But fetchMemories is a heavy operation, maybe just filter locally?
      // useUserStore.getState().fetchMemories(); // If available
    } catch (err: any) {
      alert('屏蔽失败：' + err.message);
    }
  };

  const handleReportSubmit = async (reason: string, evidenceUrl?: string) => {
    if (!currentUser || !reportingFriend) return;
    const targetUser = { ...reportingFriend }; // Clone to keep reference after state clear

    try {
      const { error } = await (supabase.from('reports' as any) as any)
        .insert({
          reporter_id: currentUser.id,
          reported_user_id: reportingFriend.friend_id || reportingFriend.id,
          reason: reason,
          evidence_url: evidenceUrl,
          status: 'pending'
        });

      if (error) throw error;

      alert('举报已收到，感谢您的反馈！我们将在 24 小时内核实处理。');
      setShowReportModal(false);
      setReportingFriend(null);

      // Ask for blocking
      setTimeout(() => {
        if (window.confirm('是否同时屏蔽该用户？屏蔽后你们将互不可见。')) {
          handleBlockUser(targetUser, true);
        }
      }, 500);

    } catch (err: any) {
      alert('举报提交失败：' + err.message);
    }
  };

  // 2. 增强型左滑行组件 — Accordion Reveal (仿 iOS/WeChat)
  const SwipeableFriendRow = ({
    friendship, index, total, isDarkMode,
    onFriendClick, onDelete, onReport, onBlock
  }: any) => {
    const friend = friendship?.friend || {};
    const displayName = friend?.username || friendship?.friend_name || '好友';
    const isVirtual = friendship.status === 'virtual' || String(friend.id || '').startsWith('temp-');

    // 按钮数量：如果是虚拟好友，只有删除(1个)；否则有举报、屏蔽、删除(3个)。
    const buttonCount = isVirtual ? 1 : 3;
    const buttonWidthPx = 70;
    const totalWidth = buttonWidthPx * buttonCount;

    // 按钮宽度：举报(70)+屏蔽(70)+删除(70) = 210
    const dragThreshold = -totalWidth;
    const x = useMotionValue(0);

    // Accordion effect: 
    // width per button ~ x / buttonCount
    const buttonWidth = useTransform(x, (latest) => Math.min(80, Math.max(0, -latest / buttonCount))); // max 80 just in case overdrag
    const buttonOpacity = useTransform(x, [-50, 0], [1, 0]);
    const iconScale = useTransform(x, [-50, 0], [1, 0.5]);

    const handleDragEnd = () => {
      const currentX = x.get();
      // Snap logic: if dragged more than 50px, snap open
      if (currentX < -50) {
        animate(x, dragThreshold, { type: 'spring', stiffness: 400, damping: 25 });
      } else {
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 25 });
      }
    };

    return (
      <div
        className="relative overflow-hidden w-full h-[76px] select-none"
        style={{ borderBottom: index === total - 1 ? 'none' : `0.5px solid ${isDarkMode ? '#1f2937' : '#f3f4f6'}` }}
      >
        {/* 底部按钮层 */}
        <div className="absolute inset-y-0 right-0 flex items-stretch z-0">
          {!isVirtual && (
            <>
              <motion.button
                style={{ width: buttonWidth, opacity: buttonOpacity }}
                onClick={() => { onReport(friendship); animate(x, 0); }}
                className="bg-orange-500 text-white flex flex-col items-center justify-center gap-1 overflow-hidden whitespace-nowrap"
              >
                <motion.div style={{ scale: iconScale }} className="flex flex-col items-center justify-center w-[70px]">
                  <FaInfoCircle className="text-sm" />
                  <span className="text-[10px] font-bold">举报</span>
                </motion.div>
              </motion.button>

              <motion.button
                style={{ width: buttonWidth, opacity: buttonOpacity }}
                onClick={() => { onBlock(friendship); animate(x, 0); }}
                className="bg-gray-500 text-white flex flex-col items-center justify-center gap-1 overflow-hidden whitespace-nowrap"
              >
                <motion.div style={{ scale: iconScale }} className="flex flex-col items-center justify-center w-[70px]">
                  <FaUserLock className="text-sm" />
                  <span className="text-[10px] font-bold">屏蔽</span>
                </motion.div>
              </motion.button>
            </>
          )}

          <motion.button
            style={{ width: buttonWidth, opacity: buttonOpacity }}
            onClick={() => { onDelete(friendship.id, displayName); animate(x, 0); }}
            className="bg-red-500 text-white flex flex-col items-center justify-center gap-1 overflow-hidden whitespace-nowrap"
          >
            <motion.div style={{ scale: iconScale }} className="flex flex-col items-center justify-center w-[70px]">
              <FaTrash className="text-sm" />
              <span className="text-[10px] font-bold">删除</span>
            </motion.div>
          </motion.button>
        </div>

        {/* 顶层内容层 */}
        <motion.div
          style={{ x, background: isDarkMode ? '#0d1626' : '#ffffff' }}
          drag="x"
          dragConstraints={{ left: dragThreshold, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 z-10 flex items-center gap-3 px-4 touch-pan-y"
        >
          <img
            src={friend?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=orbit'}
            className="w-12 h-12 rounded-full shrink-0 border"
            style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}
            alt=""
          />
          <div className="flex-1 min-w-0" onClick={() => onFriendClick(friend)}>
            <p className="font-medium truncate" style={{ color: isDarkMode ? '#e5e7eb' : '#111827' }}>{displayName}</p>
            <p className="text-xs mt-1 opacity-50" style={{ color: isDarkMode ? '#cbd5e1' : '#6b7280' }}>
              {friendship.remark || '查看共同记忆'}
            </p>
          </div>
          <FaChevronRight className="text-[10px] opacity-20" />
        </motion.div>
      </div>
    );
  };
  return (
    <div
      ref={scrollContainerRef}
      className={`relative w-full flex-1 min-h-0 hide-scrollbar flex flex-col ${shouldLockBackgroundScroll ? 'overflow-hidden touch-none' : 'overflow-y-auto'}`}
      style={{
        backgroundColor: isDarkMode ? '#070707ff' : '#f5f5f7',
        color: 'var(--orbit-text)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        overscrollBehaviorY: 'contain',
      }}
    >
      <PullToRefresh onRefresh={handleRefreshHome} isRefreshing={refreshingHome} disabled={shouldLockBackgroundScroll} scrollRef={scrollContainerRef} />
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% -10%, rgba(0, 0, 0, 0.04) 0%, transparent 45%), radial-gradient(circle at 90% 90%, rgba(0, 0, 0, 0.03) 0%, transparent 35%)` }}
      />
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

      {/* 顶部个人卡片 */}

      {/* 顶部内容保留安全区内边距，避免被灵动岛遮挡 */}
      <div
        className="relative top-0 z-10 mx-4"
        style={{ paddingTop: 'env(safe-area-inset-top, -2px)' }}
      >
        <motion.div
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-2 relative"
        >
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowSideMenu(true)}
              className="w-8 h-8 flex items-center justify-center"
              style={{ color: 'var(--orbit-text)' }}
              title="设置"
            >
              <FiSettings className="text-[18px]" />
            </button>
            <div className="flex-1 px-2">
              {isEditingName ? (
                <div className="flex items-center gap-2 max-w-[240px] mx-auto">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveName();
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelNameEditing();
                      }
                    }}
                    onBlur={resetNicknameScroll}
                    className="flex-1 h-8 px-2 rounded-lg text-sm border outline-none"
                    style={{ borderColor: '#e5e7eb', color: 'var(--orbit-text)', background: '#ffffff' }}
                    placeholder="输入昵称"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveName()}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: '#ecfdf5', color: '#065f46' }}
                    title="保存昵称"
                  >
                    <FaCheck className="text-xs" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="mx-auto flex items-center gap-1 text-xl font-semibold"
                  style={{ color: isDarkMode ? '#ffffff' : '#111827' }}
                  title="点击修改昵称"
                >
                  <span>{currentUser?.username || '我的主页'}</span>
                  <FaEdit className="text-xs" style={{ color: 'var(--orbit-text-muted)' }} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={cancelNameEditing}
              className="w-9 h-9 flex items-center justify-center"
              style={{ color: isEditingName ? 'var(--orbit-text-muted)' : 'transparent' }}
              title="取消编辑"
              disabled={!isEditingName}
            >
              <FaTimes className="text-sm" />
            </button>
          </div>

          <div className="flex items-center gap-4 mb-4 relative">
            <div className="relative">
              <motion.div className="relative cursor-pointer" onClick={handleAvatarClick}>
                <img src={currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest'} alt={currentUser?.username} className="w-20 h-20 rounded-full object-cover" />
                {uploadingAvatar && <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center"><FaSpinner className="text-white animate-spin" /></div>}
              </motion.div>
              {/* 随机头像按钮 */}
              <button
                onClick={() => setShowAvatarPicker(p => !p)}
                className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-[#00FFB3] flex items-center justify-center shadow-lg"
                title="随机头像"
              >
                <FaDice className="text-black text-xs" />
              </button>
              {/* 隐藏的文件选择器，供角标“上传头像”使用 */}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

              {/* 头像预览弹窗（点击头像查看或上传后裁剪） */}
              {typeof document !== 'undefined' && showAvatarPreview ? createPortal(
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center"
                  >
                    <button
                      onClick={closeAvatarPreview}
                      className="absolute left-4 top-10 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ color: '#ffffff' }}
                    >
                      <FaTimes className="text-2xl" />
                    </button>

                    <motion.div
                      initial={{ scale: 0.9, y: 12 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 12 }}
                      className="relative -translate-y-6"
                      onClick={e => e.stopPropagation()}
                    >
                      <img
                        ref={previewImgRef}
                        src={previewAvatarUrl || currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest'}
                        alt={currentUser?.username}
                        className="w-[72vw] max-w-[360px] aspect-square rounded-full border border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.55)] object-cover bg-black touch-none"
                        style={{ transform: `translate(${avatarAdjustOffsetX * 60}px, ${avatarAdjustOffsetY * 60}px) scale(${avatarAdjustScale})` }}
                        draggable={false}
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchEnd}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          alert('长按/右键保存图片到本地');
                        }}
                      />
                    </motion.div>

                    {pendingAvatarFile && (
                      <div
                        className="absolute left-0 right-0 bottom-0 px-5 pb-6 pt-4"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.55)] flex items-center justify-between px-4 py-3"
                          style={{ background: 'rgba(18, 18, 18, 0.92)', color: '#f5f5f5' }}
                        >
                          <button
                            onClick={closeAvatarPreview}
                            className="text-base font-semibold px-3 py-2"
                            style={{ color: '#f5f5f5' }}
                            disabled={uploadingAvatar}
                          >
                            取消
                          </button>
                          <button
                            onClick={confirmPendingAvatar}
                            className="text-base font-semibold px-4 py-2 rounded-full"
                            style={{ background: '#ef4444', color: '#fff' }}
                            disabled={uploadingAvatar}
                          >
                            {uploadingAvatar ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>,
                document.body
              ) : null}
              {/* 性别选择弹窗 — 使用 portal 渲染到 body，确保在最顶层 */}
              {typeof document !== 'undefined' && showAvatarPicker ? createPortal(
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 90%, rgba(0,0,0,0.55))' }}
                    onClick={() => setShowAvatarPicker(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 16 }}
                      className="rounded-3xl p-5 shadow-2xl flex flex-col items-center gap-4"
                      style={{ backgroundColor: 'var(--orbit-card)', border: '1px solid var(--orbit-border)', color: 'var(--orbit-text)' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <p className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>选择头像风格</p>
                      <div className="flex gap-4">
                        <button onClick={() => handleRandomAvatar('male')} className="flex flex-col items-center gap-2 px-8 py-4 rounded-2xl bg-blue-500/10 border border-blue-400/30 hover:bg-blue-500/20 active:scale-95 transition-all">
                          <span className="text-4xl">♂</span>
                          <span className="text-blue-300 text-sm font-semibold">男款</span>
                        </button>
                        <button onClick={() => handleRandomAvatar('female')} className="flex flex-col items-center gap-2 px-8 py-4 rounded-2xl bg-pink-500/10 border border-pink-400/30 hover:bg-pink-500/20 active:scale-95 transition-all">
                          <span className="text-4xl">♀</span>
                          <span className="text-pink-300 text-sm font-semibold">女款</span>
                        </button>
                      </div>
                      <button
                        onClick={handleUploadAvatarFromPicker}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl active:scale-95 transition-all"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 85%, transparent)', border: '1px solid var(--orbit-border)', color: 'var(--orbit-text)' }}
                      >
                        <FaCamera className="text-lg" />
                        <span className="text-sm font-semibold">上传头像</span>
                      </button>
                      <button onClick={() => setShowAvatarPicker(false)} className="text-xs mt-1" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>取消</button>
                    </motion.div>
                  </motion.div>
                </AnimatePresence>,
                document.body
              ) : null}
            </div>

            <div className="flex-1">
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setShowPostsCongrats(true)} className="text-center">
                  <p className="text-xl font-bold" style={{ color: isDarkMode ? '#ffffff' : '#111827' }}>{memories.length}</p>
                  <p className="text-xs mt-0.5" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>帖子</p>
                </button>
                <button type="button" onClick={() => setShowAllFriends(true)} className="text-center">
                  <p className="text-xl font-bold" style={{ color: isDarkMode ? '#ffffff' : '#111827' }}>{friends.length}</p>
                  <p className="text-xs mt-0.5" style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}>好友</p>
                </button>
                <button type="button" onClick={() => setShowBillsCongrats(true)} className="text-center">
                  <p className="text-xl font-bold" style={{ color: isDarkMode ? '#ffffff' : '#111827' }}>{ledgers.length}</p>
                  <p className="text-xs mt-0.5" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>账单</p>
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs opacity-60">邮箱</span>
                <span className="text-xs font-medium truncate opacity-90" title={currentUser?.email || '未绑定'}>{currentUser?.email || '未绑定'}</span>
              </div>

              {/* 存储空间条：仅对已登录用户展示 */}
              {currentUser && (
                <div className="mt-3">
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] opacity-50">存储空间</span>
                    <span className="text-[10px] font-medium opacity-80">
                      {(currentUser.storage_used ? (currentUser.storage_used / 1024 / 1024).toFixed(1) : '0.0')} MB / 1024 MB
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.min(100, ((currentUser.storage_used || 0) / (1024 * 1024 * 1024)) * 100)}%`,
                        // 超过 90% 变红色预警
                        backgroundColor: ((currentUser.storage_used || 0) / (1024 * 1024 * 1024)) > 0.9 ? '#ff4d4f' : undefined,
                        background: ((currentUser.storage_used || 0) / (1024 * 1024 * 1024)) <= 0.9
                          ? 'linear-gradient(to right, #60a5fa, #a855f7)'
                          : undefined
                      }}
                    />
                  </div>
                </div>
              )}

              <p className="text-sm mt-3 font-medium opacity-90">记录生活碎片 ✨</p>
              <p className="text-xs mt-1" style={{ color: 'var(--orbit-text-muted)' }}>
                {(latestActivePlace || '最近位置未知')} · 最近活跃 {latestActiveAt ? latestActiveAt.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '今天'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInviteCode(true)}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              style={{
                background: isDarkMode ? '#1f2937' : '#f3f4f6',
                color: isDarkMode ? '#7dd3fc' : '#2563eb'
              }}
            >
              复制邀请码
            </button>
            <button
              type="button"
              onClick={() => setShowAddFriend(true)}
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background: isDarkMode ? '#1f2937' : '#f3f4f6', color: isDarkMode ? '#f9fafb' : '#000000' }}
              title="添加好友"
            >
              <FaUserPlus className="text-[13px]" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* 我的足迹 */}
      <div className="relative z-10 px-4 mt-2">
        <p className="text-[14px] font-semibold mb-2 px-1" style={{ color: 'var(--orbit-text)' }}>我的足迹</p>
        <div
          className="rounded-3xl px-4 py-3"
          style={{
            background: isDarkMode ? '#111827' : '#ffffff',
            border: `1px solid ${isDarkMode ? '#1f2937' : '#e5e7eb'}`
          }}
        >
          <div className="space-y-1">
            <div className="flex items-center py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#e5e7eb' : '#111'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="17" rx="2" />
                    <path d="M8 2v4M16 2v4M3 10h18" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-5" style={{ color: 'var(--orbit-text)' }}>{currentYear} 年的记忆</p>
                  <p className="text-[12px] truncate" style={{ color: 'var(--orbit-text-muted)' }}>共 {memoryDaysThisYear} 天</p>
                </div>
              </div>
            </div>

            <div className="flex items-center py-2" style={{ borderTop: `0.5px solid ${isDarkMode ? '#1f2937' : '#f0f0f0'}` }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#e5e7eb' : '#111'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="9" cy="8" r="3" />
                    <circle cx="17" cy="9" r="2.5" />
                    <path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                    <path d="M14.5 20c0-2.4 1.9-4.3 4.3-4.3" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-5" style={{ color: 'var(--orbit-text)' }}>最常陪伴</p>
                  <p className="text-[12px] truncate" style={{ color: 'var(--orbit-text-muted)' }}>{mostFrequentCompanion} · {mostFrequentCompanionCount}次</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 好友申请通知 */}
      {pendingRequests.length > 0 && (
        <div className="relative z-10 px-4 mt-6">
          <h2 className="text-sm font-medium mb-2 px-1 flex items-center gap-2" style={{ color: 'var(--orbit-text-muted)' }}>
            <span className="w-2 h-2 rounded-full bg-[#FF6B6B] animate-pulse" />
            好友申请
            <span className="px-1.5 py-0.5 rounded-full bg-[#FF6B6B] text-white text-[10px] font-bold">{pendingRequests.length}</span>
          </h2>
          <div
            className="overflow-hidden rounded-2xl"
            style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#f2f2f7'}` }}
          >
            {pendingRequests.map((req: any) => {
              const reqUser = req.requester;
              return (
                <div
                  key={req.id}
                  className="flex items-center gap-3 py-3 px-1"
                  style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#f2f2f7'}` }}
                >
                  <img
                    src={reqUser?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${reqUser?.id}`}
                    alt={reqUser?.username}
                    className="w-11 h-11 rounded-full shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--orbit-text)' }}>{reqUser?.username || '未知用户'}</p>
                    <p className="text-xs" style={{ color: 'var(--orbit-text-muted)' }}>想加你为好友</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={processingRequests[req.id]}
                      onClick={() => handleAcceptRequest(req)}
                      className="px-3 h-8 rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ color: '#34d399', background: isDarkMode ? 'rgba(16,185,129,0.12)' : '#ecfdf5', border: `1px solid ${isDarkMode ? '#10b981' : 'transparent'}` }}
                      title="接受"
                    >
                      {processingRequests[req.id] ? <FaSpinner className="text-xs animate-spin" /> : '接受'}
                    </button>
                    <button
                      onClick={() => handleRejectRequest(req)}
                      className="px-3 h-8 rounded-lg text-xs font-medium"
                      style={{ color: '#fca5a5', background: isDarkMode ? 'rgba(248,113,113,0.12)' : '#fef2f2', border: `1px solid ${isDarkMode ? '#4b5563' : 'transparent'}` }}
                      title="拒绝"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative z-10 px-4 mt-2">
        <div style={{ height: '0.5px', background: isDarkMode ? '#1f2937' : '#f2f2f7' }} />
      </div>

      {/* 随机回忆 */}
      <div className="relative z-10 px-4 mt-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => handleRandomMemory()}
          disabled={memories.length === 0}
          className="w-full min-h-[56px] py-3 px-1 flex items-center gap-3 disabled:opacity-30 rounded-2xl"
          style={{ background: isDarkMode ? '#111827' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : 'transparent'}` }}
        >
          <div className="w-6 h-6 flex items-center justify-center text-lg shrink-0">
            🎲
          </div>
          <p className="text-[15px] font-medium" style={{ color: 'var(--orbit-text)' }}>随机回忆</p>
          <FaChevronRight className="ml-auto" style={{ color: 'var(--orbit-text-muted)' }} />
        </motion.button>

        {/* 只有过滤后有数据，才渲染整个回忆录板块 */}
        {memoryPreviewSlots.filter(Boolean).length > 0 && (
          <>
            <div className="mt-2 px-1 flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--orbit-text)' }}>回忆录（最新四个）</p>
              <p className="text-xs" style={{ color: 'var(--orbit-text-muted)' }}>点击图片查看</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {memoryPreviewSlots.filter(Boolean).map((item: any, idx: number) => (
                <button
                  key={`mem-slot-${idx}`}
                  type="button"
                  className="aspect-square rounded-xl overflow-hidden relative text-left"
                  style={{ background: '#f3f4f6' }}
                  onClick={() => setDetailMemory(item.memory)}
                  title="查看这条回忆"
                >
                  <img src={item.cover} alt={`recent-memory-${idx + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 px-2 py-1.5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45), rgba(0,0,0,0))' }}>
                    <p className="text-white text-[11px] font-medium">{item.label} · 查看回忆</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="relative z-10 px-4 mt-2">
        <div style={{ height: '0.5px', background: isDarkMode ? '#1f2937' : '#f2f2f7' }} />
      </div>


      {/* 退出按钮 */}
      <div className="relative z-10 px-4 mt-6 pb-20 space-y-3">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full p-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
          style={{
            background: isDarkMode ? '#111827' : '#ffffff',
            color: isDarkMode ? '#f9fafb' : '#111111',
            border: `1px solid ${isDarkMode ? '#1f2937' : 'transparent'}`
          }}
        >
          {loggingOut ? <FaSpinner className="w-5 h-5 animate-spin" /> : <FiLogOut className="w-5 h-5" />}
          {loggingOut ? '退出中...' : '退出登录'}
        </button>

        <div style={{ height: '0.5px', background: isDarkMode ? '#1f2937' : '#f2f2f7' }} />

        <button
          onClick={handleDeleteAccount}
          disabled={deletingAccount || loggingOut}
          className="w-full p-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
          style={{
            background: isDarkMode ? '#111827' : '#ffffff',
            color: isDarkMode ? '#f9fafb' : '#111111',
            border: `1px solid ${isDarkMode ? '#1f2937' : 'transparent'}`
          }}
        >
          {deletingAccount ? <FaSpinner className="w-5 h-5 animate-spin" /> : <FiTrash2 className="w-5 h-5" />}
          {deletingAccount ? '注销中...' : '注销邮箱账号'}
        </button>
      </div>

      <div className="relative z-10 px-4 pb-10" />

      {/* 左侧抽屉菜单 */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showSideMenu && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-black/25"
              onClick={() => setShowSideMenu(false)}
            >
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                className="h-full w-[72%] max-w-[300px] px-3 pb-2 flex flex-col pt-[calc(env(safe-area-inset-top)+16px)]"
                // className="h-full w-[72%] max-w-[300px] px-3 pt-4 pb-4 flex flex-col"
                style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7', fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 px-1">
                  <p className="text-[13px] font-medium" style={{ color: isDarkMode ? '#94a3b8' : '#c4c4c8' }}>{currentUser?.username || '设置'}</p>
                </div>

                <div className="flex-1 overflow-y-auto pr-1">
                  <div className="space-y-2">
                    {/* 账户 */}
                    <div className="rounded-2xl px-3 py-2.5" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                      <p className="text-[11px]" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3af' }}>账户</p>
                      <button
                        onClick={() => setShowAccountPage(true)}
                        className="w-full mt-1.5 pt-2 pb-1 flex items-center justify-between"
                      >
                        <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaUserShield className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />账户</span>
                        <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                      </button>
                    </div>

                    <div className="rounded-2xl px-3 py-2.5" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                      <p className="text-[11px]" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3af' }}>显示</p>

                      <button
                        onClick={() => { setShowFontSizePage(true); }}
                        className="w-full mt-1.5 py-2 flex items-center justify-between"
                        style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}
                      >
                        <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaFont className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />字体大小</span>
                        <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                      </button>

                      <button
                        onClick={() => { setShowDarkModePage(true); }}
                        className="w-full py-2 flex items-center justify-between"
                        style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}
                      >
                        <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaMoon className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />深色模式</span>
                        <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                      </button>

                      <div className="py-2 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                        <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaWifi className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />仅 Wi‑Fi 上传</span>
                        <button onClick={() => updateSettings({ wifiOnlyUpload: !settings.wifiOnlyUpload })} className="w-10 h-5 rounded-full transition-colors" style={{ background: settings.wifiOnlyUpload ? '#38bdf8' : (isDarkMode ? '#1f2937' : '#d1d5db') }}>
                          <motion.div animate={{ x: settings.wifiOnlyUpload ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }} />
                        </button>
                      </div>

                      <div className="pt-2 pb-1 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                        <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaSyncAlt className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />仅 Wi‑Fi 刷新</span>
                        <button onClick={() => updateSettings({ wifiOnlyRefresh: !settings.wifiOnlyRefresh })} className="w-10 h-5 rounded-full transition-colors" style={{ background: settings.wifiOnlyRefresh ? '#38bdf8' : (isDarkMode ? '#1f2937' : '#d1d5db') }}>
                          <motion.div animate={{ x: settings.wifiOnlyRefresh ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }} />
                        </button>
                      </div>
                    </div>

                    {/* 隐私设置 */}
                    <div className="rounded-2xl px-3 py-2.5" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                      <p className="text-[11px]" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3af' }}>隐私</p>
                      <div className="mt-1.5 pt-2 pb-1 flex items-center justify-between">
                        <span className="text-[13px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>允许他人分享我的回忆</span>
                        <button onClick={() => { const next = !settings.allowShare; updateSettings({ allowShare: next }); if (currentUser?.id) updateAllowShare(currentUser.id, next); }} className="w-10 h-5 rounded-full transition-colors" style={{ background: settings.allowShare ? '#38bdf8' : (isDarkMode ? '#1f2937' : '#d1d5db') }}>
                          <motion.div animate={{ x: settings.allowShare ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }} />
                        </button>
                      </div>
                    </div>

                    {PUSH_NOTIFICATIONS_ENABLED && (
                      <div className="rounded-2xl px-3 py-2.5" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                        <p className="text-[11px]" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3af' }}>通知设置</p>
                        <div className="mt-1.5 py-2 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                          <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaAt className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />@ 通知</span>
                          <button onClick={() => updateSettings({ notifyAt: !settings.notifyAt })} className="w-10 h-5 rounded-full transition-colors" style={{ background: settings.notifyAt ? '#38bdf8' : (isDarkMode ? '#1f2937' : '#d1d5db') }}>
                            <motion.div animate={{ x: settings.notifyAt ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }} />
                          </button>
                        </div>
                        <div className="py-2 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                          <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaComment className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />评论通知</span>
                          <button onClick={() => updateSettings({ notifyComment: !settings.notifyComment })} className="w-10 h-5 rounded-full transition-colors" style={{ background: settings.notifyComment ? '#38bdf8' : (isDarkMode ? '#1f2937' : '#d1d5db') }}>
                            <motion.div animate={{ x: settings.notifyComment ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }} />
                          </button>
                        </div>
                        <div className="pt-2 pb-1 flex items-center justify-between">
                          <span className="text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}><FaBell className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} />好友申请通知</span>
                          <button onClick={() => updateSettings({ notifyFriendRequest: !settings.notifyFriendRequest })} className="w-10 h-5 rounded-full transition-colors" style={{ background: settings.notifyFriendRequest ? '#38bdf8' : (isDarkMode ? '#1f2937' : '#d1d5db') }}>
                            <motion.div animate={{ x: settings.notifyFriendRequest ? 20 : 2 }} className="w-4 h-4 rounded-full shadow" style={{ background: isDarkMode ? '#0b1324' : '#ffffff' }} />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl overflow-hidden" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                      <button onClick={() => setShowCommunityGuidelines(true)} className="w-full px-3 py-3 text-left text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000', borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                        <FaInfoCircle className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} /> 社区公约
                      </button>
                      <button onClick={() => setShowAccountDiagnostics(true)} className="w-full px-3 py-3 text-left text-[13px] flex items-center gap-2" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>
                        <FaSearch className="text-[12px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }} /> 网络诊断
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-4 flex items-start justify-around pb-24">
                  <button className="flex flex-col items-center gap-2" onClick={() => setShowAboutOrbit(true)}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: isDarkMode ? '#000000' : '#e9eaec', border: `1px solid ${isDarkMode ? '#1f2937' : 'transparent'}` }}>
                      <FiInfo className="text-[20px]" style={{ color: isDarkMode ? '#ffffff' : '#666666' }} />
                    </div>
                    <span className="text-[12px]" style={{ color: isDarkMode ? '#ffffff' : '#6b7280' }}>关于Orbit</span>
                  </button>
                  <button className="flex flex-col items-center gap-2" onClick={() => setShowHelpSupport(true)}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: isDarkMode ? '#000000' : '#e9eaec', border: `1px solid ${isDarkMode ? '#1f2937' : 'transparent'}` }}>
                      <FiHeadphones className="text-[20px]" style={{ color: isDarkMode ? '#ffffff' : '#666666' }} />
                    </div>
                    <span className="text-[12px]" style={{ color: isDarkMode ? '#ffffff' : '#6b7280' }}>帮助与客服</span>
                  </button>
                  <button className="flex flex-col items-center gap-2" onClick={() => setShowMoreQuickMenu(true)}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: isDarkMode ? '#000000' : '#e9eaec', border: `1px solid ${isDarkMode ? '#1f2937' : 'transparent'}` }}>
                      <FiMoreHorizontal className="text-[20px]" style={{ color: isDarkMode ? '#ffffff' : '#666666' }} />
                    </div>
                    <span className="text-[12px]" style={{ color: isDarkMode ? '#ffffff' : '#6b7280' }}>更多</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 关于 Orbit 页面 */}
      <AnimatePresence>
        {showFontSizePage && (
          <FontSizePage
            isOpen={showFontSizePage}
            onClose={() => setShowFontSizePage(false)}
            currentFontSize={settings.fontSize}
            onSave={(size) => updateSettings({ fontSize: size })}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDarkModePage && (
          <DarkModePage
            isOpen={showDarkModePage}
            onClose={() => setShowDarkModePage(false)}
            themeMode={(settings.themeMode || 'system') as 'light' | 'dark' | 'system'}
            onChangeTheme={(mode) => updateSettings({ themeMode: mode })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAccountPage && (
          <AccountPage
            isOpen={showAccountPage}
            onClose={() => setShowAccountPage(false)}
            onOpenEmail={() => setShowEmailPage(true)}
            onOpenPassword={() => setShowPasswordPage(true)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEmailPage && (
          <ChangeEmailPage
            isOpen={showEmailPage}
            onClose={() => setShowEmailPage(false)}
            onSubmit={handleSubmitEmail}
            loading={actionLoading}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPasswordPage && (
          <ChangePasswordPage
            isOpen={showPasswordPage}
            onClose={() => setShowPasswordPage(false)}
            onSubmit={handleSubmitPassword}
            loading={actionLoading}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showResetPage && (
          <ResetPasswordPage
            isOpen={showResetPage}
            onClose={() => setShowResetPage(false)}
            onSubmit={async (email) => { await handleResetPassword(email); setShowResetPage(false); }}
            loading={resetLoading}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showAboutOrbit && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000]"
              style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7', fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif' }}
            >
              <div className="h-full overflow-y-auto">
                <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
                  <button
                    onClick={() => setShowAboutOrbit(false)}
                    className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
                  >
                    <FaChevronLeft className="text-base" />
                  </button>
                  <h2 className="text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>关于 Orbit</h2>
                </div>

                <div className="px-4 pt-2">
                  <div className="rounded-3xl overflow-hidden" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                    <div className="px-6 pt-12 pb-8 text-center" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                      <img src={appIcon} alt="Orbit" className="h-16 w-auto mx-auto object-contain rounded-lg" />
                      <p className="mt-4 text-[15px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>v{appVersion}</p>
                      <p className="mt-1 text-[13px]" style={{ color: isDarkMode ? '#94a3b8' : '#9ca3af' }}>更新于 {appBuildLabel}</p>
                    </div>

                    <button onClick={() => setShowEncouragePopup(true)} className="w-full px-6 py-4 flex items-center justify-between text-left" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                      <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>鼓励一下</span>
                      <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                    </button>
                    <button onClick={() => openDocument('服务条款', TERMS_TEXT)} className="w-full px-6 py-4 flex items-center justify-between text-left" style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                      <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>服务条款</span>
                      <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                    </button>
                    <button onClick={() => openDocument('隐私政策', PRIVACY_TEXT)} className="w-full px-6 py-4 flex items-center justify-between text-left">
                      <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>隐私政策</span>
                      <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                    </button>
                  </div>
                </div>


              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showEncouragePopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-6"
              onClick={() => setShowEncouragePopup(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 12 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 8 }}
                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                className="w-full max-w-xs rounded-3xl p-6 text-center"
                style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[42px] leading-none">🥰🎉✨</div>
                <p className="mt-3 text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#111827' }}>感谢你的鼓励！</p>
                <p className="mt-1 text-[13px]" style={{ color: isDarkMode ? '#94a3b8' : '#6b7280' }}>Orbit 会继续努力 💫</p>
                <button
                  onClick={() => setShowEncouragePopup(false)}
                  className="mt-4 px-4 py-2 rounded-full text-[13px]"
                  style={{ background: isDarkMode ? '#1e293b' : '#f3f4f6', color: isDarkMode ? '#e5e7eb' : '#111827' }}
                >
                  好的
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showMoreQuickMenu && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000]"
              style={{ background: isDarkMode ? '#0b1324' : '#f5f5f7', fontFamily: '"PingFang SC", "PingFangSC-Regular", "Helvetica Neue", Arial, sans-serif' }}
            >
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                className="h-full w-full overflow-y-auto"
              >
                <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-center relative">
                  <button
                    onClick={() => setShowMoreQuickMenu(false)}
                    className="absolute left-4 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}
                  >
                    <FaChevronLeft className="text-base" />
                  </button>
                  <h2 className="text-[18px] font-semibold" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>更多</h2>
                </div>

                <div className="px-4 pt-2 pb-8">
                  <div className="rounded-3xl overflow-hidden" style={{ background: isDarkMode ? '#0f172a' : '#ffffff', border: `1px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}>
                    <button
                      className="w-full px-6 py-4 flex items-center justify-between text-left"
                      style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}
                      onClick={() => {
                        openDocument('检查更新', `当前版本：v${appVersion}\n构建时间：${appBuildLabel}\n\n已是最新版本。`);
                      }}
                    >
                      <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>检查更新</span>
                      <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                    </button>
                    <button
                      className="w-full px-6 py-4 flex items-center justify-between text-left"
                      style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}
                      onClick={async () => {
                        await handleClearCache();
                      }}
                    >
                      <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>清理缓存</span>
                      <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                    </button>
                    <button
                      className="w-full px-6 py-4 flex items-center justify-between text-left"
                      style={{ borderBottom: `0.5px solid ${isDarkMode ? '#1f2937' : '#ececf1'}` }}
                      onClick={() => {
                        setHelpSupportOpenFeedback(true);
                        setShowHelpSupport(true);
                      }}
                    >
                      <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>意见反馈</span>
                      <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                    </button>
                    <button
                      className="w-full px-6 py-4 flex items-center justify-between text-left"
                      onClick={() => {
                        openDocument('关于版本', `Orbit\n版本号：v${appVersion}\n构建时间：${appBuildLabel}`);
                      }}
                    >
                      <span className="text-[16px]" style={{ color: isDarkMode ? '#e5e7eb' : '#000000' }}>关于版本</span>
                      <FaChevronRight className="text-[13px]" style={{ color: isDarkMode ? '#6b7280' : '#c4c4c8' }} />
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <AnimatePresence>
        {showCommunityGuidelines && (
          <CommunityGuidelinesPage
            isOpen={showCommunityGuidelines}
            onClose={() => setShowCommunityGuidelines(false)}
            content={COMMUNITY_TEXT}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHelpSupport && (
          <HelpSupportPage
            isOpen={showHelpSupport}
            onClose={() => { setShowHelpSupport(false); setHelpSupportOpenFeedback(false); }}
            currentUser={currentUser}
            isDarkMode={isDarkMode}
            onOpenResetPassword={() => setShowResetPage(true)}
            onOpenChangeEmail={() => setShowEmailPage(true)}
            autoOpenFeedback={helpSupportOpenFeedback}
          />
        )}
      </AnimatePresence>

      {/* 设置中心弹窗 */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-xl"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="min-h-screen max-h-screen overflow-y-auto rounded-t-3xl text-[var(--orbit-text)]"
              style={{ background: 'var(--orbit-surface)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 p-4 border-b flex items-center justify-between backdrop-blur-md" style={{ background: 'color-mix(in srgb, var(--orbit-surface) 96%, rgba(255,255,255,0.9))', borderColor: 'var(--orbit-border)', boxShadow: '0 6px 18px rgba(0,0,0,0.08)' }}>
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><FaTimes className="text-[color:var(--orbit-text-muted)]" /></button>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-[color:var(--orbit-text)]">设置中心</h2>
                  <p className="text-xs mt-0.5 text-[color:var(--orbit-text-muted)]">账户与应用偏好</p>
                </div>
                <div className="w-10" />
              </div>

              <div className="p-4 space-y-4">
                {/* 1. 账户与安全 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-xs text-[color:var(--orbit-text-muted)]">账户与安全</div>
                  <button onClick={() => setShowEmailModal(true)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">📧 更换邮箱</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">绑定新邮箱并验证</p>
                  </button>
                  <button onClick={() => setShowPasswordModal(true)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">🔑 更换密码</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">建议定期更新密码</p>
                  </button>
                </div>

                {/* 2. 通用设置 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-xs text-[color:var(--orbit-text-muted)]">通用设置</div>
                  <div className="p-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium mb-2 text-[color:var(--orbit-text)]">字体大小</p>
                    <div className="flex gap-2">
                      {(['small', 'normal', 'large'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => updateSettings({ fontSize: size })}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${settings.fontSize === size ? 'bg-[#00FFB3] text-black border-transparent' : 'bg-black/5 text-[color:var(--orbit-text-muted)] border-[color:var(--orbit-border)] dark:bg-white/5 dark:border-white/15'}`}
                        >
                          {size === 'small' ? '小' : size === 'large' ? '大' : '中'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium mb-2 text-[color:var(--orbit-text)]">外观主题</p>
                    <div className="flex gap-2">
                      {(['system', 'light', 'dark'] as const).map((mode) => {
                        const currentMode = settings.themeMode || 'system';
                        const labels = { system: '跟随系统', light: '浅色', dark: '深色' };
                        const isActive = currentMode === mode;
                        return (
                          <button
                            key={mode}
                            onClick={() => updateSettings({ themeMode: mode })}
                            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${isActive
                              ? 'bg-[#00FFB3] text-black border-transparent font-semibold'
                              : 'bg-black/5 text-[color:var(--orbit-text-muted)] border-[color:var(--orbit-border)] hover:text-[color:var(--orbit-text)] hover:border-[color:var(--orbit-border)] dark:bg-white/5 dark:text-white/60 dark:border-white/15 dark:hover:text-white dark:hover:border-white/30'
                              }`}
                          >
                            {labels[mode]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <div>
                      <p className="font-medium text-[color:var(--orbit-text)]">仅 Wi‑Fi 上传</p>
                      <p className="text-sm text-[color:var(--orbit-text-muted)]">节省流量</p>
                    </div>
                    <button onClick={() => updateSettings({ wifiOnlyUpload: !settings.wifiOnlyUpload })} className={`w-12 h-6 rounded-full transition-colors ${settings.wifiOnlyUpload ? 'bg-[#00FFB3]' : 'bg-black/10 dark:bg-white/10'}`}>
                      <motion.div animate={{ x: settings.wifiOnlyUpload ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <div>
                      <p className="font-medium text-[color:var(--orbit-text)]">仅 Wi‑Fi 刷新</p>
                      <p className="text-sm text-[color:var(--orbit-text-muted)]">弱网时避免刷新</p>
                    </div>
                    <button onClick={() => updateSettings({ wifiOnlyRefresh: !settings.wifiOnlyRefresh })} className={`w-12 h-6 rounded-full transition-colors ${settings.wifiOnlyRefresh ? 'bg-[#00FFB3]' : 'bg-black/10 dark:bg-white/10'}`}>
                      <motion.div animate={{ x: settings.wifiOnlyRefresh ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </div>

                {/* 3. 通知设置 */}
                {PUSH_NOTIFICATIONS_ENABLED && (
                  <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="px-4 pt-4 pb-2 text-xs text-[color:var(--orbit-text-muted)]">通知设置</div>
                    <div className="flex items-center justify-between px-4 py-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                      <p className="font-medium text-[color:var(--orbit-text)]">@ 通知</p>
                      <button onClick={() => updateSettings({ notifyAt: !settings.notifyAt })} className={`w-12 h-6 rounded-full transition-colors ${settings.notifyAt ? 'bg-[#00FFB3]' : 'bg-black/10 dark:bg-white/10'}`}>
                        <motion.div animate={{ x: settings.notifyAt ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                      <p className="font-medium text-[color:var(--orbit-text)]">评论通知</p>
                      <button onClick={() => updateSettings({ notifyComment: !settings.notifyComment })} className={`w-12 h-6 rounded-full transition-colors ${settings.notifyComment ? 'bg-[#00FFB3]' : 'bg-black/10 dark:bg-white/10'}`}>
                        <motion.div animate={{ x: settings.notifyComment ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                      <p className="font-medium text-[color:var(--orbit-text)]">好友申请通知</p>
                      <button onClick={() => updateSettings({ notifyFriendRequest: !settings.notifyFriendRequest })} className={`w-12 h-6 rounded-full transition-colors ${settings.notifyFriendRequest ? 'bg-[#00FFB3]' : 'bg-black/10 dark:bg-white/10'}`}>
                        <motion.div animate={{ x: settings.notifyFriendRequest ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                      </button>
                    </div>

                  </div>
                )}

                {/* 4. 隐私设置 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-xs text-[color:var(--orbit-text-muted)]">隐私设置</div>
                  <div className="flex items-center justify-between px-4 py-4 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <div>
                      <p className="font-medium text-[color:var(--orbit-text)]">允许他人分享你的回忆</p>
                      <p className="text-sm text-[color:var(--orbit-text-muted)]">关闭后仅自己可分享</p>
                    </div>
                    <button onClick={() => updateSettings({ allowShare: !settings.allowShare })} className={`w-12 h-6 rounded-full transition-colors ${settings.allowShare ? 'bg-[#00FFB3]' : 'bg-black/10 dark:bg-white/10'}`}>
                      <motion.div animate={{ x: settings.allowShare ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </div>

                {/* 5. 帮助与客服 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-xs text-[color:var(--orbit-text-muted)]">帮助与客服</div>
                  <button onClick={() => setShowResetModal(true)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">🔐 找回密码</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">重置你的账号密码</p>
                  </button>
                  <a href="mailto:3482407231@qq.com?subject=意见反馈" className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">💬 意见反馈</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">告诉我们你的想法</p>
                  </a>
                  <a href="mailto:3482407231@qq.com?subject=联系客服" className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">📞 联系客服</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">工作日 10:00-18:00</p>
                  </a>
                  <button onClick={() => alert('猜你想问：功能即将上线')} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">❓ 猜你想问</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">常见问题与使用技巧</p>
                  </button>
                  <button onClick={() => setShowAdminPage(true)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">🛡️ 举报审核 (Admin)</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">查看并处理用户举报</p>
                  </button>
                </div>

                {/* 6. 关于 Orbit */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-xs text-[color:var(--orbit-text-muted)]">关于 Orbit</div>
                  <button onClick={() => alert('谢谢你的鼓励！')} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">🌟 鼓励一下</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">你的支持是我们最大的动力</p>
                  </button>
                  <button onClick={() => setShowCommunityGuidelines(true)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">📜 社区公约</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">文明友善的社区氛围</p>
                  </button>
                  <button onClick={() => openDocument('服务条款', TERMS_TEXT)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">📄 服务条款</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">使用条款与服务说明</p>
                  </button>
                  <button onClick={() => openDocument('隐私政策', PRIVACY_TEXT)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">🔏 隐私政策</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">查看完整隐私保护政策</p>
                  </button>
                  <button onClick={() => setShowAccountDiagnostics(true)} className="w-full p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 border-t block" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="font-medium text-[color:var(--orbit-text)]">🧪 网络诊断</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text-muted)]">检查网络与账号状态</p>
                  </button>
                  <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <p className="text-xs text-[color:var(--orbit-text-muted)]">当前版本</p>
                    <p className="text-sm mt-1 text-[color:var(--orbit-text)]">v{appVersion}</p>
                    <p className="text-[11px] mt-1 text-[color:var(--orbit-text-muted)]">构建时间：{appBuildLabel}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 弹窗挂载区 */}
      <AnimatePresence>
        {showAllFriends && (
          <motion.div
            key="all-friends-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/25"
            onClick={() => setShowAllFriends(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              // className="min-h-screen max-h-screen w-full flex flex-col"
              className="h-[100dvh] w-full flex flex-col overflow-hidden"
              style={{ background: isDarkMode ? '#0b0f1a' : '#ffffff', fontFamily: '"PingFang SC", "-apple-system", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 safe-top p-4 border-b flex items-center justify-between" style={{ borderColor: isDarkMode ? '#1f2937' : '#ececec', background: isDarkMode ? '#0b0f1a' : '#ffffff', zIndex: 5 }}>
                <button onClick={() => setShowAllFriends(false)} className="p-2 rounded-full hover:bg-black/5" style={{ color: isDarkMode ? '#f9fafb' : '#000000' }}><FaTimes className="text-inherit" /></button>
                <div className="text-center">
                  <h2 className="text-lg font-semibold" style={{ color: isDarkMode ? '#f9fafb' : '#000000' }}>好友</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--orbit-text-muted)' }}>共 {friends.length} 位</p>
                </div>
                <div className="w-10" />
              </div>

              <div className="px-4 pt-2 flex gap-2" style={{ background: isDarkMode ? '#0b0f1a' : '#ffffff', position: 'sticky', top: 'calc(env(safe-area-inset-top, 0px) + 56px)', zIndex: 4 }}>
                {[
                  { key: 'all', label: '全部' },
                  { key: 'real', label: '真实' },
                  { key: 'virtual', label: '虚拟' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFriendTab(tab.key as any)}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium"
                    style={{
                      background: friendTab === tab.key ? (isDarkMode ? '#111111' : '#111111') : (isDarkMode ? '#1f2937' : '#f3f4f6'),
                      color: friendTab === tab.key ? '#ffffff' : (isDarkMode ? '#e5e7eb' : '#111111'),
                      border: `1px solid ${isDarkMode ? '#1f2937' : '#e5e7eb'}`,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {friends.length >= 4 && (
                <div className="p-4 pb-2 shrink-0" style={{ background: isDarkMode ? '#0b0f1a' : '#ffffff', top: 'calc(env(safe-area-inset-top, 0px) + 116px)', zIndex: 3 }}>
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] text-xs pointer-events-none" />
                    <input
                      type="text"
                      placeholder="搜索好友..."
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      className="w-full pl-8 pr-4 py-2.5 text-sm rounded-xl border outline-none"
                      style={{ background: isDarkMode ? '#111827' : '#f3f4f6', borderColor: isDarkMode ? '#1f2937' : '#ececec', color: isDarkMode ? '#f9fafb' : '#111827' }}
                    />
                  </div>
                </div>
              )}

              <div
                className="flex-1 overflow-y-auto min-h-0"
                style={{
                  background: isDarkMode ? '#0b0f1a' : '#ffffff', WebkitOverflowScrolling: 'touch', // 🌟 关键：iOS 丝滑滚动补丁
                  overscrollBehavior: 'contain'
                }}
              >
                <div className="p-4 pt-2 pb-32">
                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: isDarkMode ? '#1f2937' : '#ececec' }}>
                    {filteredFriends.length > 0 ? (
                      filteredFriends.map((fs: any, idx: number) => (
                        <SwipeableFriendRow
                          key={fs.id}
                          friendship={fs}
                          index={idx}
                          total={filteredFriends.length}
                          isDarkMode={isDarkMode}
                          // 传入你现有的逻辑函数
                          onFriendClick={handleFriendClick}
                          onDelete={handleDeleteFriend}
                          onEditRemark={(item: any) => {
                            setRemarkInput(item.remark || '');
                            setEditingRemarkId(item.id);
                          }}
                          // ✨ 新增的举报屏蔽入口
                          onReport={(item: any) => {
                            setReportingFriend(item); // 先锁定举报对象
                            setShowReportModal(true);       // 打开举报弹窗
                          }}
                          onBlock={(item: any) => handleBlockUser(item)}
                        />
                      ))
                    ) : (
                      <div className="p-8 text-center text-sm" style={{ color: 'var(--orbit-text-muted)' }}>没有匹配的好友</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        <AnimatePresence>
          {showPostsCongrats && (
            <motion.div
              key="posts-congrats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center"
              onClick={() => setShowPostsCongrats(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 12, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 12, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="mx-6 rounded-3xl shadow-2xl overflow-hidden"
                style={{ background: modalSurfaceColor, maxWidth: '360px', width: '100%' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-6">
                  <div className="text-4xl" aria-hidden>💕</div>
                  <p className="text-center text-lg font-semibold" style={{ color: modalPrimaryTextColor }}>
                    恭喜 {currentUser?.username || '你'}
                  </p>
                  <p className="text-center text-base" style={{ color: modalSecondaryTextColor }}>
                    已发布 {memories.length} 条帖子，继续加油！
                  </p>
                </div>
                <button
                  onClick={() => setShowPostsCongrats(false)}
                  className="w-full text-center py-4 text-base font-semibold"
                  style={{ color: modalPrimaryTextColor, borderTop: `1px solid ${modalBorderColor}` }}
                >
                  我知道了
                </button>
              </motion.div>
            </motion.div>
          )}
          {showBillsCongrats && (
            <motion.div
              key="bills-congrats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center"
              onClick={() => setShowBillsCongrats(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 12, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 12, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="mx-6 rounded-3xl shadow-2xl overflow-hidden"
                style={{ background: modalSurfaceColor, maxWidth: '360px', width: '100%' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-6">
                  <div className="text-4xl" aria-hidden>🎉</div>
                  <p className="text-center text-lg font-semibold" style={{ color: modalPrimaryTextColor }}>
                    恭喜 {currentUser?.username || '你'}
                  </p>
                  <p className="text-center text-base" style={{ color: modalSecondaryTextColor }}>
                    已记录 {ledgers.length} 笔账单，继续保持！
                  </p>
                </div>
                <button
                  onClick={() => setShowBillsCongrats(false)}
                  className="w-full text-center py-4 text-base font-semibold"
                  style={{ color: modalPrimaryTextColor, borderTop: `1px solid ${modalBorderColor}` }}
                >
                  我知道了
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {selectedFriend && (<SharedMemoriesModal
          key={`shared-${selectedFriend.id || 'unknown'}`}
          friend={selectedFriend}
          memories={memories.filter(m =>
            // 我发布的、@了对方的记忆
            m.tagged_friends?.includes(selectedFriend.id) ||
            // 对方发布的、@了我的记忆（通过 RLS 已拉取到本地）
            m.user_id === selectedFriend.id
          )}
          onClose={() => setSelectedFriend(null)}
          isDarkMode={isDarkMode}
          onReportUser={(user: any) => { setReportingFriend(user); setShowReportModal(true); }}
          onBlockUser={(user: any) => handleBlockUser(user)}
        />
        )}
        {bindingFriend && <BindFriendModal key={`bind-${bindingFriend.id || 'unknown'}`} friend={bindingFriend} isOpen={!!bindingFriend} onClose={() => setBindingFriend(null)} onBind={handleBindFriend} />}
        {acceptingRequest && (
          <AcceptFriendModal
            key={`accept-${acceptingRequest.id || 'unknown'}`}
            isOpen={!!acceptingRequest}
            onClose={() => setAcceptingRequest(null)}
            requester={acceptingRequest.requester}
            virtualFriends={friends.filter((f: any) => f.status === 'virtual')}
            onConfirm={handleConfirmAccept}
            loading={acceptingLoading}
          />
        )}
        {showAddFriend && <AddFriendModal key="add-friend-modal" isOpen={showAddFriend} onClose={() => setShowAddFriend(false)} onAddVirtual={handleAddFriend} onAddReal={handleAddRealFriend} virtualFriends={friends.filter((f: any) => f.friend?.id?.startsWith('temp-'))} onBindExisting={handleBindExisting} />}
        {showInviteCode && <InviteCodeModal key="invite-code-modal" isOpen={showInviteCode} onClose={() => setShowInviteCode(false)} inviteCode={inviteCode} username={currentUser?.username || '用户'} />}
        
        {showAccountDiagnostics && (
          <AccountDiagnosticsModal
            key="account-diagnostics-modal"
            isOpen={showAccountDiagnostics}
            onClose={() => setShowAccountDiagnostics(false)}
            currentUser={currentUser}
            friendsCount={friends.length}
            memoriesCount={memories.length}
            ledgersCount={ledgers.length}
            isDarkMode={isDarkMode}
          />
        )}
        <ChangeEmailModal
          key="change-email-modal"
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          onSubmit={handleSubmitEmail}
          loading={actionLoading}
        />
        <ReportPage
          key="report-page"
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setReportingFriend(null);
          }}
          targetName={reportingFriend?.friend?.username || reportingFriend?.friend_name || '该用户'}
          onSubmit={handleReportSubmit}
          isDarkMode={isDarkMode}
        />
        <AdminReportsPage
          isOpen={showAdminPage}
          onClose={() => setShowAdminPage(false)}
          isDarkMode={isDarkMode}
        />
        <ChangePasswordModal
          key="change-password-modal"
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onSubmit={handleSubmitPassword}
          loading={actionLoading}
        />
        <ResetPasswordModal
          key="reset-password-modal"
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          onSubmit={handleResetPassword}
          loading={resetLoading}
        />
        <DocumentModal
          key={`doc-${docModal.title || 'doc'}`}
          isOpen={docModal.isOpen}
          onClose={() => setDocModal({ ...docModal, isOpen: false })}
          title={docModal.title}
          content={docModal.content}
          isDarkMode={isDarkMode}
        />
      </AnimatePresence>

      {randomMemory && typeof document !== 'undefined' && createPortal(
        <RandomMemoryModal
          key={`random-${randomMemory.id || randomMemory.created_at || 'mem'}`}
          memory={randomMemory}
          onShuffle={() => handleRandomMemory(randomMemory?.id)}
          onClose={() => setRandomMemory(null)}
          friends={friends}
          currentUser={currentUser}
          onReport={(item: any) => {
            setReportingFriend({
              friend_id: item.user_id,
              friend: { username: item.username || '作者' },
              friend_name: item.username
            });
            setShowReportModal(true);
          }}
          onBlock={(userId: string) => handleBlockUser({ id: userId, username: '此用户' })}
        />,
        document.body
      )}
      {memoirMemory && typeof document !== 'undefined' && createPortal(
        <MemoirMemoryModal
          key={`memoir-${memoirMemory.id || memoirMemory.created_at || 'mem'}`}
          memory={memoirMemory}
          onClose={() => setMemoirMemory(null)}
          onReport={(item: any) => {
            setReportingFriend({
              friend_id: item.user_id,
              friend: { username: item.user_name || '作者' },
              friend_name: item.user_name
            });
            setShowReportModal(true);
          }}
          onBlock={(userId: string) => handleBlockUser({ id: userId, username: '此用户' })}
        />,
        document.body
      )}
      {detailMemory && typeof document !== 'undefined' && createPortal(
        <MemoryDetailModal
          key={`detail-${detailMemory.id || detailMemory.created_at || 'mem'}`}
          memory={detailMemory}
          onClose={() => setDetailMemory(null)}
          friends={friends}
          currentUser={currentUser}
        />,
        document.body
      )}
    </div >
  );
}