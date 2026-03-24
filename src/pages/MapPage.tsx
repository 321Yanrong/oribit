import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaMapMarkerAlt, FaTimes, FaUsers, FaCamera, FaCalendar, FaReceipt, FaChevronLeft, FaComment, FaPaperPlane, FaHeart } from 'react-icons/fa';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMemoryStore, useUserStore, useMapStore } from '../store';
import FloatingParticles from '../components/FloatingParticles';
import { addMemoryComment, getMemoryComments, supabase } from '../api/supabase';

import { getTaggedDisplayName, getVisibleTaggedFriendIds } from '../utils/tagVisibility';


const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
// Debug helper: print resolved token at runtime to help diagnose 401 issues.
// Remove this after debugging to avoid logging tokens in production.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log('MAPBOX_TOKEN (runtime) =', MAPBOX_TOKEN);
}

const getCityFromMemory = (memory: any): string => {
  const addr = memory.location?.address || '';
  const name = memory.location?.name || '';
  const cityMatch = addr.match(/[\u4e00-\u9fa5]{2,8}(?:市|州)/);
  if (cityMatch) return cityMatch[0];
  const parts = name.split(/[\s,，·]/);
  if (parts[0] && parts[0].length <= 6) return parts[0];
  return name.substring(0, 4) || '未知城市';
};
const META_PREFIX = '[orbit_meta:';
const LEGACY_META_PREFIX = '[orbit_data:';

const decodeMemoryContent = (content: string): { text: string; weather: string; mood: string; route: string } => {
  const raw = content || '';
  let text = raw;
  let weather = '';
  let mood = '';
  let route = '';

  const parseBracketMeta = (prefix: string) => {
    if (!raw.startsWith(prefix)) return;
    const end = raw.indexOf(']\n');
    if (end === -1) return;
    try {
      const meta = JSON.parse(raw.slice(prefix.length, end));
      weather = meta?.weather || '';
      mood = meta?.mood || '';
      route = meta?.route || '';
      text = raw.slice(end + 2);
    } catch {
      text = raw.slice(end + 2) || raw;
    }
  };

  parseBracketMeta(META_PREFIX);
  parseBracketMeta(LEGACY_META_PREFIX);

  // 兼容历史脏数据：去掉直接展示出来的 orbit_data/orbit_meta 字段行
  text = text
    .replace(/^\s*['"]?orbit_data['"]?\s*[:=].*$/gim, '')
    .replace(/^\s*['"]?orbit_meta['"]?\s*[:=].*$/gim, '')
    .trim();

  return { text, weather, mood, route };
};

export default function MapPage({ onFirstScreenReady }: { onFirstScreenReady?: () => void }) {
  const { selectedPin, setSelectedPin } = useMapStore();
  const { memories, fetchMemories, selectedFriendIds, setSelectedFriendIds } = useMemoryStore();
  const { friends, currentUser } = useUserStore();

  const [showMemoryDetail, setShowMemoryDetail] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<any>(null); // 单条记忆详情
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [detailComments, setDetailComments] = useState<any[]>([]);
  const [detailCommentText, setDetailCommentText] = useState('');
  const [detailCommentSending, setDetailCommentSending] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [memoriesFetched, setMemoriesFetched] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [mapGroupBy, setMapGroupBy] = useState<'location' | 'city'>('location');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [detailLikeInfo, setDetailLikeInfo] = useState({ liked: false, likes: 0, likers: [] as any[] });
  const [showInteractionDetail, setShowInteractionDetail] = useState(false);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]); // 存储 Mapbox 的 Marker 实例，方便后续清理
  const containerRef = useRef<HTMLDivElement>(null);
  const readyFiredRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const fitViewTimeoutRef = useRef<number | null>(null);
  const fallbackShowTimerRef = useRef<number | null>(null);
  const lastNoPinsToastRef = useRef<number>(0);
  const photoTouchStartXRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof document === 'undefined') return true;
    const theme = document.documentElement.dataset.theme;
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const theme = document.documentElement.dataset.theme;
      if (theme === 'dark') setIsDarkTheme(true);
      else if (theme === 'light') setIsDarkTheme(false);
      else setIsDarkTheme(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
    };
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    update();
    media?.addEventListener('change', update);
    window.addEventListener('settings:update', update as EventListener);
    return () => {
      media?.removeEventListener('change', update);
      window.removeEventListener('settings:update', update as EventListener);
    };
  }, []);

  // When MapPage mounts, make the app root background transparent so the map can extend into the
  // system safe area / status bar. Restore previous value on unmount.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      const rootStyle = document.documentElement.style;
      const prev = rootStyle.getPropertyValue('--app-root-bg');
      rootStyle.setProperty('--app-root-bg', 'transparent');
      return () => {
        if (prev) rootStyle.setProperty('--app-root-bg', prev);
        else rootStyle.removeProperty('--app-root-bg');
      };
    } catch (e) {
      // ignore
    }
  }, []);

  // ✨ 核心修复 1：进页面立刻拉取最新回忆数据
  useEffect(() => {
    if (currentUser?.id) {
      fetchMemories()
        .catch(() => { })
        .finally(() => setMemoriesFetched(true));
    } else {
      setMemoriesFetched(false);
    }
  }, [currentUser?.id, fetchMemories]);

  // 通知外部首屏数据已就绪（地图已加载且回忆数据到位）
  useEffect(() => {
    if (!onFirstScreenReady || readyFiredRef.current) return;
    if (mapLoaded && memoriesFetched) {
      readyFiredRef.current = true;
      onFirstScreenReady();
    }
  }, [mapLoaded, memoriesFetched, onFirstScreenReady]);

  // ✨ 核心修复 2：将散落的 memories 按“地点”打包分组，生成地图需要的 Pins
  const getFriendDisplay = (personId: string) => {
    if (!personId) return null;
    if (personId.startsWith('temp-')) {
      const friendshipId = personId.replace('temp-', '');
      const vf = friends.find((f: any) => f.id === friendshipId);
      if (!vf) return null;
      return {
        id: personId,
        username: vf.friend?.username || vf.friend_name || '好友',
        avatar_url:
          vf.friend?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${vf.friend_name || friendshipId}&backgroundColor=ffd5dc`,
      };
    }
    return friends.find((f: any) => f.friend?.id === personId || f.friend_id === personId)?.friend || null;
  };

  const derivedPins = useMemo(() => {
    const pinMap = new Map();
    memories.forEach(memory => {
      if (!memory.location || !memory.location.lat || !memory.location.lng) return;

      const locId = memory.location.id;
      if (!pinMap.has(locId)) {
        pinMap.set(locId, {
          id: locId,
          location: memory.location,
          memories: [],
          friends: [] // 记录这个地点有过哪些共同好友
        });
      }

      const pin = pinMap.get(locId);
      pin.memories.push(memory);

      // 统一添加人物头像（跳过自己、跳过虚拟好友、跳过重复）
      const addPersonToPin = (pin: any, personId: string) => {
        if (!personId) return;
        if (personId === currentUser?.id) return;
        if (pin.friends.some((f: any) => f.id === personId)) return;
        const friendObj = getFriendDisplay(personId);
        if (friendObj) pin.friends.push(friendObj);
      };

      // 所有可见的 @ 好友
      const visibleTags = getVisibleTaggedFriendIds(
        memory.tagged_friends || [],
        memory.user_id,
        currentUser?.id,
        friends
      );
      visibleTags.forEach((friendId: string) => addPersonToPin(pin, friendId));

      // 如果是别人发布的共享记忆，也把发布者加进来
      if (memory.user_id && memory.user_id !== currentUser?.id) {
        addPersonToPin(pin, memory.user_id);
      }
    });
    return Array.from(pinMap.values());
  }, [memories, friends, currentUser]);

  // 城市级别聚合
  const cityPins = useMemo(() => {
    const cityMap = new Map<string, any>();
    memories.forEach(memory => {
      if (!memory.location?.lat || !memory.location?.lng) return;
      const city = getCityFromMemory(memory);
      if (!cityMap.has(city)) {
        cityMap.set(city, {
          id: `city_${city}`,
          city,
          memories: [],
          lat: memory.location.lat,
          lng: memory.location.lng,
          friends: [],
        });
      }
      const cp = cityMap.get(city)!;
      cp.memories.push(memory);
      // 所有被 @ 的真实好友 + 如果是共享记忆，把发布者也加进来
      const addPersonToCity = (cp: any, personId: string) => {
        if (!personId) return;
        if (personId === currentUser?.id) return;
        if (cp.friends.some((f: any) => f.id === personId)) return;
        const fo = getFriendDisplay(personId);
        if (fo) cp.friends.push(fo);
      };
      const visibleTags = getVisibleTaggedFriendIds(
        memory.tagged_friends || [],
        memory.user_id,
        currentUser?.id,
        friends
      );
      visibleTags.forEach((friendId: string) => addPersonToCity(cp, friendId));
      if (memory.user_id && memory.user_id !== currentUser?.id) {
        addPersonToCity(cp, memory.user_id);
      }
      // average lat/lng for city center
      const n = cp.memories.length;
      cp.lat = (cp.lat * (n - 1) + memory.location.lat) / n;
      cp.lng = (cp.lng * (n - 1) + memory.location.lng) / n;
    });
    return Array.from(cityMap.values());
  }, [memories, friends, currentUser]);

  // 根据选中的好友过滤光点
  const basePins = mapGroupBy === 'city' ? cityPins : derivedPins;
  const filteredPins = useMemo(() => {
    if (selectedFriendIds.length === 0) return basePins;
    return basePins.filter(pin => pin.friends.some((f: any) => selectedFriendIds.includes(f.id)));
  }, [basePins, selectedFriendIds]);

  // 获取选中光点的所有记忆
  const pinMemories = selectedPin?.memories.filter((m: any) => {
    if (!selectedFriendIds.length) return true;
    const tagged = m.tagged_friends || [];
    return selectedFriendIds.some((id) => tagged.includes(id) || m.user_id === id);
  }) || [];

  // 初始化 Mapbox (只执行一次)
  useEffect(() => {
    if (!containerRef.current) return;

    if (!MAPBOX_TOKEN) {
      console.warn('Missing Mapbox token, please set VITE_MAPBOX_TOKEN');
      showToast('地图服务未配置');
      setMapLoaded(true);
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const isDarkTheme = currentTheme === 'dark' || (!currentTheme && prefersDark);

    if (!mapboxgl.supported()) {
      console.error('Mapbox 不支持当前浏览器的 WebGL');
      showToast('当前浏览器不支持地图');
      setMapLoaded(true);
      return;
    }

    try {
      const applyChineseLabels = (mp: mapboxgl.Map) => {
        try {
          const zhName = ['coalesce', ['get', 'name_zh'], ['get', 'name_zh-Hans'], ['get', 'name_zh-Hant'], ['get', 'name'], ['get', 'name_en']];
          const style = mp.getStyle();
          if (!style?.layers) return;
          style.layers
            .filter((layer) => layer.type === 'symbol' && (layer.layout as any)?.['text-field'])
            .forEach((layer) => {
              mp.setLayoutProperty(layer.id, 'text-field', zhName as any);
            });
        } catch (err) {
          console.warn('切换中文标注失败', err);
        }
      };

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: isDarkTheme ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
        center: [121.4737, 31.2304],
        zoom: 12,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }));
      mapRef.current = map;
      map.on('load', () => {
        setMapLoaded(true);
        map.resize();
        applyChineseLabels(map);
      });
      map.on('styledata', () => applyChineseLabels(map));
      map.on('error', (e) => {
        console.error('Mapbox 运行错误:', e?.error || e);
        showToast('地图加载失败');
        setMapLoaded(true); // 避免因未触发 load 导致容器永久透明
      });

      const handleResize = () => map.resize();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    } catch (e) {
      console.error('Mapbox 加载失败:', e);
      showToast('地图加载失败');
      setMapLoaded(true);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (fallbackShowTimerRef.current) window.clearTimeout(fallbackShowTimerRef.current);
    };
  }, []);

  // 兜底：如果 1.5 秒内没有 load 事件，也显示容器便于查看错误
  useEffect(() => {
    if (mapLoaded) return;
    fallbackShowTimerRef.current = window.setTimeout(() => setMapLoaded(true), 1500);
    return () => {
      if (fallbackShowTimerRef.current) window.clearTimeout(fallbackShowTimerRef.current);
    };
  }, [mapLoaded]);

  // ✨ 核心修复 3：监听数据的变化，动态往 Mapbox 上画光点
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current as mapboxgl.Map;

    // 清除旧的 Markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // 画新的 Markers
    filteredPins.forEach((pin: any) => {
      const isCityPin = mapGroupBy === 'city';

      const myAvatar = currentUser?.avatar_url || 'https://api.dicebear.com/9.x/adventurer/svg?seed=guest';
      const friendAvatarsHtml = pin.friends.slice(0, 2).map((f: any) =>
        `<img src="${f.avatar_url}" class="w-5 h-5 rounded-full ring-1 ring-[#121212] object-cover -ml-1.5" />`
      ).join('');

      const friendsBadgeHtml = pin.friends.length > 0
        ? `<div class="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center">
            ${friendAvatarsHtml}
            ${pin.friends.length > 2 ? `<div class="w-5 h-5 rounded-full ring-1 ring-[#121212] bg-white/20 flex items-center justify-center text-[8px] text-white -ml-1.5">+${pin.friends.length - 2}</div>` : ''}
           </div>`
        : '';

      const markerContent = isCityPin ? `
        <div class="relative flex flex-col items-center cursor-pointer transition-transform duration-300 hover:scale-110" style="z-index:0">
          <div class="relative w-14 h-14 rounded-2xl border-2 border-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.5)] overflow-hidden bg-[#1a1a1a] flex items-center justify-center">
            <span style="font-size:22px">🏙</span>
          </div>
          <div class="mt-1 bg-black/80 text-[#FFD700] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#FFD700]/40 whitespace-nowrap">${pin.city}</div>
          <div class="absolute -top-2 -right-2 bg-[#FFD700] text-black text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-lg">${pin.memories.length}</div>
        </div>
      ` : `
        <div class="relative flex items-center justify-center w-12 h-14 cursor-pointer group transition-transform duration-300 hover:scale-125 z-0 hover:z-50">
          <div class="absolute top-0 w-12 h-12 rounded-full bg-[#00FFB3] opacity-40 animate-ping"></div>
          <div class="relative w-10 h-10 rounded-full border-2 border-[#00FFB3] shadow-[0_0_15px_#00FFB3] overflow-hidden bg-orbit-black">
            <img src="${myAvatar}" class="w-full h-full object-cover" />
          </div>
          ${friendsBadgeHtml}
          <div class="absolute -top-2 -right-2 bg-black/80 text-[#00FFB3] text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border border-[#00FFB3]/50 shadow-lg">
            ${pin.memories.length}
          </div>
        </div>
      `;

      const el = document.createElement('div');
      el.innerHTML = markerContent;

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pin.location?.lng ?? pin.lng, pin.location?.lat ?? pin.lat]);

      el.addEventListener('click', () => {
        const clickedPin = pin;
        if (mapGroupBy === 'city') {
          setSelectedPin({ ...clickedPin, location: { name: clickedPin.city, address: `${clickedPin.city} · ${clickedPin.memories.length} 个回忆` } });
        } else {
          setSelectedPin(clickedPin);
        }
        setShowMemoryDetail(true);
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    if (fitViewTimeoutRef.current) window.clearTimeout(fitViewTimeoutRef.current);
    fitViewTimeoutRef.current = window.setTimeout(() => {
      const targetMap = mapRef.current as mapboxgl.Map | null;
      if (!targetMap) return;

      // 只有在数据加载完成且没有任何足迹时，才显示“暂无回忆足迹”的提示并缩小视野。
      // 这可避免在数据仍在加载期间误报“暂无回忆”。
      if (filteredPins.length === 0 && memoriesFetched) {
        const now = Date.now();
        if (now - lastNoPinsToastRef.current > 2500) {
          lastNoPinsToastRef.current = now;
          showToast('暂无回忆足迹');
        }
        const currentZoom = targetMap.getZoom();
        targetMap.setZoom(Math.max(currentZoom - 1, 4));
        return;
      }

      // 如果有数据，正常缩放到 bounds
      if (filteredPins.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        filteredPins.forEach((pin: any) => bounds.extend([pin.location?.lng ?? pin.lng, pin.location?.lat ?? pin.lat]));
        targetMap.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 600 });
      }
    }, 300);

    return () => {
      if (fitViewTimeoutRef.current) window.clearTimeout(fitViewTimeoutRef.current);
    };
  }, [mapLoaded, filteredPins, setSelectedPin, mapGroupBy, currentUser, showToast, memoriesFetched]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const handlePinClick = (pin: any) => {
    setSelectedPin(pin);
    setShowMemoryDetail(true);
  };

  useEffect(() => {
    if (!selectedMemory?.id) {
      setDetailComments([]);
      setDetailCommentText('');
      setDetailPhotoIndex(0);
      setDetailLikeInfo({ liked: false, likes: 0, likers: [] });
      setShowInteractionDetail(false);
      return;
    }

    setDetailPhotoIndex(0);
    setDetailCommentText('');

    // Reset showInteractionDetail to false when a new memory is selected, 
    // unless you want it to persist across memory selections (usually cleaner to reset).
    setShowInteractionDetail(false);

    let cancelled = false;

    Promise.all([
      getMemoryComments([selectedMemory.id]),
      (async () => {
        if (!currentUser?.id) return { liked: false, likes: 0, likers: [] };
        // We need to properly fetch likes.
        // First get the count and check if current user liked it
        const { data: likesData, error } = await (supabase
          .from('memory_likes' as any) as any)
          .select('user_id')
          .eq('memory_id', selectedMemory.id);

        if (error || !likesData) return { liked: false, likes: 0, likers: [] };

        const liked = likesData.some((l: any) => l.user_id === currentUser.id);
        const likers = likesData.map((l: any) => l.user_id);

        return {
          liked,
          likes: likesData.length,
          likers
        };
      })()
    ])
      .then(([comments, likeInfo]) => {
        if (cancelled) return;
        // The first element of result array from Promise.all is comments
        // If getMemoryComments returns an object { [id]: comments }, extract the array
        const commentsArray = Array.isArray(comments) ? comments : (comments?.[selectedMemory.id] || []);
        setDetailComments(commentsArray);
        setDetailLikeInfo(likeInfo);
      })
      .catch((err) => {
        console.error("Error fetching detail info:", err);
        if (cancelled) return;
        setDetailComments([]);
        setDetailLikeInfo({ liked: false, likes: 0, likers: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMemory?.id, currentUser?.id]);

  const handleToggleLike = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedMemory?.id || !currentUser?.id) return;
    const { liked, likes, likers } = detailLikeInfo;
    const isLiking = !liked;

    // Optimistic update
    const newLikers = isLiking
      ? [...likers, currentUser.id]
      : likers.filter(id => id !== currentUser.id);

    setDetailLikeInfo({
      liked: isLiking,
      likes: isLiking ? likes + 1 : Math.max(0, likes - 1),
      likers: newLikers
    });

    try {
      if (isLiking) {
        await (supabase.from('memory_likes' as any) as any).insert({
          memory_id: selectedMemory.id,
          user_id: currentUser.id
        });
      } else {
        await (supabase.from('memory_likes' as any) as any)
          .delete()
          .match({ memory_id: selectedMemory.id, user_id: currentUser.id });
      }
    } catch (err) {
      console.error('Toggle like failed', err);
      // rollback
      setDetailLikeInfo({ liked, likes, likers });
    }
  };

  const goPrevPhoto = () => {
    const len = selectedMemory?.photos?.length || 0;
    if (len <= 1) return;
    setDetailPhotoIndex((prev) => (prev - 1 + len) % len);
  };

  const goNextPhoto = () => {
    const len = selectedMemory?.photos?.length || 0;
    if (len <= 1) return;
    setDetailPhotoIndex((prev) => (prev + 1) % len);
  };

  const handleDetailCommentSubmit = async () => {
    const text = detailCommentText.trim();
    if (!text || !selectedMemory?.id || !currentUser?.id || detailCommentSending) return;
    setDetailCommentSending(true);
    try {
      const created = await addMemoryComment(selectedMemory.id, currentUser.id, text);
      setDetailComments((prev) => [...prev, created]);
      setDetailCommentText('');
      showToast('评论已发送');
    } catch (error: any) {
      showToast(error?.message || '评论发送失败');
    } finally {
      setDetailCommentSending(false);
    }
  };

  const getCommentAuthorName = (authorId: string) => {
    if (!authorId) return '好友';
    if (authorId === currentUser?.id) return currentUser?.username || '我';
    const friend = friends.find((item: any) => item.friend?.id === authorId)?.friend;
    return friend?.username || '共同好友';
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        background: 'var(--app-root-bg)', // 改为具体背景色，防止转场时透出底层黑/白屏
        minHeight: '100dvh',
        height: '100dvh',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {toastMessage && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-[95]">
          <div
            className="px-4 py-2 rounded-full text-sm shadow-lg"
            style={isDarkTheme
              ? { background: 'rgba(255,255,255,0.95)', color: '#000000', border: '1px solid rgba(0,0,0,0.08)' }
              : { background: 'rgba(0,0,0,0.8)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {toastMessage}
          </div>
        </div>
      )}
      {/* Mapbox 地图容器 */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ opacity: mapLoaded ? 1 : 0.25, transition: 'opacity 0.8s', width: '100%', height: '100%' }}
      />

      {/* 顶部导航栏 (加了 pointer-events-none 防止挡住地图点击) */}
      <div className="absolute top-0 left-0 right-0 z-20 safe-top pointer-events-none">
        <div className="mx-4 pointer-events-auto">
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card rounded-3xl p-3.5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="text-3xl">🗺️</span> 友情地图
              </h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMapGroupBy(g => g === 'location' ? 'city' : 'location')}
                  className="text-xs px-3 py-1.5 rounded-full border transition-all"
                  style={{
                    color: '#0f9f6e',
                    backgroundColor: 'color-mix(in srgb, #0f9f6e 12%, transparent)',
                    borderColor: 'color-mix(in srgb, #0f9f6e 26%, transparent)'
                  }}
                >
                  {mapGroupBy === 'city' ? '🏙 按城市' : '📍 按地点'}
                </button>
                <div
                  className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full"
                  style={{
                    color: '#0f9f6e',
                    backgroundColor: 'color-mix(in srgb, #0f9f6e 12%, transparent)'
                  }}
                >
                  <FaCamera className="w-3 h-3" />
                  <span>{filteredPins.length} 个足迹</span>
                </div>
              </div>
            </div>

            {/* 好友头像筛选器 */}
            <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar pb-1">
              <motion.button
                onClick={() => setSelectedFriendIds([])}
                whileTap={{ scale: 0.95 }}
                className={`flex flex-col items-center gap-2 flex-shrink-0 transition-all ${selectedFriendIds.length === 0 ? 'opacity-100' : 'opacity-50'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${selectedFriendIds.length === 0 ? 'bg-gradient-to-br from-[#00FFB3] to-[#00D9FF] shadow-[0_0_15px_rgba(0,255,179,0.3)]' : 'bg-white/10'}`}>
                  <span className={`text-sm font-bold ${selectedFriendIds.length === 0 ? 'text-black' : 'text-white'}`}>全部</span>
                </div>
              </motion.button>

              {friends.map((friendship: any) => {
                const friend = friendship.friend;
                const isSelected = selectedFriendIds.includes(friend.id);
                return (
                  <motion.button
                    key={friend.id}
                    onClick={() => setSelectedFriendIds(
                      isSelected
                        ? selectedFriendIds.filter((id) => id !== friend.id)
                        : [...selectedFriendIds, friend.id]
                    )}
                    whileTap={{ scale: 0.95 }}
                    className={`flex flex-col items-center gap-1 flex-shrink-0 transition-all ${isSelected ? 'opacity-100' : 'opacity-70'}`}
                  >
                    <div className={`w-12 h-12 rounded-xl overflow-hidden ring-2 transition-all ${isSelected ? 'ring-[#00FFB3] scale-110 shadow-[0_0_15px_rgba(0,255,179,0.3)]' : 'ring-transparent'}`}>
                      <img src={friend.avatar_url} alt={friend.username} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[11px] text-white/90 max-w-[72px] truncate" title={friend.username}>
                      {friend.username || '好友'}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* 记忆列表底部弹窗 */}
      <AnimatePresence>
        {showMemoryDetail && selectedPin && !selectedMemory && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowMemoryDetail(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[72vh] flex flex-col rounded-3xl border shadow-2xl"
              style={{
                backgroundColor: 'var(--orbit-surface)',
                borderColor: 'var(--orbit-border)'
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b shrink-0" style={{ borderColor: 'var(--orbit-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00FFB3]/20 flex items-center justify-center shrink-0">
                    <FaMapMarkerAlt className="w-5 h-5 text-[#00FFB3]" />
                  </div>
                  <div>
                    <h2 className="font-bold" style={{ color: 'var(--orbit-text)' }}>{(selectedPin as any).location?.name || (selectedPin as any).city}</h2>
                    <p className="text-xs truncate max-w-[200px]" style={{ color: 'var(--orbit-text-muted)' }}>
                      {selectedPin.location?.address || `${pinMemories.length} 条记忆`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowMemoryDetail(false)} className="p-2 rounded-full bg-black/5 dark:bg-white/10 transition-colors" style={{ color: 'var(--orbit-text)' }}>
                  <FaTimes />
                </button>
              </div>

              {/* Memory list */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3 hide-scrollbar">
                {pinMemories.length === 0 ? (
                  <p className="text-center py-10" style={{ color: 'var(--orbit-text-muted)' }}>暂无记忆</p>
                ) : pinMemories.map((memory: any) => {
                  const date = new Date(memory.memory_date || memory.created_at);
                  const taggedNames = getVisibleTaggedFriendIds(
                    memory.tagged_friends || [],
                    memory.user_id,
                    currentUser?.id,
                    friends
                  ).map((id: string) => getTaggedDisplayName(id, memory.user_id, currentUser, friends))
                    .filter(Boolean);

                  return (
                    <motion.div
                      key={memory.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedMemory(memory)}
                      className="flex gap-3 p-3 rounded-2xl border cursor-pointer transition-colors active:scale-[0.98]"
                      style={{
                        backgroundColor: 'var(--orbit-card)',
                        borderColor: 'var(--orbit-border)'
                      }}
                    >
                      {memory.photos?.[0] ? (
                        <img
                          src={memory.photos[0]}
                          alt=""
                          className="w-16 h-16 rounded-xl object-cover shrink-0 bg-black/5 dark:bg-white/5"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0 text-2xl">
                          {memory.location?.category === '咖啡厅' ? '☕' : memory.location?.category === '美食' ? '🍜' : '📍'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs" style={{ color: 'var(--orbit-text-muted)' }}>
                            {date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          </span>
                          {memory.has_ledger && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#FF9F43]/20 text-[#FF9F43] text-[10px]">含账单</span>
                          )}
                        </div>
                        <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: 'var(--orbit-text)' }}>
                          {decodeMemoryContent(memory.content || '').text || '（无文字记录）'}
                        </p>
                        {taggedNames.length > 0 && (
                          <p className="text-[#00FFB3] text-xs mt-1 truncate">
                            @{taggedNames.join(' @')}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 单条记忆详情 */}
      <AnimatePresence>
        {selectedMemory && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setSelectedMemory(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 250 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[75vh] overflow-y-auto hide-scrollbar rounded-3xl border shadow-2xl"
              style={{ backgroundColor: 'var(--orbit-surface)', borderColor: 'var(--orbit-border)' }}
            >
              {/* 照片 */}
              {selectedMemory.photos?.length > 0 && (
                <div
                  className="relative w-full mb-2 overflow-hidden rounded-3xl bg-black/30"
                  onTouchStart={(e) => {
                    photoTouchStartXRef.current = e.touches[0]?.clientX ?? null;
                  }}
                  onTouchEnd={(e) => {
                    const startX = photoTouchStartXRef.current;
                    const endX = e.changedTouches[0]?.clientX;
                    photoTouchStartXRef.current = null;
                    if (typeof startX !== 'number' || typeof endX !== 'number') return;
                    const diff = endX - startX;
                    if (Math.abs(diff) < 36) return;
                    if (diff > 0) goPrevPhoto();
                    else goNextPhoto();
                  }}
                >
                  <img
                    src={selectedMemory.photos[Math.min(detailPhotoIndex, selectedMemory.photos.length - 1)]}
                    alt=""
                    className="w-full object-cover max-h-80"
                  />
                  {selectedMemory.photos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={goPrevPhoto}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center"
                        aria-label="上一张"
                      >
                        <FaChevronLeft className="text-xs" />
                      </button>
                      <button
                        type="button"
                        onClick={goNextPhoto}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center"
                        aria-label="下一张"
                      >
                        <FaChevronLeft className="text-xs rotate-180" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {selectedMemory.photos.map((_: string, idx: number) => (
                          <button
                            key={`dot-${idx}`}
                            type="button"
                            onClick={() => setDetailPhotoIndex(idx)}
                            className={`w-2 h-2 rounded-full ${idx === detailPhotoIndex ? 'bg-[#00FFB3]' : 'bg-white/50'}`}
                            aria-label={`查看第${idx + 1}张`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="px-5 pt-4 pb-28">
                {/* Back + close */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setSelectedMemory(null)}
                    className="flex items-center gap-1 text-sm transition-colors hover:opacity-80"
                    style={{ color: 'var(--orbit-text-muted)' }}
                  >
                    <FaChevronLeft className="text-xs" /> 返回列表
                  </button>
                  <button onClick={() => { setSelectedMemory(null); setShowMemoryDetail(false); }} className="p-2 rounded-full bg-black/5 dark:bg-white/10" style={{ color: 'var(--orbit-text)' }}>
                    <FaTimes className="text-sm" />
                  </button>
                </div>

                {/* Location */}
                <div className="flex items-center gap-2 mb-3">
                  <FaMapMarkerAlt className="text-[#00FFB3] text-sm shrink-0" />
                  <span className="font-semibold truncate" style={{ color: 'var(--orbit-text)' }}>{selectedMemory.location?.name}</span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--orbit-text-muted)' }}>{selectedMemory.location?.address?.split(/[市区]/)[0]}</span>
                </div>

                {/* Date */}
                <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: 'var(--orbit-text-muted)' }}>
                  <FaCalendar className="text-xs" />
                  {new Date(selectedMemory.memory_date || selectedMemory.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                </div>


                {/* Interaction Summary Button (Removed redundant top button) */}


                {/* Content with meta decode */}
                {(() => {
                  const { text, weather, mood, route } = decodeMemoryContent(selectedMemory.content || '');

                  return (
                    <div className="space-y-2 mb-4">
                      {text && (
                        <div
                          // 限制最大高度，超出显示滚动条，隐藏原生滚动条样式以保持美观
                          className="max-h-24 overflow-y-auto hide-scrollbar overscroll-contain pr-1"
                          // ⚠️ 物理隔绝：防止在文字上滑动时拖拽到底层的地图！
                          onWheel={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <p className="leading-relaxed text-base" style={{ color: 'var(--orbit-text)' }}>{text}</p>
                        </div>
                      )}

                      {/* Tags 区域 */}
                      {(weather || mood || route) && (
                        <div className="flex flex-wrap gap-2 text-sm pt-1">
                          {weather && <span className="px-2 py-1 rounded-full bg-black/5 dark:bg-white/10" style={{ color: 'var(--orbit-text-muted)' }}>天气：{weather}</span>}
                          {mood && <span className="px-2 py-1 rounded-full bg-black/5 dark:bg-white/10" style={{ color: 'var(--orbit-text-muted)' }}>心情：{mood}</span>}
                          {route && <span className="px-2 py-1 rounded-full bg-black/5 dark:bg-white/10" style={{ color: 'var(--orbit-text-muted)' }}>路线：{route}</span>}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Tagged friends */}
                {selectedMemory.tagged_friends?.length > 0 && (
                  <div className="flex items-center gap-3 py-3 border-t" style={{ borderColor: 'var(--orbit-border)' }}>
                    <FaUsers className="text-sm shrink-0" style={{ color: 'var(--orbit-text-muted)' }} />
                    <div className="flex flex-wrap gap-2">
                      {getVisibleTaggedFriendIds(
                        (selectedMemory.tagged_friends as string[]) || [],
                        selectedMemory.user_id,
                        currentUser?.id,
                        friends
                      ).map((id: string) => {
                        const name = getTaggedDisplayName(id, selectedMemory.user_id, currentUser, friends);
                        if (!name) return null;
                        const f = friends.find((fs: any) => fs.friend?.id === id || fs.friend_id === id);
                        if (!f?.friend || name === '已不是好友') {
                          return (
                            <span key={id} className="text-[#00FFB3] text-sm">@{name}</span>
                          );
                        }
                        return (
                          <div key={id} className="flex items-center gap-1.5">
                            <img src={f.friend.avatar_url} alt={f.friend.username} className="w-6 h-6 rounded-full object-cover" />
                            <span className="text-[#00FFB3] text-sm">@{f.friend.username}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Ledger badge */}
                {selectedMemory.has_ledger && (
                  <div className="flex items-center gap-2 mt-3 py-2 px-3 rounded-xl bg-[#FF9F43]/10 border border-[#FF9F43]/20">
                    <FaReceipt className="text-[#FF9F43] text-sm" />
                    <span className="text-[#FF9F43] text-sm">此记忆附有账单</span>
                  </div>
                )}

                {/* Interaction Summary Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInteractionDetail(!showInteractionDetail);
                  }}
                  className="w-full mt-4 flex items-center justify-between px-4 py-3 rounded-2xl border transition-all active:scale-[0.99] group shadow-sm"
                  style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 transition-colors group-hover:opacity-100 opacity-90" style={{ color: 'var(--orbit-text)' }}>
                      <FaHeart className={detailLikeInfo.liked ? "text-[#FF4D4F] drop-shadow-[0_0_8px_rgba(255,77,79,0.5)]" : "opacity-30"} />
                      <span className="text-sm font-bold">{detailLikeInfo.likes || '赞'}</span>
                    </div>
                    <div className="w-px h-3 bg-black/10 dark:bg-white/10" />
                    <div className="flex items-center gap-1.5 transition-colors group-hover:opacity-100 opacity-90" style={{ color: 'var(--orbit-text)' }}>
                      <FaComment className="text-[#00FFB3] drop-shadow-[0_0_8px_rgba(0,255,179,0.3)]" />
                      <span className="text-sm font-bold">{detailComments.length || '评论'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-2">
                    <div className="flex items-center -space-x-2.5">
                      {detailLikeInfo.likers.slice(0, 3).map((uid: string) => {
                        const u = getFriendDisplay(uid) || (uid === currentUser?.id ? { username: currentUser.username, avatar_url: currentUser.avatar_url } : null);
                        if (!u) return null;
                        return <img key={uid} src={u.avatar_url} className="w-5 h-5 rounded-full ring-2 ring-[var(--orbit-bg)] object-cover bg-black/5 dark:bg-white/10" />;
                      })}
                    </div>
                    <FaChevronLeft
                      className={`text-xs ml-0.5 transition-transform opacity-30 ${showInteractionDetail ? '-rotate-90' : 'rotate-180 group-hover:translate-x-0.5'}`}
                      style={{ color: 'var(--orbit-text)' }}
                    />
                  </div>
                </button>

                {/* Inline Interaction Detail (Replaces Sheet) */}
                <AnimatePresence>
                  {showInteractionDetail && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden space-y-4 pt-1"
                    >
                      {/* Likes Section (Simplified) */}
                      <div className="p-3 rounded-2xl border bg-[var(--orbit-card)]" style={{ borderColor: 'var(--orbit-border)' }}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--orbit-text)' }}>
                            <FaHeart className="text-[#FF4D4F]" />
                            {detailLikeInfo.likes} 人点赞
                          </h3>
                          <button
                            onClick={(e) => handleToggleLike(e)}
                            className={`px-3 py-1 rounded-full text-[10px] font-medium border ${detailLikeInfo.liked
                              ? 'bg-[#FF4D4F]/20 text-[#FF4D4F] border-[#FF4D4F]/30'
                              : 'border-opacity-10 opacity-70'
                              }`}
                            style={!detailLikeInfo.liked ? {
                              borderColor: 'var(--orbit-border)',
                              color: 'var(--orbit-text)'
                            } : {}}
                          >
                            {detailLikeInfo.liked ? '已赞' : '点赞'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {detailLikeInfo.likers.length === 0 && (
                            <p className="text-xs opacity-40" style={{ color: 'var(--orbit-text)' }}>快来点亮爱心吧～</p>
                          )}
                          {detailLikeInfo.likers.map((uid: string) => {
                            const u = getFriendDisplay(uid) || (uid === currentUser?.id ? { username: currentUser.username, avatar_url: currentUser.avatar_url } : null);
                            if (!u) return null;
                            return (
                              <img key={uid} src={u.avatar_url} className="w-6 h-6 rounded-full object-cover ring-1 ring-[var(--orbit-border)]" title={u.username} />
                            );
                          })}
                        </div>
                      </div>

                      {/* Comments Section */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--orbit-text)' }}>
                          <FaComment className="text-[#00FFB3]" />
                          <h3>{detailComments.length} 条评论</h3>
                        </div>

                        {/* Comments List */}
                        <div className="space-y-3 max-h-60 overflow-y-auto hide-scrollbar pr-1"
                          onWheel={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {detailComments.length === 0 && (
                            <p className="text-xs text-center py-4 opacity-30" style={{ color: 'var(--orbit-text)' }}>还没有评论，来发表第一条评论吧！</p>
                          )}
                          {detailComments.map((comment: any) => {
                            const authorName = getCommentAuthorName(comment.author_id);
                            const author = friends.find((f: any) => f.friend?.id === comment.author_id)?.friend
                              || (comment.author_id === currentUser?.id ? currentUser : null);
                            return (
                              <div key={comment.id} className="flex gap-2.5">
                                <img
                                  src={author?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${authorName}`}
                                  className="w-7 h-7 rounded-full object-cover shrink-0 bg-black/5 dark:bg-white/10 mt-0.5"
                                />
                                <div className="flex-1">
                                  <div className="flex items-baseline justify-between">
                                    <span className="text-[#00FFB3] text-xs font-medium">{authorName}</span>
                                    <span className="text-[10px] opacity-30" style={{ color: 'var(--orbit-text)' }}>
                                      {new Date(comment.created_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <p className="text-xs mt-0.5 leading-relaxed opacity-90" style={{ color: 'var(--orbit-text)' }}>{comment.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Input Area */}
                        <div className="flex items-center gap-2 pt-1 relative">
                          <input
                            value={detailCommentText}
                            onChange={(e) => setDetailCommentText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleDetailCommentSubmit();
                              }
                            }}
                            onFocus={(e) => {
                              setTimeout(() => {
                                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 300); // 延迟300ms等键盘完全弹起
                            }}
                            // 防止点击输入框时触发地图事件
                            onTouchStart={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            placeholder="写下你的评论..."
                            className="flex-1 rounded-full px-3 py-2 text-xs outline-none transition-colors border"
                            style={{
                              backgroundColor: 'rgba(0,0,0,0.03)',
                              color: 'var(--orbit-text)',
                              borderColor: 'var(--orbit-border)',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void handleDetailCommentSubmit()}
                            disabled={!detailCommentText.trim() || detailCommentSending}
                            className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0"
                            style={{ background: '#00FFB3', color: '#000' }}
                          >
                            <FaPaperPlane className="text-xs" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}