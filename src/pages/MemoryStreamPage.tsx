import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaMapMarkerAlt, FaAt, FaDollarSign, FaSpinner, FaCheckCircle, FaCalendarAlt, FaCamera, FaChevronRight, FaImages, FaHeart, FaQuoteLeft, FaSearch, FaCheck, FaPlus, FaEdit, FaTrash, FaComment, FaMicrophone, FaShareAlt, FaBookOpen, FaPause, FaPlay, FaStepBackward, FaStepForward, FaLock, FaCity, FaEllipsisH } from 'react-icons/fa';
import { FaChevronDown as ChevronDownIcon } from 'react-icons/fa';
import { useMemoryStore, useUserStore, useLedgerStore } from '../store';
import { useAppStore } from '../store/app';
import { MemoryStreamDraft, useUIStore } from '../store/ui';
import { supabase, createMemory, createLocation, createLedger, updateLedger, deleteLedger, getLedgerByMemory, getMemoryComments, addMemoryComment, deleteMemoryComment, checkSessionIsHealthy, getSessionFromStorage } from '../api/supabase';
import MediaUploader, { VoiceRecorder } from '../components/MediaUploader';
import { MemoryStoryEntry, MemoryStoryDrawer } from './MemoryStreamPage/components/SharedMemoryAlbumBookFixed';
import MemoryDetailModal from './MemoryStreamPage/components/MemoryDetailModal';
import ReportPage from '../components/ReportPage';
import PullToRefresh from '../components/PullToRefresh';
import { track } from '../utils/analytics';
import { readSettings, SETTINGS_EVENT, shouldAllowRefresh } from '../utils/settings';
import { getTaggedDisplayName, getVisibleTaggedFriendIds } from '../utils/tagVisibility';
import { useScrollLock } from '../hooks/useScrollLock';
// Deduplicates concurrent refreshSessionQuick calls — both comments-subscribe and
// fetch-comments can fire within the same tick after wake; sharing one Promise
// halves the auth load on the just-recovered network.
let _refreshQuickInFlight: Promise<boolean> | null = null;

/** ms since last app foreground; used to relax timeouts right after wake */
function msSinceForeground(): number | null {
  if (typeof window === 'undefined') return null;
  const fg = (window as any).__orbit_foreground_at as number | undefined;
  if (!fg) return null;
  return Date.now() - fg;
}

function memoryStreamGetSessionRaceMs(): number {
  const ago = msSinceForeground();
  return ago != null && ago < 120_000 ? 5500 : 2000;
}

function memoryStreamRefreshSessionRaceMs(): number {
  const ago = msSinceForeground();
  return ago != null && ago < 120_000 ? 8000 : 5000;
}

function memoryStreamFetchBatchRaceMs(): number {
  const ago = msSinceForeground();
  return ago != null && ago < 120_000 ? 45_000 : 30_000;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

interface LocationPoi {
  id: string;
  name: string;
  address: string;
  location: string; // "lng,lat"
  type: string;
}

interface MemoryCommentItem {
  id: string;
  memory_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

interface MemoryReactionState {
  liked: boolean;
  likes: number;
  roastOpen: boolean;
  likers: string[];
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
  audioUrl?: string
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

const encodeSharePayload = (payload: Record<string, any>) => {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

// 格式化日期分组
const formatDateGroup = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return '今天';
  } else if (isYesterday) {
    return '昨天';
  } else {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.getDay()];

    if (year === today.getFullYear()) {
      return `${month}月${day}日 ${weekday}`;
    }
    return `${year}年${month}月${day}日 ${weekday}`;
  }
};

// 格式化时间
const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const WEATHER_OPTIONS = [
  { emoji: '\u2600\uFE0F', label: '晴天' },      // ☀️
  { emoji: '\u26C5', label: '多云' },            // ⛅
  { emoji: '\uD83C\uDF27\uFE0F', label: '下雨' }, // 🌧️
  { emoji: '\u2744\uFE0F', label: '下雪' },      // ❄️
  { emoji: '\uD83C\uDF08', label: '彩虹' },      // 🌈
  { emoji: '\uD83C\uDF2A\uFE0F', label: '大风' }, // 🌪️
  { emoji: '\uD83C\uDF2B\uFE0F', label: '大雾' }, // 🌫️
  { emoji: '\u26C8\uFE0F', label: '雷雨' },      // ⛈️
];

export const MOOD_OPTIONS = [
  { emoji: '\uD83D\uDE0A', label: '开心' }, // 😊
  { emoji: '\uD83D\uDE0D', label: '幸福' }, // 😍
  { emoji: '\uD83E\uDD70', label: '甜蜜' }, // 🥰
  { emoji: '\uD83D\uDE0E', label: '酷' },   // 😎
  { emoji: '\uD83E\uDD7A', label: '感动' }, // 🥺
  { emoji: '\uD83D\uDE22', label: '落泪' }, // 😢
  { emoji: '\uD83D\uDE24', label: '疲惫' }, // 😤
  { emoji: '\uD83E\uDD29', label: '超棒' }, // 🤩
  { emoji: '\uD83E\uDD14', label: '迷茫' }, // 🤔
  { emoji: '\uD83D\uDE34', label: '困了' }, // 😴
];

const META_PREFIX = '[orbit_meta:';
const normalizeMetaList = (value: string | string[] | null | undefined) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

const encodeMemoryContent = (text: string, meta: { weather: string[]; mood: string[]; route: string }) => {
  const weather = normalizeMetaList(meta.weather);
  const mood = normalizeMetaList(meta.mood);
  const route = meta.route || '';
  if (!weather.length && !mood.length && !route) return text;
  return `${META_PREFIX}${JSON.stringify({ weather, mood, route })}]\n${text}`;
};

const decodeMemoryContent = (content: string): { text: string; weather: string[]; mood: string[]; route: string } => {
  if (!content?.startsWith(META_PREFIX)) return { text: content || '', weather: [], mood: [], route: '' };
  const end = content.indexOf(']\n');
  if (end === -1) return { text: content, weather: [], mood: [], route: '' };
  try {
    const meta = JSON.parse(content.slice(META_PREFIX.length, end));
    return {
      text: content.slice(end + 2),
      weather: normalizeMetaList(meta.weather),
      mood: normalizeMetaList(meta.mood),
      route: meta.route || ''
    };
  } catch {
    return { text: content, weather: [], mood: [], route: '' };
  }
};

// 按日期分组记忆
const groupMemoriesByDate = (memories: any[], order: 'asc' | 'desc' = 'desc') => {
  const groups: { [key: string]: any[] } = {};

  const sortedMemories = [...memories].sort((a, b) => {
    const dateA = new Date(a.memory_date || a.created_at).getTime();
    const dateB = new Date(b.memory_date || b.created_at).getTime();
    if (Number.isNaN(dateA) || Number.isNaN(dateB)) return 0;
    return order === 'desc' ? dateB - dateA : dateA - dateB;
  });

  sortedMemories.forEach(memory => {
    const date = memory.memory_date || memory.created_at;
    const dateKey = date.split('T')[0];

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(memory);
  });

  return Object.entries(groups).map(([date, items]) => ({
    date,
    displayDate: formatDateGroup(date),
    memories: items,
  }));
};

// 提取城市名
const getCityFromMemory = (memory: any): string => {
  const addr = memory.location?.address || '';
  const name = memory.location?.name || '';
  // 尝试从地址提取市级地名
  const cityMatch = addr.match(/([\u4e00-\u9fa5]{2,8}(?:市|州))/);
  if (cityMatch) return cityMatch[1];
  // 尝试从地名提取
  const nameMatch = name.match(/([\u4e00-\u9fa5]{2,6}(?:市|州))/);
  if (nameMatch) return nameMatch[1];
  if (memory.location?.name) return memory.location.name.slice(0, 4) + '附近';
  return '未知地点';
};

const groupMemoriesByCity = (memories: any[]) => {
  const groups: Record<string, any[]> = {};
  memories.forEach(m => {
    const city = getCityFromMemory(m);
    if (!groups[city]) groups[city] = [];
    groups[city].push(m);
  });
  return Object.entries(groups)
    .map(([city, items]) => ({ city, memories: items }))
    .sort((a, b) => {
      const la = new Date(a.memories[0].memory_date || a.memories[0].created_at).getTime();
      const lb = new Date(b.memories[0].memory_date || b.memories[0].created_at).getTime();
      return lb - la;
    });
};

const getLocalDateTimeValue = (dateInput?: string) => {
  if (dateInput) {
    const d = new Date(dateInput);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const toLocalIsoWithOffset = (value: string) => {
  if (!value) return new Date().toISOString();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${hh}:${mm}`;
};

const searchMapbox = async (keyword: string): Promise<LocationPoi[]> => {
  if (!MAPBOX_TOKEN) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(keyword)}.json?language=zh&limit=10&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.features) return [];
    return data.features.map((f: any) => ({
      id: f.id,
      name: f.text_zh || f.text || keyword,
      address: f.place_name_zh || f.place_name || '',
      location: `${f.center?.[0]},${f.center?.[1]}`,
      type: f.place_type?.join(',') || '',
    })) as LocationPoi[];
  } catch {
    return [];
  }
};

const reverseMapbox = async (lat: number, lng: number): Promise<LocationPoi | null> => {
  if (!MAPBOX_TOKEN) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?language=zh&limit=1&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data?.features?.[0];
    if (!f) return null;
    return {
      id: `gps-${Date.now()}`,
      name: f.text_zh || f.text || '我的位置',
      address: f.place_name_zh || f.place_name || '',
      location: `${lng},${lat}`,
      type: f.place_type?.join(',') || '',
    } as LocationPoi;
  } catch {
    return null;
  }
};

const searchNominatim = async (keyword: string) => {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=10&addressdetails=1&q=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6' },
  });
  if (!res.ok) return [] as LocationPoi[];
  const data = (await res.json()) as any[];
  return data.map((item) => {
    const display = item.display_name || '';
    const name = display.split(',')[0] || item.name || '未知地点';
    return {
      id: item.place_id?.toString() || `osm-${item.osm_id}`,
      name,
      address: display,
      location: `${item.lon},${item.lat}`,
      type: item.type || '',
    } as LocationPoi;
  });
};

const reverseNominatim = async (lat: number, lng: number) => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const display = data?.display_name || '';
  const name = display.split(',')[0] || '我的位置';
  return {
    id: `gps-${Date.now()}`,
    name,
    address: display,
    location: `${lng},${lat}`,
    type: data?.type || '',
  } as LocationPoi;
};

// 地点搜索组件
const LocationSearch = ({ value, onChange, onSelect }: { value: string; onChange: (val: string) => void; onSelect: (poi: LocationPoi) => void; }) => {
  const [results, setResults] = useState<LocationPoi[]>([]);
  const [city, setCity] = useState('');
  const [needCityHint, setNeedCityHint] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchLocation = async (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    if (!city.trim()) {
      setNeedCityHint(true);
      setResults([]);
      setShowResults(true);
      setSearching(false);
      return;
    }

    setSearching(true);
    const query = `${city} ${trimmed}`.trim();

    try {
      const pois = await searchMapbox(query);
      if (pois.length > 0) {
        setResults(pois);
        setSearching(false);
        return;
      }
    } catch { /* fallback below */ }

    try {
      const pois = await searchNominatim(query);
      setResults(pois);
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        searchLocation(value);
        setShowResults(true);
      }, 500);
    } else {
      setResults([]);
      setShowResults(false);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, city]);

  const handleSelect = (poi: LocationPoi) => {
    onChange(poi.name);
    onSelect(poi);
    setShowResults(false);
  };

  const handleGPS = () => {
    if (!navigator.geolocation) { alert('浏览器不支持定位'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;

        try {
          const poi = await reverseMapbox(lat, lng);
          if (poi) { onChange(poi.name); onSelect(poi); return; }
        } catch { /* fallback below */ }

        try {
          const poi = await reverseNominatim(lat, lng);
          if (poi) { onChange(poi.name); onSelect(poi); return; }
        } catch { /* fallback below */ }

        const fallbackPoi: LocationPoi = {
          id: `gps-${Date.now()}`,
          name: '我的位置',
          address: `${lat.toFixed(5)},${lng.toFixed(5)}`,
          location: `${lng},${lat}`,
          type: '',
        };
        onChange(fallbackPoi.name);
        onSelect(fallbackPoi);
      },
      () => { setLocating(false); alert('定位失败，请检查定位权限'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-[#00FFB3]/10">
            <FaMapMarkerAlt className="text-[#00FFB3]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs mb-1" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>城市</p>
            <input
              type="text"
              placeholder="先选城市（例：上海 / Edinburgh）"
              value={city}
              onChange={(e) => { setCity(e.target.value); setNeedCityHint(false); }}
              className="w-full bg-transparent outline-none placeholder:opacity-60"
              style={{ color: 'var(--orbit-text)', caretColor: 'var(--orbit-text)' }}
            />
          </div>
          {city && (
            <button
              type="button"
              onClick={() => { setCity(''); setResults([]); setShowResults(false); }}
              className="p-2 text-[color:var(--orbit-text-muted,#9ca3af)] hover:text-[color:var(--orbit-text)]"
            >
              <FaTimes />
            </button>
          )}
        </div>
        {needCityHint && (
          <p className="mt-2 text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>先选城市，再搜具体地点</p>
        )}
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 p-3 rounded-xl border" style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}>
          <div className="p-2 rounded-full bg-[#00FFB3]/10">
            <FaSearch className="text-[#00FFB3]" />
          </div>
          <input
            type="text"
            placeholder="搜索地点（如：星巴克、外滩）"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => value.trim() && setShowResults(true)}
            className="flex-1 bg-transparent outline-none min-w-0 placeholder:opacity-60"
            style={{ color: 'var(--orbit-text)', caretColor: 'var(--orbit-text)' }}
          />
          {searching && <FaSpinner className="animate-spin shrink-0" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }} />}
          <button
            type="button"
            onClick={handleGPS}
            title="用我的位置"
            className="shrink-0 p-2 rounded-full bg-[#00FFB3]/10 hover:bg-[#00FFB3]/20 text-[#00FFB3] transition-colors"
          >
            {locating ? <FaSpinner className="animate-spin text-xs" /> : <span className="text-xs">📍</span>}
          </button>
        </div>

        {showResults && results.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-xl border z-10"
            style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
          >
            {results.map((poi) => (
              <button
                key={poi.id}
                onClick={() => handleSelect(poi)}
                className="w-full p-3 text-left hover:bg-white/5 border-b last:border-0"
                style={{ borderColor: 'var(--orbit-border)' }}
              >
                <div className="font-medium" style={{ color: 'var(--orbit-text)' }}>{poi.name}</div>
                <div className="text-sm truncate" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{poi.address || '暂无地址信息'}</div>
              </button>
            ))}
          </div>
        )}

        {showResults && !searching && value.trim() && results.length === 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-2 p-4 rounded-xl border z-10 text-center"
            style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{needCityHint ? '请先选择城市，再搜索具体地点' : '未找到相关地点'}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 好友选择组件
const FriendSelector = ({
  selectedFriends,
  onToggle,
  friends,
}: {
  selectedFriends: string[];
  onToggle: (friendId: string) => void;
  friends: any[];
}) => {
  if (friends.length === 0) {
    return (
      <div className="p-4 rounded-xl border text-center" style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}>
        <p className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>还没有好友</p>
        <p className="text-xs mt-1" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>去主页添加好友吧</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm mb-2" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>选择一起的人</div>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          touchAction: 'pan-x',
        }}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {friends.map((friendship: any) => {
          const friend = friendship.friend;
          const isVirtual = friend.id?.startsWith('temp-');
          const isSelected = selectedFriends.includes(friend.id);

          return (
            <motion.div
              key={friend.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onToggle(friend.id)}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border transition-all cursor-pointer ${isSelected
                ? 'bg-[#00FFB3]/20 border-[#00FFB3] text-[#00FFB3]'
                : 'bg-[color:var(--orbit-card)] border-[color:var(--orbit-border)] text-[color:var(--orbit-text-muted,#9ca3af)]'
                }`}
            >
              <img
                src={friend.avatar_url}
                alt={friend.username}
                className="w-5 h-5 rounded-full"
              />
              <span className="text-sm">{friend.username}</span>
              {isVirtual && !isSelected && <span className="text-[10px] opacity-40">待绑定</span>}
              {isSelected && <FaCheck className="text-xs" />}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// 创建记忆弹窗
// ── 账单相关类型 & 组件 ──────────────────────────────────────────
interface LedgerItem {
  id: string;
  category: string;
  note: string;
  amount: string;
}

const CATEGORIES = ['🍜 饮食', '🏨 住宿', '🚗 交通', '🎢 娱乐', '🛍️ 购物', '💊 其他'];

function CalcPad({
  expr, onChange, onConfirm,
}: { expr: string; onChange: (v: string) => void; onConfirm: (v: string) => void }) {
  const evaluate = (e: string): string | null => {
    try {
      const safe = e.replace(/×/g, '*').replace(/÷/g, '/');
      // eslint-disable-next-line no-new-func
      const fn = new Function('"use strict"; return (' + safe + ')');
      const result = fn();
      if (typeof result === 'number' && isFinite(result) && result >= 0)
        return parseFloat(result.toFixed(2)).toString();
      return null;
    } catch { return null; }
  };
  const press = (btn: string) => {
    if (btn === 'C') { onChange(''); return; }
    if (btn === '←') { onChange(expr.slice(0, -1)); return; }
    if (btn === '=') { const r = evaluate(expr); if (r !== null) onConfirm(r); return; }
    onChange(expr + btn);
  };
  const BTN_ROWS = [
    ['7', '8', '9', '÷'],
    ['4', '5', '6', '×'],
    ['1', '2', '3', '-'],
    ['C', '0', '.', '+'],
  ];
  return (
    <div className="rounded-2xl p-3 space-y-2 border" style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}>
      <div className="text-right px-2 py-1 font-mono text-xl min-h-[2.5rem] tracking-wide" style={{ color: 'var(--orbit-text)' }}>{expr || '0'}</div>
      {BTN_ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-4 gap-1.5">
          {row.map(btn => (
            <button key={btn} type="button" onClick={() => press(btn)}
              className={`py-3 rounded-xl text-sm font-semibold active:scale-95 transition-all ${['÷', '×', '-', '+'].includes(btn) ? 'bg-[#FF9F43]/15 text-[#FF9F43] border border-[#FF9F43]/30' :
                btn === 'C' ? 'bg-red-500/10 text-red-500' :
                  btn === '←' ? 'bg-[color:var(--orbit-card)] text-[color:var(--orbit-text-muted,#9ca3af)] border border-[color:var(--orbit-border)]' :
                    'bg-[color:var(--orbit-card)] text-[color:var(--orbit-text)] border border-[color:var(--orbit-border)] hover:bg-[color-mix(in_srgb,var(--orbit-card)_90%,transparent)]'}`}>{btn}</button>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => { const r = evaluate(expr); if (r !== null) onConfirm(r); }}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] font-bold"
        style={{ color: 'var(--orbit-text)' }}>= 确认</button>
    </div>
  );
}

// 发布/编辑 记忆的通用弹窗 (双模超体版)
// 发布/编辑 记忆的通用弹窗 (修复闭合版)
const CreateMemoryModal = ({
  isOpen,
  onClose,
  onSuccess,
  friends,
  editData,
  initialDraft,
  onDraftChange,
  onClearDraft,
  refreshSessionQuick,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  friends: any[];
  editData?: any;
  initialDraft?: MemoryStreamDraft | null;
  onDraftChange?: (draft: MemoryStreamDraft) => void;
  onClearDraft?: () => void;
  refreshSessionQuick: (label: string) => Promise<boolean>;
}) => {
  const { currentUser } = useUserStore();
  const isEditMode = !!editData;

  // 解析已有记忆的元数据（编辑模式）
  const existingMeta = useMemo(() => decodeMemoryContent(editData?.content || ''), [editData?.content]);

  // 1. 状态定义
  const [content, setContent] = useState(isEditMode ? (existingMeta.text || '') : (initialDraft?.content || ''));
  const [weather, setWeather] = useState<string[]>(
    isEditMode ? normalizeMetaList(existingMeta.weather) : normalizeMetaList(initialDraft?.weather)
  );
  const [mood, setMood] = useState<string[]>(
    isEditMode ? normalizeMetaList(existingMeta.mood) : normalizeMetaList(initialDraft?.mood)
  );
  const [route, setRoute] = useState(isEditMode ? existingMeta.route : (initialDraft?.route || ''));
  const [locationName, setLocationName] = useState(isEditMode ? (editData?.location?.name || '') : (initialDraft?.locationName || ''));
  const [selectedLocation, setSelectedLocation] = useState<LocationPoi | null>(
    isEditMode
      ? (editData?.location ? {
        id: editData.location.id,
        name: editData.location.name,
        address: editData.location.address,
        location: `${editData.location.lng},${editData.location.lat}`,
        type: ''
      } : null)
      : (initialDraft?.selectedLocation || null)
  );
  const [selectedFriends, setSelectedFriends] = useState<string[]>(
    isEditMode
      ? (editData?.tagged_friends || []).filter((id: string) => {
        if (id.startsWith('temp-')) {
          const fid = id.replace('temp-', '');
          return friends.some((f: any) => f.id === fid);
        }
        return friends.some((f: any) => f.friend?.id === id);
      })
      : (initialDraft?.selectedFriends || [])
  );
  const [photos, setPhotos] = useState<string[]>(isEditMode ? (editData?.photos || []) : (initialDraft?.photos || []));
  const [videos, setVideos] = useState<string[]>(isEditMode ? (editData?.videos || []) : (initialDraft?.videos || []));
  const [audios, setAudios] = useState<string[]>(isEditMode ? (editData?.audios || []) : (initialDraft?.audios || []));
  const [enableLedger, setEnableLedger] = useState(isEditMode ? (editData?.has_ledger || false) : (initialDraft?.enableLedger || false));
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([{ id: '1', category: '🍜 饮食', note: '', amount: '' }]);
  const [splitType, setSplitType] = useState<'personal' | 'equal'>(isEditMode ? 'personal' : (initialDraft?.splitType || 'personal'));
  const [existingLedgerId, setExistingLedgerId] = useState<string | null>(null);
  const [activeCalcId, setActiveCalcId] = useState<string | null>(null);
  const ledgerPrefilledRef = useRef(false);

  const [memoryDate, setMemoryDate] = useState(() =>
    isEditMode
      ? getLocalDateTimeValue(editData?.memory_date || editData?.created_at)
      : (initialDraft?.memoryDate || getLocalDateTimeValue())
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const hasContent = content.trim().length > 0 || photos.length > 0 || videos.length > 0 || audios.length > 0;

  const handleCancel = () => {
    if (isEditMode) { onClose(); return; }
    if (!hasContent) { onClearDraft?.(); onClose(); return; }
    setShowCancelConfirm(true);
  };

  useEffect(() => {
    if (!isEditMode) {
      setEnableLedger(initialDraft?.enableLedger || false);
      setLedgerItems([{ id: '1', category: '🍜 饮食', note: '', amount: '' }]);
      setSplitType(initialDraft?.splitType || 'personal');
      setExistingLedgerId(null);
      ledgerPrefilledRef.current = true;
      return;
    }
    setEnableLedger(!!editData?.has_ledger);
    setLedgerItems([{ id: '1', category: '🍜 饮食', note: '', amount: '' }]);
    setSplitType('personal');
    setExistingLedgerId(null);
    ledgerPrefilledRef.current = false;
  }, [isEditMode, editData?.id]);

  useEffect(() => {
    if (isEditMode || !onDraftChange) return;
    onDraftChange({
      content,
      weather,
      mood,
      route,
      locationName,
      selectedLocation,
      selectedFriends,
      photos,
      videos,
      audios,
      enableLedger,
      splitType,
      memoryDate,
    });
  }, [
    isEditMode,
    onDraftChange,
    content,
    weather,
    mood,
    route,
    locationName,
    selectedLocation,
    selectedFriends,
    photos,
    videos,
    audios,
    enableLedger,
    splitType,
    memoryDate,
  ]);

  useEffect(() => {
    if (!isEditMode || !isOpen || !currentUser?.id || !editData?.id || ledgerPrefilledRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const ledger = await getLedgerByMemory(editData.id, currentUser.id);
        if (cancelled) return;
        if (ledger) {
          setEnableLedger(true);
          setExistingLedgerId(ledger.id);
          const expenseType = (ledger as any)?.expense_type === 'shared' ? 'equal' : 'personal';
          const ledgerAmount = String(((ledger as any)?.total_amount || 0));
          setSplitType(expenseType);
          setLedgerItems([{ id: '1', category: '🍜 饮食', note: '', amount: ledgerAmount }]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[CreateMemoryModal] 加载顺便记账失败:', error);
        }
      } finally {
        if (!cancelled) ledgerPrefilledRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [isEditMode, isOpen, currentUser?.id, editData?.id]);

  const totalAmount = ledgerItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const addLedgerItem = () => setLedgerItems(prev => [...prev, { id: Date.now().toString(), category: '💊 其他', note: '', amount: '' }]);
  const removeLedgerItem = (id: string) => setLedgerItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);
  const updateLedgerItem = (id: string, field: keyof LedgerItem, value: string) => setLedgerItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  const modalTopOffset = 'clamp(48px, calc(env(safe-area-inset-top, 0px) + 72px), 160px)';

  // 2. 逻辑处理
  const toggleFriend = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]
    );
  };

  const toggleWeather = (emoji: string) => {
    setWeather(prev => prev.includes(emoji) ? prev.filter(e => e !== emoji) : [...prev, emoji]);
  };

  const toggleMood = (emoji: string) => {
    setMood(prev => prev.includes(emoji) ? prev.filter(e => e !== emoji) : [...prev, emoji]);
  };

  const handleLocationSelect = (poi: LocationPoi) => {
    setSelectedLocation(poi);
  };

  // Pre-warm session as soon as the modal opens so the "publish" button
  // doesn't need to wait for a network round-trip.
  useEffect(() => {
    if (isOpen) {
      refreshSessionQuick('modal-open');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const hasContent = content.trim().length > 0 || audios.length > 0 || photos.length > 0 || videos.length > 0;
    if (!currentUser || !hasContent) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('当前离线，无法发布/保存。请联网后重试。');
      return;
    }
    if (!memoryDate || Number.isNaN(new Date(memoryDate).getTime())) {
      alert('请选择有效的时间');
      return;
    }
    const ok = await refreshSessionQuick('handleSubmit');
    if (!ok) {
      alert('登录状态需要刷新，请稍后重试或点击底部“重新连接”。');
      return;
    }
    setIsSubmitting(true);
    setEditError(null);

    try {
      let locationId = editData?.location_id;
      if (selectedLocation && selectedLocation.name !== editData?.location?.name) {
        const [lng, lat] = selectedLocation.location.split(',').map(Number);
        const locationData = await createLocation(
          selectedLocation.name, lat, lng, selectedLocation.address, undefined, currentUser.id
        );
        locationId = locationData.id;
      }

      // 编码天气/心情/路线元数据
      const finalContent = encodeMemoryContent(content.trim(), { weather, mood, route });

      const realFriendIds = selectedFriends.filter(id => !id.startsWith('temp-'));
      const isShared = splitType === 'equal' && realFriendIds.length > 0;
      const participants = isShared
        ? [currentUser.id, ...realFriendIds].map(uid => ({ userId: uid, amount: parseFloat((totalAmount / (realFriendIds.length + 1)).toFixed(2)) }))
        : [{ userId: currentUser.id, amount: totalAmount }];
      const expenseType = isShared ? 'shared' : 'personal';

      if (isEditMode) {
        if (enableLedger && totalAmount === 0) {
          alert('已开启顺便记账，请先输入金额');
          setIsSubmitting(false);
          return;
        }

        await useMemoryStore.getState().editMemory(editData.id, {
          content: finalContent,
          memory_date: toLocalIsoWithOffset(memoryDate),
          location_id: locationId,
          location: selectedLocation ? { name: selectedLocation.name, address: selectedLocation.address } : editData.location,
          photos: photos,
          videos: videos,
          audios: audios,
          tagged_friends: selectedFriends,
          has_ledger: enableLedger,
          ledger: enableLedger ? { total_amount: totalAmount } : null
        });

        if (enableLedger && totalAmount > 0) {
          if (existingLedgerId) {
            await updateLedger(existingLedgerId, currentUser.id, totalAmount, participants, editData.id, expenseType);
          } else {
            const ledger = await createLedger(currentUser.id, totalAmount, participants, editData.id, expenseType);
            setExistingLedgerId(ledger.id);
          }
          await useLedgerStore.getState().fetchLedgers();
        } else if (!enableLedger && existingLedgerId) {
          await deleteLedger(existingLedgerId);
          setExistingLedgerId(null);
          await useLedgerStore.getState().fetchLedgers();
        }

        await useMemoryStore.getState().fetchMemories();
        track('memory_save_success', { mode: 'edit' });
        onSuccess();
        onClose();
        return;
      } else {
        // 新建模式
        // 如果开启记账但未填金额，提示用户
        if (enableLedger && totalAmount === 0) {
          alert('已开启顺便记账，请先输入金额');
          setIsSubmitting(false);
          return;
        }
        const memory = await createMemory(
          currentUser.id, finalContent, toLocalIsoWithOffset(memoryDate), locationId, photos, selectedFriends, videos, audios, enableLedger
        );
        if (enableLedger && totalAmount > 0) {
          await createLedger(currentUser.id, totalAmount, participants, memory.id, expenseType);
          // 同步刷新账单列表
          await useLedgerStore.getState().fetchLedgers();
        }
        useMemoryStore.getState().addMemory({
          ...memory,
          tagged_friends: memory.tagged_friends || selectedFriends,
          location: memory.location || (selectedLocation
            ? {
              id: locationId,
              name: selectedLocation.name,
              address: selectedLocation.address,
              lng: Number(selectedLocation.location.split(',')[0]),
              lat: Number(selectedLocation.location.split(',')[1]),
            }
            : null),
          has_ledger: enableLedger,
          ledger: enableLedger ? { total_amount: totalAmount } : null,
          is_owner: true,
        } as any);
        void useMemoryStore.getState().fetchMemories();
        onClearDraft?.();
        track('memory_save_success', { mode: 'create' });
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('操作失败:', error);
      const msg = (error as any)?.message || '请重试';
      alert(`发布失败：${msg}`);
      if (isEditMode) {
        setEditError(`保存失败，已回滚到原数据：${msg}`);
      }
      track('memory_save_failed', { mode: isEditMode ? 'edit' : 'create', reason: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // 3. UI 渲染 (注意这里的闭合结构)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 overflow-y-auto rounded-t-3xl pb-24 shadow-2xl"
        style={{
          background: 'var(--orbit-surface)',
          color: 'var(--orbit-text)',
          borderTop: '1px solid var(--orbit-border)',
          top: modalTopOffset,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="sticky top-0 flex items-center justify-between px-4 py-4 z-20"
          style={{ background: 'var(--orbit-surface)', borderBottom: '1px solid var(--orbit-border)', color: 'var(--orbit-text)' }}
        >
          <button onClick={handleCancel} style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>取消</button>
          <span className="font-semibold" style={{ color: 'var(--orbit-text)' }}>{isEditMode ? '编辑回忆' : '记录此刻'}</span>
          <button
            data-tour-id="memory-submit"
            onClick={handleSubmit}
            disabled={(!content.trim() && audios.length === 0 && photos.length === 0 && videos.length === 0) || isSubmitting}
            className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-white font-semibold disabled:opacity-30 shadow"
          >
            {isSubmitting ? <FaSpinner className="animate-spin" /> : (isEditMode ? '保存修改' : '发布')}
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-4 space-y-6">
          {editError && (
            <div className="rounded-2xl border px-4 py-3 text-sm"
              style={{ background: 'rgba(255, 59, 48, 0.08)', borderColor: 'rgba(255, 59, 48, 0.25)', color: '#b71c1c' }}
            >
              {editError}
            </div>
          )}
          <div className="flex items-center gap-3 p-3 rounded-xl shadow-sm border"
            style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
          >
            <div className="p-2 rounded-full" style={{ background: 'rgba(0, 217, 255, 0.12)', color: '#008fb3' }}><FaCalendarAlt /></div>
            <input type="datetime-local" value={memoryDate} onChange={(e) => setMemoryDate(e.target.value)} className="flex-1 bg-transparent outline-none" style={{ color: 'var(--orbit-text)' }} />
          </div>

          <div className="relative z-10">
            <LocationSearch value={locationName} onChange={setLocationName} onSelect={handleLocationSelect} />
          </div>

          {/* 天气选择 */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--orbit-text-muted, #6b7280)' }}>那天天气</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {WEATHER_OPTIONS.map((w) => (
                <button
                  key={w.emoji}
                  type="button"
                  onClick={() => toggleWeather(w.emoji)}
                  className="shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all"
                  style={weather.includes(w.emoji)
                    ? { background: 'color-mix(in srgb, #00D9FF 18%, transparent)', borderColor: 'color-mix(in srgb, #00D9FF 38%, transparent)', color: '#0ea5e9' }
                    : { background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                >
                  <span className="text-xl">{w.emoji}</span>
                  <span className="text-[10px]" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 心情选择 */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--orbit-text-muted, #6b7280)' }}>那天心情</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.emoji}
                  type="button"
                  onClick={() => toggleMood(m.emoji)}
                  className="shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all"
                  style={mood.includes(m.emoji)
                    ? { background: 'color-mix(in srgb, #10B981 18%, transparent)', borderColor: 'color-mix(in srgb, #10B981 38%, transparent)', color: '#059669' }
                    : { background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className="text-[10px]" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 行程路线 */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--orbit-text-muted, #6b7280)' }}>行程路线 <span className="text-gray-400">（用 → 分隔地点，如：酒店 → 故宫 → 烤鸭店）</span></p>
            <input
              type="text"
              placeholder="例：机场 → 酒店 → 景点 → 餐厅"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none border"
              style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
            />
          </div>

          {/* 内容输入：文字 + 语音 */}
          <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}>
            <textarea
              data-tour-id="memory-editor"
              placeholder="写点什么..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-transparent outline-none resize-none text-lg px-4 pt-4 pb-2"
              style={{ color: 'var(--orbit-text)' }}
            />
            <div className="px-4 py-3" style={{ borderTop: `1px solid var(--orbit-border)` }}>
              <VoiceRecorder
                userId={currentUser?.id || ''}
                audios={audios}
                onAudiosChange={setAudios}
                compact
              />
            </div>
          </div>

          <FriendSelector selectedFriends={selectedFriends} onToggle={toggleFriend} friends={friends} />

          <MediaUploader userId={currentUser?.id || ''} photos={photos} videos={videos} onPhotosChange={setPhotos} onVideosChange={setVideos} />

          <div className="flex items-center justify-between py-4 border-t" style={{ borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full" style={{ background: 'rgba(255, 159, 67, 0.12)', color: '#fbbf24' }}><FaDollarSign /></div>
              <span style={{ color: 'var(--orbit-text)' }}>顺便记账</span>
            </div>
            <button onClick={() => setEnableLedger(!enableLedger)} className="w-12 h-6 rounded-full transition-colors" style={{ backgroundColor: enableLedger ? '#FF9F43' : 'var(--orbit-border)' }}>
              <motion.div animate={{ x: enableLedger ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
            </button>
          </div>

          {enableLedger && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {/* 个人 / 均分 */}
              <div className="flex gap-1 p-1 rounded-xl border" style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}>
                {(['personal', 'equal'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setSplitType(t)}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${splitType === t ? 'bg-[#FF9F43]' : ''}`}
                    style={splitType === t
                      ? { color: '#0f172a' }
                      : { color: 'var(--orbit-text)', background: 'var(--orbit-card)' }}>
                    {t === 'personal' ? '👤 个人' : '👥 均分'}
                  </button>
                ))}
              </div>

              {/* 消费项目列表 */}
              {ledgerItems.map((item) => (
                <div key={item.id} className="rounded-2xl border p-3 space-y-2 shadow-sm" style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}>
                  {/* 类别 + 删除 */}
                  <div className="flex items-center gap-1">
                    <div className="flex gap-1 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
                      {CATEGORIES.map(cat => (
                        <button key={cat} type="button" onClick={() => updateLedgerItem(item.id, 'category', cat)}
                          className="shrink-0 px-2 py-1 rounded-lg text-xs transition-all border"
                          style={item.category === cat
                            ? { background: 'color-mix(in srgb, #FF9F43 16%, transparent)', borderColor: 'color-mix(in srgb, #FF9F43 35%, transparent)', color: '#c2410c' }
                            : { background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text-muted, #9ca3af)' }}
                        >{cat}</button>
                      ))}
                    </div>
                    {ledgerItems.length > 1 && (
                      <button type="button" onClick={() => removeLedgerItem(item.id)}
                        className="shrink-0 p-1.5 transition-colors" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                        <FaTimes className="text-xs" />
                      </button>
                    )}
                  </div>
                  {/* 备注 + 金额按钮 */}
                  <div className="flex gap-2">
                    <input type="text" placeholder="备注（选填）" value={item.note}
                      onChange={e => updateLedgerItem(item.id, 'note', e.target.value)}
                      className="flex-1 rounded-xl px-3 py-2 text-sm outline-none border"
                      style={{ background: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }} />
                    <button type="button"
                      onClick={() => setActiveCalcId(activeCalcId === item.id ? null : item.id)}
                      className="shrink-0 min-w-[90px] flex items-center justify-end px-3 py-2 rounded-xl border font-mono font-bold text-sm"
                      style={{ background: 'rgba(255, 159, 67, 0.12)', borderColor: 'rgba(255, 159, 67, 0.25)', color: '#c45a00' }}
                    >
                      ¥{item.amount || '0'}
                    </button>
                  </div>
                  {/* 计算器 */}
                  {activeCalcId === item.id && (
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
                      <CalcPad
                        expr={item.amount}
                        onChange={v => updateLedgerItem(item.id, 'amount', v)}
                        onConfirm={v => { updateLedgerItem(item.id, 'amount', v); setActiveCalcId(null); }}
                      />
                    </motion.div>
                  )}
                </div>
              ))}

              {/* 添加项目 */}
              <button type="button" onClick={addLedgerItem}
                className="w-full py-2.5 rounded-xl border border-dashed text-sm flex items-center justify-center gap-1.5 transition-colors"
                style={{ borderColor: 'var(--orbit-border)', color: 'var(--orbit-text-muted, #6b7280)' }}
              >
                <FaPlus className="text-xs" /> 添加项目
              </button>

              {/* 合计 */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border"
                style={{ background: 'color-mix(in srgb, #FF9F43 10%, transparent)', borderColor: 'color-mix(in srgb, #FF9F43 25%, transparent)' }}
              >
                <span className="text-sm" style={{ color: 'var(--orbit-text-muted, #6b7280)' }}>合计</span>
                <span className="font-bold text-xl" style={{ color: '#c45a00' }}>¥ {totalAmount.toFixed(2)}</span>
              </div>

              {/* 均分说明 */}
              {splitType === 'equal' && selectedFriends.length > 0 && totalAmount > 0 && (
                <div className="px-4 py-3 rounded-xl border"
                  style={{ background: '#ffffff', borderColor: '#e5e7eb' }}
                >
                  <p className="text-xs mb-2" style={{ color: 'var(--orbit-text-muted, #6b7280)' }}>人均分摊</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {[currentUser?.id, ...selectedFriends].map((uid) => {
                      const name = uid === currentUser?.id
                        ? (currentUser?.username || '我')
                        : (friends.find((f: any) => f.friend?.id === uid)?.friend?.username || '好友');
                      const per = totalAmount / (selectedFriends.length + 1);
                      return (
                        <span key={uid} className="text-sm" style={{ color: 'var(--orbit-text)' }}>
                          {name} <span className="font-semibold" style={{ color: '#c45a00' }}>¥ {per.toFixed(2)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* 取消确认弹窗 */}
        <AnimatePresence>
          {showCancelConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center px-8"
              onClick={() => setShowCancelConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: 'var(--orbit-surface)', border: '1px solid var(--orbit-border)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 pt-6 pb-4 text-center">
                  <p className="font-semibold text-base" style={{ color: 'var(--orbit-text)' }}>保留此草稿？</p>
                  <p className="text-sm mt-1.5" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                    你编辑的内容将被保存，下次可以继续编辑
                  </p>
                </div>
                <div className="flex border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                  <button
                    className="flex-1 py-3.5 text-sm font-medium border-r transition-colors"
                    style={{ color: '#ef4444', borderColor: 'var(--orbit-border)' }}
                    onClick={() => { setShowCancelConfirm(false); onClearDraft?.(); onClose(); }}
                  >
                    删除草稿
                  </button>
                  <button
                    className="flex-1 py-3.5 text-sm font-semibold transition-colors"
                    style={{ color: '#00C9A7' }}
                    onClick={() => { setShowCancelConfirm(false); onClose(); }}
                  >
                    保留草稿
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

const getIsDarkTheme = () => {
  if (typeof document === 'undefined') return true;
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
};

export default function MemoryStreamPage() {
  const { memories, fetchMemories, deleteMemory, commentsByMemory, prependComment, removeComment } = useMemoryStore();
  const { friends } = useUserStore();
  const {
    memoryStreamSearchQuery: searchQuery,
    memoryStreamFilterFriendIds: filterFriendIds,
    memoryStreamGroupBy: groupBy,
    memoryStreamDraft,
    scrollPositions,
    memoryCommentReadMarkers,
    memoryCommentUnreadCount,
    likeReadMarkers,
    memoryLikeUnreadCount,
    memoryComposerRequestId,
    setMemoryStreamSearchQuery,
    setMemoryStreamFilterFriendIds,
    setMemoryStreamGroupBy,
    setMemoryStreamDraft,
    clearMemoryStreamDraft,
    setScrollPosition,
    markMemoryCommentsRead,
    setMemoryCommentUnreadCount,
    markMemoryLikesRead,
    setMemoryLikeUnreadCount,
    clearMemoryComposerRequest,
  } = useUIStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingPull, setIsRefreshingPull] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(getIsDarkTheme());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateTheme = () => setIsDarkMode(getIsDarkTheme());
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    updateTheme();
    media?.addEventListener('change', updateTheme);
    window.addEventListener(SETTINGS_EVENT, updateTheme);
    return () => {
      media?.removeEventListener('change', updateTheme);
      window.removeEventListener(SETTINGS_EVENT, updateTheme);
    };
  }, []);
  const [activeStoryMemories, setActiveStoryMemories] = useState<any[] | null>(null);
  const [showStoryEntry, setShowStoryEntry] = useState(false);
  // 在原有的 useState 旁边加上这两个：
  const { currentUser } = useUserStore(); // 获取当前用户，用来判断是不是自己发的回忆
  const [editingMemory, setEditingMemory] = useState<any>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [activeMenuMemoryId, setActiveMenuMemoryId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showNotificationSheet, setShowNotificationSheet] = useState(false);
  const [showLikeNotificationSheet, setShowLikeNotificationSheet] = useState(false);
  const [reportingFriend, setReportingFriend] = useState<any>(null);

  const handleBlockUser = async (targetUser: any) => {
    if (!targetUser) return;
    const name = targetUser.username || targetUser.friend_name || '该用户';
    const targetId = targetUser.friend_id || targetUser.id; // Corrected logic to handle different user objects

    if (!targetId || targetId === currentUser?.id) {
      alert('无法屏蔽自己或未知用户');
      return;
    }

    if (!window.confirm(`确定要屏蔽 ${name} 吗？屏蔽后你们将互不可见。`)) return;

    try {
      const { error } = await (supabase.from('blocked_users' as any) as any)
        .insert({
          user_id: currentUser?.id,
          blocked_user_id: targetId
        });

      if (error) throw error;
      alert('已屏蔽该用户。');
      await useUserStore.getState().fetchFriends();
      await fetchMemories();
    } catch (err: any) {
      console.error('Block error:', err);
      alert('屏蔽失败，请稍后重试');
    }
  };

  const handleSubmitReport = async (reason: string, evidenceUrl?: string) => {
    if (!reportingFriend) return;
    const targetUser = { ...reportingFriend };

    try {
      const { error } = await (supabase.from('reports' as any) as any)
        .insert({
          reporter_id: currentUser?.id,
          reported_user_id: reportingFriend.id,
          reason: reason,
          evidence_url: evidenceUrl,
          status: 'pending'
        });

      if (error) throw error;

      alert('举报已收到，感谢您的反馈！我们将在 24 小时内核实处理。');
      setShowReportModal(false);
      setReportingFriend(null);

      // Ask for blocking in a separate cycle to let UI update
      setTimeout(() => {
        if (window.confirm('是否同时屏蔽该用户？屏蔽后你们将互不可见。')) {
          handleBlockUser(targetUser);
        }
      }, 500);

    } catch (e: any) {
      console.error('Report error:', e);
      alert('提交失败: ' + (e.message || '未知错误'));
      setShowReportModal(false);
      setReportingFriend(null);
    }
  };

  const scrollRestoredRef = useRef(false);
  const albumSectionRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(readSettings());
  const lastAutoRefreshRef = useRef(0);
  const resumeTrigger = useAppStore((state) => state.resumeTrigger);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Record<string, { commentId: string; authorId: string; authorName: string } | null>>({});
  const [albumFilterFriendIds, setAlbumFilterFriendIds] = useState<string[]>([]);
  const [albumDateRange, setAlbumDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [albumRoleFilter, setAlbumRoleFilter] = useState<'all' | 'mine' | 'others'>('all');
  // Top-of-page month filter (YYYY-MM) — keep UI consistent with LedgerPage
  const [currentMonth, setCurrentMonth] = useState('');
  // Top-of-page sort order for memory list: newest first ('desc') or oldest first ('asc')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAlbumFilterDialog, setShowAlbumFilterDialog] = useState(false);
  const [commentAudios, setCommentAudios] = useState<Record<string, string[]>>({});
  const initialFilterClearedRef = useRef(false);

  // theme detection: true when the page theme is light
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';

  const refreshSessionQuick = useCallback(async (label: string) => {
    if (!shouldAllowRefresh()) return true;

    // Fast path: if session was validated recently (e.g. on resume or modal open),
    // skip the network round-trip entirely — the token is still valid.
    const validUntil = (window as any).__orbit_session_valid_until as number | undefined;
    if (validUntil && Date.now() < validUntil) {
      console.log(`[memory-stream] session cache hit, skipping check: ${label}`);
      return true;
    }

    // If another caller already kicked off a session check, reuse that Promise
    if (_refreshQuickInFlight) {
      console.log(`[memory-stream] reusing in-flight session check: ${label}`);
      return _refreshQuickInFlight;
    }

    _refreshQuickInFlight = (async () => {
      try {
        // Read the token directly from localStorage — instant, zero async,
        // completely bypasses the SDK's internal state machine that can deadlock
        // after app backgrounding (initializePromise, _useSession queue, etc.)
        const stored = getSessionFromStorage();
        if (stored && stored.expires_at - Math.floor(Date.now() / 1000) > 600) {
          (window as any).__orbit_session_valid_until = Date.now() + 30_000;
          return true;
        }

        // Token expired or missing — attempt refresh via native HTTP path
        console.log(`[memory-stream] token expired or missing, refreshing: ${label}`);
        const refreshMs = memoryStreamRefreshSessionRaceMs();
        await Promise.race([
          supabase.auth.refreshSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('refresh-timeout')), refreshMs)),
        ]);
        setSessionInvalid(false);
        (window as any).__orbit_session_valid_until = Date.now() + 30_000;
        return true;
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg && errMsg !== '[object Object]') {
          console.log(`[memory-stream] refreshSession silent retry: ${label} (${errMsg})`);
        } else {
          console.log(`[memory-stream] refreshSession silent retry: ${label}`);
        }
        return true;
      } finally {
        _refreshQuickInFlight = null;
      }
    })();

    return _refreshQuickInFlight;
  }, [shouldAllowRefresh]);

  useEffect(() => {
    if (showStoryEntry) {
      setShowAlbumFilterDialog(true);
      if (albumFilterFriendIds.length === 0 && filterFriendIds.length > 0) {
        setAlbumFilterFriendIds(filterFriendIds);
      }
    } else {
      setShowAlbumFilterDialog(false);
    }
  }, [showStoryEntry, filterFriendIds, albumFilterFriendIds.length]);

  // 点赞改为 Supabase 持久化
  const [reactions, setReactions] = useState<Record<string, MemoryReactionState>>({});
  const [roastInput, setRoastInput] = useState<Record<string, string>>({});
  const [submittingRoasts, setSubmittingRoasts] = useState<Record<string, boolean>>({});
  const [activeInteractionMemoryId, setActiveInteractionMemoryId] = useState<string | null>(null);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const showH = Keyboard.addListener('keyboardWillShow', (info) => setKbHeight(info.keyboardHeight));
    const hideH = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
    return () => { showH.then(h => h.remove()); hideH.then(h => h.remove()); };
  }, []);

  const shouldLockBackgroundScroll =
    isCreateOpen ||
    !!selectedMemory ||
    !!activeStoryMemories ||
    showStoryEntry ||
    showAlbumFilterDialog ||
    !!activeInteractionMemoryId;

  useScrollLock(!!shouldLockBackgroundScroll);

  const getReaction = (id: string) => ({
    liked: reactions[id]?.liked || false,
    likes: reactions[id]?.likes || 0,
    roastOpen: reactions[id]?.roastOpen || false,
    likers: reactions[id]?.likers || [],
    roasts: commentsByMemory[id] || [],
  });

  // 拉取点赞数据
  useEffect(() => {
    const memoryIds = memories.map((m: any) => m.id).filter(Boolean);
    if (memoryIds.length === 0) return;

    const fetchLikes = async () => {
      const { data, error } = await (supabase
        .from('memory_likes' as any) as any)
        .select('memory_id, user_id')
        .in('memory_id', memoryIds);

      if (!error && data) {
        setReactions(prev => {
          const next = { ...prev };
          // 先把当前这批 memory 的赞数清零重算，保留 roastOpen 状态
          memoryIds.forEach(id => {
            const existing = next[id] || { liked: false, likes: 0, roastOpen: false, likers: [] };
            next[id] = { ...existing, liked: false, likes: 0, likers: [] };
          });

          data.forEach((like: any) => {
            if (next[like.memory_id]) {
              next[like.memory_id].likes = (next[like.memory_id].likes || 0) + 1;
              if (like.user_id) next[like.memory_id].likers.push(like.user_id);
              if (like.user_id === currentUser?.id) {
                next[like.memory_id].liked = true;
              }
            }
          });
          return next;
        });
      }
    };

    fetchLikes();
  }, [memories, currentUser?.id]);

  const toggleLike = async (memoryId: string) => {
    if (!currentUser?.id) return;

    const currentVal = reactions[memoryId] || { liked: false, likes: 0, roastOpen: false, likers: [] };
    const isLiking = !currentVal.liked; // 判断是想点赞还是取消赞

    // 🚀 核心：乐观更新！不要等服务器，先让 UI 变色和加减数字！
    setReactions(prev => {
      const r = prev[memoryId] || { liked: false, likes: 0, roastOpen: false, likers: [] };
      const newLikers = isLiking
        ? [...(r.likers || []), currentUser.id]
        : (r.likers || []).filter(id => id !== currentUser.id);

      return {
        ...prev,
        [memoryId]: {
          ...r,
          liked: isLiking,
          likes: isLiking ? r.likes + 1 : Math.max(0, r.likes - 1),
          likers: newLikers
        }
      };
    });

    // ☁️ 后台静默同步给 Supabase
    try {
      if (isLiking) {
        // 增加赞
        await (supabase.from('memory_likes' as any) as any).insert({
          memory_id: memoryId,
          user_id: currentUser.id
        });

        // 触发点赞通知！
        const targetMemory = memories.find(m => m.id === memoryId);
        // 如果是赞别人的动态才发通知
        if (targetMemory && targetMemory.user_id && targetMemory.user_id !== currentUser.id) {
          const fromName = currentUser.username || currentUser.full_name || '好友';
          // 不 await 它，让它后台发，别阻塞前端交互哦
          supabase.functions.invoke('send-notifications', {
            body: {
              user_ids: [targetMemory.user_id],
              headings: '新的赞 ❤️',
              contents: `${fromName} 赞了你的动态！`,
              type: 'general',
              data: {
                type: 'new_like',
                memory_id: memoryId
              }
            }
          }).catch(err => console.error('发送点赞通知失败:', err));
        }

      } else {
        // 取消赞
        await (supabase.from('memory_likes' as any) as any)
          .delete()
          .match({ memory_id: memoryId, user_id: currentUser.id });
      }
    } catch (err) {
      console.error('同步点赞状态失败', err);
    }
  };

  const toggleRoastOpen = (memoryId: string) => {
    setReactions(prev => {
      const r = (prev && prev[memoryId]) || { liked: false, likes: 0, roastOpen: false, likers: [] };
      return { ...prev, [memoryId]: { ...r, roastOpen: !r.roastOpen } };
    });
  };

  const addRoast = async (memoryId: string) => {
    const text = (roastInput[memoryId] || '').trim();
    if (!text || !currentUser?.id || resuming || submittingRoasts[memoryId]) return;

    const target = replyTarget[memoryId] || undefined;
    const audioUrl = (commentAudios[memoryId] || [])[0];
    const payload = encodeCommentContent(text, target || undefined, audioUrl);

    setSubmittingRoasts(prev => ({ ...prev, [memoryId]: true }));
    try {
      const isHealthy = await checkSessionIsHealthy();
      if (!isHealthy) {
        refreshSessionQuick('recovery');
        return;
      }

      const comment = await addMemoryComment(memoryId, currentUser.id, payload);
      prependComment(memoryId, comment as MemoryCommentItem);
      setRoastInput(prev => ({ ...prev, [memoryId]: '' }));
      setReplyTarget(prev => ({ ...prev, [memoryId]: null }));
      setCommentAudios(prev => ({ ...prev, [memoryId]: [] }));
    } catch (error) {
      console.error('发表评论失败:', error);
      // alert(`评论发送失败：${(error as any)?.message || '请稍后重试'}`); // Silent error or toast preferred
    } finally {
      setSubmittingRoasts(prev => ({ ...prev, [memoryId]: false }));
    }
  };

  const deleteRoast = async (memoryId: string, commentId: string) => {
    if (!window.confirm('确定删除这条评论吗？')) return;
    if (resuming) return;

    try {
      const isHealthy = await checkSessionIsHealthy();
      if (!isHealthy) {
        refreshSessionQuick('recovery');
        return;
      }

      await deleteMemoryComment(commentId);
      removeComment(memoryId, commentId);
    } catch (error) {
      console.error('删除评论失败:', error);
      // alert(`删除评论失败：${(error as any)?.message || '请稍后重试'}`);
    }
  };

  const getVisibleTagIds = (memory: any) => getVisibleTaggedFriendIds(
    memory?.tagged_friends || [],
    memory?.user_id,
    currentUser?.id,
    friends
  );

  const getTagName = (memory: any, friendId: string) => getTaggedDisplayName(
    friendId,
    memory?.user_id,
    currentUser,
    friends
  );

  const getMemoryAuthor = (userId: string) => {
    if (userId === currentUser?.id) return { name: currentUser?.username || '我', avatar: currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest' };
    const f = friends.find((f: any) => f.friend?.id === userId)?.friend;
    return { name: f?.username || '好友', avatar: f?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest' };
  };

  const getCommentAuthor = (memory: any, authorId: string) => {
    if (authorId === memory.user_id) {
      return getMemoryAuthor(memory.user_id);
    }
    if (authorId === currentUser?.id) {
      return {
        name: currentUser?.username || '我',
        avatar: currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest',
      };
    }
    const friend = friends.find((item: any) => item.friend?.id === authorId)?.friend;
    if (friend) {
      return {
        name: friend.username || '好友',
        avatar: friend.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest',
      };
    }
    return {
      name: '共同好友',
      avatar: 'https://api.dicebear.com/9.x/adventurer/svg?seed=shared-friend',
    };
  };

  const getLatestCommentTime = (memoryId: string) => {
    const comments = commentsByMemory[memoryId] || [];
    return comments[comments.length - 1]?.created_at || null;
  };

  const isTaggedParticipantMemory = (memory: any) => {
    if (!currentUser?.id) return false;
    return memory.user_id !== currentUser.id && memory.tagged_friends?.includes(currentUser.id);
  };

  const hasUnreadComments = (memory: any) => {
    if (!isTaggedParticipantMemory(memory)) return false;

    const comments = commentsByMemory[memory.id] || [];
    const latestOtherComment = [...comments].reverse().find((item) => item.author_id && item.author_id !== currentUser?.id);
    if (!latestOtherComment) return false;

    const lastReadAt = memoryCommentReadMarkers[memory.id];
    if (!lastReadAt) return true;

    return new Date(latestOtherComment.created_at).getTime() > new Date(lastReadAt).getTime();
  };

  const markCommentsAsRead = (memoryId: string) => {
    const latestCommentAt = getLatestCommentTime(memoryId);
    if (!latestCommentAt) return;
    markMemoryCommentsRead(memoryId, latestCommentAt);
  };

  const hasUnreadLikes = (memory: any) => {
    const r = reactions[memory.id];
    if (!r?.likers?.length) return false;
    const otherLikers = r.likers.filter((id: string) => id !== currentUser?.id);
    const lastSeen = likeReadMarkers[memory.id] ?? 0;
    return otherLikers.length > lastSeen;
  };

  const handleShareMemory = async (memory: any) => {
    // If the sharer is not the author, check whether the author allows sharing
    if (memory.user_id !== currentUser?.id) {
      const authorFriend = friends.find((f: any) => f.friend?.id === memory.user_id);
      if (authorFriend?.friend?.allow_share === false) {
        alert('该回忆发布者未开启分享功能。');
        return;
      }
    }
    track('memory_share_attempt', { memoryId: memory?.id });
    const { text: memoryText, weather, mood, route } = decodeMemoryContent(memory.content || '');
    const raw = (memoryText || '').replace(/\s+/g, ' ').trim();
    const snippet = raw ? (raw.length > 30 ? `${raw.slice(0, 30)}...` : raw) : '我在 Orbit 记录了一段回忆';
    const locationText = memory.location?.name ? `📍${memory.location.name}` : '和好友的共同回忆';
    const dateText = new Date(memory.memory_date || memory.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    const inviter = currentUser?.username || '好友';
    const day = new Date(memory.memory_date || memory.created_at).toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    const location = memory.location?.name || '';
    const comments = (commentsByMemory[memory.id] || []).slice(-2).map((item) => {
      const author = getCommentAuthor(memory, item.author_id);
      return {
        author: author.name,
        content: item.content,
      };
    });
    const taggedNames = getVisibleTagIds(memory)
      .map((id: string) => getTagName(memory, id))
      .filter(Boolean)
      .slice(0, 8);
    const payload = encodeSharePayload({
      version: 1,
      inviter,
      author: getMemoryAuthor(memory.user_id).name,
      authorAvatar: getMemoryAuthor(memory.user_id).avatar,
      title: snippet,
      content: raw,
      day,
      dateText,
      location,
      weather,
      mood,
      route,
      taggedNames,
      photos: (memory.photos || []).slice(0, 6),
      videoCount: memory.videos?.length || 0,
      audioCount: memory.audios?.length || 0,
      hasLedger: !!memory.has_ledger,
      comments,
    });
    const shareUrl = `https://wehihi.com/share-memory/?payload=${encodeURIComponent(payload)}&from=memory_share&utm_source=wechat&utm_medium=social`;
    const shareText = `【Orbit 回忆分享】\n${snippet}\n${locationText} · ${dateText}\n点这里下载并一起记录：${shareUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Orbit 回忆分享',
          text: `${snippet} ${locationText}`.trim(),
          url: shareUrl,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const el = document.createElement('textarea');
        el.value = shareText;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }

      alert('已复制分享文案，粘贴到微信即可邀请对方下载～');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      alert('分享失败，请稍后重试');
    }
  };

  // 搜索 + 好友筛选
  const filteredMemories = useMemo(() => {
    // start from a copy to avoid mutating the original
    let result = [...memories];

    // 1) top month filter (currentMonth in YYYY-MM)
    if (currentMonth) {
      result = result.filter((m: any) => {
        const dateStr = (m.memory_date || m.created_at || '').slice(0, 7);
        return dateStr === currentMonth;
      });
    }

    // 2) search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m: any) =>
        (m.content || '').toLowerCase().includes(q) ||
        (m.location?.name || '').toLowerCase().includes(q)
      );
    }

    // 3) friend filters (top-level)
    if (filterFriendIds.length > 0) {
      result = result.filter((m: any) =>
        filterFriendIds.every(id => m.tagged_friends?.includes(id) || m.user_id === id)
      );
    }

    // 4) global sortOrder
    result.sort((a: any, b: any) => {
      const ta = new Date(a.memory_date || a.created_at).getTime();
      const tb = new Date(b.memory_date || b.created_at).getTime();
      if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
      return sortOrder === 'desc' ? tb - ta : ta - tb;
    });

    return result;
  }, [memories, searchQuery, filterFriendIds, currentMonth, sortOrder]);

  const unreadCommentItems = useMemo(() => {
    return memories
      .filter((m: any) => hasUnreadComments(m))
      .map((m: any) => {
        const comments = commentsByMemory[m.id] || [];
        const latestComment = [...comments].reverse().find(c => c.author_id !== currentUser?.id);
        if (!latestComment) return null;
        return {
          memory: m,
          comment: latestComment,
          author: getCommentAuthor(m, latestComment.author_id)
        };
      })
      .filter((item: any): item is NonNullable<typeof item> => item !== null);
  }, [memories, commentsByMemory, currentUser, memoryCommentReadMarkers]);

  const unreadLikeItems = useMemo(() => {
    return memories
      .filter((m: any) => hasUnreadLikes(m))
      .map((m: any) => {
        const likers: string[] = (reactions[m.id]?.likers || []).filter((id: string) => id !== currentUser?.id);
        const lastSeen = likeReadMarkers[m.id] ?? 0;
        const newLikerIds = likers.slice(lastSeen);
        const latestLikerId = newLikerIds[newLikerIds.length - 1];
        const latestLiker = getMemoryAuthor(latestLikerId) || { name: '好友', avatar: 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + latestLikerId };
        return { memory: m, newLikerIds, latestLiker };
      });
  }, [memories, reactions, likeReadMarkers, currentUser?.id]);

  // 首次进入时若存在历史好友筛选，自动清空避免进来就空白
  useEffect(() => {
    if (initialFilterClearedRef.current) return;
    if (filterFriendIds.length > 0) {
      setMemoryStreamFilterFriendIds([]);
    }
    initialFilterClearedRef.current = true;
  }, [filterFriendIds.length, setMemoryStreamFilterFriendIds]);

  const albumFilteredMemories = useMemo(() => {
    let result = filteredMemories;

    if (albumFilterFriendIds.length > 0) {
      result = result.filter((m: any) =>
        albumFilterFriendIds.every((id) => m.tagged_friends?.includes(id) || m.user_id === id)
      );
    }

    if (albumDateRange.start || albumDateRange.end) {
      const start = albumDateRange.start ? new Date(albumDateRange.start) : null;
      const end = albumDateRange.end ? new Date(albumDateRange.end) : null;
      if (end) end.setHours(23, 59, 59, 999);

      result = result.filter((m: any) => {
        const ts = new Date(m.memory_date || m.created_at).getTime();
        if (Number.isNaN(ts)) return false;
        if (end && ts > end.getTime()) return false;
        return true;
      });
    }
    if (albumRoleFilter === 'mine') {
      result = result.filter((m: any) => m.user_id === currentUser?.id);
    } else if (albumRoleFilter === 'others') {
      result = result.filter((m: any) => m.user_id !== currentUser?.id);
    }

    // Apply same sort order to album-filtered list
    const sorted = [...result].sort((a: any, b: any) => {
      const ta = new Date(a.memory_date || a.created_at).getTime();
      const tb = new Date(b.memory_date || b.created_at).getTime();
      if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
      return sortOrder === 'desc' ? tb - ta : ta - tb;
    });
    return sorted;
  }, [filteredMemories, albumFilterFriendIds, albumDateRange, albumRoleFilter, currentUser, sortOrder]);

  // 若筛选导致列表为空，自动清空筛选以恢复数据
  useEffect(() => {
    if (!filterFriendIds.length) return;
    if (isLoading) return;
    if (filteredMemories.length === 0) {
      setMemoryStreamFilterFriendIds([]);
    }
  }, [filterFriendIds.length, filteredMemories.length, isLoading, setMemoryStreamFilterFriendIds]);

  // 按日期分组（尊重当前排序）
  const groupedMemories = useMemo(() => groupMemoriesByDate(filteredMemories, sortOrder), [filteredMemories, sortOrder]);
  // 按城市分组
  const cityGroupedMemories = useMemo(() => groupMemoriesByCity(filteredMemories), [filteredMemories]);


  useEffect(() => {
    if (!currentUser?.id) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = async () => {
      const memoryIds = memories.map((memory: any) => memory.id).filter(Boolean);
      if (memoryIds.length === 0) return;

      const idList = memoryIds.join(',');
      if (channel) supabase.removeChannel(channel);
      const ok = await refreshSessionQuick('comments-subscribe');
      if (!ok) {
        console.warn('[comments-subscribe] refresh failed, skip subscribe');
        setSessionInvalid(true);
        return;
      }
      channel = supabase
        .channel(`memory-comments-${currentUser.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'memory_comments', filter: `memory_id=in.(${idList})` },
          (payload) => {
            const item = payload.new as MemoryCommentItem;
            if (!item?.id || !item.memory_id) return;
            prependComment(item.memory_id, item);
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'memory_comments', filter: `memory_id=in.(${idList})` },
          (payload) => {
            const item = payload.old as MemoryCommentItem;
            if (!item?.id || !item.memory_id) return;
            removeComment(item.memory_id, item.id);
          }
        )
        .subscribe();
    };

    void subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [memories, currentUser?.id, refreshSessionQuick]);

  useEffect(() => {
    const unreadCount = memories.reduce((count: number, memory: any) => count + (hasUnreadComments(memory) ? 1 : 0), 0);
    setMemoryCommentUnreadCount(unreadCount);
  }, [memories, commentsByMemory, memoryCommentReadMarkers, currentUser?.id, setMemoryCommentUnreadCount]);

  useEffect(() => {
    const count = memories.filter((m: any) => hasUnreadLikes(m)).length;
    setMemoryLikeUnreadCount(count);
  }, [memories, reactions, likeReadMarkers, currentUser?.id]);

  const refreshMemoryStream = useCallback(async (showLoading: boolean) => {
    if (!shouldAllowRefresh()) return;
    if (showLoading) setIsLoading(true);

    // 🚨 唤醒缓冲：等待 800ms，让网络模块恢复
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const ok = await refreshSessionQuick('refreshMemoryStream');
      if (!ok) {
        setIsLoading(false);
        setSessionInvalid(true);
        return;
      }
      const fetchPromise = Promise.all([
        fetchMemories(),
        useUserStore.getState().fetchFriends(),
      ]);

      const batchMs = memoryStreamFetchBatchRaceMs();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), batchMs)
      );

      await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      const hint =
        msg === 'timeout'
          ? ` （记忆流+好友拉取超过 ${memoryStreamFetchBatchRaceMs() / 1000}s，可下拉刷新；与上一条 getSession-timeout 无必然因果）`
          : '';
      console.error('拉取数据超时或被系统打断:', msg + hint);
      // 可选提示：alert('网络似乎开小差了，请下拉重新刷新试试');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [fetchMemories]);

  // 获取记忆数据
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      // 检查当前 store 是否已有数据
      if (useMemoryStore.getState().memories.length > 0) {
        if (isMounted) setIsLoading(false);
        return;
      }

      if (!shouldAllowRefresh()) {
        if (isMounted) setIsLoading(false);
        return;
      }
      await refreshMemoryStream(true);
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, []); // 仅挂载时检查一次

  // 前台/联网时自动轻量刷新，避免卡在旧界面
  useEffect(() => {
    const tryAutoRefresh = () => {
      if (!navigator.onLine) return;
      // 切回 30s 内，performSafeResume 的 fetchCoreData 已统一接管，不重复触发
      const foregroundAt = (window as any).__orbit_foreground_at as number | undefined;
      if (foregroundAt && Date.now() - foregroundAt < 30_000) return;
      // fetchCoreData 在过去 60s 内刚刚运行过，跳过以避免与正在进行的上传竞争
      const lastCoreRefresh = (window as any).__orbit_last_core_data_refresh as number | undefined;
      if (lastCoreRefresh && Date.now() - lastCoreRefresh < 60_000) return;
      const now = Date.now();
      if (now - lastAutoRefreshRef.current < 30000) return;
      lastAutoRefreshRef.current = now;
      void refreshMemoryStream(false);
    };

    const interval = window.setInterval(tryAutoRefresh, 60000);
    window.addEventListener('online', tryAutoRefresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', tryAutoRefresh);
    };
  }, [refreshMemoryStream]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrollPosition('memory-stream', window.scrollY || 0);
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [setScrollPosition]);

  useEffect(() => {
    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<typeof settings>).detail;
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
    if (!memoryComposerRequestId) return;
    setIsCreateOpen(true);
    clearMemoryComposerRequest();
  }, [memoryComposerRequestId, clearMemoryComposerRequest]);

  useEffect(() => {
    if (isLoading || scrollRestoredRef.current) return;
    const savedY = scrollPositions['memory-stream'] || 0;
    scrollRestoredRef.current = true;
    if (savedY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, savedY);
      });
    }
  }, [isLoading, scrollPositions]);

  const scrollToAlbumSection = () => {
    if (!albumSectionRef.current) return;
    albumSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (deletingMemoryId) return;
    if (!window.confirm('确定删除这条记忆？')) return;
    setDeletingMemoryId(memoryId);
    try {
      await deleteMemory(memoryId);
      track('memory_delete_success');
    } catch (error) {
      console.error('删除记忆失败:', error);
      alert(`删除失败：${(error as any)?.message || '请稍后重试'}`);
      await fetchMemories();
    } finally {
      setDeletingMemoryId(null);
    }
  };

  const handlePullRefresh = async () => {
    if (isRefreshingPull) return;
    if (!shouldAllowRefresh()) {
      alert('已开启仅 Wi‑Fi 刷新，请连接 Wi‑Fi 后重试。');
      return;
    }

    setIsRefreshingPull(true);

    try {
      const ok = await refreshSessionQuick('pull-to-refresh');
      if (!ok) {
        setIsRefreshingPull(false);
        setSessionInvalid(true);
        return;
      }
      // 1. 把所有要拉取的数据打包成一个内部函数
      const fetchAllData = async () => {
        await Promise.all([
          useMemoryStore.getState().fetchMemories(),
          useUserStore.getState().fetchFriends(),
          useLedgerStore.getState().fetchLedgers(),
        ]);

        const latestMemories = useMemoryStore.getState().memories || [];
        const memoryIds = latestMemories.map((m: any) => m.id).filter(Boolean);

        if (memoryIds.length > 0) {
          const comments = await getMemoryComments(memoryIds);
          const grouped = (comments || []).reduce((acc: Record<string, MemoryCommentItem[]>, item: any) => {
            const memoryId = item.memory_id;
            if (!memoryId) return acc;
            if (!acc[memoryId]) acc[memoryId] = [];
            acc[memoryId].push(item as MemoryCommentItem);
            return acc;
          }, {});
          useMemoryStore.getState().updateCommentsByMemory(grouped);
        }
      };

      // 2. 设定 10 秒的强制死亡线（防止 iOS 假死）
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('刷新超时，网络可能在后台断开了')), 10000)
      );

      // 3. 竞速执行：只要 10 秒内没拉完，强行打断！
      await Promise.race([fetchAllData(), timeoutPromise]);

    } catch (error) {
      console.error('下拉刷新被强行中断:', error);
      // 这里不需要弹窗打扰用户，只需要在控制台记录即可
    } finally {
      // 4. 有了前面的保护，代码现在 100% 能走到这里，把下拉胶囊收回去！
      setIsRefreshingPull(false);
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      onClick={() => setActiveMenuMemoryId(null)}
      className={`memory-stream-page relative w-full flex-1 min-h-0 hide-scrollbar flex flex-col overflow-x-hidden ${shouldLockBackgroundScroll ? 'overflow-hidden touch-none' : 'overflow-y-auto'}`}
      style={{
        backgroundColor: 'var(--orbit-surface)',
        color: 'var(--orbit-text)',
        paddingBottom: kbHeight > 0
          ? `${kbHeight}px`
          : 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        transition: 'padding-bottom 200ms cubic-bezier(0.33, 1, 0.68, 1)',
        overscrollBehaviorY: 'contain',
      }}
    >
      <PullToRefresh onRefresh={handlePullRefresh} isRefreshing={isRefreshingPull} disabled={shouldLockBackgroundScroll} scrollRef={scrollContainerRef} />
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none sticky top-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00FFB3]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-[#FF9F43]/5 rounded-full blur-3xl" />
      </div>

      {/* 顶部标题 + 搜索筛选 */}
      <div
        className="sticky top-0 left-0 right-0 z-40 backdrop-blur-md border-b safe-top"
        style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 92%, transparent)', borderColor: 'var(--orbit-border)' }}
      >
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--orbit-text)' }}>回忆流</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                {(searchQuery || filterFriendIds.length > 0) && filteredMemories.length !== memories.length
                  ? `找到 ${filteredMemories.length} / ${memories.length} 条`
                  : `共 ${memories.length} 条记忆`}
              </p>
              {settings.notifyComment && memoryCommentUnreadCount > 0 && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowNotificationSheet(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-[#FF6B6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FF8A8A] border border-[#FF6B6B]/20"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B] animate-pulse" />
                  {memoryCommentUnreadCount} 条新评论
                </motion.button>
              )}
              {memoryLikeUnreadCount > 0 && (
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setShowLikeNotificationSheet(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 border border-red-500/20"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  {memoryLikeUnreadCount} 个新的赞
                </motion.button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => {
                setShowStoryEntry(true);
                track('memory_story_open');
              }}
              className="px-3.5 py-2 rounded-full border font-semibold text-sm shrink-0 flex items-center gap-2"
              style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
            >
              <FaBookOpen className="text-xs" />
              回忆相册
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => {
                setIsCreateOpen(true);
                track('memory_create_open');
              }}
              data-tour-id="memory-create"
              className="px-4 py-2 rounded-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-white font-semibold text-sm shrink-0"
            >记录此刻</motion.button>
          </div>
        </div>

        {/* 搜索框 + 分组切换 */}
        <div className="px-4 pb-2 flex gap-2">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }} />
            <input
              type="text"
              placeholder="搜索内容、地点..."
              value={searchQuery}
              onChange={(e) => setMemoryStreamSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm outline-none focus:ring-2 placeholder:opacity-60"
              style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)', caretColor: 'var(--orbit-text)' }}
            />
            {searchQuery && (
              <button onClick={() => setMemoryStreamSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                <FaTimes className="text-xs" />
              </button>
            )}
          </div>
          {/* 分组方式切换 */}
          <button
            onClick={() => setMemoryStreamGroupBy(groupBy === 'date' ? 'city' : 'date')}
            className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-all"
            style={groupBy === 'city'
              ? { backgroundColor: 'color-mix(in srgb, #00FFB3 20%, transparent)', color: '#00B89F', borderColor: 'color-mix(in srgb, #00FFB3 40%, transparent)' }
              : { backgroundColor: 'var(--orbit-card)', color: 'var(--orbit-text)', borderColor: 'var(--orbit-border)' }
            }
          >
            {groupBy === 'city'
              ? <div className="flex items-center gap-1.5"><FaCity /><span>按城市</span></div>
              : <div className="flex items-center gap-1.5"><FaCalendarAlt /><span>按日期</span></div>
            }
          </button>
          {/* 顶部月份筛选 + 排序（与财务页保持一致） */}
          <div className="flex items-center gap-2">
            {/* 外层容器：只负责背景色和边框，注意去掉了 relative */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border relative"
              style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
            >

              {/* 🌟 1. 隔离区：只让 input 盖住文字和箭头，绝不越界 */}
              <div className="relative flex items-center gap-1.5">
                <span className="text-sm font-mono font-medium">{currentMonth ? currentMonth.replace('-', ' / ') : '全部'}</span>
                <ChevronDownIcon className="text-[10px] opacity-50" />
                <input
                  type="month"
                  value={currentMonth}
                  onChange={e => setCurrentMonth(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  style={{ colorScheme: 'light', zIndex: 1 }}
                />
              </div>

              {/* 🌟 2. 杀手锏：使用 onPointerDown 提前击杀系统事件 */}
              {currentMonth && (
                <button
                  type="button"
                  aria-label="清空月份筛选"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentMonth('');
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentMonth('');
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium shrink-0"
                  style={{
                    backgroundColor: 'var(--orbit-surface)',
                    borderColor: 'var(--orbit-border)',
                    color: 'var(--orbit-text-muted, #9ca3af)',
                    zIndex: 10,
                  }}
                >
                  ✕
                  <span>清空</span>
                </button>
              )}
            </div>

            {/* 时间排序按钮保持不变 */}
            <button
              onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium border"
              style={{ backgroundColor: 'var(--orbit-card)', color: 'var(--orbit-text)', borderColor: 'var(--orbit-border)' }}
            >
              时间 {sortOrder === 'desc' ? '↓' : '↑'}
            </button>
          </div>

        </div>

        {/* 好友筛选（支持多选，AND 逻辑：选中的好友必须同时出现） */}
        {friends.length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto px-4 pb-3"
            style={{
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              msOverflowStyle: 'none',
              overscrollBehaviorX: 'contain',
              touchAction: 'pan-x',
              WebkitMaskImage: '-webkit-linear-gradient(left, transparent, #000 10%, #000 90%, transparent)',
            }}
          >
            <button
              onClick={() => setMemoryStreamFilterFriendIds([])}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all border"
              style={filterFriendIds.length === 0
                ? { backgroundColor: '#00FFB3', color: '#0f172a', borderColor: '#00FFB3' }
                : { backgroundColor: 'transparent', color: 'var(--orbit-text)', borderColor: 'var(--orbit-border)' }}
            >全部</button>
            {friends.map((f: any) => {
              const isSelected = filterFriendIds.includes(f.friend.id);
              return (
                <button
                  key={f.friend.id}
                  onClick={() => setMemoryStreamFilterFriendIds(
                    isSelected
                      ? filterFriendIds.filter(id => id !== f.friend.id)
                      : [...filterFriendIds, f.friend.id]
                  )}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border"
                  style={isSelected
                    ? { backgroundColor: '#00FFB3', color: '#0f172a', borderColor: '#00FFB3' }
                    : { backgroundColor: 'transparent', color: 'var(--orbit-text)', borderColor: 'var(--orbit-border)' }}
                >
                  <img src={f.friend.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover" />
                  {f.friend.username}
                  {isSelected && <FaCheck className="text-[9px]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 记忆列表 */}
      <div className="relative px-4 pb-32 pt-4">
        <div ref={albumSectionRef} className="scroll-mt-20" />
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FaSpinner className="text-[#00FFB3] text-3xl animate-spin mb-4" />
            <p className="mb-6" style={{ color: 'var(--orbit-text)' }}>加载回忆中...</p>
            {/* PWA 防卡死神器：刷新按钮 */}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-full border text-xs transition-colors"
              style={{ borderColor: 'var(--orbit-border)', color: 'var(--orbit-text-muted, #9ca3af)' }}
            >
              如果卡住，点此重新加载
            </button>
          </div>
        ) : groupedMemories.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00FFB3]/10 to-[#00D9FF]/10 flex items-center justify-center mb-4">
              <FaCamera className="text-[#00FFB3] text-2xl" />
            </div>
            <p className="text-lg mb-2" style={{ color: 'var(--orbit-text)' }}>还没有回忆</p>
            <p className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>点击「记录此刻」开始你的第一个记忆</p>
          </motion.div>
        ) : groupBy === 'city' ? (
          cityGroupedMemories.map((cityGroup, cgIdx) => (
            <motion.div key={cityGroup.city} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: cgIdx * 0.08 }} className="mb-8">
              {/* 城市标题 */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF9F43]/20 to-[#FF6B6B]/20 flex items-center justify-center">
                  <FaCity className="text-[#FF9F43]" />
                </div>
                <div>
                  <div className="font-semibold" style={{ color: 'var(--orbit-text)' }}>{cityGroup.city}</div>
                  <div className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{cityGroup.memories.length} 条记忆</div>
                </div>
              </div>

              <div className="space-y-4">
                {cityGroup.memories.map((memory, index) => {
                  const photos = memory.photos || [];
                  const reaction = getReaction(memory.id);
                  const author = getMemoryAuthor(memory.user_id);
                  const { text: mText, weather: mWeather, mood: mMood } = decodeMemoryContent(memory.content || '');

                  return (
                    <motion.div
                      key={memory.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: cgIdx * 0.08 + index * 0.04 }}
                      className="mb-6 bg-transparent sm:bg-[var(--orbit-card)] sm:border sm:rounded-sm border-b pb-4"
                      style={{ borderColor: 'var(--orbit-border)' }}
                    >
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={author.avatar} className="w-8 h-8 rounded-full object-cover border border-[var(--orbit-border)]" />
                          <div className="flex flex-col justify-center">
                            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--orbit-text)' }}>{author.name}</p>
                            {(memory.location || mWeather.length > 0 || mMood.length > 0) && (
                              <p className="text-[11px] mt-0.5" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                                {memory.location?.name} {[...mWeather, ...mMood].join(' ')}
                              </p>
                            )}
                          </div>
                        </div>
                        {memory.user_id === currentUser?.id ? (
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); setEditingMemory(memory); }} className="text-[color:var(--orbit-text-muted,#9ca3af)] hover:text-[#00FFB3] transition-colors"><FaEdit className="text-sm" /></button>
                            <button onClick={(e) => { e.stopPropagation(); void handleDeleteMemory(memory.id); }} disabled={deletingMemoryId === memory.id} className="text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-40"><FaTrash className="text-sm" /></button>
                          </div>
                        ) : (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuMemoryId(activeMenuMemoryId === memory.id ? null : memory.id);
                              }}
                              className="p-1.5 rounded-full text-[color:var(--orbit-text-muted)] hover:text-[color:var(--orbit-text)]"
                            >
                              <FaEllipsisH className="text-xs" />
                            </button>
                            {activeMenuMemoryId === memory.id && (
                              <div className="absolute right-0 top-full mt-1 w-28 rounded-xl bg-[var(--orbit-card)] border border-[var(--orbit-border)] shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMemoryId(null);
                                    setReportingFriend({ id: memory.user_id, username: author.name });
                                    setShowReportModal(true);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 text-red-500"
                                >
                                  举报发布者
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMemoryId(null);
                                    handleBlockUser({ id: memory.user_id, username: author.name });
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 border-t border-[var(--orbit-border)]"
                                  style={{ color: 'var(--orbit-text)' }}
                                >
                                  屏蔽发布者
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {photos.length === 1 && (
                        <div className="w-full cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          <img src={photos[0]} alt="" className="w-full max-h-[500px] object-cover sm:rounded-sm" />
                        </div>
                      )}
                      {photos.length >= 2 && (
                        <div className="w-full grid grid-cols-2 gap-0.5 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {photos.slice(0, 4).map((p: string, i: number) => (
                            <div key={i} className="relative overflow-hidden aspect-square">
                              <img src={p} alt="" className="w-full h-full object-cover" />
                              {i === 3 && photos.length > 4 && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <span className="text-white font-medium text-2xl">+{photos.length - 4}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {(memory.videos?.length > 0 || memory.audios?.length > 0) && (
                        <div className="px-4 pt-2 space-y-2">
                          {memory.videos?.length > 0 && <span className="text-xs text-[color:var(--orbit-text-muted,#9ca3af)]">▶ {memory.videos.length} 个视频</span>}
                          {memory.audios?.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              {memory.audios.map((url: string, idx: number) => (
                                <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-[var(--orbit-border)]">
                                  <FaMicrophone className="text-[var(--orbit-text)] text-xs shrink-0" />
                                  <audio src={url} controls className="flex-1 h-7" style={{ minWidth: 0 }} />
                                  <span className="text-[var(--orbit-text-muted)] text-[10px] shrink-0">{idx + 1}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <div className="flex items-center gap-4">
                          <button onClick={() => { toggleLike(memory.id); const otherLikers = (reactions[memory.id]?.likers || []).filter((id: string) => id !== currentUser?.id); markMemoryLikesRead(memory.id, otherLikers.length); }} className={`flex items-center gap-1 transition-all active:scale-125 ${reaction.liked ? 'text-red-500' : 'text-[color:var(--orbit-text)] hover:text-gray-400'}`}>
                            <div className="relative">
                              <FaHeart className="text-[22px]" />
                              {hasUnreadLikes(memory) && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF6B6B]" />}
                            </div>
                            {reaction.likes > 0 && <span className="text-sm font-medium">{reaction.likes}</span>}
                          </button>
                          <button onClick={() => setActiveInteractionMemoryId(memory.id)} className="flex items-center gap-1 text-[color:var(--orbit-text)] hover:text-gray-400 transition-colors relative">
                            <div className="relative">
                              <FaComment className="text-[22px] scale-x-[-1]" />
                              {settings.notifyComment && hasUnreadComments(memory) && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF6B6B]" />}
                            </div>
                            {(reaction.roasts?.length || 0) > 0 && <span className="text-sm font-medium">{reaction.roasts.length}</span>}
                          </button>
                          <button onClick={() => handleShareMemory(memory)} className="text-[color:var(--orbit-text)] hover:text-gray-400 transition-colors">
                            <FaShareAlt className="text-[20px]" />
                          </button>
                        </div>
                        {memory.has_ledger && <span className="text-orange-500 text-sm font-semibold"><FaDollarSign className="inline text-xs -mt-0.5" /> 记账</span>}
                      </div>

                      {/* Social Summary Button */}
                      {(reaction.likes > 0 || (reaction.roasts && reaction.roasts.length > 0)) && (
                        <div className="px-4 pb-2">
                          <div
                            onClick={() => setActiveInteractionMemoryId(memory.id)}
                            className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-xl active:bg-black/5 dark:active:bg-white/10 transition-colors cursor-pointer"
                          >
                            <div className="flex -space-x-1.5 relative z-0">
                              {reaction.likers?.slice(0, 3).map((uid, idx) => {
                                const liker = getMemoryAuthor(uid) || { avatar: 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + uid };
                                return (
                                  <img
                                    key={uid}
                                    src={liker.avatar || 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + uid}
                                    className="w-4 h-4 rounded-full border border-[var(--orbit-card)] object-cover bg-gray-200"
                                    style={{ zIndex: 10 - idx }}
                                  />
                                );
                              })}
                              {reaction.roasts?.slice(0, Math.max(0, 3 - (reaction.likers?.length || 0))).map((r, idx) => {
                                const cAuthor = getCommentAuthor(memory, r.author_id);
                                return (
                                  <img
                                    key={r.id}
                                    src={cAuthor.avatar}
                                    className="w-4 h-4 rounded-full border border-[var(--orbit-card)] object-cover bg-gray-200"
                                    style={{ zIndex: 10 - (reaction.likers?.length || 0) - idx }}
                                  />
                                );
                              })}
                            </div>

                            <FaChevronRight className="ml-auto text-xs opacity-30" />
                          </div>
                        </div>
                      )}

                      <div className="px-4 pb-1 text-sm leading-relaxed" style={{ color: 'var(--orbit-text)' }}>
                        {mText && (
                          <span>
                            <span className="font-bold mr-2">{author.name}</span>
                            <span>{mText}</span>
                          </span>
                        )}
                        {!mText && memory.tagged_friends?.length > 0 && (
                          <span className="font-bold mr-2">{author.name}</span>
                        )}
                        {memory.tagged_friends?.length > 0 && (
                          <span className={mText ? 'ml-1' : ''}>
                            {getVisibleTagIds(memory).map((id: string, tidx: number) => {
                              const name = getTagName(memory, id);
                              return name ? <span key={id} className="text-[#005c8a] dark:text-[#00D9FF] mr-1 font-medium">@{name}</span> : null;
                            })}
                          </span>
                        )}
                      </div>

                      <div className="px-4 pt-1 mb-2">
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                          {formatTime(memory.memory_date || memory.created_at)}
                        </span>
                      </div>

                      <AnimatePresence>
                        {reaction.roastOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden border-t"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 60%, transparent)', borderColor: 'var(--orbit-border)' }}
                          >
                            <div className="p-4 space-y-3">
                              {reaction.roasts.map((r: MemoryCommentItem) => {
                                const commentAuthor = getCommentAuthor(memory, r.author_id);
                                const canDeleteComment = currentUser?.id === r.author_id || currentUser?.id === memory.user_id;
                                const decoded = decodeCommentContent(r.content);
                                const replyTo = decoded.replyTo;
                                const handleReply = () => {
                                  setReplyTarget(prev => ({
                                    ...prev,
                                    [memory.id]: {
                                      commentId: r.id,
                                      authorId: replyTo?.authorId || r.author_id,
                                      authorName: replyTo?.authorName || commentAuthor.name,
                                    },
                                  }));
                                };

                                return (
                                  <div key={r.id} className="flex items-start gap-2">
                                    <img src={commentAuthor.avatar} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                                    <div className="flex-1 rounded-2xl px-3 py-2" style={{ backgroundColor: 'var(--orbit-card)' }}>
                                      <div className="flex items-start justify-between gap-3 mb-0.5">
                                        <div className="flex items-center gap-2">
                                          <p className="text-[#00FFB3] text-xs font-medium">{commentAuthor.name}</p>
                                          {replyTo && (
                                            <span className="text-[11px] text-[color:var(--orbit-text-muted,#9ca3af)]">回复 {replyTo.authorName}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={handleReply}
                                            className="text-[11px] text-[color:var(--orbit-text-muted,#9ca3af)] hover:text-[#00FFB3] transition-colors"
                                          >回复</button>
                                          {canDeleteComment && (
                                            <button
                                              type="button"
                                              onClick={() => void deleteRoast(memory.id, r.id)}
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
                              {replyTarget[memory.id] && (
                                <div className="flex items-center gap-2 px-1 text-xs" style={{ color: 'var(--orbit-text-muted,#9ca3af)' }}>
                                  <span>回复 {replyTarget[memory.id]?.authorName}</span>
                                  <button
                                    type="button"
                                    className="hover:text-[#00FFB3]"
                                    onClick={() => setReplyTarget(prev => ({ ...prev, [memory.id]: null }))}
                                  >取消</button>
                                </div>
                              )}
                              <div className="flex items-start gap-2">
                                <img src={currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest'} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <div
                                    className="flex items-center gap-2 rounded-2xl px-3 py-2 border"
                                    style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                                  >
                                    <input
                                      type="text"
                                      placeholder="文字 + 表情 或 留空配语音"
                                      value={roastInput[memory.id] || ''}
                                      onChange={(e) => setRoastInput(prev => ({ ...prev, [memory.id]: e.target.value }))}
                                      onKeyDown={(e) => { if (e.key === 'Enter') void addRoast(memory.id); }}
                                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--orbit-text-muted,#9ca3af)]"
                                      style={{ color: 'var(--orbit-text)' }}
                                    />
                                    <button
                                      onClick={() => void addRoast(memory.id)}
                                      disabled={(!roastInput[memory.id]?.trim() && !(commentAudios[memory.id]?.length)) || submittingRoasts[memory.id]}
                                      className="text-[#00FFB3] text-sm font-semibold disabled:opacity-30 shrink-0"
                                    >{submittingRoasts[memory.id] ? <FaSpinner className="animate-spin" /> : '发'}</button>
                                  </div>
                                  <VoiceRecorder
                                    userId={currentUser?.id || ''}
                                    audios={commentAudios[memory.id] || []}
                                    onAudiosChange={(urls) => setCommentAudios(prev => ({ ...prev, [memory.id]: urls }))}
                                    compact
                                  />
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))
        ) : (
          groupedMemories.map((group, groupIndex) => (
            <motion.div key={group.date} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: groupIndex * 0.1 }} className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00FFB3]/20 to-[#00D9FF]/20 flex items-center justify-center">
                  <FaCalendarAlt className="text-[#00FFB3]" />
                </div>
                <div>
                  <div className="font-semibold" style={{ color: 'var(--orbit-text)' }}>{group.displayDate}</div>
                  <div className="text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{group.memories.length} 条记忆</div>
                </div>
              </div>

              <div className="space-y-4">
                {group.memories.map((memory, index) => {
                  const photos = memory.photos || [];
                  const reaction = getReaction(memory.id);
                  const author = getMemoryAuthor(memory.user_id);
                  const { text: mText, weather: mWeather, mood: mMood } = decodeMemoryContent(memory.content || '');

                  return (
                    <motion.div
                      key={memory.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: groupIndex * 0.08 + index * 0.04 }}
                      className="mb-6 bg-transparent sm:bg-[var(--orbit-card)] sm:border sm:rounded-sm border-b pb-4"
                      style={{ borderColor: 'var(--orbit-border)' }}
                    >
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={author.avatar} className="w-8 h-8 rounded-full object-cover border border-[var(--orbit-border)]" />
                          <div className="flex flex-col justify-center">
                            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--orbit-text)' }}>{author.name}</p>
                            {(memory.location || mWeather.length > 0 || mMood.length > 0) && (
                              <p className="text-[11px] mt-0.5" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                                {memory.location?.name} {[...mWeather, ...mMood].join(' ')}
                              </p>
                            )}
                          </div>
                        </div>
                        {memory.user_id === currentUser?.id ? (
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); setEditingMemory(memory); }} className="text-[color:var(--orbit-text-muted,#9ca3af)] hover:text-[#00FFB3] transition-colors"><FaEdit className="text-sm" /></button>
                            <button onClick={(e) => { e.stopPropagation(); void handleDeleteMemory(memory.id); }} disabled={deletingMemoryId === memory.id} className="text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-40"><FaTrash className="text-sm" /></button>
                          </div>
                        ) : (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuMemoryId(activeMenuMemoryId === memory.id ? null : memory.id);
                              }}
                              className="p-1.5 rounded-full text-[color:var(--orbit-text-muted)] hover:text-[color:var(--orbit-text)]"
                            >
                              <FaEllipsisH className="text-xs" />
                            </button>
                            {activeMenuMemoryId === memory.id && (
                              <div className="absolute right-0 top-full mt-1 w-28 rounded-xl bg-[var(--orbit-card)] border border-[var(--orbit-border)] shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMemoryId(null);
                                    setReportingFriend({ id: memory.user_id, username: author.name });
                                    setShowReportModal(true);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 text-red-500"
                                >
                                  举报发布者
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMemoryId(null);
                                    handleBlockUser({ id: memory.user_id, username: author.name });
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 border-t border-[var(--orbit-border)]"
                                  style={{ color: 'var(--orbit-text)' }}
                                >
                                  屏蔽发布者
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {photos.length === 1 && (
                        <div className="w-full cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          <img src={photos[0]} alt="" className="w-full max-h-[500px] object-cover sm:rounded-sm" />
                        </div>
                      )}
                      {photos.length >= 2 && (
                        <div className="w-full grid grid-cols-2 gap-0.5 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {photos.slice(0, 4).map((p: string, i: number) => (
                            <div key={i} className="relative overflow-hidden aspect-square">
                              <img src={p} alt="" className="w-full h-full object-cover" />
                              {i === 3 && photos.length > 4 && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <span className="text-white font-medium text-2xl">+{photos.length - 4}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {(memory.videos?.length > 0 || memory.audios?.length > 0) && (
                        <div className="px-4 pt-2 space-y-2">
                          {memory.videos?.length > 0 && <span className="text-xs text-[color:var(--orbit-text-muted,#9ca3af)]">▶ {memory.videos.length} 个视频</span>}
                          {memory.audios?.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              {memory.audios.map((url: string, idx: number) => (
                                <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-[var(--orbit-border)]">
                                  <FaMicrophone className="text-[var(--orbit-text)] text-xs shrink-0" />
                                  <audio src={url} controls className="flex-1 h-7" style={{ minWidth: 0 }} />
                                  <span className="text-[var(--orbit-text-muted)] text-[10px] shrink-0">{idx + 1}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <div className="flex items-center gap-4">
                          <button onClick={() => { toggleLike(memory.id); const otherLikers = (reactions[memory.id]?.likers || []).filter((id: string) => id !== currentUser?.id); markMemoryLikesRead(memory.id, otherLikers.length); }} className={`flex items-center gap-1 transition-all active:scale-125 ${reaction.liked ? 'text-red-500' : 'text-[color:var(--orbit-text)] hover:text-gray-400'}`}>
                            <div className="relative">
                              <FaHeart className="text-[22px]" />
                              {hasUnreadLikes(memory) && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF6B6B]" />}
                            </div>
                            {reaction.likes > 0 && <span className="text-sm font-medium">{reaction.likes}</span>}
                          </button>
                          <button onClick={() => setActiveInteractionMemoryId(memory.id)} className="flex items-center gap-1 text-[color:var(--orbit-text)] hover:text-gray-400 transition-colors relative">
                            <div className="relative">
                              <FaComment className="text-[22px] scale-x-[-1]" />
                              {settings.notifyComment && hasUnreadComments(memory) && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF6B6B]" />}
                            </div>
                            {(reaction.roasts?.length || 0) > 0 && <span className="text-sm font-medium">{reaction.roasts.length}</span>}
                          </button>
                          <button onClick={() => handleShareMemory(memory)} className="text-[color:var(--orbit-text)] hover:text-gray-400 transition-colors">
                            <FaShareAlt className="text-[20px]" />
                          </button>
                        </div>
                        {memory.has_ledger && <span className="text-orange-500 text-sm font-semibold"><FaDollarSign className="inline text-xs -mt-0.5" /> 记账</span>}
                      </div>

                      {/* Social Summary Button */}
                      {(reaction.likes > 0 || (reaction.roasts && reaction.roasts.length > 0)) && (
                        <div className="px-4 pb-2">
                          <div
                            onClick={() => setActiveInteractionMemoryId(memory.id)}
                            className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-xl active:bg-black/5 dark:active:bg-white/10 transition-colors cursor-pointer"
                          >
                            <div className="flex -space-x-1.5 relative z-0">
                              {reaction.likers?.slice(0, 3).map((uid, idx) => {
                                const liker = getMemoryAuthor(uid) || { avatar: 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + uid };
                                return (
                                  <img
                                    key={uid}
                                    src={liker.avatar || 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + uid}
                                    className="w-4 h-4 rounded-full border border-[var(--orbit-card)] object-cover bg-gray-200"
                                    style={{ zIndex: 10 - idx }}
                                  />
                                );
                              })}
                              {reaction.roasts?.slice(0, Math.max(0, 3 - (reaction.likers?.length || 0))).map((r, idx) => {
                                const cAuthor = getCommentAuthor(memory, r.author_id);
                                return (
                                  <img
                                    key={r.id}
                                    src={cAuthor.avatar}
                                    className="w-4 h-4 rounded-full border border-[var(--orbit-card)] object-cover bg-gray-200"
                                    style={{ zIndex: 10 - (reaction.likers?.length || 0) - idx }}
                                  />
                                );
                              })}
                            </div>

                            <FaChevronRight className="ml-auto text-xs opacity-30" />
                          </div>
                        </div>
                      )}

                      <div className="px-4 pb-1 text-sm leading-relaxed" style={{ color: 'var(--orbit-text)' }}>
                        {mText && (
                          <span>
                            <span className="font-bold mr-2">{author.name}</span>
                            <span>{mText}</span>
                          </span>
                        )}
                        {!mText && memory.tagged_friends?.length > 0 && (
                          <span className="font-bold mr-2">{author.name}</span>
                        )}
                        {memory.tagged_friends?.length > 0 && (
                          <span className={mText ? 'ml-1' : ''}>
                            {getVisibleTagIds(memory).map((id: string) => {
                              const name = getTagName(memory, id);
                              return name ? <span key={id} className="text-[#005c8a] dark:text-[#00D9FF] mr-1 font-medium">@{name}</span> : null;
                            })}
                          </span>
                        )}
                      </div>

                      <div className="px-4 pt-1 mb-2">
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                          {formatTime(memory.memory_date || memory.created_at)}
                        </span>
                      </div>

                      <AnimatePresence>
                        {reaction.roastOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden border-t"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-card) 60%, transparent)', borderColor: 'var(--orbit-border)' }}
                          >
                            <div className="p-4 space-y-3">
                              {reaction.roasts.map((r: MemoryCommentItem) => {
                                const commentAuthor = getCommentAuthor(memory, r.author_id);
                                const canDeleteComment = currentUser?.id === r.author_id || currentUser?.id === memory.user_id;
                                const decoded = decodeCommentContent(r.content);
                                const replyTo = decoded.replyTo;
                                const handleReply = () => {
                                  setReplyTarget(prev => ({
                                    ...prev,
                                    [memory.id]: {
                                      commentId: r.id,
                                      authorId: replyTo?.authorId || r.author_id,
                                      authorName: replyTo?.authorName || commentAuthor.name,
                                    },
                                  }));
                                };

                                return (
                                  <div key={r.id} className="flex items-start gap-2">
                                    <img src={commentAuthor.avatar} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                                    <div className="flex-1 rounded-2xl px-3 py-2" style={{ backgroundColor: 'var(--orbit-card)' }}>
                                      <div className="flex items-start justify-between gap-3 mb-0.5">
                                        <div className="flex items-center gap-2">
                                          <p className="text-[#00FFB3] text-xs font-medium">{commentAuthor.name}</p>
                                          {replyTo && (
                                            <span className="text-[11px] text-[color:var(--orbit-text-muted,#9ca3af)]">回复 {replyTo.authorName}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={handleReply}
                                            className="text-[11px] text-[color:var(--orbit-text-muted,#9ca3af)] hover:text-[#00FFB3] transition-colors"
                                          >回复</button>
                                          {canDeleteComment && (
                                            <button
                                              type="button"
                                              onClick={() => void deleteRoast(memory.id, r.id)}
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
                              {replyTarget[memory.id] && (
                                <div className="flex items-center gap-2 px-1 text-xs" style={{ color: 'var(--orbit-text-muted,#9ca3af)' }}>
                                  <span>回复 {replyTarget[memory.id]?.authorName}</span>
                                  <button
                                    type="button"
                                    className="hover:text-[#00FFB3]"
                                    onClick={() => setReplyTarget(prev => ({ ...prev, [memory.id]: null }))}
                                  >取消</button>
                                </div>
                              )}
                              <div className="flex items-start gap-2">
                                <img src={currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest'} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <div
                                    className="flex items-center gap-2 rounded-2xl px-3 py-2 border"
                                    style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                                  >
                                    <input
                                      type="text"
                                      placeholder="文字 + 表情 或 留空配语音"
                                      value={roastInput[memory.id] || ''}
                                      onChange={(e) => setRoastInput(prev => ({ ...prev, [memory.id]: e.target.value }))}
                                      onKeyDown={(e) => { if (e.key === 'Enter') void addRoast(memory.id); }}
                                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--orbit-text-muted,#9ca3af)]"
                                      style={{ color: 'var(--orbit-text)' }}
                                    />
                                    <button
                                      onClick={() => void addRoast(memory.id)}
                                      disabled={(!roastInput[memory.id]?.trim() && !(commentAudios[memory.id]?.length)) || submittingRoasts[memory.id]}
                                      className="text-[#00FFB3] text-sm font-semibold disabled:opacity-30 shrink-0"
                                    >{submittingRoasts[memory.id] ? <FaSpinner className="animate-spin" /> : '发'}</button>
                                  </div>
                                  <VoiceRecorder
                                    userId={currentUser?.id || ''}
                                    audios={commentAudios[memory.id] || []}
                                    onAudiosChange={(urls) => setCommentAudios(prev => ({ ...prev, [memory.id]: urls }))}
                                    compact
                                  />
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))
        )}

        <AnimatePresence>
          {showStoryEntry && (
            <motion.div
              key="story-entry"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[180] backdrop-blur-md flex items-center justify-center px-4 memory-overlay"
              style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 92%, rgba(0,0,0,0.65))' }}
              onClick={() => setShowStoryEntry(false)}
            >
              <motion.div
                initial={{ scale: 0.96, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, y: 10, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                className="w-full max-w-3xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 mb-6">
                  {/* 角色筛选 */}
                  <div
                    className="mb-3 rounded-2xl border p-3 flex items-center justify-between"
                    style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                  >
                    <p className="text-sm font-semibold shrink-0" style={{ color: 'var(--orbit-text)' }}>查看范围</p>
                    <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--orbit-border)' }}>
                      {(['all', 'mine', 'others'] as const).map((v, i) => {
                        const label = v === 'all' ? '全部' : v === 'mine' ? '我发布的' : '为我发布';
                        const active = albumRoleFilter === v;
                        return (
                          <button
                            key={v}
                            onClick={() => setAlbumRoleFilter(v)}
                            className={`px-3 py-1.5 text-xs font-semibold transition-colors${i > 0 ? ' border-l' : ''}`}
                            style={{
                              borderColor: 'var(--orbit-border)',
                              background: active ? '#00FFB3' : 'var(--orbit-surface)',
                              color: active ? '#000' : 'var(--orbit-text-muted, #9ca3af)',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    className="mb-4 rounded-2xl border p-4"
                    style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--orbit-text)' }}>按时间范围筛选</p>
                        <p className="text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>默认查看全部，可选择一段时间的回忆相册</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--orbit-text)' }}>
                          <span>从</span>
                          <div className="relative">
                            {!albumDateRange.start && (
                              <span
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                style={{ color: 'var(--orbit-text)', opacity: 0.55 }}
                              >
                                年/月/日
                              </span>
                            )}
                            <input
                              type="date"
                              placeholder="年/月/日"
                              value={albumDateRange.start}
                              onChange={(e) => setAlbumDateRange((prev) => ({ ...prev, start: e.target.value }))}
                              className="rounded-lg pl-2 pr-2 py-1 text-sm border min-w-[140px]"
                              style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                            />
                          </div>
                        </label>
                        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--orbit-text)' }}>
                          <span>到</span>
                          <div className="relative">
                            {!albumDateRange.end && (
                              <span
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                style={{ color: 'var(--orbit-text)', opacity: 0.55 }}
                              >
                                年/月/日
                              </span>
                            )}
                            <input
                              type="date"
                              placeholder="年/月/日"
                              value={albumDateRange.end}
                              onChange={(e) => setAlbumDateRange((prev) => ({ ...prev, end: e.target.value }))}
                              className="rounded-lg pl-2 pr-2 py-1 text-sm border min-w-[140px]"
                              style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                            />
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => { setAlbumDateRange({ start: '', end: '' }); setCurrentMonth(''); setAlbumRoleFilter('all'); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                          style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                        >清空</button>
                      </div>
                    </div>
                  </div>
                </div>

                <MemoryStoryEntry
                  memories={albumFilteredMemories}
                  onClick={(memories) => {
                    setActiveStoryMemories(memories);
                    setShowStoryEntry(false);
                  }}
                  friends={friends.map((f: any) => ({ id: f.friend.id, name: f.friend.username, avatar: f.friend.avatar_url }))}
                  selectedFriendIds={albumFilterFriendIds}
                  onSelectFriend={(ids) => setAlbumFilterFriendIds(ids)}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAlbumFilterDialog && (
            <motion.div
              key="album-filter-dialog"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[190] backdrop-blur-md flex items-center justify-center px-6 memory-overlay"
              style={{ backgroundColor: 'color-mix(in srgb, var(--orbit-surface) 92%, rgba(0,0,0,0.65))' }}
              onClick={() => setShowAlbumFilterDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                className="w-full max-w-md rounded-2xl border p-4 shadow-xl"
                style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--orbit-text)' }}>按时间范围筛选</p>
                    <p className="text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>仅筛选回忆流，不会打开相册播放</p>
                  </div>
                  <button onClick={() => setShowAlbumFilterDialog(false)} className="text-xs text-[color:var(--orbit-text-muted,#9ca3af)]">关闭</button>
                </div>

                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--orbit-text)' }}>
                    <span>月份</span>
                    <div className="relative">
                      <div className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border`} style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)' }}>
                        <span className="text-sm font-mono">{currentMonth ? currentMonth.replace('-', ' / ') : '全部'}</span>
                        <ChevronDownIcon className="text-[10px] opacity-50" />
                        <input type="month" value={currentMonth} onChange={(e) => setCurrentMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      </div>
                    </div>
                  </label>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentMonth('');
                        setAlbumDateRange({ start: '', end: '' });
                        setShowAlbumFilterDialog(false);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                      style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', color: 'var(--orbit-text)' }}
                    >清空</button>
                    <button type="button" onClick={() => setShowAlbumFilterDialog(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-white">应用</button>
                  </div>
                </div>

              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Story Drawer：保持上下文，不跳页 */}
      <AnimatePresence>
        {activeStoryMemories && (
          <MemoryStoryDrawer
            key={activeStoryMemories
              .map((m, idx) => m?.id || m?.created_at || `memory-${idx}`)
              .join('|') || 'memory-drawer'}
            memories={activeStoryMemories}
            onClose={() => setActiveStoryMemories(null)}
            onShare={(memory) => handleShareMemory(memory)}
          />
        )}
      </AnimatePresence>

      {/* 创建记忆弹窗 */}
      {/* ================= 弹窗区 ================= */}

      {/* 1. 创建记忆弹窗 (新建模式：不传 editData) */}
      <AnimatePresence>
        {isCreateOpen && (
          <CreateMemoryModal
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            onSuccess={fetchMemories}
            friends={friends}
            initialDraft={memoryStreamDraft}
            onDraftChange={setMemoryStreamDraft}
            onClearDraft={clearMemoryStreamDraft}
            refreshSessionQuick={refreshSessionQuick}
          />
        )}
      </AnimatePresence>

      {/* 2. 编辑记忆弹窗 (全量编辑模式：传入 editData，并复用 CreateMemoryModal！) */}
      <AnimatePresence>
        {editingMemory && (
          <CreateMemoryModal
            isOpen={!!editingMemory}
            onClose={() => setEditingMemory(null)}
            onSuccess={fetchMemories}
            friends={friends}
            editData={editingMemory} // ✨ 传过去回显！
            refreshSessionQuick={refreshSessionQuick}
          />
        )}
      </AnimatePresence>

      {/* 3. 记忆详情弹窗 */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedMemory && (
            <MemoryDetailModal
              memory={selectedMemory}
              onClose={() => setSelectedMemory(null)}
              friends={friends}
              currentUser={currentUser}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      <AnimatePresence>
        {showNotificationSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNotificationSheet(false)}
              className="fixed inset-0 z-[190] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-20 left-0 right-0 z-[191] flex flex-col rounded-t-3xl border-t shadow-2xl safe-bottom"
              style={{
                backgroundColor: 'var(--orbit-surface)',
                borderColor: 'var(--orbit-border)',
                maxHeight: '70vh'
              }}
            >
              <div className="w-full flex justify-center pt-3 pb-2 cursor-pointer" onClick={() => setShowNotificationSheet(false)}>
                <div className="w-12 h-1.5 rounded-full bg-gray-400/30" />
              </div>

              <div className="px-6 pb-4 flex-1 overflow-hidden flex flex-col">
                <h2 className="text-lg font-bold mb-4 shrink-0" style={{ color: 'var(--orbit-text)' }}>新评论</h2>

                <div className="overflow-y-auto hide-scrollbar flex flex-col gap-3 pb-6 flex-1">
                  {unreadCommentItems.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>暂无未读评论</p>
                  ) : (
                    unreadCommentItems.map(({ memory, comment, author }: any) => {
                      const decoded = decodeCommentContent(comment.content);
                      return (
                        <div
                          key={comment.id}
                          className="p-3 rounded-2xl flex gap-3 items-start border cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                          onClick={() => {
                            setShowNotificationSheet(false);
                            setSelectedMemory(memory);
                            markCommentsAsRead(memory.id);
                          }}
                        >
                          <img src={author.avatar} className="w-8 h-8 rounded-full bg-gray-200 object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--orbit-text)' }}>{author.name}</p>
                              <span className="text-[10px]" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{formatTime(comment.created_at)}</span>
                            </div>
                            <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                              {decoded.audioUrl ? '🎤 [语音评论]' : decoded.text}
                            </p>
                          </div>
                          {memory.photos?.[0] && (
                            <img src={memory.photos[0]} className="w-10 h-10 rounded-lg object-cover ml-1 opacity-80" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLikeNotificationSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => {
                memories.forEach((m: any) => {
                  if (hasUnreadLikes(m)) {
                    const otherLikers = (reactions[m.id]?.likers || []).filter((id: string) => id !== currentUser?.id);
                    markMemoryLikesRead(m.id, otherLikers.length);
                  }
                });
                setShowLikeNotificationSheet(false);
              }}
              className="fixed inset-0 z-[190] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-20 left-0 right-0 z-[191] flex flex-col rounded-t-3xl border-t shadow-2xl safe-bottom"
              style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)', maxHeight: '70vh' }}
            >
              <div className="w-full flex justify-center pt-3 pb-2 cursor-pointer" onClick={() => {
                memories.forEach((m: any) => {
                  if (hasUnreadLikes(m)) {
                    const otherLikers = (reactions[m.id]?.likers || []).filter((id: string) => id !== currentUser?.id);
                    markMemoryLikesRead(m.id, otherLikers.length);
                  }
                });
                setShowLikeNotificationSheet(false);
              }}>
                <div className="w-12 h-1.5 rounded-full bg-gray-400/30" />
              </div>

              <div className="px-6 pb-4 flex-1 overflow-hidden flex flex-col">
                <h2 className="text-lg font-bold mb-4 shrink-0" style={{ color: 'var(--orbit-text)' }}>新的赞</h2>

                <div className="overflow-y-auto hide-scrollbar flex flex-col gap-3 pb-6 flex-1">
                  {unreadLikeItems.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>暂无未读点赞</p>
                  ) : (
                    unreadLikeItems.map(({ memory, newLikerIds, latestLiker }: any) => (
                      <div
                        key={memory.id}
                        className="p-3 rounded-2xl flex gap-3 items-start border cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                        onClick={() => {
                          const otherLikers = (reactions[memory.id]?.likers || []).filter((id: string) => id !== currentUser?.id);
                          markMemoryLikesRead(memory.id, otherLikers.length);
                          setShowLikeNotificationSheet(false);
                          setSelectedMemory(memory);
                        }}
                      >
                        <img src={latestLiker.avatar} className="w-8 h-8 rounded-full bg-gray-200 object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--orbit-text)' }}>
                              {newLikerIds.length > 1 ? `${latestLiker.name} 等 ${newLikerIds.length} 人` : latestLiker.name}
                            </p>
                            <FaHeart className="text-red-400 text-xs shrink-0" />
                          </div>
                          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                            赞了你的回忆{memory.content ? `：${memory.content.slice(0, 30)}${memory.content.length > 30 ? '…' : ''}` : ''}
                          </p>
                        </div>
                        {memory.photos?.[0] && (
                          <img src={memory.photos[0]} className="w-10 h-10 rounded-lg object-cover ml-1 opacity-80" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeInteractionMemoryId && (() => {
          const memory = memories.find(m => m.id === activeInteractionMemoryId);
          if (!memory) return null;

          const reaction = getReaction(memory.id);

          const handleReply = (comment: MemoryCommentItem) => {
            const commentAuthor = getCommentAuthor(memory, comment.author_id);
            const decoded = decodeCommentContent(comment.content);
            const replyTo = decoded.replyTo;

            setReplyTarget(prev => ({
              ...prev,
              [memory.id]: {
                commentId: comment.id,
                authorId: replyTo?.authorId || comment.author_id,
                authorName: replyTo?.authorName || commentAuthor.name,
              }
            }));
          };

          return (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveInteractionMemoryId(null)}
                className="fixed inset-0 z-[190] bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed left-0 right-0 z-[191] flex flex-col rounded-t-3xl border-t shadow-2xl safe-bottom max-h-[85vh]"
                style={{
                  backgroundColor: 'var(--orbit-surface)',
                  borderColor: 'var(--orbit-border)',
                  bottom: kbHeight > 0 ? `${kbHeight}px` : 0,
                  transition: 'bottom 200ms cubic-bezier(0.33, 1, 0.68, 1)',
                }}
              >
                <div className="w-full flex justify-center pt-3 pb-2 cursor-pointer" onClick={() => setActiveInteractionMemoryId(null)}>
                  <div className="w-12 h-1.5 rounded-full bg-gray-400/30" />
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="px-6 pb-4 border-b border-[var(--orbit-border)] flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-bold" style={{ color: 'var(--orbit-text)' }}>互动详情</h2>
                    <button onClick={() => setActiveInteractionMemoryId(null)} className="p-2 -mr-2 text-[var(--orbit-text-muted, #9ca3af)]">
                      <FaTimes />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto hide-scrollbar">
                    {reaction.likers && reaction.likers.length > 0 && (
                      <div className="px-6 py-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--orbit-text)' }}>
                          <FaHeart className="text-red-500" />
                          <span>{reaction.likes} 人赞过</span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {reaction.likers.map(uid => {
                            const liker = getMemoryAuthor(uid) || { name: 'Unknown', avatar: 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + uid };
                            return (
                              <div key={uid} className="flex flex-col items-center gap-1 w-12">
                                <img src={liker.avatar} className="w-10 h-10 rounded-full object-cover border border-[var(--orbit-border)]" />
                                <span className="text-[10px] truncate w-full text-center" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{liker.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {reaction.likers?.length > 0 && reaction.roasts?.length > 0 && (
                      <div className="h-2 bg-black/5 dark:bg-white/5 shrink-0" />
                    )}

                    <div className="px-6 py-4 pb-20 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--orbit-text)' }}>
                        <FaComment className="text-[var(--orbit-text)]" />
                        <span>{reaction.roasts.length} 条评论</span>
                      </div>

                      {reaction.roasts.length === 0 ? (
                        <div className="py-8 text-center text-sm" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                          暂无评论，快来抢沙发～
                        </div>
                      ) : (
                        reaction.roasts.map((r: MemoryCommentItem) => {
                          const commentAuthor = getCommentAuthor(memory, r.author_id);
                          const canDeleteComment = currentUser?.id === r.author_id || currentUser?.id === memory.user_id;
                          const decoded = decodeCommentContent(r.content);
                          const replyTo = decoded.replyTo;

                          return (
                            <div key={r.id} className="flex items-start gap-3">
                              <img src={commentAuthor.avatar} className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold" style={{ color: 'var(--orbit-text)' }}>{commentAuthor.name}</span>
                                      <span className="text-[10px]" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>{formatTime(r.created_at)}</span>
                                    </div>
                                    {replyTo && (
                                      <span className="text-xs text-[var(--orbit-text-muted, #9ca3af)] mt-0.5">回复 {replyTo.authorName}</span>
                                    )}
                                  </div>
                                </div>

                                <div
                                  className="mt-1.5 p-3 rounded-xl text-sm leading-relaxed"
                                  style={{ backgroundColor: 'var(--orbit-card)', color: 'var(--orbit-text)' }}
                                  onClick={() => handleReply(r)}
                                >
                                  {decoded.audioUrl && (
                                    <audio src={decoded.audioUrl} controls className="w-full h-8 mb-1" />
                                  )}
                                  {(decoded.text || !decoded.audioUrl) && decoded.text}
                                </div>

                                <div className="flex items-center gap-4 mt-1.5 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => handleReply(r)}
                                    className="text-xs font-medium text-[var(--orbit-text-muted, #9ca3af)] hover:text-[#00FFB3]"
                                  >回复</button>
                                  {canDeleteComment && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); void deleteRoast(memory.id, r.id); }}
                                      className="text-xs font-medium text-[var(--orbit-text-muted, #9ca3af)] hover:text-red-500"
                                    >删除</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="p-3 border-t bg-[var(--orbit-surface)] shrink-0" style={{ borderColor: 'var(--orbit-border)' }}>
                    {replyTarget[memory.id] && (
                      <div className="flex items-center gap-2 px-2 pb-2 text-xs" style={{ color: 'var(--orbit-text-muted, #9ca3af)' }}>
                        <span>回复 {replyTarget[memory.id]?.authorName}</span>
                        <button
                          type="button"
                          className="hover:text-[#00FFB3]"
                          onClick={() => setReplyTarget(prev => ({ ...prev, [memory.id]: null }))}
                        >取消</button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <img src={currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest'} className="w-8 h-8 rounded-full object-cover shrink-0 mb-1" />
                      <div className="flex-1 space-y-2">
                        <div
                          className="flex items-center gap-2 rounded-2xl px-3 py-2 border bg-[var(--orbit-card)]"
                          style={{ borderColor: 'var(--orbit-border)' }}
                        >
                          <input
                            type="text"
                            placeholder={replyTarget?.[memory.id] ? `回复 @${replyTarget[memory.id]?.authorName}` : "说点什么..."}
                            value={roastInput[memory.id] || ''}
                            onChange={(e) => setRoastInput(prev => ({ ...prev, [memory.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') void addRoast(memory.id); }}
                            className="bg-transparent text-sm w-full outline-none placeholder:text-gray-400"
                            style={{ color: 'var(--orbit-text)' }}
                          />
                          <button
                            onClick={() => void addRoast(memory.id)}
                            disabled={(!roastInput[memory.id]?.trim() && !(commentAudios[memory.id]?.length)) || submittingRoasts[memory.id]}
                            className="text-[#00FFB3] text-sm font-semibold disabled:opacity-30 shrink-0"
                          >{submittingRoasts[memory.id] ? <FaSpinner className="animate-spin text-lg" /> : '发送'}</button>
                        </div>
                        <VoiceRecorder
                          userId={currentUser?.id || ''}
                          audios={commentAudios[memory.id] || []}
                          onAudiosChange={(urls) => setCommentAudios(prev => ({ ...prev, [memory.id]: urls }))}
                          compact
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      <ReportPage
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetName={reportingFriend?.username || reportingFriend?.friend_name || '该用户'}
        onSubmit={handleSubmitReport}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
