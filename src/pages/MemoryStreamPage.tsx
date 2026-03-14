import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaMapMarkerAlt, FaAt, FaDollarSign, FaSpinner, FaCheckCircle, FaCalendarAlt, FaCamera, FaChevronRight, FaImages, FaHeart, FaQuoteLeft, FaSearch, FaCheck, FaPlus, FaEdit, FaTrash, FaComment, FaMicrophone, FaShareAlt, FaBookOpen, FaPause, FaPlay, FaStepBackward, FaStepForward, FaLock } from 'react-icons/fa';
import { useMemoryStore, useUserStore, useLedgerStore } from '../store';
import { MemoryStreamDraft, useUIStore } from '../store/ui';
import { createMemory, createLocation, createLedger, updateLedger, deleteLedger, getLedgerByMemory, getMemoryComments, addMemoryComment, deleteMemoryComment } from '../api/supabase';
import MediaUploader, { VoiceRecorder } from '../components/MediaUploader';
import memoryFlowBackground from '../../回忆流.jpg';

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

// 记忆详情弹窗
const MemoryDetailModal = ({ 
  memory, 
  onClose,
  friends,
}: { 
  memory: any; 
  onClose: () => void;
  friends: any[];
}) => {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photos = memory.photos || [];
  const videos = memory.videos || [];
  const audios = memory.audios || [];
  const { text: memoryText, weather, mood, route } = decodeMemoryContent(memory.content || '');
  
  // 获取好友名称（虚拟好友用 temp- 前缀；不认识的 ID 返回 null 不渲染）
  const getFriendName = (friendId: string): string | null => {
    if (friendId.startsWith('temp-')) {
      const fid = friendId.replace('temp-', '');
      const vf = friends.find((f: any) => f.id === fid);
      return vf?.friend_name || null;
    }
    const friend = friends.find((f: any) => f.friend?.id === friendId || f.id === friendId);
    return friend?.friend?.username || friend?.username || null;
  };
  
  // Route stops
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
        {/* 顶部操作栏 */}
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
          {/* 天气 + 心情 顶部角标 */}
          <div className="flex items-center gap-1 text-xl">
            {weather && <span title={weather}>{weather}</span>}
            {mood && <span title={mood}>{mood}</span>}
          </div>
        </motion.div>
        
        {/* 主内容区 */}
        <div className="px-4 pb-32">
          {/* 地点信息 */}
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

          {/* 天气 / 心情 / 路线 详情卡 */}
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
                    {routeStops.map((stop, i) => (
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

          {/* 照片轮播 */}
          {photos.length > 0 && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <div className="relative rounded-2xl overflow-hidden bg-white/5">
                <img
                  src={photos[currentPhotoIndex]}
                  alt={`照片 ${currentPhotoIndex + 1}`}
                  className="w-full h-auto max-h-[60vh] object-contain bg-black/40"
                />
                
                {photos.length > 1 && (
                  <>
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                      {photos.map((_: any, index: number) => (
                        <button
                          key={index}
                          onClick={() => setCurrentPhotoIndex(index)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            index === currentPhotoIndex 
                              ? 'bg-white w-6' 
                              : 'bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                    
                    <button
                      onClick={() => setCurrentPhotoIndex(Math.max(0, currentPhotoIndex - 1))}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 backdrop-blur-sm disabled:opacity-30"
                      disabled={currentPhotoIndex === 0}
                    >
                      <FaChevronRight className="text-white rotate-180" />
                    </button>
                    <button
                      onClick={() => setCurrentPhotoIndex(Math.min(photos.length - 1, currentPhotoIndex + 1))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 backdrop-blur-sm disabled:opacity-30"
                      disabled={currentPhotoIndex === photos.length - 1}
                    >
                      <FaChevronRight className="text-white" />
                    </button>
                  </>
                )}
                
                <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm flex items-center gap-2">
                  <FaImages className="text-white/70 text-sm" />
                  <span className="text-white text-sm">{currentPhotoIndex + 1} / {photos.length}</span>
                </div>
              </div>
            </motion.div>
          )}
          
          {/* 视频展示 */}
          {videos.length > 0 && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mb-8 space-y-4"
            >
              {videos.map((video: string, index: number) => (
                <video
                  key={index}
                  src={video}
                  controls
                  className="w-full rounded-2xl"
                  poster={photos[0]}
                />
              ))}
            </motion.div>
          )}
          
          {/* 语音内容 */}
          {audios.length > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.27 }}
              className="mb-8 space-y-3"
            >
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
          
          {/* 趣事描述 */}
          {memoryText && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-8"
            >
              <div className="relative p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10">
                <FaQuoteLeft className="absolute top-4 left-4 text-[#00FFB3]/30 text-xl" />
                <p className="text-white/90 text-lg leading-relaxed pl-6">
                  {memoryText}
                </p>
              </div>
            </motion.div>
          )}
          
          {/* @的好友 */}
          {memory.tagged_friends && memory.tagged_friends.length > 0 && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mb-6"
            >
              <div className="text-white/40 text-sm mb-2">一起的人</div>
              <div className="flex flex-wrap gap-2">
                {memory.tagged_friends.map((friendId: string, index: number) => {
                  const name = getFriendName(friendId);
                  if (!name) return null;
                  return (
                    <motion.span
                      key={friendId}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.4 + index * 0.1 }}
                      className="px-3 py-1.5 rounded-full bg-[#00FFB3]/10 text-[#00FFB3] text-sm border border-[#00FFB3]/20"
                    >
                      @{name}
                    </motion.span>
                  );
                })}
              </div>
            </motion.div>
          )}
          
          {/* 账单信息 */}
          {memory.has_ledger && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="p-4 rounded-2xl bg-gradient-to-r from-[#FF9F43]/10 to-[#FF6B6B]/10 border border-[#FF9F43]/20"
            >
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
  const searchLocation = (keyword: string) => {
    if (!keyword.trim() || !placeSearchRef.current) {
      setResults([]);
      return;
    }

    setSearching(true);
    
    placeSearchRef.current.search(keyword, (status: string, result: any) => {
      setSearching(false);
      
      if (status === 'complete' && result.poiList?.pois) {
        const pois = result.poiList.pois.map((poi: any) => ({
          id: poi.id,
          name: poi.name,
          address: poi.address || poi.pname + poi.cityname + poi.adname,
          location: `${poi.location.lng},${poi.location.lat}`,
          type: poi.type,
        }));
        setResults(pois);
      } else {
        setResults([]);
      }
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
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        // 优先用已加载的 AMap 实例，其次尝试 window.AMap
        const AMap = aMapRef.current || (window as any).AMap;
        if (AMap?.Geocoder) {
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
        } else {
          const poi: AMapPoi = { id: `gps-${Date.now()}`, name: '我的位置', address: `${lat.toFixed(5)},${lng.toFixed(5)}`, location: `${lng},${lat}`, type: '' };
          onChange(poi.name);
          onSelect(poi);
        }
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
    const hasContent = content.trim().length > 0 || audios.length > 0 || photos.length > 0 || videos.length > 0;
    if (!currentUser || !hasContent) return;
    setIsSubmitting(true);
    
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
          memory_date: new Date(memoryDate).toISOString(),
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
          currentUser.id, finalContent, new Date(memoryDate).toISOString(), locationId, photos, selectedFriends, videos, audios, enableLedger
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
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('操作失败:', error);
      alert(`发布失败：${(error as any)?.message || '请重试'}`);
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

interface AlbumBookPage {
  id: string;
  memoryId: string;
  leftPhoto: string;
  rightPhoto: string;
  caption: string;
  dateLabel: string;
  locationLabel: string;
  previewPhotos: string[];
  totalPhotos: number;
}

const buildAlbumBookPages = (memories: any[]): AlbumBookPage[] => {
  const sorted = [...memories].sort((a, b) => {
    const da = new Date(a.memory_date || a.created_at).getTime();
    const db = new Date(b.memory_date || b.created_at).getTime();
    return db - da;
  });

  const pages: AlbumBookPage[] = [];

  sorted.forEach((memory: any) => {
    const photos: string[] = memory.photos || [];
    if (!photos.length) return;

    const { text } = decodeMemoryContent(memory.content || '');
    const caption = (text || '').trim() || '和朋友一起记录的这一天，值得慢慢翻看。';
    const dateLabel = new Date(memory.memory_date || memory.created_at).toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    const locationLabel = memory.location?.name || '共同回忆';

    for (let i = 0; i < photos.length; i += 2) {
      const leftPhoto = photos[i];
      const rightPhoto = photos[i + 1] || photos[i];
      pages.push({
        id: `${memory.id}-${i}`,
        memoryId: memory.id,
        leftPhoto,
        rightPhoto,
        caption,
        dateLabel,
        locationLabel,
        previewPhotos: photos.slice(0, 2),
        totalPhotos: photos.length,
      });
    }
  });

  return pages;
};

const SharedMemoryAlbumBook = ({ memories }: { memories: any[] }) => {
  const pages = useMemo(() => buildAlbumBookPages(memories), [memories]);
  const [pageIndex, setPageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFlipping, setIsFlipping] = useState(false);
  const flipIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (pages.length === 0) {
      setPageIndex(0);
      setIsPlaying(false);
      return;
    }
    if (pageIndex > pages.length - 1) {
      setPageIndex(0);
    }
  }, [pages.length, pageIndex]);

  const triggerFlip = (nextIndex: number) => {
    if (!pages.length) return;
    setIsFlipping(true);
    window.setTimeout(() => {
      setPageIndex(nextIndex);
    }, 180);
    window.setTimeout(() => {
      setIsFlipping(false);
    }, 620);
  };

  const goNext = () => {
    if (!pages.length) return;
    const nextIndex = (pageIndex + 1) % pages.length;
    triggerFlip(nextIndex);
  };

  const goPrev = () => {
    if (!pages.length) return;
    const prevIndex = (pageIndex - 1 + pages.length) % pages.length;
    triggerFlip(prevIndex);
  };

  useEffect(() => {
    if (flipIntervalRef.current) {
      window.clearInterval(flipIntervalRef.current);
      flipIntervalRef.current = null;
    }
    if (!isPlaying || pages.length <= 1) return;

    flipIntervalRef.current = window.setInterval(() => {
      goNext();
    }, 4000);

    return () => {
      if (flipIntervalRef.current) {
        window.clearInterval(flipIntervalRef.current);
      }
    };
  }, [isPlaying, pages.length, pageIndex]);

  if (pages.length === 0) return null;
  const current = pages[pageIndex];
  const extraCount = Math.max(0, current.totalPhotos - 2);

  return (
    <section
      className="rounded-3xl overflow-hidden border border-white/10 mb-6"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(17,24,39,.82), rgba(76,29,149,.62), rgba(225,29,72,.52)), url(${memoryFlowBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 text-white text-[11px] border border-white/20">
              <FaBookOpen className="text-[10px]" />
              共同回忆相册
            </div>
            <h3 className="text-white text-lg font-semibold mt-2">像一本书一样翻页回看你们的旅程</h3>
            <p className="text-white/70 text-xs mt-1">自动翻页 / 手动翻页 / 随时暂停 · 只展示前两张扑克叠放预览</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] text-white/90">
            <FaLock className="text-[10px]" />
            仅好友可见
          </span>
        </div>

        <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-4">
          <article className="rounded-2xl border border-white/15 bg-black/25 backdrop-blur-md overflow-hidden">
            <div className="px-3.5 py-3 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">{current.locationLabel}</p>
                <p className="text-white/60 text-xs">{current.dateLabel} · 第 {String(pageIndex + 1).padStart(2, '0')} 页 / 共 {String(pages.length).padStart(2, '0')} 页</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={goPrev} className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 text-white grid place-items-center"><FaStepBackward className="text-xs" /></button>
                <button
                  type="button"
                  onClick={() => setIsPlaying((v) => !v)}
                  className="w-8 h-8 rounded-lg bg-[#ff4f7d] border border-[#ff9fbb]/50 text-white grid place-items-center"
                >
                  {isPlaying ? <FaPause className="text-xs" /> : <FaPlay className="text-xs" />}
                </button>
                <button type="button" onClick={goNext} className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 text-white grid place-items-center"><FaStepForward className="text-xs" /></button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 p-3 [perspective:1800px]">
              <div
                className="rounded-xl bg-black/35 border border-white/15 p-2 transition-transform duration-700"
                style={{ transform: isFlipping ? 'rotateY(-12deg) scale(0.985)' : 'rotateY(0deg) scale(1)' }}
              >
                <p className="text-white/60 text-[11px] mb-1.5">左页 · 完整展示</p>
                <div className="h-64 rounded-lg bg-black/40 overflow-hidden flex items-center justify-center">
                  <img src={current.leftPhoto} alt="album-left" className="w-full h-full object-contain" />
                </div>
              </div>
              <div
                className="rounded-xl bg-black/35 border border-white/15 p-2 transition-transform duration-700"
                style={{ transform: isFlipping ? 'rotateY(-12deg) scale(0.985)' : 'rotateY(0deg) scale(1)' }}
              >
                <p className="text-white/60 text-[11px] mb-1.5">右页 · 完整展示</p>
                <div className="h-64 rounded-lg bg-black/40 overflow-hidden flex items-center justify-center">
                  <img src={current.rightPhoto} alt="album-right" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            <div className="px-3 pb-3">
              <div className="rounded-xl border border-white/15 bg-white/10 p-3 text-xs text-white/90 leading-relaxed">
                {current.caption}
              </div>
            </div>
          </article>

          <aside className="rounded-2xl border border-white/15 bg-black/25 backdrop-blur-md p-3.5">
            <p className="text-white text-sm font-medium">多图预览规则</p>
            <p className="text-white/65 text-xs mt-1">照片很多时，仅展示前两张，像扑克叠放。</p>
            <div className="relative h-52 mt-3 rounded-xl border border-white/15 bg-black/30 overflow-hidden">
              {current.previewPhotos[0] && (
                <div className="absolute left-3 top-3 w-[72%] h-44 rounded-xl border border-white/40 overflow-hidden rotate-[-8deg] shadow-2xl">
                  <img src={current.previewPhotos[0]} alt="preview-1" className="w-full h-full object-contain bg-black/50" />
                </div>
              )}
              {current.previewPhotos[1] && (
                <div className="absolute right-3 top-6 w-[72%] h-44 rounded-xl border border-white/40 overflow-hidden rotate-[7deg] shadow-2xl">
                  <img src={current.previewPhotos[1]} alt="preview-2" className="w-full h-full object-contain bg-black/50" />
                </div>
              )}
              {extraCount > 0 && (
                <span className="absolute right-3 bottom-3 px-2 py-1 rounded-full bg-[#ff4f7d] text-white text-xs font-semibold">+{extraCount}</span>
              )}
            </div>
            <div className="mt-3 rounded-xl border border-white/15 bg-white/10 p-2.5 text-[11px] text-white/80 space-y-1">
              <div className="flex items-center justify-between"><span>自动翻页</span><span className={isPlaying ? 'text-[#8ff5d1]' : 'text-[#ffb58d]'}>{isPlaying ? '开启' : '暂停'}</span></div>
              <div className="flex items-center justify-between"><span>翻页速度</span><span>4 秒/页</span></div>
              <div className="flex items-center justify-between"><span>展示策略</span><span>完整图 + 前两张叠放</span></div>
            </div>
          </aside>
        </div>
      </div>
    </section>
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
  // 在原有的 useState 旁边加上这两个：
  const { currentUser } = useUserStore(); // 获取当前用户，用来判断是不是自己发的回忆
  const [editingMemory, setEditingMemory] = useState<any>(null);
  const scrollRestoredRef = useRef(false);
  const albumSectionRef = useRef<HTMLDivElement>(null);

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

  const getFriendName = (friendId: string): string | null => {
    if (friendId.startsWith('temp-')) {
      const fid = friendId.replace('temp-', '');
      const vf = friends.find((f: any) => f.id === fid);
      return vf?.friend_name || null;
    }
    const friend = friends.find((f: any) => f.friend?.id === friendId);
    return friend?.friend?.username || null;
  };

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
    const taggedNames = (memory.tagged_friends || [])
      .map((id: string) => getFriendName(id))
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
    const unreadCount = memories.reduce((count: number, memory: any) => count + (hasUnreadComments(memory) ? 1 : 0), 0);
    setMemoryCommentUnreadCount(unreadCount);
  }, [memories, commentsByMemory, memoryCommentReadMarkers, currentUser?.id, setMemoryCommentUnreadCount]);
  
  // 获取记忆数据
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchMemories(),
        useUserStore.getState().fetchFriends() // ✨ 确保好友数据同步加载
      ]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchMemories]);

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
  
  return (
    <div className="relative min-h-screen bg-[#121212]">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00FFB3]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-[#FF9F43]/5 rounded-full blur-3xl" />
      </div>
      
      {/* 顶部标题 + 搜索筛选 */}
      <div className="sticky top-0 z-20 bg-[#121212]/96 backdrop-blur-md border-b border-white/5">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white leading-tight">回忆流</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-white/40 text-xs">
              {(searchQuery || filterFriendIds.length > 0) && filteredMemories.length !== memories.length
                ? `找到 ${filteredMemories.length} / ${memories.length} 条`
                : `共 ${memories.length} 条记忆`}
              </p>
              {memoryCommentUnreadCount > 0 && (
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
              onClick={scrollToAlbumSection}
              className="px-3.5 py-2 rounded-full border border-white/15 bg-white/5 text-white/80 font-semibold text-sm shrink-0 flex items-center gap-2 hover:border-white/30"
            >
              <FaBookOpen className="text-xs" />
              回忆相册
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setIsCreateOpen(true)}
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
        <div ref={albumSectionRef} className="scroll-mt-20">
          <SharedMemoryAlbumBook memories={filteredMemories} />
        </div>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FaSpinner className="text-[#00FFB3] text-3xl animate-spin mb-4" />
            <p className="text-white/40">加载回忆中...</p>
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
                            <button onClick={(e) => { e.stopPropagation(); if (window.confirm('确定删除这条记忆？')) deleteMemory(memory.id); }} className="p-2 rounded-full text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"><FaTrash className="text-xs" /></button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingMemory(memory); }} className="p-2 rounded-full text-white/30 hover:text-[#00FFB3] hover:bg-[#00FFB3]/10 transition-colors"><FaEdit className="text-xs" /></button>
                          </div>
                        )}
                      </div>
                      {mText && <p className="px-4 pb-3 text-white/85 text-sm leading-relaxed">{mText}</p>}
                      {photos.length === 1 && (
                        <div className="px-4 pb-3 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          <img src={photos[0]} alt="" className="w-full rounded-2xl object-contain max-h-80 bg-black/30" />
                        </div>
                      )}
                      {photos.length >= 2 && (
                        <div className="px-4 pb-3 grid grid-cols-2 gap-1 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {photos.slice(0, 4).map((p: string, i: number) => (
                            <div key={i} className="relative rounded-xl bg-black/30 overflow-hidden">
                              <img src={p} alt="" className="w-full h-36 object-contain" />
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
                          {memory.tagged_friends?.map((id: string, tidx: number) => { const n = getFriendName(id); return n ? <span key={`${memory.id}-${id}-${tidx}`} className="text-[#00FFB3] text-sm font-medium">@{n}</span> : null; })}
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
                          }} className={`relative flex items-center gap-1.5 text-sm ${reaction.roastOpen ? 'text-[#00FFB3]' : 'text-white/40 hover:text-[#00FFB3]'}`}><FaComment />{hasUnreadComments(memory) && <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-[#FF6B6B]" />}<span className="text-xs">{reaction.roasts.length > 0 ? `${reaction.roasts.length} 条吐槽` : '吐槽'}</span></button>
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
                              onClick={(e) => { e.stopPropagation(); if (window.confirm('确定删除这条记忆？')) deleteMemory(memory.id); }}
                              className="p-2 rounded-full text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"
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
                          <img src={photos[0]} alt="" className="w-full rounded-2xl object-contain max-h-80 bg-black/30" />
                        </div>
                      )}
                      {photos.length >= 2 && (
                        <div className="px-4 pb-3 grid grid-cols-2 gap-1 cursor-pointer" onClick={() => setSelectedMemory(memory)}>
                          {photos.slice(0, 4).map((p: string, i: number) => (
                            <div key={i} className="relative rounded-xl bg-black/30 overflow-hidden">
                              <img src={p} alt="" className="w-full h-36 object-contain" />
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
                          {memory.tagged_friends?.map((id: string, tidx: number) => {
                            const name = getFriendName(id);
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
                            {hasUnreadComments(memory) && <span className="w-2 h-2 rounded-full bg-[#FF6B6B]" />}
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
      </div>
      
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
          />
        )}
      </AnimatePresence>
    </div>
  );
}
