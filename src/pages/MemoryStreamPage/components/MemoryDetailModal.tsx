import { useState, useEffect, useRef } from 'react';
import { VoiceRecorder } from '../../../components/MediaUploader';
import { uploadAvatar, updateProfileAvatarUrl } from '../../../api/supabase';
import { useUserStore } from '../../../store';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaMapMarkerAlt, FaChevronRight, FaMicrophone, FaDollarSign, FaQuoteLeft } from 'react-icons/fa';
import { decodeMemoryContent, formatDateGroup, formatTime, MOOD_OPTIONS, WEATHER_OPTIONS } from '../utils';
import { getTaggedDisplayName, getVisibleTaggedFriendIds } from '../../../utils/tagVisibility';
import { getMemoryComments, addMemoryComment, deleteMemoryComment } from '../../../api/supabase';

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
  const photos = memory.photos || [];
  const videos = memory.videos || [];
  const audios = memory.audios || [];
  const { text: memoryText, weather, mood, route } = decodeMemoryContent(memory.content || '');

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
    // Only track primary pointer
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
      try { lightboxContainerRef.current.focus(); } catch {}
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
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-4"
          style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--orbit-surface) 96%, transparent) 0%, color-mix(in srgb, var(--orbit-surface) 80%, transparent) 60%, transparent 100%)' }}
        >
          <button
            onClick={onClose}
            className="p-2 rounded-full backdrop-blur-sm transition-colors"
            style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 65%, transparent)' }}
          >
            <FaTimes className="text-white text-lg" />
          </button>
          <div className="text-center">
            <div className="text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{formatDateGroup(memory.memory_date || memory.created_at)}</div>
            <div className="font-medium" style={{ color: 'var(--orbit-text)' }}>{formatTime(memory.memory_date || memory.created_at)}</div>
          </div>
          <div className="flex items-center gap-1 text-xl">
            {weather && <span title={weather}>{weather}</span>}
            {mood && <span title={mood}>{mood}</span>}
          </div>
        </motion.div>

        <div className="px-4 pb-32">
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
                      <span className="text-[13px] text-[var(--orbit-text-muted,#9ca3af)]">{WEATHER_OPTIONS.find(w => w.emoji === weather)?.label || '天气'}</span>
                    </div>
                  )}
                  {mood && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{mood}</span>
                      <span className="text-[13px] text-[var(--orbit-text-muted,#9ca3af)]">{MOOD_OPTIONS.find(m => m.emoji === mood)?.label || '心情'}</span>
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

          {/* ✨ 核心重构：完美单图居中 + 仿朋友圈动态九宫格 */}
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
                      {/* 右下角序号角标 */}
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

          <AnimatePresence>
            {isLightboxOpen && photos.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] backdrop-blur-sm flex items-center justify-center"
                style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 94%, transparent)' }}
                onClick={() => setIsLightboxOpen(false)}
              >
                <div
                  ref={lightboxContainerRef}
                  tabIndex={0}
                  className="relative w-full h-full max-w-6xl mx-auto flex items-center justify-center px-4"
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={handleLightboxTouchStart}
                  onTouchEnd={handleLightboxTouchEnd}
                  onPointerDown={handleLightboxPointerDown}
                  onPointerUp={handleLightboxPointerUp}
                  onKeyDown={handleLightboxKeyDown}
                >
                  <img
                    src={photos[currentPhotoIndex]}
                    alt={`原图 ${currentPhotoIndex + 1}`}
                    className="max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain"
                  />
                  {photos.length > 1 && (
                    <>
                      <button
                        onClick={goPrevPhoto}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full transition disabled:opacity-40"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)' }}
                        disabled={currentPhotoIndex === 0}
                      >
                        <FaChevronRight className="text-white rotate-180" />
                      </button>
                      <button
                        onClick={goNextPhoto}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full transition disabled:opacity-40"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)' }}
                        disabled={currentPhotoIndex === photos.length - 1}
                      >
                        <FaChevronRight className="text-white" />
                      </button>
                      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
                        {photos.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => setCurrentPhotoIndex(index)}
                            className={`w-2 h-2 rounded-full transition-all ${index === currentPhotoIndex ? 'bg-white w-6' : 'bg-white/40'}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => setIsLightboxOpen(false)}
                    className="absolute top-6 right-6 p-3 rounded-full transition"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)' }}
                  >
                    <FaTimes className="text-white text-lg" />
                  </button>
                  <div
                    className="absolute top-6 left-6 px-3 py-1.5 rounded-full text-white text-sm"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 70%, transparent)' }}
                  >
                    {currentPhotoIndex + 1} / {photos.length}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {videos.length > 0 && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="mb-8 space-y-4">
              {videos.map((video: string, index: number) => (
                <video key={index} src={video} controls className="w-full rounded-2xl" poster={photos[0]} />
              ))}
            </motion.div>
          )}

          {audios.length > 0 && (
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
          )}

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
      <AnimatePresence>
        {avatarPreview && (
          <motion.div
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
      </AnimatePresence>
    </motion.div>
  );
};

export default MemoryDetailModal;
