import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSignOutAlt, FaEdit, FaChevronRight, FaSpinner, FaHeart, FaUsers, FaCamera, FaTimes, FaCheck, FaPlus, FaUserPlus, FaShareAlt, FaCopy, FaTrash, FaDice, FaMapMarkerAlt, FaFire, FaSearch } from 'react-icons/fa';
import { useUserStore, useMemoryStore, useLedgerStore } from '../store';
import { signOut, uploadAvatar, saveInviteCode, lookupProfileByInviteCode, bindVirtualFriend, addRealFriendByCode, updateFriendRemark, acceptFriendRequest, rejectFriendRequest } from '../api/supabase';

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
          alert(err.message || '操作失败');
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
      className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-[#1a1a1a] rounded-3xl p-6 border border-white/10"
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
const RandomMemoryModal = ({ memory, onClose, friends }: { memory: any; onClose: () => void; friends: any[] }) => {
  const META_PREFIX = '[orbit_meta:';
  const decodeMemoryContent = (content: string): { text: string; weather: string; mood: string; route: string } => {
    if (!content?.startsWith(META_PREFIX)) return { text: content || '', weather: '', mood: '', route: '' };
    const end = content.indexOf(']\n');
    if (end === -1) return { text: content, weather: '', mood: '', route: '' };
    try {
      const meta = JSON.parse(content.slice(META_PREFIX.length, end));
      return { text: content.slice(end + 2), weather: meta.weather || '', mood: meta.mood || '', route: meta.route || '' };
    } catch {
      return { text: content, weather: '', mood: '', route: '' };
    }
  };
  const photos = memory?.photos || [];
  const getFriendName = (friendId: string): string | null => {
    if (friendId.startsWith('temp-')) {
      const fid = friendId.replace('temp-', '');
      const vf = friends.find((f: any) => f.id === fid);
      return vf?.friend_name || null;
    }
    const friend = friends.find((f: any) => f.friend?.id === friendId);
    return friend?.friend?.username || null;
  };
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
              {memory.tagged_friends.map((id: string) => {
                const name = getFriendName(id);
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
                  <p className="text-white/80 mb-2">{memory.content}</p>
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

// ================= 主页面 =================
export default function ProfilePage() {
  const { currentUser, friends, pendingRequests, setCurrentUser, addFriend, deleteFriend } = useUserStore();
  const { memories } = useMemoryStore();
  const { ledgers } = useLedgerStore();
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(currentUser?.username || '');
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [bindingFriend, setBindingFriend] = useState<any>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [randomMemory, setRandomMemory] = useState<any>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkInput, setRemarkInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // 这里调用 supabase 更新 profile，同时更新本地 store
    // await updateProfile(currentUser.id, { username: newName }); 
    setCurrentUser({ ...currentUser, username: newName } as any);
    setIsEditingName(false);
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

  const handleAcceptRequest = async (req: any) => {
    if (processingRequests[req.id]) return;
    setProcessingRequests((s) => ({ ...s, [req.id]: true }));
    try {
      let bindVirtualFriendshipId: string | undefined;
      const virtualFriends = friends.filter((f: any) => f.status === 'virtual');
      if (virtualFriends.length > 0) {
        const choice = window.prompt(
          `是否把这位好友绑定到已有马甲？输入序号绑定，留空直接接受：\n` +
          virtualFriends.map((f: any, idx: number) => `${idx + 1}. ${f.username || f.friend_name || f.remark || '马甲好友'}`).join('\n')
        );
        const idx = choice ? parseInt(choice, 10) - 1 : -1;
        if (!Number.isNaN(idx) && idx >= 0 && idx < virtualFriends.length) {
          bindVirtualFriendshipId = virtualFriends[idx].id?.replace('temp-', '') || virtualFriends[idx].id;
        }
      }

      await acceptFriendRequest(req.id, req.user_id, currentUser!.id, bindVirtualFriendshipId);
      // 本地先移除 pending，防重点击导致重复接受
      useUserStore.setState((state) => ({ pendingRequests: state.pendingRequests.filter((p: any) => p.id !== req.id) }));
      await useUserStore.getState().fetchFriends();
      await useUserStore.getState().fetchPendingRequests();
      await useMemoryStore.getState().fetchMemories();
    } catch (err: any) {
      alert('接受失败：' + err.message);
    } finally {
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

  return (
    <div className="relative min-h-screen bg-orbit-black pb-28">
      <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 50% 0%, rgba(168, 85, 247, 0.2) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0, 255, 179, 0.15) 0%, transparent 40%)` }} />
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      
      {/* 顶部个人卡片 */}
      <div className="relative z-10 safe-top mx-4 mt-4">
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card rounded-3xl p-6 relative overflow-hidden">
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
      {pendingRequests.length > 0 && (
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
            friends
              .filter((fs: any) => {
                if (!friendSearch.trim()) return true;
                const q = friendSearch.toLowerCase();
                // 同时搜索备注和真实名
                return fs.friend.username.toLowerCase().includes(q) || fs.friend.real_username?.toLowerCase().includes(q);
              })
              .map((friendship, index, arr) => {
              const friend = friendship.friend;
              const isTemp = friend.id.startsWith('temp-');
              const hasRemark = !!friendship.remark;
              
              return (
                <motion.div
                  key={friend.id}
                  className={`w-full flex items-center gap-3 p-4 ${index !== arr.length - 1 ? 'border-b border-white/5' : ''} hover:bg-white/5`}
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
            })
          ) : (
             <div className="p-8 text-center text-white/40">还没有好友</div>
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
      
      {/* 退出按钮 */}
      <div className="relative z-10 px-4 mt-6 pb-20 space-y-3">
        <button onClick={handleLogout} disabled={loggingOut} className="w-full p-4 glass-card rounded-2xl flex items-center justify-center gap-2 text-red-400 disabled:opacity-50">
          {loggingOut ? <FaSpinner className="w-5 h-5 animate-spin" /> : <FaSignOutAlt className="w-5 h-5" />}
          {loggingOut ? '退出中...' : '退出登录'}
        </button>
      </div>
      
      {/* 弹窗挂载区 */}
      <AnimatePresence>
        {selectedFriend && <SharedMemoriesModal friend={selectedFriend} memories={memories.filter(m =>
          // 我发布的、@了对方的记忆
          m.tagged_friends?.includes(selectedFriend.id) ||
          // 对方发布的、@了我的记忆（通过 RLS 已拉取到本地）
          m.user_id === selectedFriend.id
        )} onClose={() => setSelectedFriend(null)} />}
        {bindingFriend && <BindFriendModal friend={bindingFriend} isOpen={!!bindingFriend} onClose={() => setBindingFriend(null)} onBind={handleBindFriend} />}
        {showAddFriend && <AddFriendModal isOpen={showAddFriend} onClose={() => setShowAddFriend(false)} onAddVirtual={handleAddFriend} onAddReal={handleAddRealFriend} virtualFriends={friends.filter((f: any) => f.friend?.id?.startsWith('temp-'))} onBindExisting={handleBindExisting} />}
        {showInviteCode && <InviteCodeModal isOpen={showInviteCode} onClose={() => setShowInviteCode(false)} inviteCode={inviteCode} username={currentUser?.username || '用户'} />}
        {randomMemory && <RandomMemoryModal memory={randomMemory} onClose={() => setRandomMemory(null)} friends={friends} />}
      </AnimatePresence>
    </div>
  );
}