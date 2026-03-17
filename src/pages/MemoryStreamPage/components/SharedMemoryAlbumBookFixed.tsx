import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { FaDollarSign, FaMapMarkerAlt, FaTimes, FaPlay, FaPause } from 'react-icons/fa';
import { decodeMemoryContent } from '../utils';
import memoryFlowBackground from '../../../../screenshot_app/回忆流.jpg';

const STORY_DURATION = 5000; // ms per story
const MUSIC_TRACKS = [
{ label: '本地音乐 · bgm1', url: '/music/bgm1.mp3' },
{ label: '本地音乐 · bgm2', url: '/music/bgm2.mp3' },
{ label: '本地音乐 · bgm3', url: '/music/bgm3.mp3' },
{ label: '本地音乐 · bgm4', url: '/music/bgm4.mp3' },
];
const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
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

  // 监听主题变化，保证入口卡片随浅/深模式变换
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark'
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      setTheme((prev) => (prev === next ? prev : next));
    };
    const observer = new MutationObserver(handler);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    handler();
    return () => observer.disconnect();
  }, []);

  const entryStyle = useMemo(() => {
    const baseBg = theme === 'light'
      ? 'color-mix(in srgb, var(--orbit-surface) 94%, rgba(255,255,255,0.88))'
      : 'color-mix(in srgb, var(--orbit-bg) 82%, #0f172a 18%)';
    const baseOverlay = theme === 'light'
      ? 'linear-gradient(145deg, rgba(255,255,255,0.86), rgba(245,247,251,0.92))'
      : 'linear-gradient(145deg, rgba(18,22,32,0.82), rgba(18,22,32,0.72))';
    const shadow = theme === 'light'
      ? '0 18px 42px rgba(15,23,42,0.18)'
      : '0 28px 64px rgba(6,12,20,0.5)';

    return {
      borderColor: 'color-mix(in srgb, var(--orbit-border) 60%, transparent)',
      backgroundColor: baseBg,
      backgroundImage: `radial-gradient(at 18% 12%, color-mix(in srgb, var(--orbit-glow, #00ffb3) 26%, transparent) 0, transparent 42%),
       radial-gradient(at 82% 18%, rgba(255,177,214,0.22) 0, transparent 40%),
       radial-gradient(at 46% 78%, rgba(94,214,190,0.22) 0, transparent 46%),
       radial-gradient(at 72% 72%, rgba(255,196,120,0.18) 0, transparent 48%),
       ${baseOverlay},
       url(${memoryFlowBackground})`,
      backgroundBlendMode: 'screen, screen, screen, screen, soft-light, overlay',
      backgroundSize: '170% 170%, 170% 170%, 170% 170%, 190% 190%, cover, cover',
      backgroundPosition: 'center',
      boxShadow: shadow,
      color: 'var(--orbit-text)',
    } as const;
  }, [theme]);

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
        className="relative overflow-hidden rounded-2xl p-4 cursor-pointer group border min-h-[150px]"
        style={entryStyle}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-white/14 mix-blend-screen" />
        <div className="absolute inset-0 blur-3xl opacity-70" style={{
          backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.12) 0, transparent 28%), radial-gradient(circle at 70% 60%, rgba(200,224,255,0.12) 0, transparent 32%)'
        }} />

<div className="relative flex items-center justify-between">
<div>
<p className="text-[11px] tracking-[0.2em] uppercase" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>memory story</p>
<h3 className="text-lg font-semibold mt-1" style={{ color: 'var(--orbit-text)' }}>共 {memoriesCount} 段回忆 · {photosCount} 张照片</h3>
{(weather || mood) && (
<p className="text-xs mt-1" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
{weather && <span className="mr-2">{weather}</span>}
{mood && <span>{mood}</span>}
</p>
)}
{latestMemory.location?.name && (
<p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
<FaMapMarkerAlt className="text-[10px]" />
{latestMemory.location.name}
</p>
)}
</div>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shadow-inner"
          style={{
            color: '#0f9f6e',
            background: 'color-mix(in srgb, #0f9f6e 16%, transparent)',
            border: '1px solid color-mix(in srgb, #dce7f5 24%, transparent)',
            boxShadow: '0 12px 28px rgba(11,17,24,0.55), inset 0 1px 0 rgba(255,255,255,0.06)'
          }}
        >
          ▶
        </div>
</div>

{friends.length > 0 && onSelectFriend && (
<div
  className="relative mt-4 flex gap-2 overflow-x-auto flex-nowrap"
  style={{
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
    touchAction: 'pan-x',
    msOverflowStyle: 'none',
  }}
>
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
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shadow-sm whitespace-nowrap"
      style={{
        backgroundColor: active ? '#0f9f6e' : 'color-mix(in srgb, var(--orbit-card) 82%, rgba(255,255,255,0.75))',
        color: active ? '#fff' : 'var(--orbit-text)',
        borderColor: active ? 'transparent' : 'var(--orbit-border)'
      }}
    >
      {f.avatar && <img src={f.avatar} className="w-6 h-6 rounded-full object-cover" />}
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
export const MemoryStoryDrawer = ({
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
const [isMusicPlaying, setIsMusicPlaying] = useState(false);
const [selectedTrack, setSelectedTrack] = useState(0);
const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);
const [pendingPosterDataUrl, setPendingPosterDataUrl] = useState<string | null>(null);
const [storyCompleted, setStoryCompleted] = useState(false);
// 海报预览弹窗开关
const [showPosterPreview, setShowPosterPreview] = useState(false);
const [posterLoading, setPosterLoading] = useState(false);
const audioRef = useRef<HTMLAudioElement | null>(null);
const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
const swipeHandledRef = useRef(false);
const pinchActiveRef = useRef(false);
const pinchStartDistRef = useRef(0);
const pinchStartScaleRef = useRef(1);
const clampScale = (s: number) => Math.min(3, Math.max(1, s));
const [zoomScale, setZoomScale] = useState(1);
// Always use a single audio element, update src/volume as needed
const ensureAudio = useCallback(() => {
if (!audioRef.current) {
const audio = new Audio(MUSIC_TRACKS[selectedTrack].url);
audio.loop = true;
audio.volume = 0.35;
audioRef.current = audio;
}
return audioRef.current;
}, [selectedTrack]);

const handleToggleMusic = useCallback(() => {
const audio = ensureAudio();
if (!audio) return;
if (isMusicPlaying) {
audio.pause();
setIsMusicPlaying(false);
} else {
setIsMusicPlaying(true);
audio.play().catch(() => setIsMusicPlaying(false));
}
}, [ensureAudio, isMusicPlaying]);

const handleNextTrack = useCallback(() => {
setSelectedTrack((prev) => {
const next = (prev + 1) % MUSIC_TRACKS.length;
const audio = ensureAudio();
if (audio) {
audio.pause();
audio.src = MUSIC_TRACKS[next].url;
audio.load();
audio.play().catch(() => setIsMusicPlaying(false));
}
setIsMusicPlaying(true);
return next;
});
}, [ensureAudio]);

const currentItem = playlist[activeIndex];
// Keep a loaded blur background to avoid a black flash when switching photos
const [blurBgUrl, setBlurBgUrl] = useState(currentItem?.photoUrl || '');
const shareThumb = playlist[activeIndex + 1]?.photoUrl || currentItem?.photoUrl;
const { text: mText, weather, mood } = decodeMemoryContent(currentItem?.memory?.content || '');

useEffect(() => {
setActiveIndex(0);
setProgress(0);
setIsPaused(false);
// Reset audio on new memories
if (audioRef.current) {
audioRef.current.pause();
audioRef.current = null;
}
setIsMusicPlaying(false);
// Don't auto-play on mount
// eslint-disable-next-line
return () => {
// Cleanup on unmount (drawer close)
if (audioRef.current) {
audioRef.current.pause();
audioRef.current = null;
}
};
}, [memories]);

// Preload next blur background and only swap when loaded to avoid flashing to black
useEffect(() => {
const nextUrl = currentItem?.photoUrl;
if (!nextUrl) return;
// Optimistically set to当前图，避免与上层主图不同步慢一拍
setBlurBgUrl(nextUrl);
const img = new Image();
img.onload = () => setBlurBgUrl(nextUrl);
img.onerror = () => setBlurBgUrl(nextUrl);
img.src = nextUrl;
}, [currentItem?.photoUrl]);

// 同步播放/暂停
useEffect(() => {
const audio = ensureAudio();
if (!audio) return;
if (isMusicPlaying) {
// Only play if not already playing
if (audio.paused) {
audio.play().catch(() => setIsMusicPlaying(false));
}
} else {
audio.pause();
}
// Always pause on unmount (drawer close)
return () => {
if (audio) audio.pause();
};
// eslint-disable-next-line
}, [isMusicPlaying, ensureAudio]);

// 同步曲目切换
useEffect(() => {
const audio = ensureAudio();
if (!audio) return;
// Only update src if changed
if (audio.src !== MUSIC_TRACKS[selectedTrack].url) {
audio.pause();
audio.src = MUSIC_TRACKS[selectedTrack].url;
audio.load();
}
audio.volume = 0.35;
if (isMusicPlaying) {
audio.play().catch(() => setIsMusicPlaying(false));
}
// eslint-disable-next-line
}, [selectedTrack]);

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
setStoryCompleted(false);
} else {
setIsPaused(true);
setProgress(100);
setStoryCompleted(true); // 仅在真正播放完最后一张后展示分享卡片
}
}
}, [progress, activeIndex, playlist.length, currentItem]);

// 切换 memory 时重置完成态
useEffect(() => {
setStoryCompleted(false);
}, [activeIndex, memories]);

const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
  if ('changedTouches' in e) {
    const t = e.changedTouches[0];
    return { x: t.clientX, y: t.clientY };
  }
  const m = e as React.MouseEvent;
  return { x: m.clientX, y: m.clientY };
};

const goPrev = () => {
  if (activeIndex > 0) {
    setActiveIndex((a) => a - 1);
    setProgress(0);
  }
};

const goNext = () => {
  if (activeIndex < playlist.length - 1) {
    setActiveIndex((a) => a + 1);
    setProgress(0);
  }
};

const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
  setIsPaused(true);
  swipeHandledRef.current = false;
  swipeStartRef.current = getPoint(e);
};

const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
  if (!swipeStartRef.current || swipeHandledRef.current) return;
  const { x, y } = getPoint(e);
  const dx = x - swipeStartRef.current.x;
  const dy = y - swipeStartRef.current.y;
  if (Math.abs(dx) < 15 || Math.abs(dx) < Math.abs(dy)) return;

  swipeHandledRef.current = true;
  if (dx > 0) goPrev();
  else goNext();
};

const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
  if (!swipeStartRef.current) {
    setIsPaused(false);
    return;
  }

  const start = swipeStartRef.current;
  const end = getPoint(e);
  swipeStartRef.current = null;

  if (!swipeHandledRef.current) {
    const w = (e.currentTarget as HTMLElement).clientWidth || window.innerWidth;
    if (end.x < w / 3) goPrev();
    else if (end.x > (w * 2) / 3) goNext();
  }

  setIsPaused(false);
  swipeHandledRef.current = false;
};

const handlePointerCancel = () => {
  swipeStartRef.current = null;
  swipeHandledRef.current = false;
  setIsPaused(false);
};

const handleDragEnd = (_: any, info: PanInfo) => {
if (info.offset.y > 100 || info.velocity.y > 500) onClose();
};

const loadImage = (src: string) =>
new Promise<HTMLImageElement>((resolve) => {
const img = new Image();
img.crossOrigin = 'anonymous';
img.onload = () => resolve(img);
img.onerror = () => {
// Fallback to a tiny transparent pixel so poster绘制不中断
const fallback = new Image();
fallback.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAr8B9SdPNnwAAAAASUVORK5CYII=';
fallback.onload = () => resolve(fallback);
fallback.onerror = () => resolve(fallback);
};
img.src = src;
});

const generatePoster = useCallback(async () => {
if (!currentItem) return;
const currentUrl = currentItem.photoUrl;
// Use previous photo for poster background, fallback to current if not available
const prevUrl = playlist[activeIndex - 1]?.photoUrl || currentUrl;
setPosterLoading(true);
try {
const [img1, img2] = await Promise.all([loadImage(currentUrl), loadImage(prevUrl)]);
const canvas = document.createElement('canvas');
const w = 900;
const h = 1400;
canvas.width = w;
canvas.height = h;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('no ctx');

const gradient = ctx.createLinearGradient(0, 0, 0, h);
gradient.addColorStop(0, '#0b0f1c');
gradient.addColorStop(1, '#0a0716');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, w, h);

const drawImg = (img: HTMLImageElement, x: number, y: number, bw: number, bh: number, radius = 32) => {
ctx.save();
ctx.beginPath();
ctx.moveTo(x + radius, y);
ctx.lineTo(x + bw - radius, y);
ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
ctx.lineTo(x + bw, y + bh - radius);
ctx.quadraticCurveTo(x + bw, y + bh, x + bw - radius, y + bh);
ctx.lineTo(x + radius, y + bh);
ctx.quadraticCurveTo(x, y + bh, x, y + bh - radius);
ctx.lineTo(x, y + radius);
ctx.quadraticCurveTo(x, y, x + radius, y);
ctx.closePath();
ctx.clip();

const ratio = Math.max(bw / img.width, bh / img.height);
const iw = img.width * ratio;
const ih = img.height * ratio;
const ix = x + (bw - iw) / 2;
const iy = y + (bh - ih) / 2;
ctx.drawImage(img, ix, iy, iw, ih);
ctx.restore();
};

// Draw previous photo as background (poker style: slightly rotated, under current)
drawImg(img2, 80, 120, w - 160, 520, 36); // prev / cover
ctx.save();
ctx.fillStyle = 'rgba(0,0,0,0.22)';
ctx.fillRect(80, 120, w - 160, 520);
ctx.restore();

// Draw current photo on top
drawImg(img1, 60, 380, w - 120, 620, 40);
ctx.shadowColor = 'rgba(0,0,0,0.5)';
ctx.shadowBlur = 24;
ctx.shadowOffsetY = 18;

ctx.fillStyle = 'rgba(255,255,255,0.9)';
ctx.font = 'bold 36px "Inter", "PingFang SC", "Helvetica"';
const title = currentItem.memory?.title || '回忆故事';
ctx.fillText(title, 70, 1080);

ctx.fillStyle = 'rgba(255,255,255,0.75)';
ctx.font = '24px "Inter", "PingFang SC"';
const dateText = new Date(currentItem.memory.memory_date || currentItem.memory.created_at).toLocaleDateString('zh-CN', {
year: 'numeric',
month: 'short',
day: 'numeric',
});
ctx.fillText(dateText, 70, 1130);

if (weather || mood) {
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.font = '22px "Inter", "PingFang SC"';
ctx.fillText([weather, mood].filter(Boolean).join(' · '), 70, 1170);
}

// Memory/friend/location info
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.font = '20px "Inter", "PingFang SC"';
const memCount = playlist.filter((p, idx) => idx <= activeIndex && p.memory.id === currentItem.memory.id).length;
const friendCount = currentItem.memory.friends?.length || 0;
const location = currentItem.memory.location?.name || '';
let infoY = 1200;
ctx.fillText(`本段照片: ${memCount} 张`, 70, infoY);
infoY += 32;
if (friendCount > 0) {
ctx.fillText(`好友: ${friendCount} 位`, 70, infoY);
infoY += 32;
}
if (location) {
ctx.fillText(`地点: ${location}`, 70, infoY);
infoY += 32;
}

ctx.fillStyle = '#00FFB3';
ctx.font = 'bold 22px "Inter", "PingFang SC"';
ctx.fillText('长按保存 · 微信分享', 70, infoY + 20);

// Draw QR code (bottom right) - link to the specific share page for this memory
const qrImg = new window.Image();
qrImg.crossOrigin = 'anonymous';
const shareUrl = `https://orbit.yanrong.fun/share-memory/?id=${currentItem.memory.id}`;
qrImg.onload = () => {
ctx.save();
ctx.globalAlpha = 0.95;
ctx.drawImage(qrImg, w - 180, h - 220, 120, 120);
ctx.restore();
setPendingPosterDataUrl(canvas.toDataURL('image/png'));
};
qrImg.onerror = () => setPendingPosterDataUrl(canvas.toDataURL('image/png'));
qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=1&data=${encodeURIComponent(shareUrl)}`;
} catch (e) {
console.error(e);
setPendingPosterDataUrl(null);
} finally {
setPosterLoading(false);
}
}, [activeIndex, currentItem, playlist, weather, mood]);

// 先保留上一帧 posterDataUrl，等新图生成好再替换，避免闪黑
useEffect(() => {
setPendingPosterDataUrl(null); // 触发新一轮生成
generatePoster();
// eslint-disable-next-line
}, [generatePoster]);

// 监听 pendingPosterDataUrl，生成好后再替换 posterDataUrl
useEffect(() => {
if (pendingPosterDataUrl) {
setPosterDataUrl(pendingPosterDataUrl);
}
}, [pendingPosterDataUrl]);

if (!currentItem) {
return (
<div className="flex flex-col items-center justify-center h-full text-white/70 py-20">
<div className="text-2xl mb-2">暂无可展示的回忆内容</div>
<div className="text-base">请检查数据是否已保存，或刷新页面重试。</div>
</div>
);
}

const stackedPhotos = useMemo(() => {
const list: string[] = [];
if (playlist[activeIndex]) {
// 第一张为当前，第二张为下一张（若存在）
list.push(playlist[activeIndex].photoUrl);
if (playlist[activeIndex + 1]) list.push(playlist[activeIndex + 1].photoUrl);
}
return list;
}, [playlist, activeIndex]);
const stackedExtra = Math.max(playlist.length - (activeIndex + 1), 0);

return (
<AnimatePresence>
<motion.div
key="drawer-backdrop"
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
key="drawer-panel"
initial={{ opacity: 0, scale: 0.96, y: 20 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.96, y: 20 }}
transition={{ type: 'spring', stiffness: 280, damping: 28 }}
className="fixed inset-0 z-[150] flex items-center justify-center px-4"
>
<div
className="w-[92vw] max-w-5xl h-[82vh] rounded-3xl overflow-hidden flex flex-col shadow-[0_20px_80px_rgba(0,0,0,0.45)] relative"
style={{
backgroundColor: '#05070d',
backgroundImage: `radial-gradient(at 16% 18%, rgba(120,155,255,0.22) 0, transparent 42%),
             radial-gradient(at 84% 16%, rgba(255,137,191,0.24) 0, transparent 40%),
             radial-gradient(at 50% 76%, rgba(88,255,214,0.18) 0, transparent 46%),
             linear-gradient(135deg, rgba(8,12,24,0.92), rgba(12,7,28,0.88)),
             url(${memoryFlowBackground})`,
            backgroundBlendMode: isSafari ? 'normal' : 'screen, screen, screen, normal, soft-light',
backgroundSize: '140% 140%, 140% 140%, 140% 140%, cover, cover',
backgroundPosition: 'center',
            color: 'var(--orbit-text)',
}}
>
<div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-white/35" />

<div className="absolute top-7 left-0 right-0 z-20 px-4 flex gap-1.5">
{playlist.map((item, i) => (
<div key={`${item.memory?.id || item.memory?.created_at || 'm'}-${i}`} className="h-1 flex-1 bg-white/25 rounded-full overflow-hidden">
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
className="p-2 pointer-events-auto rounded-full backdrop-blur-md border shadow-sm"
style={{
  color: 'var(--orbit-text)',
  backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 90%, rgba(255,255,255,0.9))',
  borderColor: 'color-mix(in srgb, var(--orbit-border) 40%, rgba(255,255,255,0.75))'
}}
>
<FaTimes className="text-lg" />
</button>
</div>

<div
className="flex-1 relative bg-black"
onMouseDown={handlePointerDown}
onMouseMove={handlePointerMove}
onMouseUp={handlePointerUp}
onMouseLeave={handlePointerCancel}
onTouchStart={handlePointerDown}
onTouchMove={handlePointerMove}
onTouchEnd={handlePointerUp}
onTouchCancel={handlePointerCancel}
>
<div
className="absolute inset-0"
style={{
backgroundImage: blurBgUrl ? `url(${blurBgUrl})` : undefined,
backgroundSize: 'cover',
backgroundPosition: 'center',
filter: 'blur(10px)',
transform: 'scale(1.03)',
transition: 'opacity 120ms ease-out',
opacity: blurBgUrl ? 1 : 0,
}}
/>
<div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/35 to-transparent pointer-events-none" />

{stackedPhotos.length > 0 && (
<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
<div className="relative w-[82%] max-w-[540px] h-[80%]">
{stackedPhotos.map((src, idx) => (
<div
key={`${src}-${idx}`}
className="absolute inset-6 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
style={{
transform: `rotate(${idx === 0 ? '-6deg' : '6deg'}) translate(${idx === 0 ? '-10px' : '10px'}, ${idx === 0 ? '10px' : '-10px'})`,
zIndex: idx === 0 ? 20 : 10,
boxShadow: '0 28px 48px rgba(0,0,0,0.45)',
}}
>
<img src={src} className="w-full h-full object-cover" />
<div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/55 backdrop-blur text-white text-xs font-semibold border border-white/15">
photo-{activeIndex + idx + 1}
</div>
</div>
))}
{stackedExtra > 0 && (
<div className="absolute -bottom-2 -right-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#FF5F8F] to-[#FF8F5F] text-white text-xs font-semibold shadow-lg border border-white/20">
+{stackedExtra}
</div>
)}
</div>
</div>
)}
</div>

<div className="absolute bottom-6 left-4 right-4 z-30 pointer-events-none">
<AnimatePresence mode="popLayout">
{!isPaused || currentItem.isAllLast ? (
<motion.div
key={currentItem.memory?.id || currentItem.memory?.created_at || 'meta-block'}
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0 }}
className="space-y-4"
>
{mText && <p className="text-white text-base leading-relaxed drop-shadow-lg font-medium whitespace-pre-wrap">{mText}</p>}

{currentItem.isAllLast && storyCompleted && (
<div className="bg-black/45 backdrop-blur-xl rounded-3xl p-5 border border-white/20 w-full pointer-events-auto shadow-2xl">
<div className="flex justify-between items-end mb-5">
<div>
<p className="text-white/80 text-xs mb-1">本次串联回顾</p>
<p className="text-[#00FFB3] text-sm font-bold">已看完 {playlist.length} 张照片 ✨</p>
</div>
{currentItem.memory.has_ledger && (
<div className="text-right">
<div className="flex items-center justify-end gap-1 text-[#FF9F43] mb-0.5"><FaDollarSign className="text-xs" /><span className="text-xs font-semibold">最后一笔平摊</span></div>
<p className="text-[#FF9F43] text-xl font-black font-mono">{currentItem.memory.ledger?.total_amount || '0.00'}</p>
</div>
)}
</div>
<div className="flex gap-3 flex-col sm:flex-row">
<button
onClick={onClose}
className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold text-sm border border-white/10"
>返回</button>
<button
onClick={() => {
if (onShare) {
onShare(currentItem.memory);
return;
}
// 内建兜底：生成海报并弹出预览，避免父组件未传 onShare 时按钮无反应
if (!posterDataUrl) generatePoster();
setShowPosterPreview(true);
}}
className="flex-[1.6] py-3.5 rounded-2xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-bold text-sm hover:scale-[1.02] shadow-[0_0_20px_rgba(0,255,179,0.3)]"
>
去微信分享回忆
</button>
</div>
{(
activeIndex === 0 ||
(
playlist[activeIndex].memory.id !== playlist[activeIndex - 1]?.memory.id &&
progress === 0 // 只在自动播放到新 memory 的第一张时出现，手动切换不出现
)
) && (
<div className="mt-3 flex items-center gap-3 p-3 rounded-2xl bg-white/4 border border-white/10 pointer-events-auto">
<div className="w-16 h-16 rounded-xl overflow-hidden border border-white/15 shadow-lg">
<img src={shareThumb} className="w-full h-full object-cover" />
</div>
<div className="flex-1 text-white/80 text-xs leading-snug">
<p className="font-semibold text-white/90">微信分享小贴士</p>
<p>1) 点“去微信分享回忆”生成分享数据</p>
<p>2) 保存缩略图/海报到相册，在微信选择分享</p>
<p>3) 封面默认取上一张照片，若无则当前照片</p>
</div>
<div className="hidden sm:block text-right text-[11px] text-white/60">
<p>封面图</p>
<p className="font-semibold text-white/85">下一张/当前</p>
</div>
</div>
)}
<div className="mt-3 flex flex-col sm:flex-row gap-3 pointer-events-auto">
<button
onClick={() => {
if (!posterDataUrl) generatePoster();
setShowPosterPreview(true);
}}
className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold text-sm border border-white/10 hover:border-white/30 backdrop-blur"
>
{posterLoading ? '生成海报中…' : '查看/保存分享海报'}
</button>
{/* 💥 解决长按保存的海报预览弹窗 💥 */}
<AnimatePresence>
{showPosterPreview && posterDataUrl && (
<motion.div
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
className="fixed inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-md"
onClick={() => setShowPosterPreview(false)}
>
<p className="text-white/80 text-sm font-medium mb-4 tracking-wide animate-pulse pointer-events-none">
👇 长按下方海报保存，或发送给微信好友
</p>
<img
src={posterDataUrl}
alt="分享海报"
className="w-full max-w-[320px] rounded-2xl shadow-2xl pointer-events-auto"
onClick={(e) => e.stopPropagation()}
style={{ WebkitTouchCallout: 'default' }}
/>
<button
onClick={() => setShowPosterPreview(false)}
className="mt-8 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center border border-white/20 pointer-events-auto"
>
<FaTimes />
</button>
</motion.div>
)}
</AnimatePresence>
</div>
</div>
)}
</motion.div>
) : null}
</AnimatePresence>
</div>
</div>
</motion.div>

<div className="fixed top-6 right-6 z-[220] flex items-center justify-end pointer-events-auto">
<div className="flex items-center gap-2 bg-white/80 text-[#0f172a] dark:bg-black/60 dark:text-white backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/80 dark:border-white/12 shadow-lg text-xs">
<button
onClick={handleToggleMusic}
className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
               isMusicPlaying
                 ? 'bg-[#0f9f6e]/15 border-[#0f9f6e]/70 text-[#0f9f6e] shadow-[0_0_0_1px_rgba(15,159,110,0.15)] dark:border-[#00FFB3]/60 dark:text-[#00FFB3] dark:bg-[#00ffb3]/10'
                 : 'bg-white border-white/70 text-[#0f172a] shadow-sm dark:bg-white/5 dark:border-white/25 dark:text-white'
             }`}
title={isMusicPlaying ? '暂停' : '播放'}
>
{isMusicPlaying ? <FaPause className="text-sm" /> : <FaPlay className="text-sm ml-0.5" />}
</button>
<button
onClick={handleNextTrack}
className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
title="下一首"
>
<span className="font-semibold whitespace-nowrap text-sm">{MUSIC_TRACKS[selectedTrack].label}</span>
{isMusicPlaying && (
<div className="flex items-end gap-0.5 h-4 text-[#0f9f6e] dark:text-[#00FFB3]">
{[0, 1, 2].map((b) => (
<motion.span
key={b}
className="w-1 rounded-full bg-current"
initial={{ height: '35%' }}
animate={{ height: ['35%', '90%', '45%', '75%'] }}
transition={{ duration: 1, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay: b * 0.12 }}
/>
))}
</div>
)}
</button>
</div>
</div>
</AnimatePresence>
);
};

export default MemoryStoryDrawer;