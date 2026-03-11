import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaMapMarkerAlt, FaTimes, FaUsers, FaCamera } from 'react-icons/fa';
import AMapLoader from '@amap/amap-jsapi-loader';
import { useMemoryStore, useUserStore, useMapStore } from '../store';
import MemoryCard from '../components/MemoryCard'; // 确保你有这个组件，如果没有可以暂时注释掉
import FloatingParticles from '../components/FloatingParticles'; // 确保你有这个组件

const AMAP_KEY = '2c322381589d30cd71d9275748b8b02c';

const getCityFromMemory = (memory: any): string => {
  const addr = memory.location?.address || '';
  const name = memory.location?.name || '';
  const cityMatch = addr.match(/[\u4e00-\u9fa5]{2,8}(?:市|州)/);
  if (cityMatch) return cityMatch[0];
  const parts = name.split(/[\s,，·]/);
  if (parts[0] && parts[0].length <= 6) return parts[0];
  return name.substring(0, 4) || '未知城市';
};
const AMAP_SECURITY_CODE = '34af5b9d582fa1ec0ac3b5d8840917a3';

(window as any)._AMapSecurityConfig = {
  securityJsCode: AMAP_SECURITY_CODE,
};

export default function MapPage() {
  const { selectedPin, setSelectedPin } = useMapStore();
  const { memories, fetchMemories, selectedFriendId, setSelectedFriendId } = useMemoryStore();
  const { friends, currentUser } = useUserStore();
  
  const [showMemoryDetail, setShowMemoryDetail] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [mapGroupBy, setMapGroupBy] = useState<'location' | 'city'>('location');
  
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]); // ✨ 新增：用来存储高德的 Marker 实例，方便后续清理
  const containerRef = useRef<HTMLDivElement>(null);

  // ✨ 核心修复 1：进页面立刻拉取最新回忆数据
  useEffect(() => {
    if (currentUser?.id) {
      fetchMemories();
    }
  }, [currentUser?.id, fetchMemories]);

  // ✨ 核心修复 2：将散落的 memories 按“地点”打包分组，生成地图需要的 Pins
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

      // 收集该地点涉及的好友
      memory.tagged_friends?.forEach((friendId: string) => {
        if (!pin.friends.some((f: any) => f.id === friendId)) {
          const friendObj = friends.find(f => f.friend?.id === friendId)?.friend;
          if (friendObj) pin.friends.push(friendObj);
        }
      });
    });
    return Array.from(pinMap.values());
  }, [memories, friends]);

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
      // accumulate friends
      memory.tagged_friends?.forEach((friendId: string) => {
        if (!cp.friends.some((f: any) => f.id === friendId)) {
          const fo = friends.find(f => f.friend?.id === friendId)?.friend;
          if (fo) cp.friends.push(fo);
        }
      });
      // average lat/lng for city center
      const n = cp.memories.length;
      cp.lat = (cp.lat * (n - 1) + memory.location.lat) / n;
      cp.lng = (cp.lng * (n - 1) + memory.location.lng) / n;
    });
    return Array.from(cityMap.values());
  }, [memories, friends]);

  // 根据选中的好友过滤光点
  const basePins = mapGroupBy === 'city' ? cityPins : derivedPins;
  const filteredPins = selectedFriendId
    ? basePins.filter(pin => pin.friends.some((f: any) => f.id === selectedFriendId))
    : basePins;

  // 获取选中光点的所有记忆
  const pinMemories = selectedPin?.memories.filter((m: any) => 
    !selectedFriendId || m.tagged_friends.includes(selectedFriendId)
  ) || [];

  // 初始化高德地图 (只执行一次)
  useEffect(() => {
    AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: ['AMap.Scale'],
    }).then((AMap) => {
      if (!containerRef.current) return;
      
      const map = new AMap.Map(containerRef.current, {
        zoom: 12,
        center: [121.4737, 31.2304], // 默认中心点 (上海)，后续可以根据数据自动调整视野
        mapStyle: 'amap://styles/dark', 
      });
      
      map.addControl(new AMap.Scale());
      mapRef.current = map;
      setMapLoaded(true);
    }).catch(e => console.error('地图加载失败:', e));

    return () => mapRef.current?.destroy();
  }, []);

  // ✨ 核心修复 3：监听数据的变化，动态往真实的高德地图上画光点
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !(window as any).AMap) return;
    const map = mapRef.current;
    const AMap = (window as any).AMap;

    // 清除旧的 Markers
    map.remove(markersRef.current);
    markersRef.current = [];

    // 画新的 Markers
    filteredPins.forEach((pin: any) => {
      const isCityPin = mapGroupBy === 'city';

      // 光点始终显示自己的头像
      const myAvatar = currentUser?.avatar_url || 'https://api.dicebear.com/7.x/adventurer/svg?seed=guest';

      // 同行人头像叠加（最多显示 2 个）
      const friendAvatarsHtml = pin.friends.slice(0, 2).map((f: any) =>
        `<img src="${f.avatar_url}" class="w-5 h-5 rounded-full ring-1 ring-[#121212] object-cover -ml-1.5" />`
      ).join('');

      const friendsBadgeHtml = pin.friends.length > 0
        ? `<div class="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center">
            ${friendAvatarsHtml}
            ${pin.friends.length > 2 ? `<div class="w-5 h-5 rounded-full ring-1 ring-[#121212] bg-white/20 flex items-center justify-center text-[8px] text-white -ml-1.5">+${pin.friends.length - 2}</div>` : ''}
           </div>`
        : '';

      // city pin uses bigger badge style
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

      const marker = new AMap.Marker({
        position: [pin.location.lng, pin.location.lat],
        content: markerContent,
        offset: new AMap.Pixel(-24, -24), // 往左上偏移一半，确保指针居中
        extData: pin
      });
      // ... 下面的 onClick 逻辑保持不变
      
      marker.on('click', (e: any) => {
        const clickedPin = e.target.getExtData();
        if (mapGroupBy === 'city') {
          // city pin: wrap into a pin-like object for display
          setSelectedPin({ ...clickedPin, location: { name: clickedPin.city, address: `${clickedPin.city} · ${clickedPin.memories.length} 个回忆` } });
        } else {
          setSelectedPin(clickedPin);
        }
        setShowMemoryDetail(true);
      });
      
      map.add(marker);
      markersRef.current.push(marker);
    });

    // 如果有数据，让地图自动缩放并居中包含所有光点
    if (markersRef.current.length > 0) {
      map.setFitView(markersRef.current, false, [50, 50, 50, 50]);
    }
  }, [mapLoaded, filteredPins, setSelectedPin, mapGroupBy]);

  const handlePinClick = (pin: any) => {
    setSelectedPin(pin);
    setShowMemoryDetail(true);
  };

  return (
    <div className="relative h-screen w-full bg-orbit-black overflow-hidden">
      {/* 高德地图容器 */}
      <div 
        ref={containerRef} 
        className="absolute inset-0"
        style={{ opacity: mapLoaded ? 1 : 0, transition: 'opacity 1s' }}
      />
      
      {/* 顶部导航栏 (加了 pointer-events-none 防止挡住地图点击) */}
      <div className="absolute top-0 left-0 right-0 z-20 safe-top pointer-events-none">
        <div className="mx-4 mt-4 pointer-events-auto">
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="text-3xl">🗺️</span> 友情地图
              </h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMapGroupBy(g => g === 'location' ? 'city' : 'location')}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    mapGroupBy === 'city'
                      ? 'bg-[#FFD700]/10 border-[#FFD700]/30 text-[#FFD700]'
                      : 'bg-[#00FFB3]/10 border-[#00FFB3]/30 text-[#00FFB3]'
                  }`}
                >
                  {mapGroupBy === 'city' ? '🏙 按城市' : '📍 按地点'}
                </button>
                <div className="flex items-center gap-2 text-[#00FFB3] text-sm bg-[#00FFB3]/10 px-3 py-1.5 rounded-full">
                  <FaCamera className="w-3 h-3" />
                  <span>{filteredPins.length} 个足迹</span>
                </div>
              </div>
            </div>
            
            {/* 好友头像筛选器 */}
            <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar pb-1">
              <motion.button
                onClick={() => setSelectedFriendId(null)}
                whileTap={{ scale: 0.95 }}
                className={`flex flex-col items-center gap-2 flex-shrink-0 transition-all ${selectedFriendId === null ? 'opacity-100' : 'opacity-50'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${selectedFriendId === null ? 'bg-gradient-to-br from-[#00FFB3] to-[#00D9FF] shadow-[0_0_15px_rgba(0,255,179,0.3)]' : 'bg-white/10'}`}>
                  <span className={`text-sm font-bold ${selectedFriendId === null ? 'text-black' : 'text-white'}`}>全部</span>
                </div>
              </motion.button>
              
              {friends.map((friendship: any) => {
                const friend = friendship.friend;
                const isSelected = selectedFriendId === friend.id;
                return (
                  <motion.button
                    key={friend.id}
                    onClick={() => setSelectedFriendId(isSelected ? null : friend.id)}
                    whileTap={{ scale: 0.95 }}
                    className={`flex flex-col items-center gap-2 flex-shrink-0 transition-all ${isSelected ? 'opacity-100' : 'opacity-50'}`}
                  >
                    <div className={`w-12 h-12 rounded-xl overflow-hidden ring-2 transition-all ${isSelected ? 'ring-[#00FFB3] scale-110 shadow-[0_0_15px_rgba(0,255,179,0.3)]' : 'ring-transparent'}`}>
                      <img src={friend.avatar_url} alt={friend.username} className="w-full h-full object-cover" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* 记忆详情弹窗 */}
      <AnimatePresence>
        {showMemoryDetail && selectedPin && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMemoryDetail(false)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[70vh] overflow-y-auto hide-scrollbar bg-[#1a1a1a] rounded-t-3xl border-t border-white/10 p-6 mb-24" // 留出底部导航栏空间
            >
              <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#1a1a1a] pt-2 pb-4 z-10 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00FFB3]/20 flex items-center justify-center">
                    <FaMapMarkerAlt className="w-5 h-5 text-[#00FFB3]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selectedPin.location.name}</h2>
                    <p className="text-white/40 text-xs truncate max-w-[200px]">{selectedPin.location.address}</p>
                  </div>
                </div>
                <button onClick={() => setShowMemoryDetail(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                  <FaTimes />
                </button>
              </div>
              
              {/* 渲染卡片 */}
              <div className="space-y-4">
                {pinMemories.map((memory: any) => (
                  // 如果你有 MemoryCard 组件，直接替换这里的 div
                  <div key={memory.id} className="p-4 bg-white/5 rounded-2xl border border-white/10 text-white">
                    <p className="text-white/80">{memory.content}</p>
                    <p className="text-[#00FFB3] text-xs mt-2">{new Date(memory.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}