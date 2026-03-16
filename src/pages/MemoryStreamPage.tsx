import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaMapMarkerAlt, FaAt, FaDollarSign, FaSpinner, FaCheckCircle, FaCalendarAlt, FaCamera, FaChevronRight, FaImages, FaHeart, FaQuoteLeft, FaSearch, FaCheck, FaPlus, FaEdit, FaTrash, FaComment, FaMicrophone, FaShareAlt, FaBookOpen, FaPause, FaPlay, FaStepBackward, FaStepForward, FaLock } from 'react-icons/fa';
import { useMemoryStore, useUserStore, useLedgerStore } from '../store';
import { useAppStore } from '../store/app';
import { MemoryStreamDraft, useUIStore } from '../store/ui';
import { supabase, createMemory, createLocation, createLedger, updateLedger, deleteLedger, getLedgerByMemory, getMemoryComments, addMemoryComment, deleteMemoryComment } from '../api/supabase';
import MediaUploader, { VoiceRecorder } from '../components/MediaUploader';
import { MemoryStoryEntry, MemoryStoryDrawer } from './MemoryStreamPage/components/SharedMemoryAlbumBookFixed';
import MemoryDetailModal from './MemoryStreamPage/components/MemoryDetailModal';
import PullToRefresh from '../components/PullToRefresh';
import { track } from '../utils/analytics';
import { readSettings, SETTINGS_EVENT, shouldAllowRefresh } from '../utils/settings';
import { getTaggedDisplayName, getVisibleTaggedFriendIds } from '../utils/tagVisibility';

// 高德地图 API 配置
const AMAP_KEY = '2c322381589d30cd71d9275748b8b02c';
const AMAP_SECURITY_CODE = '34af5b9d582fa1ec0ac3b5d8840917a3';

// 配置安全密钥
(window as any)._AMapSecurityConfig = {
  securityJsCode: AMAP_SECURITY_CODE,
};

// 高德地点搜索结果类型
interface AMapPoi {
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
}

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

// ── 天气 / 心情 / 路线 元数据编解码 ──────────────────────────────
const WEATHER_OPTIONS = [
  { emoji: '☀️', label: '晴天' }, { emoji: '⛅', label: '多云' },
  { emoji: '🌧️', label: '下雨' }, { emoji: '❄️', label: '下雪' },
  { emoji: '🌈', label: '彩虹' }, { emoji: '🌪️', label: '大风' },
  { emoji: '🌫️', label: '大雾' }, { emoji: '⛈️', label: '雷雨' },
];
const MOOD_OPTIONS = [
  { emoji: '😊', label: '开心' }, { emoji: '😍', label: '幸福' },
  { emoji: '🥰', label: '甜蜜' }, { emoji: '😎', label: '酷' },
  { emoji: '🥺', label: '感动' }, { emoji: '😢', label: '落泪' },
  { emoji: '😤', label: '疲惫' }, { emoji: '🤩', label: '超棒' },
  { emoji: '🤔', label: '迷茫' }, { emoji: '😴', label: '困了' },
];

const META_PREFIX = '[orbit_meta:';

const encodeMemoryContent = (text: string, meta: { weather: string; mood: string; route: string }) => {
  if (!meta.weather && !meta.mood && !meta.route) return text;
  return `${META_PREFIX}${JSON.stringify(meta)}]\n${text}`;
};

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

// 按日期分组记忆
const groupMemoriesByDate = (memories: any[]) => {
  const groups: { [key: string]: any[] } = {};

  const sortedMemories = [...memories].sort((a, b) => {
    const dateA = new Date(a.memory_date || a.created_at);
    const dateB = new Date(b.memory_date || b.created_at);
    return dateB.getTime() - dateA.getTime();
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

// 提取城市名（高德地址格式：省市区...)
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

const isInChina = (lat: number, lng: number) => {
  // Rough bounding box for mainland China
  return lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135;
};

const searchNominatim = async (keyword: string) => {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=10&addressdetails=1&q=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6' },
  });
  if (!res.ok) return [] as AMapPoi[];
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
    } as AMapPoi;
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
  } as AMapPoi;
};

// 地点搜索组件
const LocationSearch = ({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (poi: AMapPoi) => void;
}) => {
  const [results, setResults] = useState<AMapPoi[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const placeSearchRef = useRef<any>(null);
  const aMapRef = useRef<any>(null); // 保存 AMap 实例，供 Geocoder 使用
  const lastKnownCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // 初始化高德地点搜索
  useEffect(() => {
    const initPlaceSearch = async () => {
      try {
        const AMap = await import('@amap/amap-jsapi-loader').then(m => m.default.load({
          key: AMAP_KEY,
          version: '2.0',
          plugins: ['AMap.PlaceSearch', 'AMap.Geocoder'],
        }));

        aMapRef.current = AMap;
        
        placeSearchRef.current = new AMap.PlaceSearch({
          pageSize: 10,
          pageIndex: 1,
        });
      } catch (error) {
        console.error('初始化地点搜索失败:', error);
      }
    };
    
    initPlaceSearch();
  }, []);

  // 搜索地点
  const searchLocation = async (keyword: string) => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }

    const last = lastKnownCoordsRef.current;
    const preferGlobal = !!last && !isInChina(last.lat, last.lng);
    const hasAmap = !!placeSearchRef.current;

    setSearching(true);

    if (!hasAmap || preferGlobal) {
      try {
        const pois = await searchNominatim(keyword.trim());
        setResults(pois);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
      return;
    }

    placeSearchRef.current.search(keyword, async (status: string, result: any) => {
      if (status === 'complete' && result.poiList?.pois?.length) {
        const pois = result.poiList.pois.map((poi: any) => ({
          id: poi.id,
          name: poi.name,
          address: poi.address || poi.pname + poi.cityname + poi.adname,
          location: `${poi.location.lng},${poi.location.lat}`,
          type: poi.type,
        }));
        setResults(pois);
        setSearching(false);
        return;
      }

      // 若在海外或 AMap 无结果，尝试全球服务
      if (preferGlobal) {
        try {
          const pois = await searchNominatim(keyword.trim());
          setResults(pois);
        } catch {
          setResults([]);
        }
      } else {
        setResults([]);
      }
      setSearching(false);
    });
  };

  // 输入防抖 - 增加到 500ms 减少请求频率
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
  }, [value]);

  const handleSelect = (poi: AMapPoi) => {
    onChange(poi.name);
    onSelect(poi);
    setShowResults(false);
  };

  // GPS 定位
  const [locating, setLocating] = useState(false);
  const handleGPS = () => {
    if (!navigator.geolocation) { alert('浏览器不支持定位'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        lastKnownCoordsRef.current = { lat, lng };
        const inChina = isInChina(lat, lng);

        // 优先用已加载的 AMap 实例（仅在国内）
        const AMap = aMapRef.current || (window as any).AMap;
        if (inChina && AMap?.Geocoder) {
          const gc = new AMap.Geocoder({ radius: 500 });
          gc.getAddress([lng, lat], (status: string, result: any) => {
            if (status === 'complete' && result.regeocode) {
              const addr = result.regeocode;
              const name = addr.pois?.[0]?.name || addr.formattedAddress?.slice(-10) || '我的位置';
              const poi: AMapPoi = {
                id: `gps-${Date.now()}`,
                name,
                address: addr.formattedAddress || '',
                location: `${lng},${lat}`,
                type: '',
              };
              onChange(poi.name);
              onSelect(poi);
            } else {
              // 逆地址解析失败，用坐标兜底
              const poi: AMapPoi = { id: `gps-${Date.now()}`, name: '我的位置', address: `${lat.toFixed(5)},${lng.toFixed(5)}`, location: `${lng},${lat}`, type: '' };
              onChange(poi.name);
              onSelect(poi);
            }
          });
          return;
        }

        // 海外：使用全球服务
        try {
          const poi = await reverseNominatim(lat, lng);
          if (poi) {
            onChange(poi.name);
            onSelect(poi);
            return;
          }
        } catch {
          // ignore
        }

        // 兜底：显示坐标
        const fallbackPoi: AMapPoi = {
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
    <div className="relative">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5">
        <div className="p-2 rounded-full bg-[#00FFB3]/10">
          <FaMapMarkerAlt className="text-[#00FFB3]" />
        </div>
        <input
          type="text"
          placeholder="搜索地点（如：星巴克、外滩）"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => value.trim() && setShowResults(true)}
          className="flex-1 bg-transparent text-white placeholder-white/30 outline-none min-w-0"
        />
        {searching && <FaSpinner className="text-white/30 animate-spin shrink-0" />}
        <button
          type="button"
          onClick={handleGPS}
          title="用我的位置"
          className="shrink-0 p-2 rounded-full bg-[#00FFB3]/10 hover:bg-[#00FFB3]/20 text-[#00FFB3] transition-colors"
        >
          {locating ? <FaSpinner className="animate-spin text-xs" /> : <span className="text-xs">📍</span>}
        </button>
      </div>

      {/* 搜索结果 */}
      <AnimatePresence>
        {showResults && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-xl bg-[#2a2a2a] border border-white/10 z-10"
          >
            {results.map((poi) => (
              <button
                key={poi.id}
                onClick={() => handleSelect(poi)}
                className="w-full p-3 text-left hover:bg-white/5 border-b border-white/5 last:border-0"
              >
                <div className="text-white font-medium">{poi.name}</div>
                <div className="text-white/40 text-sm truncate">{poi.address}</div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* 无结果提示 */}
      <AnimatePresence>
        {showResults && !searching && value.trim() && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 p-4 rounded-xl bg-[#2a2a2a] border border-white/10 z-10 text-center"
          >
            <p className="text-white/40 text-sm">未找到相关地点</p>
          </motion.div>
        )}
      </AnimatePresence>
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
      <div className="p-4 rounded-xl bg-white/5 text-center">
        <p className="text-white/40 text-sm">还没有好友</p>
        <p className="text-white/20 text-xs mt-1">去主页添加好友吧</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-white/40 text-sm mb-2">选择一起的人</div>
      <div className="flex flex-wrap gap-2">
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
              className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#00FFB3]/20 border-[#00FFB3] text-[#00FFB3]'
                  : 'bg-white/5 border-white/10 text-white/60'
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
    ['7','8','9','÷'],
    ['4','5','6','×'],
    ['1','2','3','-'],
    ['C','0','.', '+'],
  ];
  return (
    <div className="bg-black/50 rounded-2xl p-3 space-y-2 border border-white/10">
      <div className="text-right px-2 py-1 text-white font-mono text-xl min-h-[2.5rem] tracking-wide">{expr || '0'}</div>
      {BTN_ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-4 gap-1.5">
          {row.map(btn => (
            <button key={btn} type="button" onClick={() => press(btn)}
              className={`py-3 rounded-xl text-sm font-semibold active:scale-95 transition-all ${
                ['÷','×','-','+'].includes(btn) ? 'bg-[#FF9F43]/20 text-[#FF9F43] border border-[#FF9F43]/20' :
                btn === 'C' ? 'bg-red-500/20 text-red-400' :
                btn === '←' ? 'bg-white/10 text-white/60' :
                'bg-white/10 text-white hover:bg-white/20'}`}>{btn}</button>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => { const r = evaluate(expr); if (r !== null) onConfirm(r); }}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-bold">= 确认</button>
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  friends: any[];
  editData?: any;
  initialDraft?: MemoryStreamDraft | null;
  onDraftChange?: (draft: MemoryStreamDraft) => void;
  onClearDraft?: () => void;
}) => {
  const { currentUser } = useUserStore(); 
  const isEditMode = !!editData;

  // 解析已有记忆的元数据（编辑模式）
  const existingMeta = useMemo(() => decodeMemoryContent(editData?.content || ''), [editData?.content]);

  // 1. 状态定义
  const [content, setContent] = useState(isEditMode ? (existingMeta.text || '') : (initialDraft?.content || ''));
  const [weather, setWeather] = useState(isEditMode ? existingMeta.weather : (initialDraft?.weather || ''));
  const [mood, setMood] = useState(isEditMode ? existingMeta.mood : (initialDraft?.mood || ''));
  const [route, setRoute] = useState(isEditMode ? existingMeta.route : (initialDraft?.route || ''));
  const [locationName, setLocationName] = useState(isEditMode ? (editData?.location?.name || '') : (initialDraft?.locationName || ''));
  const [selectedLocation, setSelectedLocation] = useState<AMapPoi | null>(
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

  // 2. 逻辑处理
  const toggleFriend = (friendId: string) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]
    );
  };

  const handleLocationSelect = (poi: AMapPoi) => {
    setSelectedLocation(poi);
  };
  
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
      className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-xl" 
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: '100%' }} 
        animate={{ y: 0 }} 
        exit={{ y: '100%' }} 
        transition={{ type: 'spring', damping: 25, stiffness: 300 }} 
        className="absolute bottom-0 left-0 right-0 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-[#1a1a1a] border-t border-white/10 pb-24" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="sticky top-0 flex items-center justify-between px-4 py-4 bg-[#1a1a1a] border-b border-white/5 z-20">
          <button onClick={onClose} className="text-white/60">取消</button>
          <span className="text-white font-semibold">{isEditMode ? '编辑回忆' : '记录此刻'}</span>
          <button 
            onClick={handleSubmit} 
            disabled={(!content.trim() && audios.length === 0 && photos.length === 0 && videos.length === 0) || isSubmitting} 
            className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold disabled:opacity-30"
          >
            {isSubmitting ? <FaSpinner className="animate-spin" /> : (isEditMode ? '保存修改' : '发布')}
          </button>
        </div>
        
        {/* 内容区 */}
        <div className="p-4 space-y-6">
          {editError && (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
              {editError}
            </div>
          )}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <div className="p-2 rounded-full bg-[#00D9FF]/10"><FaCalendarAlt className="text-[#00D9FF]" /></div>
            <input type="datetime-local" value={memoryDate} onChange={(e) => setMemoryDate(e.target.value)} className="flex-1 bg-transparent text-white outline-none [color-scheme:dark]" />
          </div>

          <div className="relative z-10">
             <LocationSearch value={locationName} onChange={setLocationName} onSelect={handleLocationSelect} />
          </div>
          
          {/* 天气选择 */}
          <div>
            <p className="text-white/40 text-xs mb-2">那天天气</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {WEATHER_OPTIONS.map((w) => (
                <button
                  key={w.emoji}
                  type="button"
                  onClick={() => setWeather(weather === w.emoji ? '' : w.emoji)}
                  className={`shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all ${
                    weather === w.emoji ? 'bg-sky-500/20 border-sky-400/50 text-white' : 'bg-white/5 border-white/5 text-white/50'
                  }`}
                >
                  <span className="text-xl">{w.emoji}</span>
                  <span className="text-[10px]">{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 心情选择 */}
          <div>
            <p className="text-white/40 text-xs mb-2">那天心情</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.emoji}
                  type="button"
                  onClick={() => setMood(mood === m.emoji ? '' : m.emoji)}
                  className={`shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all ${
                    mood === m.emoji ? 'bg-[#00FFB3]/20 border-[#00FFB3]/50 text-white' : 'bg-white/5 border-white/5 text-white/50'
                  }`}
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className="text-[10px]">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 行程路线 */}
          <div>
            <p className="text-white/40 text-xs mb-2">行程路线 <span className="text-white/20">（用 → 分隔地点，如：酒店 → 故宫 → 烤鸭店）</span></p>
            <input
              type="text"
              placeholder="例：机场 → 酒店 → 景点 → 餐厅"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              className="w-full bg-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none border border-white/10 placeholder-white/20"
            />
          </div>

          {/* 内容输入：文字 + 语音 */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <textarea
              placeholder="写点什么..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-transparent text-white outline-none resize-none text-lg px-4 pt-4 pb-2"
            />
            <div className="border-t border-white/10 px-4 py-3">
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
          
          <div className="flex items-center justify-between py-4 border-t border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-[#FF9F43]/10"><FaDollarSign className="text-[#FF9F43]" /></div>
              <span className="text-white/80">顺便记账</span>
            </div>
            <button onClick={() => setEnableLedger(!enableLedger)} className={`w-12 h-6 rounded-full transition-colors ${enableLedger ? 'bg-[#FF9F43]' : 'bg-white/10'}`}>
              <motion.div animate={{ x: enableLedger ? 24 : 2 }} className="w-5 h-5 rounded-full bg-white shadow" />
            </button>
          </div>
          
          {enableLedger && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {/* 个人 / 均分 */}
              <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                {(['personal', 'equal'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setSplitType(t)}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${splitType === t ? 'bg-[#FF9F43] text-black' : 'text-white/50 hover:text-white'}`}>
                    {t === 'personal' ? '👤 个人' : '👥 均分'}
                  </button>
                ))}
              </div>

              {/* 消费项目列表 */}
              {ledgerItems.map((item) => (
                <div key={item.id} className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
                  {/* 类别 + 删除 */}
                  <div className="flex items-center gap-1">
                    <div className="flex gap-1 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
                      {CATEGORIES.map(cat => (
                        <button key={cat} type="button" onClick={() => updateLedgerItem(item.id, 'category', cat)}
                          className={`shrink-0 px-2 py-1 rounded-lg text-xs transition-all ${
                            item.category === cat
                              ? 'bg-[#FF9F43]/20 text-[#FF9F43] border border-[#FF9F43]/30'
                              : 'bg-white/5 text-white/40 border border-transparent'
                          }`}>{cat}</button>
                      ))}
                    </div>
                    {ledgerItems.length > 1 && (
                      <button type="button" onClick={() => removeLedgerItem(item.id)}
                        className="shrink-0 p-1.5 text-white/30 hover:text-red-400 transition-colors">
                        <FaTimes className="text-xs" />
                      </button>
                    )}
                  </div>
                  {/* 备注 + 金额按钮 */}
                  <div className="flex gap-2">
                    <input type="text" placeholder="备注（选填）" value={item.note}
                      onChange={e => updateLedgerItem(item.id, 'note', e.target.value)}
                      className="flex-1 bg-white/5 rounded-xl px-3 py-2 text-white text-sm outline-none border border-white/10 placeholder-white/30" />
                    <button type="button"
                      onClick={() => setActiveCalcId(activeCalcId === item.id ? null : item.id)}
                      className="shrink-0 min-w-[80px] flex items-center justify-end px-3 py-2 rounded-xl bg-[#FF9F43]/10 border border-[#FF9F43]/20 text-[#FF9F43] font-mono font-bold text-sm">
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
                className="w-full py-2.5 rounded-xl border border-dashed border-white/20 text-white/40 text-sm flex items-center justify-center gap-1.5 hover:border-[#FF9F43]/40 hover:text-[#FF9F43] transition-colors">
                <FaPlus className="text-xs" /> 添加项目
              </button>

              {/* 合计 */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#FF9F43]/10 border border-[#FF9F43]/20">
                <span className="text-white/60 text-sm">合计</span>
                <span className="text-[#FF9F43] font-bold text-xl">¥ {totalAmount.toFixed(2)}</span>
              </div>

              {/* 均分说明 */}
              {splitType === 'equal' && selectedFriends.length > 0 && totalAmount > 0 && (
                <div className="px-4 py-3 rounded-xl bg-white/5">
                  <p className="text-white/40 text-xs mb-2">人均分摊</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {[currentUser?.id, ...selectedFriends].map((uid) => {
                      const name = uid === currentUser?.id
                        ? (currentUser?.username || '我')
                        : (friends.find((f: any) => f.friend?.id === uid)?.friend?.username || '好友');
                      const per = totalAmount / (selectedFriends.length + 1);
                      return (
                        <span key={uid} className="text-white/70 text-sm">
                          {name} <span className="text-[#FF9F43] font-semibold">¥ {per.toFixed(2)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>  
      </motion.div>
    </motion.div>
  );
};

export default function MemoryStreamPage() {
  const { memories, fetchMemories, deleteMemory } = useMemoryStore();
  const { friends } = useUserStore();
  const {
    memoryStreamSearchQuery: searchQuery,
    memoryStreamFilterFriendIds: filterFriendIds,
    memoryStreamGroupBy: groupBy,
    memoryStreamDraft,
    scrollPositions,
    memoryCommentReadMarkers,
    memoryCommentUnreadCount,
    setMemoryStreamSearchQuery,
    setMemoryStreamFilterFriendIds,
    setMemoryStreamGroupBy,
    setMemoryStreamDraft,
    clearMemoryStreamDraft,
    setScrollPosition,
    markMemoryCommentsRead,
    setMemoryCommentUnreadCount,
  } = useUIStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingPull, setIsRefreshingPull] = useState(false);
  const [activeStoryMemories, setActiveStoryMemories] = useState<any[] | null>(null);
  const [showStoryEntry, setShowStoryEntry] = useState(false);
  // 在原有的 useState 旁边加上这两个：
  const { currentUser } = useUserStore(); // 获取当前用户，用来判断是不是自己发的回忆
  const [editingMemory, setEditingMemory] = useState<any>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const scrollRestoredRef = useRef(false);
  const albumSectionRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(readSettings());
  const lastAutoRefreshRef = useRef(0);
  const resumeTrigger = useAppStore((state) => state.resumeTrigger);

  // 点赞本地持久化；评论改为 Supabase 持久化，好友之间终于能互相看到了。
  const [reactions, setReactions] = useState<Record<string, MemoryReactionState>>(() => {
    try { return JSON.parse(localStorage.getItem('orbit_reactions') || '{}'); } catch { return {}; }
  });
  const [commentsByMemory, setCommentsByMemory] = useState<Record<string, MemoryCommentItem[]>>({});
  const [roastInput, setRoastInput] = useState<Record<string, string>>({});

  const getReaction = (id: string) => ({
    liked: reactions[id]?.liked || false,
    likes: reactions[id]?.likes || 0,
    roastOpen: reactions[id]?.roastOpen || false,
    roasts: commentsByMemory[id] || [],
  });

  const toggleLike = (memoryId: string) => {
    setReactions(prev => {
      const r = prev[memoryId] || { liked: false, likes: 0, roastOpen: false };
      const next = { ...prev, [memoryId]: { ...r, liked: !r.liked, likes: r.liked ? Math.max(0, r.likes - 1) : r.likes + 1 } };
      try { localStorage.setItem('orbit_reactions', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const toggleRoastOpen = (memoryId: string) => {
    setReactions(prev => {
      const r = prev[memoryId] || { liked: false, likes: 0, roastOpen: false };
      const next = { ...prev, [memoryId]: { ...r, roastOpen: !r.roastOpen } };
      try { localStorage.setItem('orbit_reactions', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const addRoast = async (memoryId: string) => {
    const text = (roastInput[memoryId] || '').trim();
    if (!text || !currentUser?.id) return;

    try {
      const comment = await addMemoryComment(memoryId, currentUser.id, text);
      setCommentsByMemory(prev => ({
        ...prev,
        [memoryId]: [...(prev[memoryId] || []), comment as MemoryCommentItem],
      }));
    } catch (error) {
      console.error('发表评论失败:', error);
      alert(`评论发送失败：${(error as any)?.message || '请稍后重试'}`);
      return;
    }

    setRoastInput(prev => ({ ...prev, [memoryId]: '' }));
  };

  const deleteRoast = async (memoryId: string, commentId: string) => {
    if (!window.confirm('确定删除这条评论吗？')) return;

    try {
      await deleteMemoryComment(commentId);
      setCommentsByMemory(prev => ({
        ...prev,
        [memoryId]: (prev[memoryId] || []).filter((item) => item.id !== commentId),
      }));
    } catch (error) {
      console.error('删除评论失败:', error);
      alert(`删除评论失败：${(error as any)?.message || '请稍后重试'}`);
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

  const handleShareMemory = async (memory: any) => {
    if (!settings.allowShare) {
      alert('已关闭“允许他人分享你的回忆”，请在隐私设置中开启。');
      return;
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
    let result = memories;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m: any) =>
        m.content?.toLowerCase().includes(q) ||
        m.location?.name?.toLowerCase().includes(q)
      );
    }
    if (filterFriendIds.length > 0) {
      // AND 逻辑：所有选中的好友都出现在这条记忆里（包括发布者）
      result = result.filter((m: any) =>
        filterFriendIds.every(id =>
          m.tagged_friends?.includes(id) || m.user_id === id
        )
      );
    }
    return result;
  }, [memories, searchQuery, filterFriendIds]);

  // 按日期分组
  const groupedMemories = useMemo(() => groupMemoriesByDate(filteredMemories), [filteredMemories]);
  // 按城市分组
  const cityGroupedMemories = useMemo(() => groupMemoriesByCity(filteredMemories), [filteredMemories]);

  useEffect(() => {
    const memoryIds = memories.map((memory: any) => memory.id).filter(Boolean);
    if (memoryIds.length === 0) {
      setCommentsByMemory({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const comments = await getMemoryComments(memoryIds);
        if (cancelled) return;

        const grouped = (comments || []).reduce((acc: Record<string, MemoryCommentItem[]>, item: any) => {
          const memoryId = item.memory_id;
          if (!memoryId) return acc;
          if (!acc[memoryId]) acc[memoryId] = [];
          acc[memoryId].push(item as MemoryCommentItem);
          return acc;
        }, {});

        setCommentsByMemory(grouped);
      } catch (error) {
        if (!cancelled) {
          console.error('加载评论失败:', error);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [memories]);

  useEffect(() => {
    if (!currentUser?.id) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      const memoryIds = memories.map((memory: any) => memory.id).filter(Boolean);
      if (memoryIds.length === 0) return;

      const idList = memoryIds.join(',');
      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel(`memory-comments-${currentUser.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'memory_comments', filter: `memory_id=in.(${idList})` },
          (payload) => {
            const item = payload.new as MemoryCommentItem;
            if (!item?.id || !item.memory_id) return;
            setCommentsByMemory((prev) => {
              const existing = prev[item.memory_id] || [];
              if (existing.some((c) => c.id === item.id)) return prev;
              return {
                ...prev,
                [item.memory_id]: [...existing, item],
              };
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'memory_comments', filter: `memory_id=in.(${idList})` },
          (payload) => {
            const item = payload.old as MemoryCommentItem;
            if (!item?.id || !item.memory_id) return;
            setCommentsByMemory((prev) => {
              const existing = prev[item.memory_id] || [];
              if (!existing.some((c) => c.id === item.id)) return prev;
              return {
                ...prev,
                [item.memory_id]: existing.filter((c) => c.id !== item.id),
              };
            });
          }
        )
        .subscribe();
    };

    subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [memories, currentUser?.id, resumeTrigger]);

  useEffect(() => {
    const unreadCount = memories.reduce((count: number, memory: any) => count + (hasUnreadComments(memory) ? 1 : 0), 0);
    setMemoryCommentUnreadCount(unreadCount);
  }, [memories, commentsByMemory, memoryCommentReadMarkers, currentUser?.id, setMemoryCommentUnreadCount]);
  
  const refreshMemoryStream = useCallback(async (showLoading: boolean) => {
    if (!shouldAllowRefresh()) return;
    if (showLoading) setIsLoading(true);
    try {
      const fetchPromise = Promise.all([
        fetchMemories(),
        useUserStore.getState().fetchFriends(),
      ]);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
      await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      console.error('拉取数据超时或被系统打断:', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [fetchMemories]);

  // 获取记忆数据
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
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
  }, [refreshMemoryStream]);

  // 前台/联网时自动轻量刷新，避免卡在旧界面
  useEffect(() => {
    const tryAutoRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      const now = Date.now();
      if (now - lastAutoRefreshRef.current < 30000) return;
      lastAutoRefreshRef.current = now;
      void refreshMemoryStream(false);
    };

    const interval = window.setInterval(tryAutoRefresh, 60000);
    window.addEventListener('online', tryAutoRefresh);
    document.addEventListener('visibilitychange', tryAutoRefresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', tryAutoRefresh);
      document.removeEventListener('visibilitychange', tryAutoRefresh);
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
        setCommentsByMemory(grouped);
      }
    } finally {
      setIsRefreshingPull(false);
    }
  };
  
  return (
    <div className="relative min-h-screen bg-[#121212] pt-[180px]">
      <PullToRefresh onRefresh={handlePullRefresh} isRefreshing={isRefreshingPull} />
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00FFB3]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-[#FF9F43]/5 rounded-full blur-3xl" />
      </div>
      
      {/* 顶部标题 + 搜索筛选 */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-[#121212]/96 backdrop-blur-md border-b border-white/5">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white leading-tight">回忆流</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-white/40 text-xs">
              {(searchQuery || filterFriendIds.length > 0) && filteredMemories.length !== memories.length
                ? `找到 ${filteredMemories.length} / ${memories.length} 条`
                : `共 ${memories.length} 条记忆`}
              </p>
              {settings.notifyComment && memoryCommentUnreadCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FF6B6B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FF8A8A] border border-[#FF6B6B]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
                  {memoryCommentUnreadCount} 条新评论
                </span>
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
              className="px-3.5 py-2 rounded-full border border-white/15 bg-white/5 text-white/80 font-semibold text-sm shrink-0 flex items-center gap-2 hover:border-white/30"
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
              className="px-4 py-2 rounded-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold text-sm shrink-0"
            >记录此刻</motion.button>
          </div>
        </div>

        {/* 搜索框 + 分组切换 */}
        <div className="px-4 pb-2 flex gap-2">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none" />
            <input
              type="text"
              placeholder="搜索内容、地点..."
              value={searchQuery}
              onChange={(e) => setMemoryStreamSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 outline-none focus:border-white/20"
            />
            {searchQuery && (
              <button onClick={() => setMemoryStreamSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                <FaTimes className="text-xs" />
              </button>
            )}
          </div>
          {/* 分组方式切换 */}
          <button
            onClick={() => setMemoryStreamGroupBy(groupBy === 'date' ? 'city' : 'date')}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              groupBy === 'city' ? 'bg-[#00FFB3]/20 text-[#00FFB3] border-[#00FFB3]/40' : 'bg-white/5 text-white/50 border-white/10 hover:border-white/25'
            }`}
          >
            {groupBy === 'city' ? '🏙 按城市' : '📅 按日期'}
          </button>
        </div>

        {/* 好友筛选（支持多选，AND 逻辑：选中的好友必须同时出现） */}
        {friends.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setMemoryStreamFilterFriendIds([])}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                filterFriendIds.length === 0 ? 'bg-[#00FFB3] text-black border-transparent' : 'bg-transparent text-white/50 border-white/15 hover:border-white/30'
              }`}
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
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                    isSelected ? 'bg-[#00FFB3] text-black border-transparent' : 'bg-transparent text-white/50 border-white/15 hover:border-white/30'
                  }`}
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
      <div className="relative px-4 pb-32">
        <div ref={albumSectionRef} className="scroll-mt-20" />
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FaSpinner className="text-[#00FFB3] text-3xl animate-spin mb-4" />
            <p className="text-white/40 mb-6">加载回忆中...</p>
            {/* PWA 防卡死神器：刷新按钮 */}
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 rounded-full border border-white/20 text-white/50 text-xs hover:text-white hover:bg-white/10 transition-colors"
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
            <p className="text-white/60 text-lg mb-2">还没有回忆</p>
            <p className="text-white/40 text-sm">点击「记录此刻」开始你的第一个记忆</p>
          </motion.div>
        ) : groupBy === 'city' ? (
          cityGroupedMemories.map((cityGroup, cgIdx) => (
            <motion.div key={cityGroup.city} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: cgIdx * 0.08 }} className="mb-8">
              {/* 城市标题 */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF9F43]/20 to-[#FF6B6B]/20 flex items-center justify-center">
                  <span className="text-base">🏙</span>
                </div>
                <div>
                  <div className="text-white font-semibold">{cityGroup.city}</div>
                  <div className="text-white/40 text-sm">{cityGroup.memories.length} 条记忆</div>
                </div>
              </div>
              <div className="space-y-4">
                {cityGroup.memories.map((memory, index) => {
                  const photos = memory.photos || [];
                  const reaction = getReaction(memory.id);
                  const author = getMemoryAuthor(memory.user_id);
                  const { text: mText, weather: mWeather, mood: mMood } = decodeMemoryContent(memory.content || '');
                  return (
                    <motion.div key={memory.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: cgIdx * 0.06 + index * 0.04 }} className="rounded-3xl bg-white/[0.06] border border-white/5 overflow-hidden">
                      <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <div className="flex items-center gap-3">
                          <img src={author.avatar} className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/10" />
                          <div>
                            <p className="text-white font-semibold text-sm">{author.name}</p>
                            <p className="text-white/40 text-xs mt-0.5">
                              {new Date(memory.memory_date || memory.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                              {memory.location && <span className="ml-1">· 📍 {memory.location.name}</span>}
                              {(mWeather || mMood) && <span className="ml-1">{mWeather}{mMood}</span>}
                            </p>
                          </div>
                        </div>
                        {memory.user_id === currentUser?.id && (
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleDeleteMemory(memory.id); }}
                              disabled={deletingMemoryId === memory.id}
                              className="p-2 rounded-full text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                            ><FaTrash className="text-xs" /></button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingMemory(memory); }} className="p-2 rounded-full text-white/30 hover:text-[#00FFB3] hover:bg-[#00FFB3]/10 transition-colors"><FaEdit className="text-xs" /></button>
                          </div>
                        )}
                      </div>
                      {mText && <p className="px-4 pb-3 text-white/85 text-sm leading-relaxed">{mText}</p>}
                      {photos.length === 1 && (
                        <div className="px-4 pb-3 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {/* ✨ 改为 object-cover 填满，并把最大高度稍微调高一点，避免竖图被裁得太多，同时去掉 bg-black/30 */}
                          <img src={photos[0]} alt="" className="w-full rounded-2xl object-cover max-h-[400px]" />
                        </div>
                      )}
                      {photos.length >= 2 && (
                        <div className="px-4 pb-3 grid grid-cols-2 gap-1 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {photos.slice(0, 4).map((p: string, i: number) => (
                            // ✨ 删掉了 bg-black/30，改为 cover 填满
                            <div key={i} className="relative rounded-xl overflow-hidden">
                              <img src={p} alt="" className="w-full h-36 object-cover" />
                              {i === 3 && photos.length > 4 && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <span className="text-white font-bold text-xl">+{photos.length - 4}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {(memory.videos?.length > 0 || memory.audios?.length > 0) && (
                        <div className="px-4 pb-3 space-y-2">
                          {memory.videos?.length > 0 && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-xs">🎥 {memory.videos.length}个视频</span>}
                          {memory.audios?.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              {memory.audios.map((url: string, idx: number) => (
                                <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#00FFB3]/5 border border-[#00FFB3]/20">
                                  <FaMicrophone className="text-[#00FFB3] text-xs shrink-0" />
                                  <audio src={url} controls className="flex-1 h-7 accent-[#00FFB3]" style={{ minWidth: 0 }} />
                                  <span className="text-[#00FFB3]/60 text-[10px] shrink-0">{idx + 1}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {(memory.tagged_friends?.length > 0 || memory.has_ledger) && (
                        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                          {getVisibleTagIds(memory).map((id: string, tidx: number) => {
                            const n = getTagName(memory, id);
                            return n ? <span key={`${memory.id}-${id}-${tidx}`} className="text-[#00FFB3] text-sm font-medium">@{n}</span> : null;
                          })}
                          {memory.has_ledger && <span className="px-2 py-0.5 rounded-full bg-[#FF9F43]/10 text-[#FF9F43] text-xs flex items-center gap-1"><FaDollarSign className="text-xs" /> 记账</span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                        <div className="flex items-center gap-5">
                          <button onClick={() => toggleLike(memory.id)} className={`flex items-center gap-1.5 text-sm transition-all ${reaction.liked ? 'text-red-400' : 'text-white/40 hover:text-red-300'}`}><FaHeart />{reaction.likes > 0 && <span className="text-xs">{reaction.likes}</span>}</button>
                          <button onClick={() => {
                            const willOpen = !reaction.roastOpen;
                            toggleRoastOpen(memory.id);
                            if (willOpen) markCommentsAsRead(memory.id);
                          }} className={`relative flex items-center gap-1.5 text-sm ${reaction.roastOpen ? 'text-[#00FFB3]' : 'text-white/40 hover:text-[#00FFB3]'}`}><FaComment />{settings.notifyComment && hasUnreadComments(memory) && <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-[#FF6B6B]" />}<span className="text-xs">{reaction.roasts.length > 0 ? `${reaction.roasts.length} 条吐槽` : '吐槽'}</span></button>
                          <button onClick={() => handleShareMemory(memory)} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-[#5fd6ff]"><FaShareAlt /><span className="text-xs">分享微信</span></button>
                        </div>
                        <button onClick={() => setSelectedMemory(memory)} className="text-white/20 text-xs hover:text-white/50">查看全部 →</button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))
        ) : (
          groupedMemories.map((group, groupIndex) => (
            <motion.div
              key={group.date}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
              className="mb-8"
            >
              {/* 日期标题 */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00FFB3]/20 to-[#00D9FF]/20 flex items-center justify-center">
                  <FaCalendarAlt className="text-[#00FFB3]" />
                </div>
                <div>
                  <div className="text-white font-semibold">{group.displayDate}</div>
                  <div className="text-white/40 text-sm">{group.memories.length} 条记忆</div>
                </div>
              </div>
              
              {/* 记忆列表 - 朋友圈大卡片风格 */}
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
                      className="rounded-3xl bg-white/[0.06] border border-white/5 overflow-hidden"
                    >
                      {/* ── 头部：头像 + 昵称 + 地点 + 操作 ── */}
                      <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <div className="flex items-center gap-3">
                          <img src={author.avatar} className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/10" />
                          <div>
                            <p className="text-white font-semibold text-sm leading-tight">{author.name}</p>
                            <p className="text-white/40 text-xs mt-0.5">
                              {formatTime(memory.memory_date || memory.created_at)}
                              {memory.location && <span className="ml-1">· 📍 {memory.location.name}</span>}
                              {(mWeather || mMood) && <span className="ml-2">{mWeather}{mMood}</span>}
                            </p>
                          </div>
                        </div>
                        {memory.user_id === currentUser?.id && (
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleDeleteMemory(memory.id); }}
                              disabled={deletingMemoryId === memory.id}
                              className="p-2 rounded-full text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                            ><FaTrash className="text-xs" /></button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingMemory(memory); }}
                              className="p-2 rounded-full text-white/30 hover:text-[#00FFB3] hover:bg-[#00FFB3]/10 transition-colors"
                            ><FaEdit className="text-xs" /></button>
                          </div>
                        )}
                      </div>

                      {/* ── 正文 ── */}
                      {mText && (
                        <p className="px-4 pb-3 text-white/85 text-sm leading-relaxed">{mText}</p>
                      )}

                      {/* ── 图片区（1张全宽，2-4张2列，5+张3列） ── */}
                      {photos.length === 1 && (
                        <div className="px-4 pb-3 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {/* ✨ 改为 object-cover 填满，并把最大高度稍微调高一点，避免竖图被裁得太多，同时去掉 bg-black/30 */}
                          <img src={photos[0]} alt="" className="w-full rounded-2xl object-cover max-h-[400px]" />
                        </div>
                      )}
                      {photos.length >= 2 && (
                        <div className="px-4 pb-3 grid grid-cols-2 gap-1 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {photos.slice(0, 4).map((p: string, i: number) => (
                            // ✨ 删掉了 bg-black/30，改为 cover 填满
                            <div key={i} className="relative rounded-xl overflow-hidden">
                              <img src={p} alt="" className="w-full h-36 object-cover" />
                              {i === 3 && photos.length > 4 && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <span className="text-white font-bold text-xl">+{photos.length - 4}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── 视频/语音 ── */}
                      {(memory.videos?.length > 0 || memory.audios?.length > 0) && (
                        <div className="px-4 pb-3 space-y-2">
                          {memory.videos?.length > 0 && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-xs">🎥 {memory.videos.length}个视频</span>}
                          {memory.audios?.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              {memory.audios.map((url: string, idx: number) => (
                                <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#00FFB3]/5 border border-[#00FFB3]/20">
                                  <FaMicrophone className="text-[#00FFB3] text-xs shrink-0" />
                                  <audio src={url} controls className="flex-1 h-7 accent-[#00FFB3]" style={{ minWidth: 0 }} />
                                  <span className="text-[#00FFB3]/60 text-[10px] shrink-0">{idx + 1}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── @好友 + 记账标签 ── */}
                      {(memory.tagged_friends?.length > 0 || memory.has_ledger) && (
                        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                          {getVisibleTagIds(memory).map((id: string, tidx: number) => {
                            const name = getTagName(memory, id);
                            if (!name) return null;
                            return <span key={`${memory.id}-${id}-${tidx}`} className="text-[#00FFB3] text-sm font-medium">@{name}</span>;
                          })}
                          {memory.has_ledger && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FF9F43]/10 text-[#FF9F43] text-xs flex items-center gap-1">
                              <FaDollarSign className="text-xs" /> 记账
                            </span>
                          )}
                        </div>
                      )}

                      {/* ── 互动栏 ── */}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                        <div className="flex items-center gap-5">
                          <button
                            onClick={() => toggleLike(memory.id)}
                            className={`flex items-center gap-1.5 text-sm transition-all active:scale-125 ${
                              reaction.liked ? 'text-red-400' : 'text-white/40 hover:text-red-300'
                            }`}
                          >
                            <FaHeart />
                            {reaction.likes > 0 && <span className="text-xs tabular-nums">{reaction.likes}</span>}
                          </button>
                          <button
                            onClick={() => {
                              const willOpen = !reaction.roastOpen;
                              toggleRoastOpen(memory.id);
                              if (willOpen) markCommentsAsRead(memory.id);
                            }}
                            className={`flex items-center gap-1.5 text-sm transition-colors ${
                              reaction.roastOpen ? 'text-[#00FFB3]' : 'text-white/40 hover:text-[#00FFB3]'
                            }`}
                          >
                            <FaComment />
                            {settings.notifyComment && hasUnreadComments(memory) && <span className="w-2 h-2 rounded-full bg-[#FF6B6B]" />}
                            <span className="text-xs">
                              {reaction.roasts.length > 0 ? `${reaction.roasts.length} 条吐槽` : '吐槽'}
                            </span>
                          </button>
                          <button
                            onClick={() => handleShareMemory(memory)}
                            className="flex items-center gap-1.5 text-sm text-white/40 hover:text-[#5fd6ff] transition-colors"
                          >
                            <FaShareAlt />
                            <span className="text-xs">分享微信</span>
                          </button>
                        </div>
                        <button
                          onClick={() => setSelectedMemory(memory)}
                          className="text-white/20 text-xs hover:text-white/50 transition-colors"
                        >查看全部 →</button>
                      </div>

                      {/* ── 吐槽展开区 ── */}
                      <AnimatePresence>
                        {reaction.roastOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden bg-white/[0.02] border-t border-white/5"
                          >
                            <div className="p-4 space-y-3">
                              {reaction.roasts.map((r: MemoryCommentItem) => {
                                const commentAuthor = getCommentAuthor(memory, r.author_id);
                                const canDeleteComment = currentUser?.id === r.author_id || currentUser?.id === memory.user_id;
                                return (
                                <div key={r.id} className="flex items-start gap-2">
                                  <img src={commentAuthor.avatar} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                                  <div className="flex-1 bg-white/5 rounded-2xl px-3 py-2">
                                    <div className="flex items-start justify-between gap-3 mb-0.5">
                                      <p className="text-[#00FFB3] text-xs font-medium">{commentAuthor.name}</p>
                                      {canDeleteComment && (
                                        <button
                                          type="button"
                                          onClick={() => void deleteRoast(memory.id, r.id)}
                                          className="text-[11px] text-white/30 hover:text-red-300 transition-colors shrink-0"
                                        >撤回</button>
                                      )}
                                    </div>
                                    <p className="text-white/70 text-sm">{r.content}</p>
                                  </div>
                                </div>
                              )})}
                              <div className="flex items-center gap-2">
                                <img src={currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest'} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                <div className="flex-1 flex items-center gap-2 bg-white/5 rounded-2xl px-3 py-2 border border-white/10">
                                  <input
                                    type="text"
                                    placeholder="留下你的吐槽..."
                                    value={roastInput[memory.id] || ''}
                                    onChange={(e) => setRoastInput(prev => ({ ...prev, [memory.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void addRoast(memory.id); }}
                                    className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30"
                                  />
                                  <button
                                    onClick={() => void addRoast(memory.id)}
                                    disabled={!roastInput[memory.id]?.trim()}
                                    className="text-[#00FFB3] text-sm font-semibold disabled:opacity-30 shrink-0"
                                  >发</button>
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
              className="fixed inset-0 z-[180] bg-black/70 backdrop-blur-md flex items-center justify-center px-4"
              onClick={() => setShowStoryEntry(false)}
            >
              <motion.div
                initial={{ scale: 0.96, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, y: 10, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="w-full max-w-3xl"
                onClick={(e) => e.stopPropagation()}
              >
                <MemoryStoryEntry
                  memories={filteredMemories}
                  onClick={(memories) => {
                    setActiveStoryMemories(memories);
                    setShowStoryEntry(false);
                  }}
                  friends={friends.map((f: any) => ({ id: f.friend.id, name: f.friend.username, avatar: f.friend.avatar_url }))}
                  selectedFriendIds={filterFriendIds}
                  onSelectFriend={(ids) => setMemoryStreamFilterFriendIds(ids)}
                />
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
          />
        )}
      </AnimatePresence>

      {/* 3. 记忆详情弹窗 */}
      <AnimatePresence>
        {selectedMemory && (
          <MemoryDetailModal
            memory={selectedMemory}
            onClose={() => setSelectedMemory(null)}
            friends={friends}
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
