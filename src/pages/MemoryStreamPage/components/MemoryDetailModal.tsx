import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { VoiceRecorder } from '../../../components/MediaUploader';
import { uploadAvatar, updateProfileAvatarUrl, supabase } from '../../../api/supabase';
import { useUserStore } from '../../../store';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { FaTimes, FaMapMarkerAlt, FaChevronRight, FaMicrophone, FaDollarSign, FaQuoteLeft, FaHeart } from 'react-icons/fa';
import { decodeMemoryContent, formatDateGroup, formatTime, MOOD_OPTIONS, WEATHER_OPTIONS } from '../utils';
import { getTaggedDisplayName, getVisibleTaggedFriendIds } from '../../../utils/tagVisibility';
import { getMemoryComments, addMemoryComment, deleteMemoryComment } from '../../../api/supabase';
import { useScrollLock } from '../../../hooks/useScrollLock';    // Add useScrollLock
import { App } from '@capacitor/app';                            // Add Capacitor App for backButton handling

interface MemoryDetailModalProps {
  memory: any;
  onClose: () => void;
  friends: any[];
  currentUser?: any;
}

const REPLY_PREFIX = '[reply=';
const AUDIO_PREFIX = '[audio]';
const AUDIO_SPLIT = '||';

const encodeReplyContent = (text: string, target?: { commentId: string; authorId: string; authorName: string }) => {
  if (!target) return text;
  const meta = btoa(JSON.stringify(target));
  return `${REPLY_PREFIX}${meta}]${text}`;
};

const decodeReplyContent = (content: string): { text: string; replyTo?: { commentId: string; authorId: string; authorName: string } } => {
  if (!content?.startsWith(REPLY_PREFIX)) return { text: content };
  const end = content.indexOf(']');
  if (end === -1) return { text: content };
  const metaRaw = content.slice(REPLY_PREFIX.length, end);
  const text = content.slice(end + 1);
  try {
    const parsed = JSON.parse(atob(metaRaw));
    return { text, replyTo: parsed };
  } catch {
    return { text: content };
  }
};

const encodeCommentContent = (
  text: string,
  replyTarget?: { commentId: string; authorId: string; authorName: string } | null,
  audioUrl?: string,
) => {
  const payload = encodeReplyContent(text, replyTarget || undefined);
  if (audioUrl) return `${AUDIO_PREFIX}${audioUrl}${AUDIO_SPLIT}${payload}`;
  return payload;
};

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
  const decoded = decodeReplyContent(rest);
  return { ...decoded, audioUrl };
};

const MemoryDetailModal = ({ memory, onClose, friends, currentUser }: MemoryDetailModalProps) => {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lightboxContainerRef = useRef<HTMLDivElement | null>(null);
  const [commentAudios, setCommentAudios] = useState<string[]>([]);
  const [replyTarget, setReplyTarget] = useState<{ commentId: string; authorId: string; authorName: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<{ url: string; name: string; isSelf: boolean; userId?: string } | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const setCurrentUser = useUserStore((s) => s.setCurrentUser);
  const userStoreUser = useUserStore((s) => s.currentUser);
  useScrollLock(true);

  const [likeInfo, setLikeInfo] = useState({ liked: false, count: 0, likers: [] as any[] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!memory?.id || !currentUser?.id) return;

      const { data, error } = await (supabase.from('memory_likes' as any) as any)
        .select('user_id')
        .eq('memory_id', memory.id);

      if (!error && data && !cancelled) {
        const likers = data.map((l: any) => {
          const author = getMemoryAuthor(l.user_id);
          return { ...author, id: l.user_id, avatar_url: author.avatar };
        });
        const userLiked = data.some((l: any) => l.user_id === currentUser.id);
        setLikeInfo({
          liked: userLiked,
          count: data.length,
          likers,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [memory?.id, currentUser?.id]);

  const handleToggleLike = async () => {
    if (!currentUser?.id) return;
    const isLiking = !likeInfo.liked;

    // 乐观更新
    setLikeInfo(prev => {
      const me = {
        ...getMemoryAuthor(currentUser.id),
        id: currentUser.id,
        avatar_url: currentUser.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${currentUser.id}`
      };
      return {
        ...prev,
        liked: isLiking,
        count: isLiking ? prev.count + 1 : Math.max(0, prev.count - 1),
        likers: isLiking ? [me, ...prev.likers] : prev.likers.filter(l => l.id !== currentUser.id)
      };
    });

    try {
      if (isLiking) {
        await (supabase.from('memory_likes' as any) as any).insert({ memory_id: memory.id, user_id: currentUser.id });
      } else {
        await (supabase.from('memory_likes' as any) as any).delete().match({ memory_id: memory.id, user_id: currentUser.id });
      }
    } catch {
      // rollback if needed
    }
  };

  // 1. 设置手势的基础动画值
  const y = useMotionValue(0);
  const x = useMotionValue(0);

  // ✅ 每次打开图片时，确保图片坐标回到正中心
  useEffect(() => {
    if (isLightboxOpen) {
      x.set(0);
      y.set(0);
    }
  }, [isLightboxOpen, x, y]);

  // 监听硬件返回键（Android）
  useEffect(() => {
    let unregister: (() => void) | undefined;
    App.addListener('backButton', () => {
      // 这里的逻辑需要小心闭包问题，最好用 ref 引用最新的 state，或者让 UI 驱动 state
      // 简单起见，我们只能在顶层做。由于 useEffect deps 包含 state，每次 state 变了都会重新注册，性能尚可。
      if (isLightboxOpen) {
        setIsLightboxOpen(false);
      } else if (avatarPreview) {
        setAvatarPreview(null);
      } else {
        onClose();
      }
    }).then(result => {
      unregister = result.remove;
    });

    return () => {
      if (unregister) unregister();
    };
  }, [isLightboxOpen, avatarPreview, onClose]);

  // 2. 灵魂魔法：将拖拽的距离映射到 背景透明度 和 图片缩放比例 上
  // 当往下或往上拖拽超过 150px 时，背景变得全透，图片缩小到 80%
  const bgOpacity = useTransform(y, [-150, 0, 150], [0, 1, 0]);
  const imgScale = useTransform(y, [-150, 0, 150], [0.8, 1, 0.8]);

  const photos = memory.photos || [];
  const videos = memory.videos || [];
  const audios = memory.audios || [];
  const { text: memoryText, weather, mood, route } = decodeMemoryContent(memory.content || '');
  const displayWeather = Array.isArray(weather) ? (weather[0] || '') : (weather || '');
  const displayMood = Array.isArray(mood) ? (mood[0] || '') : (mood || '');

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

  const getMemoryAuthor = (userId: string) => {
    if (userId === currentUser?.id) {
      return {
        name: currentUser?.username || '我',
        avatar: currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest',
      };
    }
    const f = friends.find((item: any) => item.friend?.id === userId)?.friend || friends.find((item: any) => item.id === userId);
    return {
      name: f?.username || '好友',
      avatar: f?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest',
    };
  };

  const getCommentAuthor = (authorId: string) => {
    if (authorId === memory.user_id) return getMemoryAuthor(memory.user_id);
    return getMemoryAuthor(authorId);
  };

  const openAvatarPreview = (avatarUrl: string, name: string, userId?: string) => {
    const isSelf = !!currentUser?.id && userId === currentUser.id;
    setAvatarPreview({ url: avatarUrl, name, isSelf, userId });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!memory?.id) return;
      try {
        const list = await getMemoryComments([memory.id]);
        if (!cancelled) setComments(list || []);
      } catch {
        if (!cancelled) setComments([]);
      }
    })();
    return () => { cancelled = true; };
  }, [memory?.id]);

  const handleAddComment = async () => {
    const text = commentInput.trim();
    const audioUrl = commentAudios[0];
    if (!text && !audioUrl) return;
    if (!currentUser?.id) return;
    try {
      setIsSending(true);
      const payload = encodeCommentContent(text, replyTarget || undefined, audioUrl);
      const item = await addMemoryComment(memory.id, currentUser.id, payload);
      setComments((prev) => [...prev, item]);
      setCommentInput('');
      setCommentAudios([]);
      setReplyTarget(null);
    } finally {
      setIsSending(false);
    }
  };

  const applyAvatar = async (url: string) => {
    if (!avatarPreview?.userId || !currentUser?.id || avatarPreview.userId !== currentUser.id) return;
    setAvatarSaving(true);
    try {
      const finalUrl = await updateProfileAvatarUrl(currentUser.id, url);
      const merged = { ...(userStoreUser || currentUser), avatar_url: finalUrl };
      setCurrentUser(merged);
      setAvatarPreview((prev) => (prev ? { ...prev, url: finalUrl } : prev));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`头像更新失败：${msg}`);
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleRandomAvatar = async (gender: 'boy' | 'girl') => {
    const seed = `${gender}-${Date.now()}`;
    const url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
    await applyAvatar(url);
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !avatarPreview?.userId || !currentUser?.id || avatarPreview.userId !== currentUser.id) return;
    setAvatarSaving(true);
    try {
      const url = await uploadAvatar(currentUser.id, file);
      const merged = { ...(userStoreUser || currentUser), avatar_url: url };
      setCurrentUser(merged);
      setAvatarPreview((prev) => (prev ? { ...prev, url } : prev));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`头像上传失败：${msg}`);
    } finally {
      setAvatarSaving(false);
      if (avatarFileRef.current) avatarFileRef.current.value = '';
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('确定删除这条评论吗？')) return;
    await deleteMemoryComment(commentId);
    setComments((prev) => prev.filter((item) => item.id !== commentId));
  };

  const routeStops = route ? route.split(/→|->|>/).map(s => s.trim()).filter(Boolean) : [];

  const goPrevPhoto = () => setCurrentPhotoIndex((idx) => Math.max(0, idx - 1));
  const goNextPhoto = () => setCurrentPhotoIndex((idx) => Math.min(photos.length - 1, idx + 1));

  // 3. 处理拖拽结束的逻辑
  const handleDragEnd = (e: any, info: any) => {
    const { offset, velocity } = info;
    const swipeThreshold = 50; // 滑动判定阈值

    // 垂直方向判断：下拉或上拉超过阈值，直接关闭
    if (Math.abs(offset.y) > 100 || Math.abs(velocity.y) > 500) {
      setIsLightboxOpen(false);
      return; // 退出就不执行后面的代码了
    }

    // 水平方向判断：左滑或右滑切图
    if (offset.x < -swipeThreshold && currentPhotoIndex < photos.length - 1) {
      goNextPhoto();
    } else if (offset.x > swipeThreshold && currentPhotoIndex > 0) {
      goPrevPhoto();
    }
  };

  const handleLightboxTouchStart = (e: React.TouchEvent) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleLightboxTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNextPhoto();
    else goPrevPhoto();
  };

  const handleLightboxPointerDown = (e: React.PointerEvent) => {
    if ((e as any).isPrimary === false) return;
    touchStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleLightboxPointerUp = (e: React.PointerEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNextPhoto();
    else goPrevPhoto();
  };

  const handleLightboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrevPhoto();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNextPhoto();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsLightboxOpen(false);
    }
  };

  useEffect(() => {
    if (isLightboxOpen && lightboxContainerRef.current) {
      try { lightboxContainerRef.current.focus(); } catch { }
    }
  }, [isLightboxOpen]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 backdrop-blur-xl overflow-y-auto memory-modal-backdrop"
      style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 92%, rgba(0,0,0,0.55))', color: 'var(--orbit-text)' }}
      onClick={onClose}
    >
      <div className="min-h-screen" onClick={(e) => e.stopPropagation()}>

        {/* ✨ 修复后的独立 Header：实心防穿透、绝对居中 */}
        {/* ✨ 修复后的独立 Header：完美适配深浅色模式、绝对居中、实心防穿透 */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-[100] w-full border-b backdrop-blur-xl"
          style={{
            // 完美适配深色/浅色模式，90%不透明度防穿透
            backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 90%, transparent)',
            borderColor: 'var(--orbit-border)',
            paddingTop: 'env(safe-area-inset-top, 20px)',
          }}
        >
          {/* 内部容器，固定高度14，居中对齐 */}
          <div className="relative h-14 flex items-center justify-center px-4">

            {/* 左侧：关闭按钮 (绝对定位，靠左) */}
            <button
              onClick={onClose}
              className="absolute left-4 p-2 rounded-full transition-colors active:scale-90"
              style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-text) 10%, transparent)' }}
            >
              <FaTimes className="text-lg" style={{ color: 'var(--orbit-text)' }} />
            </button>

            {/* 中间：时间日期 (Flex居中) */}
            <div className="flex flex-col items-center">
              <div className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                {formatDateGroup(memory.memory_date || memory.created_at)}
              </div>
              <div className="text-[17px] font-bold font-mono tracking-tight" style={{ color: 'var(--orbit-text)' }}>
                {formatTime(memory.memory_date || memory.created_at)}
              </div>
            </div>

            {/* 右侧：天气心情 (绝对定位，靠右) */}
            <div className="absolute right-4 flex items-center gap-1.5 text-xl">
              {displayWeather && <span title={displayWeather}>{displayWeather}</span>}
              {displayMood && <span title={displayMood}>{displayMood}</span>}
            </div>
          </div>
        </motion.div>

        {/* 👇 下方内容区：调整 paddingTop 配合 sticky header */}
        <div
          className="px-4 pb-32 w-full max-w-3xl mx-auto"
          style={{ paddingTop: '16px' }}
        >
          {memory.location && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2 mb-4"
            >
              <div className="p-2 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 90%, transparent)' }}>
                <FaMapMarkerAlt style={{ color: 'var(--orbit-text)' }} />
              </div>
              <div>
                <div className="font-medium" style={{ color: 'var(--orbit-text)' }}>{memory.location.name}</div>
                <div className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{memory.location.address}</div>
              </div>
            </motion.div>
          )}

          {(weather || mood || routeStops.length > 0) && (
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.12 }}
              className="mb-5"
            >
              {(weather || mood) && (
                <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--orbit-text)' }}>
                  {weather && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{weather}</span>
                      <span className="text-[13px] text-[var(--orbit-text-muted,#9ca3af)]">{WEATHER_OPTIONS.find(w => w.emoji === displayWeather)?.label || '天气'}</span>
                    </div>
                  )}
                  {mood && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{mood}</span>
                      <span className="text-[13px] text-[var(--orbit-text-muted,#9ca3af)]">{MOOD_OPTIONS.find(m => m.emoji === displayMood)?.label || '心情'}</span>
                    </div>
                  )}
                </div>
              )}
              {routeStops.length > 0 && (
                <div>
                  <p className="text-xs mb-2" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>📍 行程路线</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {routeStops.map((stop: string, i: number) => (
                      <span key={i} className="flex items-center gap-1">
                        <span
                          className="px-2.5 py-1 rounded-full text-sm border"
                          style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                        >
                          {stop}
                        </span>
                        {i < routeStops.length - 1 && <span className="text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {photos.length > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              {photos.length === 1 ? (
                <div
                  className="relative w-full rounded-2xl overflow-hidden cursor-zoom-in grid place-items-center"
                  style={{ backgroundColor: 'var(--orbit-card)' }}
                  onClick={() => { setCurrentPhotoIndex(0); setIsLightboxOpen(true); }}
                >
                  <img
                    src={photos[0]}
                    alt="照片"
                    className="max-h-[65vh] max-w-full w-auto h-auto object-contain"
                  />
                </div>
              ) : (
                <div className={`grid gap-1.5 ${photos.length === 2 || photos.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {photos.map((p: string, idx: number) => (
                    <button
                      key={p + idx}
                      className="relative aspect-square rounded-xl overflow-hidden"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)' }}
                      onClick={() => { setCurrentPhotoIndex(idx); setIsLightboxOpen(true); }}
                    >
                      <img src={p} alt={`照片 ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                      <div
                        className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded border text-white/80 text-[10px] font-mono leading-none backdrop-blur-sm"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 80%, transparent)', borderColor: 'var(--orbit-border)' }}
                      >
                        {idx + 1}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {createPortal(
            <AnimatePresence mode="wait">
              {isLightboxOpen && photos.length > 0 && (
                <motion.div
                  key="lightbox-overlay"
                  className="fixed inset-0 z-[120] flex items-center justify-center overscroll-none touch-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* 动态背景层：跟着下拉手势变透明 */}
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 98%, #000)',
                      opacity: bgOpacity
                    }}
                    onClick={() => setIsLightboxOpen(false)} // 点击空白处依然可以退出
                  />

                  {/* 图片容器：处理所有拖拽逻辑，现在它变成了一列火车的轨道 */}
                  <motion.div
                    className="relative w-full h-full flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing"
                    // 1. 把 x, y 拖拽全部绑定在这个轨道容器上
                    style={{ x, y, scale: imgScale }}
                    drag
                    dragDirectionLock
                    dragTransition={{ bounceStiffness: 300, bounceDamping: 20 }}
                    dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
                    dragElastic={0.8}
                    onDragEnd={handleDragEnd}
                  >
                    {/* 2. 🚀 核心魔法：把相邻的图片提前渲染出来，放在屏幕外面等着！ */}
                    {photos.map((photo: string, idx: number) => {
                      const offset = idx - currentPhotoIndex; // 计算偏移量：-1(左边), 0(中间), 1(右边)

                      // 💡 性能终极优化：哪怕你有 100 张照片，也只渲染当前屏幕、左边和右边共 3 张图。
                      // 否则手机内存会瞬间爆炸！
                      if (Math.abs(offset) > 1) return null;

                      return (
                        <motion.img
                          key={photo + idx}
                          src={photo}
                          alt={`照片 ${idx + 1}`}
                          className="absolute max-h-[100vh] max-w-[100vw] w-auto h-auto object-contain pointer-events-none"

                          // 3. 动态定位：根据偏移量，把图片推到屏幕左侧或右侧
                          initial={false}
                          animate={{
                            x: `${offset * 100}vw`, // -100vw, 0, 100vw
                            // 可选的视觉提升：两边的图片不仅在屏幕外，还可以稍微缩小一点，滑入时放大
                            scale: offset === 0 ? 1 : 0.9
                          }}
                          // 保持和容器的回弹阻尼一致，这样滑动切换时严丝合缝
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        />
                      );
                    })}
                  </motion.div>

                  {/* 顶部指示器 1 / 3 */}
                  <motion.div
                    style={{ opacity: bgOpacity }} // 下拉时连同背景一起消失
                    className="absolute top-safe-12 left-0 right-0 flex justify-center pointer-events-none"
                  >
                    <div className="px-3 py-1.5 rounded-full text-white text-sm bg-black/40 backdrop-blur-md mt-4">
                      {currentPhotoIndex + 1} / {photos.length}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )}

          {
            videos.length > 0 && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="mb-8 space-y-4">
                {videos.map((video: string, index: number) => (
                  <video key={index} src={video} controls className="w-full rounded-2xl" poster={photos[0]} />
                ))}
              </motion.div>
            )
          }

          {
            audios.length > 0 && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.27 }} className="mb-8 space-y-3">
                <div className="text-xs mb-2" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>🎙️ 语音记录</div>
                {audios.map((url: string, index: number) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-2xl border"
                    style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                  >
                    <div className="p-2.5 rounded-full shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 85%, transparent)' }}>
                      <FaMicrophone style={{ color: 'var(--orbit-text)' }} />
                    </div>
                    <audio src={url} controls className="flex-1 h-8" style={{ accentColor: 'var(--orbit-text)' }} />
                  </div>
                ))}
              </motion.div>
            )
          }

          {memoryText && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="mb-8">
              <div
                className="relative p-6 rounded-2xl border"
                style={{ background: 'color-mix(in srgb, var(--orbit-card) 94%, transparent)', borderColor: 'var(--orbit-border)' }}
              >
                <FaQuoteLeft className="absolute top-4 left-4 text-xl" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }} />
                <p className="text-lg leading-relaxed pl-6" style={{ color: 'var(--orbit-text)' }}>{memoryText}</p>
              </div>
            </motion.div>
          )}

          {memory.tagged_friends && memory.tagged_friends.length > 0 && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="mb-6">
              <div className="text-sm mb-2" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>一起的人</div>
              <div className="flex flex-wrap gap-2">
                {getVisibleTags().map((friendId: string, index: number) => {
                  const name = getTagName(friendId);
                  if (!name) return null;
                  return (
                    <motion.span
                      key={friendId}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.4 + index * 0.1 }}
                      className="px-3 py-1.5 rounded-full text-sm border"
                      style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                    >
                      @{name}
                    </motion.span>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* 👇 新增的点赞区域 👇 */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.36 }} className="mb-6 flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--orbit-border)' }}>
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleLike}
                className="flex items-center justify-center p-2 rounded-full transition-colors active:scale-90"
                style={{ backgroundColor: likeInfo.liked ? '#FF4D4F' : 'color-mix(in srgb, var(--orbit-surface) 90%, transparent)' }}
              >
                <FaHeart className={likeInfo.liked ? "text-white" : "text-[var(--orbit-text-muted)]"} />
              </button>
              <span className="text-sm font-medium" style={{ color: 'var(--orbit-text)' }}>
                {likeInfo.count} 人觉得很赞
              </span>
            </div>

            {/* 头像堆叠展示点赞的人 */}
            <div className="flex items-center -space-x-2">
              {(likeInfo.likers || []).slice(0, 5).map((user: any, idx) => (
                <img key={idx} src={user.avatar_url || user.avatar} className="w-6 h-6 rounded-full border-2 border-[var(--orbit-bg)] object-cover" />
              ))}
            </div>
          </motion.div>
          {/* 👆 点赞区域结束 👆 */}

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.38 }} className="mb-8">
            <div className="text-sm mb-3" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>评论</div>
            <div className="space-y-3">
              {comments.length === 0 && (
                <div className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>暂无评论</div>
              )}
              {comments.map((item: any) => {
                const author = getCommentAuthor(item.author_id);
                const canDelete = currentUser?.id === item.author_id || currentUser?.id === memory.user_id;
                const decoded = decodeCommentContent(item.content);
                const replyTo = decoded.replyTo;
                const handleReply = () => {
                  setReplyTarget({
                    commentId: item.id,
                    authorId: replyTo?.authorId || item.author_id,
                    authorName: replyTo?.authorName || author.name,
                  });
                };
                return (
                  <div key={item.id} className="flex items-start gap-2">
                    <img
                      src={author.avatar}
                      className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5 cursor-pointer"
                      onClick={() => openAvatarPreview(author.avatar, author.name, item.author_id)}
                    />
                    <div className="flex-1 rounded-2xl px-3 py-2 border" style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}>
                      <div className="flex items-start justify-between gap-3 mb-0.5">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium" style={{ color: 'var(--orbit-text)' }}>{author.name}</p>
                          {replyTo && (
                            <span className="text-[11px]" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>回复 {replyTo.authorName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleReply}
                            className="text-[11px] text-[color:var(--orbit-text-muted,#9ca3af)] hover:text-[#00FFB3] transition-colors"
                          >回复</button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteComment(item.id)}
                              className="text-[11px] hover:text-red-500 transition-colors shrink-0"
                              style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}
                            >撤回</button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {decoded.audioUrl && (
                          <audio src={decoded.audioUrl} controls className="w-full h-8" />
                        )}
                        {(decoded.text || !decoded.audioUrl) && (
                          <p className="text-sm" style={{ color: 'var(--orbit-text)' }}>{decoded.text}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder={currentUser?.id ? '文字 + 表情 或 留空配语音' : '登录后可评论'}
                  disabled={!currentUser?.id || isSending}
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none focus:ring-2 placeholder:text-[color:var(--orbit-text-muted,#9ca3af)]"
                  style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)', boxShadow: '0 0 0 1px var(--orbit-border)' }}
                />
                <button
                  type="button"
                  onClick={() => void handleAddComment()}
                  disabled={!currentUser?.id || (!commentInput.trim() && commentAudios.length === 0) || isSending}
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: '#00FFB3', color: '#0f172a', opacity: (!currentUser?.id || (!commentInput.trim() && commentAudios.length === 0) || isSending) ? 0.5 : 1 }}
                >发表</button>
              </div>
              {replyTarget && (
                <div className="flex items-center gap-2 px-1 text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                  <span>回复 {replyTarget.authorName}</span>
                  <button
                    type="button"
                    className="hover:text-[#00FFB3]"
                    onClick={() => setReplyTarget(null)}
                  >取消</button>
                </div>
              )}
              <VoiceRecorder
                userId={currentUser?.id || ''}
                audios={commentAudios}
                onAudiosChange={setCommentAudios}
                compact
              />
            </div>
          </motion.div>

          {memory.has_ledger && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="p-4 rounded-2xl bg-gradient-to-r from-[#FF9F43]/10 to-[#FF6B6B]/10 border border-[#FF9F43]/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-[#FF9F43]/20">
                  <FaDollarSign className="text-[#FF9F43]" />
                </div>
                <div>
                  <div className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>本次消费</div>
                  <div className="font-semibold" style={{ color: 'var(--orbit-text)' }}>¥{memory.ledger?.total_amount || '0.00'}</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
      {createPortal(
        <AnimatePresence>
          {avatarPreview && (
            <motion.div
              key="avatar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-md flex items-center justify-center px-6"
              onClick={() => setAvatarPreview(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                className="w-full max-w-sm rounded-2xl border p-4 text-center space-y-4"
                style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={avatarPreview.url}
                  className="w-48 h-48 rounded-2xl object-cover mx-auto cursor-pointer"
                  onClick={() => setAvatarPreview(null)}
                />
                <div className="space-y-1">
                  <p className="text-lg font-semibold" style={{ color: 'var(--orbit-text)' }}>{avatarPreview.name}</p>
                  <p className="text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>点击图片或空白处关闭</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarPreview(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                >关闭</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
};

export default MemoryDetailModal;