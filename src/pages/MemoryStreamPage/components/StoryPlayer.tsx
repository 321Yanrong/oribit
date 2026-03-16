import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FaTimes, FaPause, FaPlay, FaArrowDown, FaReceipt, FaMapMarkerAlt } from 'react-icons/fa';
import { decodeMemoryContent, formatDateGroup } from '../utils';

interface StoryPlayerProps {
  memories: any[];
  open: boolean;
  onClose: () => void;
}

interface Scene {
  type: 'photo' | 'text' | 'receipt' | 'poster';
  photo?: string;
  text?: string;
  sub?: string;
  receipt?: { amount: number; category?: string; title?: string };
  dateLabel?: string;
  place?: string;
}

const SCENE_DURATION = 5000;

const buildScenes = (memory: any): Scene[] => {
  const scenes: Scene[] = [];
  const photos: string[] = memory.photos || [];
  const { text, weather, mood } = decodeMemoryContent(memory.content || '');
  const dateLabel = formatDateGroup(memory.memory_date || memory.created_at);
  const place = memory.location?.name || '未知地点';

  if (photos[0]) {
    scenes.push({
      type: 'photo',
      photo: photos[0],
      text: `📍 ${dateLabel} · ${place}`,
      sub: `${weather || '天气'} · ${mood || '心情'}`,
      dateLabel,
      place,
    });
  }
  if (photos[1]) {
    scenes.push({ type: 'photo', photo: photos[1], text: text || '那天的情绪记在这里。' });
  }
  if (photos[2] && memory.ledger?.total_amount) {
    scenes.push({
      type: 'receipt',
      photo: photos[2],
      receipt: { amount: memory.ledger.total_amount, category: memory.ledger?.category, title: '账单小票' },
      text: `这次花了 ¥${memory.ledger.total_amount}，快乐平摊。`,
    });
  }
  if (!scenes.length && photos.length) {
    scenes.push({ type: 'photo', photo: photos[0], text: '翻开回忆，看看这里。' });
  }
  scenes.push({ type: 'poster', photo: photos[0], text: '保存 / 分享这份回忆', place });
  return scenes;
};

const StoryPlayer = ({ memories, open, onClose }: StoryPlayerProps) => {
  const targetMemory = memories.find((m) => (m.photos && m.photos.length > 0)) || memories[0];
  const scenes = useMemo(() => (targetMemory ? buildScenes(targetMemory) : []), [targetMemory]);

  const [index, setIndex] = useState(0);
  const [isPaused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setPaused(false);
  }, [open]);

  useEffect(() => {
    if (!open || isPaused || scenes.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIndex((i) => (i + 1 >= scenes.length ? scenes.length - 1 : i + 1));
    }, SCENE_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, isPaused, index, scenes.length]);

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(scenes.length - 1, i + 1));
  const togglePause = (state: boolean) => setPaused(state);

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.clientX;
    const width = window.innerWidth;
    if (x < width / 3) goPrev();
    else goNext();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY;
    togglePause(true);
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartY.current;
    const endY = e.changedTouches[0].clientY;
    touchStartY.current = null;
    togglePause(false);
    if (startY !== null && endY - startY > 80) onClose();
  };

  if (!open || scenes.length === 0) return null;
  const scene = scenes[index];
  const progress = ((index + 1) / scenes.length) * 100;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="story-player"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
           className="fixed inset-0 z-[130]"
           style={{ backgroundColor: 'color-mix(in srgb, #000 85%, transparent)' }}
        >
          <div className="absolute inset-0" onClick={handleTap} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {scene.photo && (
              <motion.img
                key={scene.photo + index}
                src={scene.photo}
                initial={{ scale: 1.05, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="w-full h-full object-cover"
              />
            )}
            <div
              className="absolute inset-0"
             style={{
               background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.65) 100%)'
             }}
            />
          </div>

          <div className="absolute top-0 left-0 right-0 px-4 pt-4">
            <div className="flex gap-1 mb-3">
              {scenes.map((_, i) => (
                  <div key={i} className="flex-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
                  <div
                    className="h-full"
                    style={{
                      width: i < index ? '100%' : i === index ? `${progress - index * (100 / scenes.length)}%` : '0%',
                      background: 'linear-gradient(90deg, #00FFB3, #00D9FF)'
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
              <span>{scene.place || 'Story'}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPaused((p) => !p)}
                  className="p-2 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                >
                  {isPaused ? <FaPlay /> : <FaPause />}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                >
                  <FaTimes />
                </button>
              </div>
            </div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <motion.div
              key={scene.type + index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="max-w-xl space-y-3"
              style={{ color: '#fff' }}
            >
              {scene.type === 'receipt' && (
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs"
                  style={{ backgroundColor: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)' }}
                >
                  <FaReceipt /> <span>账单 · {scene.receipt?.category || '消费'}</span>
                </div>
              )}
              {scene.type === 'photo' && scene.sub && (
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs"
                  style={{ backgroundColor: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)' }}
                >
                  <FaMapMarkerAlt /> <span>{scene.sub}</span>
                </div>
              )}
              <p className="text-lg font-semibold leading-relaxed">
                {scene.text}
              </p>
              {scene.type === 'receipt' && (
                <div
                  className="mt-2 inline-flex items-center gap-3 px-4 py-2 rounded-2xl shadow-lg border"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderColor: 'rgba(255,255,255,0.18)' }}
                >
                  <div className="text-2xl font-bold" style={{ color: '#fff' }}>¥{scene.receipt?.amount?.toFixed(2)}</div>
                  <div className="text-left text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    <div>这次花费记录在 Orbit</div>
                    <div>点击右侧继续翻页</div>
                  </div>
                </div>
              )}
              {scene.type === 'poster' && (
                <div className="flex flex-col items-center gap-3 mt-3">
                  <div className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>故事结尾，生成分享海报</div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 rounded-full font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>保存到手机</button>
                    <button className="px-4 py-2 rounded-full bg-[#00FFB3] text-black font-semibold">分享这份回忆</button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <div className="absolute bottom-6 w-full flex justify-center text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}
            >
              <FaArrowDown className="text-[10px]" /> 下滑即可关闭
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StoryPlayer;
