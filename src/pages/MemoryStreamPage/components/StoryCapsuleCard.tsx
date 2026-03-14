import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FaPlay } from 'react-icons/fa';
import { decodeMemoryContent, formatDateGroup } from '../utils';

interface StoryCapsuleCardProps {
  memories: any[];
  currentUser?: any;
  friends?: any[];
  onOpen: () => void;
}

const pickHeroMemories = (memories: any[]) => {
  return memories
    .filter((m) => (m.photos && m.photos.length > 0))
    .slice(0, 3);
};

const pickLine = (memories: any[], friends: any[] = []) => {
  if (!memories.length) return '点开看看最近的回忆';
  const latest = memories[0];
  const { weather, mood } = decodeMemoryContent(latest.content || '');
  const place = latest.location?.name || '某个熟悉的角落';
  const dateLabel = formatDateGroup(latest.memory_date || latest.created_at);
  const partner = friends.find((f) => latest.tagged_friends?.includes(f.friend?.id))?.friend?.username;
  if (partner) {
    return `${dateLabel} 和 @${partner} 的那天，${weather || '晴'} · ${mood || '心情不错'}`;
  }
  return `${dateLabel} 在 ${place} 的片段，点开回顾吧`;
};

const StoryCapsuleCard = ({ memories, currentUser, friends = [], onOpen }: StoryCapsuleCardProps) => {
  const heroMemories = useMemo(() => pickHeroMemories(memories), [memories]);
  const line = useMemo(() => pickLine(heroMemories, friends), [heroMemories, friends]);
  const bgPhotos = heroMemories.flatMap((m) => m.photos || []).slice(0, 3);
  const avatars = [currentUser?.avatar_url, ...friends.slice(0, 2).map((f) => f.friend?.avatar_url)].filter(Boolean);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-4 py-3 text-left shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
    >
      <div className="absolute inset-0 overflow-hidden">
        {bgPhotos.map((src, idx) => (
          <img
            key={src + idx}
            src={src}
            className={`absolute inset-0 w-full h-full object-cover ${idx === 0 ? 'opacity-80' : 'opacity-0'} blur-2xl scale-110`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-black/30" />
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-60" />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white/70 text-xs mb-1">回忆放映室 · Story</p>
          <p className="text-white text-sm font-semibold leading-snug line-clamp-2">{line}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex -space-x-2">
              {avatars.map((a, i) => (
                <img key={a + i} src={a} className="w-7 h-7 rounded-full border border-white/20 object-cover" />
              ))}
            </div>
            <span className="text-white/50 text-xs">点开以沉浸播放</span>
          </div>
        </div>
        <div className="shrink-0 w-11 h-11 rounded-full bg-white/15 border border-white/20 grid place-items-center text-white">
          <FaPlay className="text-sm" />
        </div>
      </div>
    </motion.button>
  );
};

export default StoryCapsuleCard;
