import { useState, useEffect } from 'react';
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

const MemoryDetailModal = ({ memory, onClose, friends, currentUser }: MemoryDetailModalProps) => {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [isSending, setIsSending] = useState(false);
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
    if (!text || !currentUser?.id) return;
    try {
      setIsSending(true);
      const item = await addMemoryComment(memory.id, currentUser.id, text);
      setComments((prev) => [...prev, item]);
      setCommentInput('');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('确定删除这条评论吗？')) return;
    await deleteMemoryComment(commentId);
    setComments((prev) => prev.filter((item) => item.id !== commentId));
  };

  const routeStops = route ? route.split(/→|->|>/).map(s => s.trim()).filter(Boolean) : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-screen" onClick={(e) => e.stopPropagation()}>
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 bg-gradient-to-b from-black/80 to-transparent"
        >
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors"
          >
            <FaTimes className="text-white text-lg" />
          </button>
          <div className="text-center">
            <div className="text-white/60 text-xs">{formatDateGroup(memory.memory_date || memory.created_at)}</div>
            <div className="text-white font-medium">{formatTime(memory.memory_date || memory.created_at)}</div>
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
              <div className="p-2 rounded-full bg-gradient-to-r from-[#00FFB3]/20 to-[#00D9FF]/20">
                <FaMapMarkerAlt className="text-[#00FFB3]" />
              </div>
              <div>
                <div className="text-white font-medium">{memory.location.name}</div>
                <div className="text-white/40 text-sm">{memory.location.address}</div>
              </div>
            </motion.div>
          )}

          {(weather || mood || routeStops.length > 0) && (
            <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 }} className="mb-5 p-4 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 space-y-3">
              {(weather || mood) && (
                <div className="flex flex-wrap gap-2">
                  {weather && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/20">
                      <span className="text-lg">{weather}</span>
                      <span className="text-sky-300 text-sm">{WEATHER_OPTIONS.find(w => w.emoji === weather)?.label || '天气'}</span>
                    </div>
                  )}
                  {mood && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00FFB3]/10 border border-[#00FFB3]/20">
                      <span className="text-lg">{mood}</span>
                      <span className="text-[#00FFB3] text-sm">{MOOD_OPTIONS.find(m => m.emoji === mood)?.label || '心情'}</span>
                    </div>
                  )}
                </div>
              )}
              {routeStops.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs mb-2">📍 行程路线</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {routeStops.map((stop: string, i: number) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="px-2.5 py-1 rounded-full bg-white/10 text-white/80 text-sm">{stop}</span>
                        {i < routeStops.length - 1 && <span className="text-white/30 text-xs">→</span>}
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
                  className="relative w-full rounded-2xl overflow-hidden bg-black/20 cursor-zoom-in grid place-items-center"
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
                      className="relative aspect-square rounded-xl overflow-hidden bg-black/30"
                      onClick={() => { setCurrentPhotoIndex(idx); setIsLightboxOpen(true); }}
                    >
                      <img src={p} alt={`照片 ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                      {/* 右下角序号角标 */}
                      <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded border border-white/10 bg-black/50 text-white/80 text-[10px] font-mono leading-none backdrop-blur-sm">
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
                className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-sm flex items-center justify-center"
                onClick={() => setIsLightboxOpen(false)}
              >
                <div className="relative w-full h-full max-w-6xl mx-auto flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
                  <img
                    src={photos[currentPhotoIndex]}
                    alt={`原图 ${currentPhotoIndex + 1}`}
                    className="max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain"
                  />
                  {photos.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentPhotoIndex((idx) => Math.max(0, idx - 1))}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-40"
                        disabled={currentPhotoIndex === 0}
                      >
                        <FaChevronRight className="text-white rotate-180" />
                      </button>
                      <button
                        onClick={() => setCurrentPhotoIndex((idx) => Math.min(photos.length - 1, idx + 1))}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-40"
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
                    className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 transition"
                  >
                    <FaTimes className="text-white text-lg" />
                  </button>
                  <div className="absolute top-6 left-6 px-3 py-1.5 rounded-full bg-white/10 text-white text-sm">
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
              <div className="text-white/40 text-xs mb-2">🎙️ 语音记录</div>
              {audios.map((url: string, index: number) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="p-2.5 rounded-full bg-[#00FFB3]/10 shrink-0">
                    <FaMicrophone className="text-[#00FFB3]" />
                  </div>
                  <audio src={url} controls className="flex-1 h-8 accent-[#00FFB3]" />
                </div>
              ))}
            </motion.div>
          )}

          {memoryText && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="mb-8">
              <div className="relative p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
                <FaQuoteLeft className="absolute top-4 left-4 text-[#00FFB3]/30 text-xl" />
                <p className="text-white/90 text-lg leading-relaxed pl-6">{memoryText}</p>
              </div>
            </motion.div>
          )}

          {memory.tagged_friends && memory.tagged_friends.length > 0 && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="mb-6">
              <div className="text-white/40 text-sm mb-2">一起的人</div>
              <div className="flex flex-wrap gap-2">
                {getVisibleTags().map((friendId: string, index: number) => {
                  const name = getTagName(friendId);
                  if (!name) return null;
                  return (
                    <motion.span key={friendId} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + index * 0.1 }} className="px-3 py-1.5 rounded-full bg-[#00FFB3]/10 text-[#00FFB3] text-sm border border-[#00FFB3]/20">
                      @{name}
                    </motion.span>
                  );
                })}
              </div>
            </motion.div>
          )}

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.38 }} className="mb-8">
            <div className="text-white/40 text-sm mb-3">评论</div>
            <div className="space-y-3">
              {comments.length === 0 && (
                <div className="text-white/40 text-sm">暂无评论</div>
              )}
              {comments.map((item: any) => {
                const author = getCommentAuthor(item.author_id);
                const canDelete = currentUser?.id === item.author_id || currentUser?.id === memory.user_id;
                return (
                  <div key={item.id} className="flex items-start gap-2">
                    <img src={author.avatar} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                    <div className="flex-1 bg-white/5 rounded-2xl px-3 py-2">
                      <div className="flex items-start justify-between gap-3 mb-0.5">
                        <p className="text-[#00FFB3] text-xs font-medium">{author.name}</p>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteComment(item.id)}
                            className="text-[11px] text-white/30 hover:text-red-300 transition-colors shrink-0"
                          >撤回</button>
                        )}
                      </div>
                      <p className="text-white/70 text-sm">{item.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={currentUser?.id ? '写下你的评论...' : '登录后可评论'}
                disabled={!currentUser?.id || isSending}
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#00FFB3]/50"
              />
              <button
                type="button"
                onClick={() => void handleAddComment()}
                disabled={!currentUser?.id || !commentInput.trim() || isSending}
                className="px-4 py-2 rounded-xl bg-[#00FFB3]/20 text-[#00FFB3] text-sm font-semibold border border-[#00FFB3]/30 disabled:opacity-40"
              >发送</button>
            </div>
          </motion.div>

          {memory.has_ledger && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="p-4 rounded-2xl bg-gradient-to-r from-[#FF9F43]/10 to-[#FF6B6B]/10 border border-[#FF9F43]/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-[#FF9F43]/20">
                  <FaDollarSign className="text-[#FF9F43]" />
                </div>
                <div>
                  <div className="text-white/60 text-sm">本次消费</div>
                  <div className="text-white font-semibold">¥{memory.ledger?.total_amount || '0.00'}</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default MemoryDetailModal;
