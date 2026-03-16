import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSignOutAlt, FaEdit, FaChevronRight, FaSpinner, FaHeart, FaUsers, FaCamera, FaTimes, FaCheck, FaPlus, FaUserPlus, FaShareAlt, FaCopy, FaTrash, FaDice, FaMapMarkerAlt, FaFire, FaSearch, FaSyncAlt } from 'react-icons/fa';
import { useUserStore, useMemoryStore, useLedgerStore } from '../store';
import { supabase, signOut, uploadAvatar, saveInviteCode, lookupProfileByInviteCode, bindVirtualFriend, addRealFriendByCode, updateFriendRemark, acceptFriendRequest, rejectFriendRequest, updateProfileUsername, getProfile, deleteMyAccount } from '../api/supabase';
import { DEFAULT_SETTINGS, readSettings, writeSettings, SETTINGS_EVENT, shouldAllowRefresh } from '../utils/settings';
import { getTaggedDisplayName, getVisibleTaggedFriendIds } from '../utils/tagVisibility';

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

// 邮箱修改弹窗
const ChangeEmailModal = ({ isOpen, onClose, onSubmit, loading }: any) => {
  const [email, setEmail] = useState('');
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">更换邮箱</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
        </div>
        <p className="text-white/40 text-sm mb-4">我们将向新邮箱发送一封确认邮件，点击邮件中的链接后即可生效。</p>
        <input type="email" placeholder="输入新邮箱" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none mb-6" />
        <button onClick={() => onSubmit(email)} disabled={!email || loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold disabled:opacity-30">
          {loading ? <FaSpinner className="animate-spin mx-auto" /> : '发送确认邮件'}
        </button>
      </motion.div>
    </motion.div>
  );
};

// 密码修改弹窗
const ChangePasswordModal = ({ isOpen, onClose, onSubmit, loading }: any) => {
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">修改密码</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
        </div>
        <div className="space-y-3 mb-6">
          <input type="password" placeholder="输入新密码（至少 6 位）" value={pwd1} onChange={e => setPwd1(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" />
          <input type="password" placeholder="再次确认新密码" value={pwd2} onChange={e => setPwd2(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" />
        </div>
        <button onClick={() => onSubmit(pwd1, pwd2)} disabled={!pwd1 || !pwd2 || loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white font-semibold disabled:opacity-30">
          {loading ? <FaSpinner className="animate-spin mx-auto" /> : '确认修改'}
        </button>
      </motion.div>
    </motion.div>
  );
};

// 找回密码弹窗
const ResetPasswordModal = ({ isOpen, onClose, onSubmit, loading }: any) => {
  const [email, setEmail] = useState('');
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">找回密码</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
        </div>
        <p className="text-white/40 text-sm mb-4">请输入你注册时的邮箱，我们将为你发送一封包含重置密码链接的邮件。</p>
        <input type="email" placeholder="输入注册邮箱" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none mb-6" />
        <button onClick={() => onSubmit(email)} disabled={!email || loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold disabled:opacity-30">
          {loading ? <FaSpinner className="animate-spin mx-auto" /> : '发送重置邮件'}
        </button>
      </motion.div>
    </motion.div>
  );
};

// 通用文档/协议展示弹窗
const DocumentModal = ({ isOpen, onClose, title, content }: any) => {
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-md bg-[#1a1a1a] rounded-3xl border border-white/10 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* 标题栏 (固定在顶部) */}
        <div className="flex justify-between items-center p-6 border-b border-white/5 shrink-0">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
        </div>
        {/* 内容区 (可滚动) */}
        <div className="p-6 overflow-y-auto text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </motion.div>
    </motion.div>
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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">添加好友</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <FaTimes className="text-white/60" />
          </button>
        </div>

        {/* 标签切换 */}
        <div className="flex p-1 bg-white/5 rounded-xl mb-5">
          <button
            onClick={() => setTab('virtual')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'virtual' ? 'bg-white/10 text-white shadow' : 'text-white/40'
            }`}
          >
            🎭 临时好友
          </button>
          <button
            onClick={() => setTab('real')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'real' ? 'bg-[#00FFB3]/20 text-[#00FFB3] shadow' : 'text-white/40'
            }`}
          >
            ✅ 已注册好友
          </button>
        </div>

        {tab === 'virtual' ? (
          <div className="mb-6 space-y-3">
            <p className="text-white/50 text-sm">
              输入昵称创建临时好友（马甲），方便打卡记账。等他/她注册后可通过邀请码绑定为真实账号。
            </p>
            <input
              type="text"
              placeholder="好友昵称 *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none focus:border-orbit-mint/50"
            />
            <input
              type="text"
              placeholder="备注（选填，如：大学室友）"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none focus:border-orbit-mint/50"
            />
          </div>
        ) : realStep === 'input' ? (
          <div className="mb-6">
            <p className="text-white/50 text-sm mb-4">
              让对方在「我的」页面查看并分享邀请码，输入后可预览对方信息再确认添加。
            </p>
            <input
              type="text"
              placeholder="对方的邀请码（如 ORBIT123456）"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none focus:border-orbit-mint/50 font-mono tracking-widest text-center text-base"
            />
          </div>
        ) : (
          // preview step
          <div className="mb-6">
            {/* 找到的用户预览 */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#00FFB3]/10 border border-[#00FFB3]/20 mb-4">
              <img
                src={previewProfile?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${previewProfile?.id}`}
                alt={previewProfile?.username}
                className="w-12 h-12 rounded-xl ring-2 ring-[#00FFB3]/30"
              />
              <div>
                <p className="text-white font-bold">{previewProfile?.username}</p>
                <p className="text-[#00FFB3] text-xs mt-0.5">找到了 ✓</p>
              </div>
            </div>

            {/* 选择：新建 or 绑定已有虚拟好友 */}
            {virtualFriends.length > 0 && (
              <div className="space-y-2">
                <p className="text-white/50 text-xs mb-2">这是你已有的「{previewProfile?.username}」？选择绑定或新建：</p>
                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === 'new' ? 'border-[#00FFB3] bg-[#00FFB3]/5' : 'border-white/10 bg-white/3'}`}>
                  <input type="radio" name="bindTarget" value="new" checked={bindTarget === 'new'} onChange={() => setBindTarget('new')} className="accent-[#00FFB3]" />
                  <span className="text-white text-sm">➕ 直接添加为新好友</span>
                </label>
                {virtualFriends.map((vf: any) => (
                  <label key={vf.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === vf.id ? 'border-[#FF9F43] bg-[#FF9F43]/5' : 'border-white/10 bg-white/3'}`}>
                    <input type="radio" name="bindTarget" value={vf.id} checked={bindTarget === vf.id} onChange={() => setBindTarget(vf.id)} className="accent-[#FF9F43]" />
                    <img src={vf.friend.avatar_url} alt={vf.friend.username} className="w-7 h-7 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{vf.friend.username}</p>
                      {vf.remark && <p className="text-white/40 text-xs truncate">{vf.remark}</p>}
                    </div>
                    <span className="ml-auto text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded shrink-0">绑定</span>
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
              className="flex-1 py-3 rounded-xl bg-white/5 text-white/60 font-semibold"
            >
              返回
            </button>
          )}
          <button
            onClick={handleAdd}
            disabled={loading || (tab === 'virtual' ? !name.trim() : realStep === 'input' ? code.length < 11 : false)}
            className={`flex-1 py-3 rounded-xl font-semibold disabled:opacity-30 flex items-center justify-center gap-2 ${
              tab === 'virtual'
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

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">接受好友申请</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <FaTimes className="text-white/60" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#00FFB3]/10 border border-[#00FFB3]/20 mb-4">
          <img
            src={requester?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${requester?.id}`}
            alt={requester?.username}
            className="w-12 h-12 rounded-xl ring-2 ring-[#00FFB3]/30"
          />
          <div>
            <p className="text-white font-bold">{requester?.username || '未知用户'}</p>
            <p className="text-[#00FFB3] text-xs mt-0.5">想添加你为好友</p>
          </div>
        </div>

        {virtualFriends.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-white/50 text-xs mb-2">是否绑定到已有马甲好友？</p>
            <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === 'new' ? 'border-[#00FFB3] bg-[#00FFB3]/5' : 'border-white/10 bg-white/3'}`}>
              <input type="radio" name="bindTarget" value="new" checked={bindTarget === 'new'} onChange={() => setBindTarget('new')} className="accent-[#00FFB3]" />
              <span className="text-white text-sm">✅ 直接接受（不绑定）</span>
            </label>
            {virtualFriends.map((vf: any) => (
              <label key={vf.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${bindTarget === vf.id ? 'border-[#FF9F43] bg-[#FF9F43]/5' : 'border-white/10 bg-white/3'}`}>
                <input type="radio" name="bindTarget" value={vf.id} checked={bindTarget === vf.id} onChange={() => setBindTarget(vf.id)} className="accent-[#FF9F43]" />
                <img src={vf.friend.avatar_url} alt={vf.friend.username} className="w-7 h-7 rounded-lg" />
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{vf.friend.username}</p>
                  {vf.remark && <p className="text-white/40 text-xs truncate">{vf.remark}</p>}
                </div>
                <span className="ml-auto text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded shrink-0">绑定</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-white/5 text-white/60 font-semibold"
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
  const [code, setCode] = useState('');

  if (!isOpen) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4" 
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">绑定真实账号</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <FaTimes className="text-white/60" />
          </button>
        </div>
        
        <p className="text-white/40 text-sm mb-6">
          【<span className="text-[#00FFB3]">{friend.real_username || friend.username}</span>】目前是临时好友。当他/她注册后，输入他/她的邀请码，即可将过去的回忆和账单无缝同步过去！
        </p>
        
        <input
          type="text"
          placeholder="请输入对方的 6 位邀请码"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none focus:border-orbit-mint/50 mb-6 font-mono tracking-widest text-center text-lg"
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
      className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">我的邀请码</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <FaTimes className="text-white/60" />
          </button>
        </div>
        
        <div className="text-center mb-6">
          <p className="text-white/60 text-sm mb-4">
            分享给你的临时好友，让他们在列表里点击你，并输入此邀请码进行绑定。
          </p>
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#00FFB3]/10 to-[#00D9FF]/10 border border-[#00FFB3]/20">
            <p className="text-white/40 text-xs mb-2">你的邀请码</p>
            <p className="text-3xl font-bold text-white tracking-wider">{inviteCode}</p>
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
const RandomMemoryModal = ({ memory, onClose, friends, currentUser }: { memory: any; onClose: () => void; friends: any[]; currentUser?: any }) => {
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
  const photos = memory?.photos || [];
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
  if (!memory) return null;
  const date = new Date(memory.memory_date || memory.created_at);
  const { text, weather, mood, route } = decodeMemoryContent(memory.content || '');
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 250 }}
        className="w-full max-w-lg bg-[#1a1a1a] rounded-3xl border border-white/10 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start p-5 pb-3">
          <div>
            <p className="text-[#00FFB3] text-xs font-semibold tracking-wide mb-1">🎲 随机回忆</p>
            <h2 className="text-white font-bold text-lg">
              {date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            {memory.location && <p className="text-white/40 text-sm mt-0.5">📍 {memory.location.name}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 mt-1"><FaTimes className="text-white" /></button>
        </div>
        <div className="px-5 pb-5">
          {photos.length > 0 && (
            <div className="w-full mb-4 overflow-hidden rounded-2xl bg-black/40 border border-white/5">
              <img src={photos[0]} className="w-full object-cover max-h-72" />
            </div>
          )}
          {(text || weather || mood || route) && (
            <div className="space-y-3 mb-4">
              {text && <p className="text-white/85 leading-relaxed whitespace-pre-wrap">{text}</p>}
              {(weather || mood || route) && (
                <div className="flex flex-wrap gap-2 text-sm">
                  {weather && <span className="px-2 py-1 rounded-full bg-white/10 text-white/70">天气：{weather}</span>}
                  {mood && <span className="px-2 py-1 rounded-full bg-white/10 text-white/70">心情：{mood}</span>}
                  {route && <span className="px-2 py-1 rounded-full bg-white/10 text-white/70">路线：{route}</span>}
                </div>
              )}
            </div>
          )}
          {memory.tagged_friends?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {getVisibleTags().map((id: string) => {
                const name = getTagName(id);
                if (!name) return null;
                return <span key={id} className="text-[#00FFB3] text-sm font-medium">@{name}</span>;
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// 5. 共同记忆弹窗 (保持不变)
const SharedMemoriesModal = ({ friend, memories, onClose }: { friend: any; memories: any[]; onClose: () => void; }) => {
  const hasRemark = friend?.username !== friend?.real_username;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="min-h-screen bg-[#1a1a1a] rounded-t-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#1a1a1a] p-4 border-b border-white/5 flex items-center justify-between">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">
              与 {friend?.username} 的共同记忆
            </h2>
            {/* 详情页才展示真实账号名 */}
            {hasRemark && (
              <p className="text-white/30 text-xs mt-0.5">账号名：{friend?.real_username}</p>
            )}
          </div>
          <div className="w-10" />
        </div>
        <div className="p-4 pb-20">
          {memories.length > 0 ? (
            <div className="space-y-4">
              {memories.map((memory) => (
                <div key={memory.id} className="p-4 rounded-2xl bg-white/5">
                  <p className="text-white/80 mb-2">{stripOrbitMetaText(memory.content) || '（无文字记录）'}</p>
                  <p className="text-white/40 text-sm">{memory.memory_date}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20"><p className="text-white/40">还没有共同记忆</p></div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export const NewbieGuideModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: '欢迎来到 Orbit ✨',
      text: '我是你的小向导汪～我们会把见面和旅行变成超可爱的回忆卡片！',
    },
    {
      title: '🗺️ 地图页',
      text: '点地图看足迹，按好友筛选，一秒找到“我们一起去过哪”。',
    },
    {
      title: '🖼️ 记忆流',
      text: '发照片 + 文字 + 地点 + @好友，每条日常都可以闪闪发光～',
    },
    {
      title: '💳 账单页',
      text: '聚餐分账超轻松，谁该付多少一眼看懂，不再尴尬对账。',
    },
    {
      title: '👥 我的页',
      text: '添加好友、改备注、看共同记忆都在这。需要帮助也可以点“账号诊断”。',
    },
  ];

  if (!isOpen) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 10 }} className="w-full max-w-md bg-[#1a1a1a] rounded-3xl border border-white/10 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[#00FFB3] text-sm font-semibold">新手指引 {step + 1}/{steps.length}</p>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
        </div>
        <h3 className="text-white text-xl font-bold mb-3">{current.title}</h3>
        <p className="text-white/75 leading-relaxed min-h-[72px]">{current.text}</p>
        <div className="flex gap-2 mt-6">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="px-4 py-2 rounded-xl bg-white/10 text-white/70">上一步</button>
          )}
          <button
            onClick={() => {
              if (isLast) {
                setStep(0);
                onClose();
                return;
              }
              setStep((s) => s + 1);
            }}
            className="ml-auto px-5 py-2 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold"
          >
            {isLast ? '开始探索吧！' : '下一步'}
          </button>
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
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  friendsCount: number;
  memoriesCount: number;
  ledgersCount: number;
}) => {
  const [checking, setChecking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState('');
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
    } catch (e) {
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

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-xl" onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="min-h-screen bg-[#1a1a1a] rounded-t-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#1a1a1a] p-4 border-b border-white/5 flex items-center justify-between">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
          <h2 className="text-white font-bold">账号诊断</h2>
          <button onClick={runDiagnostics} disabled={checking} className="text-[#00FFB3] text-sm disabled:opacity-50">{checking ? '检测中…' : '重新检测'}</button>
        </div>

        <div className="p-4 pb-24 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-white/80 text-sm">{checking ? '正在做健康检查，请稍等～' : summary}</p>
            <div className="mt-3">
              <button
                onClick={handleCopyReport}
                disabled={checking || !reportText || copying}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-white/75 text-xs disabled:opacity-50 hover:bg-white/15"
              >
                <FaCopy className="text-[11px]" />
                {copying ? '复制中…' : copied ? '已复制诊断报告' : '一键导出诊断报告（复制文本）'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.name} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-white font-medium">{item.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.ok ? 'bg-[#00FFB3]/20 text-[#00FFB3]' : 'bg-red-500/20 text-red-300'}`}>
                    {item.ok ? '正常' : '异常'}
                  </span>
                </div>
                <p className="text-white/55 text-sm break-all">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[#00FFB3]/20 bg-[#00FFB3]/5 p-4 text-sm text-white/80">
            小贴士：当用户反馈“账号有问题”时，让 TA 打开这个页面并截图给你，通常能快速定位是登录、会话还是资料权限问题。
          </div>
        </div>
      </motion.div>
    </motion.div>
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
  const [showNewbieGuide, setShowNewbieGuide] = useState(false);
  const [showAccountDiagnostics, setShowAccountDiagnostics] = useState(false);
  const [randomMemory, setRandomMemory] = useState<any>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkInput, setRemarkInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(readSettings());
  const [refreshingHome, setRefreshingHome] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  // 找回密码状态
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  // 文档弹窗状态
  const [docModal, setDocModal] = useState({ isOpen: false, title: '', content: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAutoRefreshRef = useRef(0);
  const appVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const appBuildTime = import.meta.env.VITE_APP_BUILD_TIME || '';
  const appBuildLabel = appBuildTime
    ? new Date(appBuildTime).toLocaleString('zh-CN', { hour12: false })
    : '未知';

  useEffect(() => {
    writeSettings(settings);
    if (typeof window !== 'undefined') {
      const fontSize = settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '18px' : '16px';
      document.documentElement.style.fontSize = fontSize;

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

  useEffect(() => {
    const tryAutoRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      const now = Date.now();
      if (now - lastAutoRefreshRef.current < 30000) return;
      lastAutoRefreshRef.current = now;
      void refreshProfileData();
    };

    const interval = window.setInterval(tryAutoRefresh, 60000);
    window.addEventListener('online', tryAutoRefresh);
    document.addEventListener('visibilitychange', tryAutoRefresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', tryAutoRefresh);
      document.removeEventListener('visibilitychange', tryAutoRefresh);
    };
  }, [refreshProfileData]);

  const handleSubmitEmail = async (nextEmail: string) => {
    setActionLoading(true);
    try {
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

  const handleSubmitPassword = async (p1: string, p2: string) => {
    if (p1 !== p2) {
      alert('两次输入的密码不一致！');
      return;
    }
    if (p1.length < 6) {
      alert('密码至少需要 6 位！');
      return;
    }
    setActionLoading(true);
    try {
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

  // 占位的文档内容（你可以自己改成详细的真实内容）
  const TERMS_TEXT = "【Orbit 服务条款】\n\n欢迎使用 Orbit！我们致力于为你提供最纯粹的记忆记录服务。\n\n1. 账号安全：请妥善保管你的登录邮箱和密码。\n2. 内容规范：请勿上传违法、色情或侵犯他人隐私的内容。\n3. 数据所有权：你的记忆属于你，我们绝不会将其用于商业广告分析。\n\n（此处为简略版，最终解释权归 Orbit 团队所有）";
  
  const PRIVACY_TEXT = "【Orbit 隐私政策】\n\n你的隐私对我们至关重要：\n\n1. 我们收集什么：仅收集维持基础运转所需的邮箱、公开昵称及你主动上传的照片和文字。\n2. 不追踪：我们不接入任何第三方广告追踪 SDK。\n3. 数据删除：当你选择“注销账号”时，系统会在毫秒级瞬间抹除你的所有记录，干干净净，绝不拖泥带水。\n\n请放心记录你的每一天。";

  const COMMUNITY_TEXT = "【Orbit 社区公约】\n\nOrbit 是一个温暖、私密的熟人社交空间。\n\n1. 友善互动：在共同记忆下留下温暖的吐槽。\n2. 尊重边界：请不要恶意绑定他人的真实账号。\n3. 记录当下：少一些刻意的摆拍，多一些真实的生活碎片。\n\n让我们一起守护这片净土。";

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
    if (friend.id.startsWith('temp-')) {
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

    if (!window.confirm('⚠️ 注销后账号、回忆、账单、评论等数据将被永久删除，且无法恢复。确定继续吗？')) {
      return;
    }

    setDeletingAccount(true);
    try {
      await deleteMyAccount(confirmEmail);
      setCurrentUser(null);
      useMemoryStore.setState({ memories: [] });
      useLedgerStore.setState({ ledgers: [] });
      useUserStore.setState({ friends: [], pendingRequests: [] });
      alert('账号已注销完成');
    } catch (error: any) {
      alert(error?.message || '注销失败，请稍后重试');
    } finally {
      setDeletingAccount(false);
    }
  };
  const handleAvatarClick = () => { if (!uploadingAvatar) fileInputRef.current?.click(); };
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || uploadingAvatar) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(currentUser.id, file);
      // 同步到本地 state，避免刷新前不更新
      setCurrentUser({ ...currentUser, avatar_url: url });
    } catch (err: any) {
      console.error('头像上传失败', err);
      alert(err?.message || '上传失败，请重试');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRandomMemory = () => {
    if (memories.length === 0) return;
    const idx = Math.floor(Math.random() * memories.length);
    setRandomMemory(memories[idx]);
  };

  const handleRandomAvatar = async (sex: 'male' | 'female') => {
    if (!currentUser) return;
    setShowAvatarPicker(false);
    setUploadingAvatar(true);
    try {
      const seed = Math.random().toString(36).slice(2, 10);
      // Pick one random hair style to distinguish male vs female
      const maleHairs = ['short01','short02','short03','short04','short05','short06','short07','short08','short09','short10','short11','short12','short13','short14','short15','short16','short17','short18','short19'];
      const femaleHairs = ['long01','long02','long03','long04','long05','long06','long07','long08','long09','long10','long11','long12','long13','long14','long15','long16','long17','long18','long19','long20','long21','long22','long23','long24','long25','long26'];
      const hairList = sex === 'male' ? maleHairs : femaleHairs;
      const hair = hairList[Math.floor(Math.random() * hairList.length)];
      const earringsProbability = sex === 'male' ? 0 : 40;
      const bg = sex === 'male' ? 'b6e3f4' : 'ffd5dc';
      const url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&hair=${hair}&earringsProbability=${earringsProbability}&backgroundColor=${bg}`;
      const { supabase } = await import('../api/supabase');
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
      setCurrentUser({ ...currentUser, avatar_url: url });
    } catch (e) {
      console.error('随机头像失败', e);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const filteredFriends = friends.filter((fs: any) => {
    if (!friendSearch.trim()) return true;
    const q = friendSearch.toLowerCase();
    const displayName = fs?.friend?.username?.toLowerCase?.() || '';
    const realName = fs?.friend?.real_username?.toLowerCase?.() || '';
    return displayName.includes(q) || realName.includes(q);
  });
  const shouldCollapseOnHome = friends.length > 5 && !friendSearch.trim();
  const homeFriends = shouldCollapseOnHome ? filteredFriends.slice(0, 5) : filteredFriends;

  const renderFriendRow = (friendship: any, index: number, total: number) => {
    const friend = friendship.friend;
    const isTemp = friend.id.startsWith('temp-');
    const hasRemark = !!friendship.remark;

    return (
      <motion.div
        key={friendship.id}
        className={`w-full flex items-center gap-3 p-4 ${index !== total - 1 ? 'border-b border-white/5' : ''} hover:bg-white/5`}
      >
        {/* 左侧可点击区域 */}
        <div className="flex items-center gap-3 flex-1 cursor-pointer min-w-0" onClick={() => { if (editingRemarkId !== friendship.id) handleFriendClick(friend); }}>
          <img src={friend.avatar_url} alt={friend.username} className="w-12 h-12 rounded-xl ring-2 ring-white/10 shrink-0" />
          <div className="text-left min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {/* 主显示名：备注优先 */}
              <p className="text-white font-medium truncate">{friend.username}</p>
              {isTemp && <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white/40 shrink-0">临时</span>}
            </div>
            {/* 备注区：可内联编辑 */}
            {editingRemarkId === friendship.id ? (
              <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
                <input
                  autoFocus
                  value={remarkInput}
                  onChange={e => setRemarkInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveRemark(friendship.id); if (e.key === 'Escape') setEditingRemarkId(null); }}
                  placeholder="输入备注..."
                  className="flex-1 bg-white/10 text-white text-xs px-2 py-1 rounded-lg outline-none border border-[#00FFB3]/40 placeholder-white/30 min-w-0"
                />
                <button onClick={() => handleSaveRemark(friendship.id)} className="shrink-0 p-1 bg-[#00FFB3] text-black rounded-md"><FaCheck className="text-[10px]" /></button>
                <button onClick={() => setEditingRemarkId(null)} className="shrink-0 p-1 bg-white/10 text-white/60 rounded-md"><FaTimes className="text-[10px]" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group/remark" onClick={e => { e.stopPropagation(); setRemarkInput(friendship.remark || ''); setEditingRemarkId(friendship.id); }}>
                <p className="text-white/40 text-sm truncate">
                  {/* 有备注时显示真实名，无备注时显示默认提示 */}
                  {hasRemark ? friend.real_username : (isTemp ? '点击绑定真实账号' : '查看共同记忆')}
                </p>
                <FaEdit className="text-[10px] text-white/20 opacity-0 group-hover/remark:opacity-100 shrink-0 transition-opacity" />
              </div>
            )}
          </div>
        </div>
        {/* 右侧操作按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleDeleteFriend(friendship.id, friend.username)}
            className="p-2 rounded-full text-red-400/30 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="删除好友"
          >
            <FaTrash className="text-xs" />
          </button>
          <FaChevronRight
            className="w-4 h-4 text-white/20 cursor-pointer"
            onClick={() => handleFriendClick(friend)}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="relative min-h-screen bg-orbit-black pb-28">
      <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 50% 0%, rgba(168, 85, 247, 0.2) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0, 255, 179, 0.15) 0%, transparent 40%)` }} />
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      
      {/* 顶部个人卡片 */}
      <div className="relative z-10 safe-top mx-4 mt-4">
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card rounded-3xl p-6 relative overflow-hidden">
          <div className="mb-5 flex items-center justify-between">
            <button
              onClick={handleRefreshHome}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/60 text-xs hover:text-white"
            >
              <FaSyncAlt className={refreshingHome ? 'animate-spin' : ''} />
              刷新
            </button>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/40 text-xs shrink-0">我的页面</span>
          </div>
          <div className="flex items-center gap-4 mb-6 relative">
            <div className="relative">
              <motion.div className="relative cursor-pointer" onClick={handleAvatarClick}>
                <img src={currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest'} alt={currentUser?.username} className="w-20 h-20 rounded-2xl ring-4 ring-orbit-mint/30 shadow-xl object-cover" />
                {uploadingAvatar && <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center"><FaSpinner className="text-white animate-spin" /></div>}
              </motion.div>
              {/* 随机头像按钮 */}
              <button
                onClick={() => setShowAvatarPicker(p => !p)}
                className="absolute -bottom-2 -right-2 w-7 h-7 rounded-xl bg-[#00FFB3] flex items-center justify-center shadow-lg border-2 border-[#121212]"
                title="随机头像"
              >
                <FaDice className="text-black text-xs" />
              </button>
              {/* 性别选择弹窗 — fixed overlay，避免被 overflow-hidden 裁切 */}
              <AnimatePresence>
                {showAvatarPicker && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={() => setShowAvatarPicker(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 16 }}
                      className="bg-[#2a2a2a] border border-white/15 rounded-3xl p-5 shadow-2xl flex flex-col items-center gap-4"
                      onClick={e => e.stopPropagation()}
                    >
                      <p className="text-white/60 text-sm">选择头像风格</p>
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
                      <button onClick={() => setShowAvatarPicker(false)} className="text-white/30 text-xs mt-1">取消</button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex-1">
                {/* ✨ 可编辑的名字区域 */}
                {isEditingName ? (
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="bg-white/10 text-white font-bold text-xl px-2 py-1 rounded-lg outline-none w-32 border border-[#00FFB3]/50"
                    />
                    <button onClick={handleSaveName} className="p-1.5 bg-[#00FFB3] text-black rounded-lg">
                      <FaCheck className="text-sm" />
                    </button>
                  </div>
                ) : (
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2 group">
                    {currentUser?.username || '访客'}
                    <button 
                      onClick={() => { setNewName(currentUser?.username || ''); setIsEditingName(true); }}
                      className="text-white/20 hover:text-[#00FFB3] transition-colors"
                    >
                      <FaEdit className="text-sm" />
                    </button>
                  </h1>
                )}
                <p className="text-white/40 text-sm">{currentUser?.email || '点击头像更换图片'}</p>
              </div>
            
            {/* ✨ 邀请好友按钮 (点此查看自己的邀请码) */}
            <motion.button whileHover={{ scale: 1.05 }} onClick={() => setShowInviteCode(true)} className="p-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black">
              <FaShareAlt className="w-5 h-5" />
            </motion.button>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            {[ { icon: FaCamera, value: memories.length, label: '条记忆', color: 'orbit-mint' }, { icon: FaUsers, value: friends.length, label: '位好友', color: 'orbit-orange' }, { icon: FaHeart, value: ledgers.length, label: '笔账单', color: 'purple-400' } ].map((stat, index) => (
              <motion.div key={stat.label} className="text-center p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className={`w-10 h-10 mx-auto mb-2 rounded-xl bg-${stat.color}/20 flex items-center justify-center`}><stat.icon className={`w-5 h-5 text-${stat.color}`} /></div>
                <p className={`text-${stat.color} text-xl font-bold`}>{stat.value}</p>
                <p className="text-white/40 text-xs mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
      
      {/* 好友申请通知 */}
      {settings.notifyFriendRequest && pendingRequests.length > 0 && (
        <div className="relative z-10 px-4 mt-6">
          <h2 className="text-white/60 text-sm font-medium mb-2 px-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF6B6B] animate-pulse" />
            好友申请
            <span className="px-1.5 py-0.5 rounded-full bg-[#FF6B6B] text-white text-[10px] font-bold">{pendingRequests.length}</span>
          </h2>
          <div className="glass-card rounded-2xl overflow-hidden divide-y divide-white/5">
            {pendingRequests.map((req: any) => {
              const reqUser = req.requester;
              return (
                <div key={req.id} className="flex items-center gap-3 p-4">
                  <img
                    src={reqUser?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${reqUser?.id}`}
                    alt={reqUser?.username}
                    className="w-11 h-11 rounded-xl ring-2 ring-white/10 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{reqUser?.username || '未知用户'}</p>
                    <p className="text-white/40 text-xs">想加你为好友</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleRejectRequest(req)}
                      className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                      title="拒绝"
                    >
                      <FaTimes className="text-sm" />
                    </button>
                    <button
                      disabled={processingRequests[req.id]}
                      onClick={() => handleAcceptRequest(req)}
                      className={`w-9 h-9 rounded-xl bg-[#00FFB3]/20 flex items-center justify-center text-[#00FFB3] hover:bg-[#00FFB3]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                      title="接受"
                    >
                      {processingRequests[req.id] ? <FaSpinner className="text-sm animate-spin" /> : <FaCheck className="text-sm" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 朋友列表 */}
      <div className="relative z-10 px-4 mt-6">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-white/60 text-sm font-medium flex items-center gap-2">
            <FaUsers className="w-3 h-3" />我的密友
            <span className="text-white/30">({friends.length})</span>
          </h2>
        </div>
        {friends.length >= 4 && (
          <div className="relative mb-2">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none" />
            <input
              type="text"
              placeholder="搜索好友..."
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              className="w-full pl-8 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 outline-none focus:border-white/20"
            />
          </div>
        )}
        <div className="glass-card rounded-2xl overflow-hidden">
          {friends.length > 0 ? (
            homeFriends.length > 0 ? (
              homeFriends.map((friendship, index) => renderFriendRow(friendship, index, homeFriends.length))
            ) : (
              <div className="p-8 text-center text-white/40">没有匹配的好友</div>
            )
          ) : (
             <div className="p-8 text-center text-white/40">还没有好友</div>
          )}

          {shouldCollapseOnHome && (
            <button
              onClick={() => setShowAllFriends(true)}
              className="w-full px-4 py-3 border-t border-white/5 bg-white/[0.02] hover:bg-white/5 text-white/75 flex items-center justify-between"
            >
              <span className="text-sm">已展示 5 位，点击查看全部 {friends.length} 位好友</span>
              <FaChevronRight className="text-xs" />
            </button>
          )}
          
          <button onClick={() => setShowAddFriend(true)} className="w-full p-4 flex items-center justify-center gap-2 text-orbit-mint border-t border-white/5 hover:bg-white/5">
            <FaUserPlus className="text-lg" /> <span className="text-sm font-medium">添加好友</span>
          </button>
        </div>
      </div>
      
      {/* 足迹统计 */}
      <div className="relative z-10 px-4 mt-6">
        <h2 className="text-white/60 text-sm font-medium mb-3 px-1 flex items-center gap-2">
          <FaFire className="text-[#FF9F43]" /> 我的足迹
        </h2>
        <div className="glass-card rounded-2xl p-4 space-y-4">
          {/* 今年记忆数 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00FFB3]/10 flex items-center justify-center">
                <FaCamera className="text-[#00FFB3] text-sm" />
              </div>
              <div>
                <p className="text-white/80 text-sm">{new Date().getFullYear()} 年的记忆</p>
                <p className="text-white/40 text-xs">共 {memories.length} 条</p>
              </div>
            </div>
            <span className="text-[#00FFB3] font-bold text-lg">
              {memories.filter(m => new Date(m.memory_date || m.created_at).getFullYear() === new Date().getFullYear()).length} 条
            </span>
          </div>

          {/* 最常出没的地方 */}
          {(() => {
            const loc: Record<string, number> = {};
            memories.forEach(m => { if (m.location?.name) loc[m.location.name] = (loc[m.location.name] || 0) + 1; });
            const top = Object.entries(loc).sort((a, b) => b[1] - a[1])[0];
            if (!top) return null;
            return (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FF9F43]/10 flex items-center justify-center">
                    <FaMapMarkerAlt className="text-[#FF9F43] text-sm" />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm">最常出没</p>
                    <p className="text-white/40 text-xs truncate max-w-[140px]">{top[0]}</p>
                  </div>
                </div>
                <span className="text-[#FF9F43] font-bold">{top[1]} 次</span>
              </div>
            );
          })()}

          {/* 最常陈伴的人 */}
          {(() => {
            const cnt: Record<string, number> = {};
            memories.forEach(m => m.tagged_friends?.forEach((id: string) => { cnt[id] = (cnt[id] || 0) + 1; }));
            const topId = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
            const topName = topId ? (friends.find((f: any) => f.friend?.id === topId)?.friend?.username || null) : null;
            if (!topName) return null;
            return (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-400/10 flex items-center justify-center">
                    <FaHeart className="text-purple-400 text-sm" />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm">最常陈伴</p>
                    <p className="text-white/40 text-xs">@{topName}</p>
                  </div>
                </div>
                <span className="text-purple-400 font-bold">{cnt[topId!]} 次</span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 随机回忆 */}
      <div className="relative z-10 px-4 mt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleRandomMemory}
          disabled={memories.length === 0}
          className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 border border-white/5 disabled:opacity-30"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF9F43] to-[#FF6B6B] flex items-center justify-center shrink-0">
            <FaDice className="text-white text-xl" />
          </div>
          <div className="text-left">
            <p className="text-white font-semibold">🎲 随机回忆</p>
            <p className="text-white/40 text-sm">打开一段随机的过去</p>
          </div>
          <FaChevronRight className="text-white/20 ml-auto" />
        </motion.button>
      </div>

      {/* 设置入口 */}
      <div className="relative z-10 px-4 mt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowSettings(true)}
          className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 border border-white/5"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7cf5ff] to-[#9b8cff] flex items-center justify-center shrink-0">
            <span className="text-white text-xl">⚙️</span>
          </div>
          <div className="text-left">
            <p className="text-white font-semibold">设置中心</p>
            <p className="text-white/40 text-sm">账户、安全、通知、隐私与关于</p>
          </div>
          <FaChevronRight className="text-white/20 ml-auto" />
        </motion.button>
      </div>

      {/* 帮助与排障 */}
      <div className="relative z-10 px-4 mt-4">
        <div className="glass-card rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowNewbieGuide(true)}
            className="w-full p-4 text-left hover:bg-white/5 border-b border-white/5"
          >
            <p className="text-white font-medium">🌟 新手指引</p>
            <p className="text-white/45 text-sm mt-1">用可爱模式 1 分钟了解所有功能</p>
          </button>
          <button
            onClick={() => setShowAccountDiagnostics(true)}
            className="w-full p-4 text-left hover:bg-white/5"
          >
            <p className="text-white font-medium">🛠️ 账号诊断</p>
            <p className="text-white/45 text-sm mt-1">当用户说“账号有问题”时，这里能快速定位</p>
          </button>
        </div>
      </div>

      
      {/* 退出按钮 */}
      <div className="relative z-10 px-4 mt-6 pb-20 space-y-3">
        <button onClick={handleLogout} disabled={loggingOut} className="w-full p-4 glass-card rounded-2xl flex items-center justify-center gap-2 text-red-400 disabled:opacity-50">
          {loggingOut ? <FaSpinner className="w-5 h-5 animate-spin" /> : <FaSignOutAlt className="w-5 h-5" />}
          {loggingOut ? '退出中...' : '退出登录'}
        </button>

        <button
          onClick={handleDeleteAccount}
          disabled={deletingAccount || loggingOut}
          className="w-full p-4 rounded-2xl border border-red-400/30 bg-red-500/10 flex items-center justify-center gap-2 text-red-300 disabled:opacity-50"
        >
          {deletingAccount ? <FaSpinner className="w-5 h-5 animate-spin" /> : <FaTrash className="w-5 h-5" />}
          {deletingAccount ? '注销中...' : '注销邮箱账号'}
        </button>
      </div>

      <div className="fixed left-4 z-20 pointer-events-none" style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
          <img src="/icons/orbit-logo.svg" alt="Orbit Logo" className="w-8 h-8 rounded-lg object-contain" />
          <img src="/icons/orbit-wordmark.svg" alt="Orbit Wordmark" className="h-5 w-auto object-contain opacity-95" />
        </div>
      </div>

      {/* 设置中心弹窗 */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="min-h-screen max-h-screen overflow-y-auto bg-[#1a1a1a] rounded-t-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-[#1a1a1a] p-4 border-b border-white/5 flex items-center justify-between">
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-white">设置中心</h2>
                  <p className="text-white/40 text-xs mt-0.5">账户与应用偏好</p>
                </div>
                <div className="w-10" />
              </div>

              <div className="p-4 space-y-4">
                {/* 1. 账户与安全 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-white/60 text-xs">账户与安全</div>
                  <button onClick={() => setShowEmailModal(true)} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5">
                    <p className="text-white font-medium">📧 更换邮箱</p>
                    <p className="text-white/45 text-sm mt-1">绑定新邮箱并验证</p>
                  </button>
                  <button onClick={() => setShowPasswordModal(true)} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5">
                    <p className="text-white font-medium">🔑 更换密码</p>
                    <p className="text-white/45 text-sm mt-1">建议定期更新密码</p>
                  </button>
                </div>

                {/* 2. 通用设置 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-white/60 text-xs">通用设置</div>
                  <div className="p-4 border-t border-white/5">
                    <p className="text-white font-medium mb-2">字体大小</p>
                    <div className="flex gap-2">
                      {(['small', 'normal', 'large'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => updateSettings({ fontSize: size })}
                          className={`px-3 py-1.5 rounded-full text-xs border ${settings.fontSize === size ? 'bg-[#00FFB3] text-black border-transparent' : 'bg-white/5 text-white/60 border-white/15'}`}
                        >
                          {size === 'small' ? '小' : size === 'large' ? '大' : '中'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 border-t border-white/5">
                    <p className="text-white font-medium mb-2">外观主题</p>
                    <div className="flex gap-2">
                      {(['system', 'light', 'dark'] as const).map((mode) => {
                        const currentMode = settings.themeMode || 'system';
                        const labels = { system: '跟随系统', light: '浅色', dark: '深色' };
                        const isActive = currentMode === mode;
                        return (
                          <button
                            key={mode}
                            onClick={() => updateSettings({ themeMode: mode })}
                            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                              isActive
                                ? 'bg-[#00FFB3] text-black border-transparent font-semibold'
                                : 'bg-white/5 text-white/60 border-white/15 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {labels[mode]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4 border-t border-white/5">
                    <div>
                      <p className="text-white font-medium">仅 Wi‑Fi 上传</p>
                      <p className="text-white/45 text-sm">节省流量</p>
                    </div>
                    <button onClick={() => updateSettings({ wifiOnlyUpload: !settings.wifiOnlyUpload })} className={`w-12 h-6 rounded-full transition-colors ${settings.wifiOnlyUpload ? 'bg-[#00FFB3]' : 'bg-white/10'}`}>
                      <motion.div animate={{ x: settings.wifiOnlyUpload ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4 border-t border-white/5">
                    <div>
                      <p className="text-white font-medium">仅 Wi‑Fi 刷新</p>
                      <p className="text-white/45 text-sm">弱网时避免刷新</p>
                    </div>
                    <button onClick={() => updateSettings({ wifiOnlyRefresh: !settings.wifiOnlyRefresh })} className={`w-12 h-6 rounded-full transition-colors ${settings.wifiOnlyRefresh ? 'bg-[#00FFB3]' : 'bg-white/10'}`}>
                      <motion.div animate={{ x: settings.wifiOnlyRefresh ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </div>

                {/* 3. 通知设置 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-white/60 text-xs">通知设置</div>
                  <div className="flex items-center justify-between px-4 py-4 border-t border-white/5">
                    <p className="text-white font-medium">@ 通知</p>
                    <button onClick={() => updateSettings({ notifyAt: !settings.notifyAt })} className={`w-12 h-6 rounded-full transition-colors ${settings.notifyAt ? 'bg-[#00FFB3]' : 'bg-white/10'}`}>
                      <motion.div animate={{ x: settings.notifyAt ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4 border-t border-white/5">
                    <p className="text-white font-medium">评论通知</p>
                    <button onClick={() => updateSettings({ notifyComment: !settings.notifyComment })} className={`w-12 h-6 rounded-full transition-colors ${settings.notifyComment ? 'bg-[#00FFB3]' : 'bg-white/10'}`}>
                      <motion.div animate={{ x: settings.notifyComment ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4 border-t border-white/5">
                    <p className="text-white font-medium">好友申请通知</p>
                    <button onClick={() => updateSettings({ notifyFriendRequest: !settings.notifyFriendRequest })} className={`w-12 h-6 rounded-full transition-colors ${settings.notifyFriendRequest ? 'bg-[#00FFB3]' : 'bg-white/10'}`}>
                      <motion.div animate={{ x: settings.notifyFriendRequest ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </div>

                {/* 4. 隐私设置 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-white/60 text-xs">隐私设置</div>
                  <div className="flex items-center justify-between px-4 py-4 border-t border-white/5">
                    <div>
                      <p className="text-white font-medium">允许他人分享你的回忆</p>
                      <p className="text-white/45 text-sm">关闭后仅自己可分享</p>
                    </div>
                    <button onClick={() => updateSettings({ allowShare: !settings.allowShare })} className={`w-12 h-6 rounded-full transition-colors ${settings.allowShare ? 'bg-[#00FFB3]' : 'bg-white/10'}`}>
                      <motion.div animate={{ x: settings.allowShare ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </div>

                {/* 5. 帮助与客服 */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-white/60 text-xs">帮助与客服</div>
                  <button onClick={() => setShowResetModal(true)} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">🔐 找回密码</p>
                    <p className="text-white/45 text-sm mt-1">重置你的账号密码</p>
                  </button>
                  <a href="mailto:3482407231@qq.com?subject=意见反馈" className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">💬 意见反馈</p>
                    <p className="text-white/45 text-sm mt-1">告诉我们你的想法</p>
                  </a>
                  <a href="mailto:3482407231@qq.com?subject=联系客服" className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">📞 联系客服</p>
                    <p className="text-white/45 text-sm mt-1">工作日 10:00-18:00</p>
                  </a>
                  <button onClick={() => alert('猜你想问：功能即将上线')} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5">
                    <p className="text-white font-medium">❓ 猜你想问</p>
                    <p className="text-white/45 text-sm mt-1">常见问题与使用技巧</p>
                  </button>
                </div>

                {/* 6. 关于 Orbit */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-2 text-white/60 text-xs">关于 Orbit</div>
                  <button onClick={() => alert('谢谢你的鼓励！')} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">🌟 鼓励一下</p>
                    <p className="text-white/45 text-sm mt-1">你的支持是我们最大的动力</p>
                  </button>
                  <button onClick={() => openDocument('社区公约', COMMUNITY_TEXT)} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">📜 社区公约</p>
                    <p className="text-white/45 text-sm mt-1">文明友善的社区氛围</p>
                  </button>
                  <button onClick={() => openDocument('服务条款', TERMS_TEXT)} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">📄 服务条款</p>
                    <p className="text-white/45 text-sm mt-1">使用条款与服务说明</p>
                  </button>
                  <button onClick={() => openDocument('隐私政策', PRIVACY_TEXT)} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">🔏 隐私政策（简明版）</p>
                    <p className="text-white/45 text-sm mt-1">简要说明数据收集与使用</p>
                  </button>
                  <button onClick={() => setShowAccountDiagnostics(true)} className="w-full p-4 text-left hover:bg-white/5 border-t border-white/5 block">
                    <p className="text-white font-medium">🧪 网络诊断</p>
                    <p className="text-white/45 text-sm mt-1">检查网络与账号状态</p>
                  </button>
                  <div className="px-4 py-3 border-t border-white/5">
                    <p className="text-white/60 text-xs">当前版本</p>
                    <p className="text-white/85 text-sm mt-1">v{appVersion}</p>
                    <p className="text-white/35 text-[11px] mt-1">构建时间：{appBuildLabel}</p>
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl"
            onClick={() => setShowAllFriends(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="min-h-screen max-h-screen overflow-y-auto bg-[#1a1a1a] rounded-t-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-[#1a1a1a] p-4 border-b border-white/5 flex items-center justify-between">
                <button onClick={() => setShowAllFriends(false)} className="p-2 rounded-full hover:bg-white/10"><FaTimes className="text-white/60" /></button>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-white">全部好友</h2>
                  <p className="text-white/40 text-xs mt-0.5">共 {friends.length} 位</p>
                </div>
                <div className="w-10" />
              </div>

              {friends.length >= 4 && (
                <div className="p-4 pb-2">
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none" />
                    <input
                      type="text"
                      placeholder="搜索好友..."
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      className="w-full pl-8 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 outline-none focus:border-white/20"
                    />
                  </div>
                </div>
              )}

              <div className="p-4 pt-2 pb-24">
                <div className="glass-card rounded-2xl overflow-hidden">
                  {filteredFriends.length > 0 ? (
                    filteredFriends.map((friendship, index) => renderFriendRow(friendship, index, filteredFriends.length))
                  ) : (
                    <div className="p-8 text-center text-white/40">没有匹配的好友</div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {selectedFriend && <SharedMemoriesModal friend={selectedFriend} memories={memories.filter(m =>
          // 我发布的、@了对方的记忆
          m.tagged_friends?.includes(selectedFriend.id) ||
          // 对方发布的、@了我的记忆（通过 RLS 已拉取到本地）
          m.user_id === selectedFriend.id
        )} onClose={() => setSelectedFriend(null)} />}
        {bindingFriend && <BindFriendModal friend={bindingFriend} isOpen={!!bindingFriend} onClose={() => setBindingFriend(null)} onBind={handleBindFriend} />}
        {acceptingRequest && (
          <AcceptFriendModal
            isOpen={!!acceptingRequest}
            onClose={() => setAcceptingRequest(null)}
            requester={acceptingRequest.requester}
            virtualFriends={friends.filter((f: any) => f.status === 'virtual')}
            onConfirm={handleConfirmAccept}
            loading={acceptingLoading}
          />
        )}
        {showAddFriend && <AddFriendModal isOpen={showAddFriend} onClose={() => setShowAddFriend(false)} onAddVirtual={handleAddFriend} onAddReal={handleAddRealFriend} virtualFriends={friends.filter((f: any) => f.friend?.id?.startsWith('temp-'))} onBindExisting={handleBindExisting} />}
        {showInviteCode && <InviteCodeModal isOpen={showInviteCode} onClose={() => setShowInviteCode(false)} inviteCode={inviteCode} username={currentUser?.username || '用户'} />}
        {randomMemory && (
          <RandomMemoryModal
            memory={randomMemory}
            onClose={() => setRandomMemory(null)}
            friends={friends}
            currentUser={currentUser}
          />
        )}
        {showNewbieGuide && <NewbieGuideModal isOpen={showNewbieGuide} onClose={() => setShowNewbieGuide(false)} />}
        {showAccountDiagnostics && (
          <AccountDiagnosticsModal
            isOpen={showAccountDiagnostics}
            onClose={() => setShowAccountDiagnostics(false)}
            currentUser={currentUser}
            friendsCount={friends.length}
            memoriesCount={memories.length}
            ledgersCount={ledgers.length}
          />
        )}
        <ChangeEmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          onSubmit={handleSubmitEmail}
          loading={actionLoading}
        />
        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onSubmit={handleSubmitPassword}
          loading={actionLoading}
        />
        <ResetPasswordModal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          onSubmit={handleResetPassword}
          loading={resetLoading}
        />
        <DocumentModal
          isOpen={docModal.isOpen}
          onClose={() => setDocModal({ ...docModal, isOpen: false })}
          title={docModal.title}
          content={docModal.content}
        />
      </AnimatePresence>
    </div>
  );
}