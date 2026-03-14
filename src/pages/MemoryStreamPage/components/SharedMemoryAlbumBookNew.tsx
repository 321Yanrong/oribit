// Temporary placeholder, main implementation moved to SharedMemoryAlbumBook.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { FaDollarSign, FaMapMarkerAlt, FaTimes } from 'react-icons/fa';
import { decodeMemoryContent } from '../utils';
// import memoryFlowBackground from '../../../../回忆流.jpg';
const memoryFlowBackground = 'https://dummyimage.com/1200x800/222/aaa&text=Memory+Flow+BG';

const STORY_DURATION = 5000; // ms per story

type FriendChip = { id: string; name: string; avatar?: string };

// ==========================================
// 1. 入口组件：胶囊式放映入口卡片
// ==========================================
export const MemoryStoryEntry = ({
  memories,
  onClick,
  friends = [],
  selectedFriendIds = [],
  onSelectFriend,
}: {
  memories: any[];
  onClick: (storyMemories: any[]) => void;
  friends?: FriendChip[];
  selectedFriendIds?: string[];
  onSelectFriend?: (ids: string[]) => void;
}) => {
  const storyMemories = memories.filter((m) => m.photos && m.photos.length > 0);
  if (storyMemories.length === 0) return null;

  const latestMemory = storyMemories[0];
  const photosCount = storyMemories.reduce((sum, m) => sum + (m.photos?.length || 0), 0);
  const memoriesCount = storyMemories.length;
  const { weather, mood } = decodeMemoryContent(latestMemory.content || '');

  return (
    <div className="px-4 mb-6">
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onClick(storyMemories)}
        className="relative overflow-hidden rounded-2xl p-4 cursor-pointer group border border-white/10 min-h-[150px]"
        style={{
          backgroundColor: '#05070d',
          backgroundImage: `radial-gradient(at 20% 18%, rgba(120,155,255,0.28) 0, transparent 42%),
            radial-gradient(at 82% 22%, rgba(255,137,191,0.32) 0, transparent 40%),
            radial-gradient(at 50% 74%, rgba(88,255,214,0.24) 0, transparent 46%),
            linear-gradient(135deg, rgba(8,12,24,0.88), rgba(12,7,28,0.82)),
            url(${memoryFlowBackground})`,
          backgroundBlendMode: 'screen, screen, screen, normal, soft-light',
          backgroundSize: '140% 140%, 140% 140%, cover, cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-black/60" />

        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[11px] text-white/50 tracking-[0.2em] uppercase">memory story</p>
            <h3 className="text-white text-lg font-semibold mt-1">共 {memoriesCount} 段回忆 · {photosCount} 张照片</h3>
            {(weather || mood) && (
              <p className="text-white/70 text-xs mt-1">
                {weather && <span className="mr-2">{weather}</span>}
                {mood && <span>{mood}</span>}
              </p>
            )}
            {latestMemory.location?.name && (
              <p className="text-white/60 text-xs mt-1 flex items-center gap-1">
                <FaMapMarkerAlt className="text-[10px]" />
                {latestMemory.location.name}
              </p>
            )}
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-[#00FFB3] font-bold text-xl shadow-inner">
            ▶
          </div>
        </div>

        {friends.length > 0 && onSelectFriend && (
          <div className="relative mt-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {friends.map((f) => {
              const active = selectedFriendIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (active) onSelectFriend(selectedFriendIds.filter((id) => id !== f.id));
                    else onSelectFriend([...selectedFriendIds, f.id]);
                  }}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    active
                      ? 'bg-[#00FFB3] text-black border-transparent'
                      : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                  }`}
                >
                  {f.avatar && <img src={f.avatar} className="w-4 h-4 rounded-full object-cover" />}
                  {f.name}
                </button>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ==========================================
// 2. 底部 Drawer 式放映（全局播放列表）
// ==========================================
export const MemoryStoryViewer = ({
  memories,
  onClose,
  onShare,
}: {
  memories: any[];
  onClose: () => void;
  onShare?: (memory: any) => void;
}) => {
  const playlist = useMemo(() => {
    const list: { photoUrl: string; memory: any; isMemoryLast: boolean; isAllLast: boolean }[] = [];
    memories.forEach((m: any, mIdx: number) => {
      (m.photos || []).forEach((photo: string, pIdx: number) => {
        list.push({
          photoUrl: photo,
          memory: m,
          isMemoryLast: pIdx === (m.photos?.length || 0) - 1,
          isAllLast: mIdx === memories.length - 1 && pIdx === (m.photos?.length || 0) - 1,
        });
      });
    });
    return list;
  }, [memories]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const currentItem = playlist[activeIndex];
  const { text: mText, weather, mood } = decodeMemoryContent(currentItem?.memory?.content || '');
  // 新增变量定义，防止未定义报错
  const memoriesCount = memories.length;
  const photosCount = memories.reduce((sum, m) => sum + (m.photos?.length || 0), 0);

  useEffect(() => {
    setActiveIndex(0);
    setProgress(0);
    setIsPaused(false);
  }, [memories]);

  useEffect(() => {
    if (!currentItem || isPaused) return;
    const step = 100 / (STORY_DURATION / 50);
    const interval = setInterval(() => setProgress((p) => p + step), 50);
    return () => clearInterval(interval);
  }, [currentItem, isPaused]);

  useEffect(() => {
    if (!currentItem) return;
    if (progress >= 100) {
      if (activeIndex < playlist.length - 1) {
        setActiveIndex((a) => a + 1);
        setProgress(0);
      } else {
        setIsPaused(true);
        setProgress(100);
      }
    }
  }, [progress, activeIndex, playlist.length, currentItem]);

  const handlePointerDown = () => setIsPaused(true);
  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    setIsPaused(false);
    let clientX = 0;
    if ('changedTouches' in e) clientX = e.changedTouches[0].clientX;
    else clientX = (e as React.MouseEvent).clientX;
    const w = (e.currentTarget as HTMLElement).clientWidth || window.innerWidth;
    if (clientX < w / 3) {
      if (activeIndex > 0) {
        setActiveIndex((a) => a - 1);
        setProgress(0);
      }
    } else {
      if (activeIndex < playlist.length - 1) {
        setActiveIndex((a) => a + 1);
        setProgress(0);
      }
    }
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) onClose();
  };

  if (!currentItem) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-md"
        style={{
          backgroundImage: `radial-gradient(at 18% 22%, rgba(120,155,255,0.15) 0, transparent 40%),
            radial-gradient(at 80% 18%, rgba(255,137,191,0.18) 0, transparent 38%),
            radial-gradient(at 46% 70%, rgba(88,255,214,0.16) 0, transparent 42%)`,
          backgroundBlendMode: 'screen',
        }}
      />
      <motion.div
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-[150] h-[88vh] max-h-[88vh] rounded-t-3xl overflow-hidden flex flex-col shadow-[0_-20px_80px_rgba(0,0,0,0.45)]"
        style={{
          backgroundColor: '#05070d',
          backgroundImage: `radial-gradient(at 16% 18%, rgba(120,155,255,0.22) 0, transparent 42%),
            radial-gradient(at 84% 16%, rgba(255,137,191,0.24) 0, transparent 40%),
            radial-gradient(at 50% 76%, rgba(88,255,214,0.18) 0, transparent 46%),
            linear-gradient(135deg, rgba(8,12,24,0.92), rgba(12,7,28,0.88)),
            url(${memoryFlowBackground})`,
          backgroundBlendMode: 'screen, screen, screen, normal, soft-light',
          backgroundSize: '140% 140%, 140% 140%, 140% 140%, cover, cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-white/35" />

        <div className="absolute top-7 left-0 right-0 z-20 px-4 flex gap-1.5">
          {playlist.map((_, i) => (
            <div key={i} className="h-1 flex-1 bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7cf5ff] via-[#9b8cff] to-[#ff9fd8] transition-all duration-75 ease-linear"
                style={{ width: i < activeIndex ? '100%' : i === activeIndex ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        <div className="absolute top-11 left-0 right-0 z-20 px-4 flex justify-between items-center pointer-events-none">
          <div className="flex items-center gap-2 drop-shadow">
            {weather && <span className="text-xl text-white">{weather}</span>}
            {mood && <span className="text-xl text-white">{mood}</span>}
            <div className="text-white">
              <p className="text-sm font-semibold">
                {new Date(currentItem.memory.memory_date || currentItem.memory.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </p>
              {currentItem.memory.location && (
                <p className="text-[10px] text-white/80 flex items-center gap-1"><FaMapMarkerAlt /> {currentItem.memory.location.name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white pointer-events-auto bg-black/30 rounded-full backdrop-blur-md border border-white/10"
          >
            <FaTimes className="text-lg" />
          </button>
        </div>

        <div
          className="flex-1 relative bg-black"
          onMouseDown={handlePointerDown}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchEnd={handlePointerUp}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={activeIndex}
              src={currentItem.photoUrl}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-transparent to-transparent pointer-events-none" />
        </div>

        <div className="absolute bottom-6 left-4 right-4 z-30 pointer-events-none">
          <AnimatePresence mode="popLayout">
            {(!isPaused || currentItem.isAllLast) && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                {mText && <p className="text-white text-base leading-relaxed drop-shadow-lg font-medium whitespace-pre-wrap">{mText}</p>}
                {currentItem.isAllLast && (
                  <div className="bg-black/45 backdrop-blur-xl rounded-3xl p-5 border border-white/20 w-full pointer-events-auto shadow-2xl">
                    <div className="flex justify-between items-end mb-5">
                      <div className="flex-1 pr-2">
                        <p className="text-sm text-white/70">这是你和朋友们的回忆合集，包含了 {memoriesCount} 段回忆和 {photosCount} 张照片。</p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
