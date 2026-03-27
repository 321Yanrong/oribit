import { useEffect, useRef, useState } from 'react';
import { FaMapMarkerAlt, FaTimes, FaSpinner } from 'react-icons/fa';
import { LocationPoi } from '../types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

type LocationSearchProps = {
  value: string;
  onChange: (val: string) => void;
  onSelect: (poi: LocationPoi) => void;
};

const mapboxSearch = async (keyword: string): Promise<LocationPoi[]> => {
  if (!MAPBOX_TOKEN) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(keyword)}.json?language=zh&limit=8&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data?.features) return [];
    return data.features.map((f: any) => ({
      id: f.id,
      name: f.text_zh || f.text || keyword,
      address: f.place_name_zh || f.place_name || '',
      location: `${f.center?.[0]},${f.center?.[1]}`,
      type: f.place_type?.join(',') || '',
    }));
  } catch (e) {
    console.warn('Mapbox geocoding failed', e);
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
    };
  } catch {
    return null;
  }
};

const LocationSearch = ({ value, onChange, onSelect }: LocationSearchProps) => {
  const [results, setResults] = useState<LocationPoi[]>([]);
  const [city, setCity] = useState('');
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [locating, setLocating] = useState(false);
  const [needCityHint, setNeedCityHint] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchLocation = async (keyword: string) => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    if (!city.trim()) {
      setNeedCityHint(true);
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);

    try {
      const pois = await mapboxSearch(`${city} ${keyword}`.trim());
      setResults(pois);
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  const handleInputChange = (val: string) => {
    onChange(val);
    if (!city.trim()) {
      setNeedCityHint(true);
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchLocation(val), 250);
  };

  const handleSelect = (poi: LocationPoi) => {
    onSelect(poi);
    onChange(poi.name);
    setShowResults(false);
  };

  const handleGPS = () => {
    if (!navigator.geolocation) {
      alert('当前设备不支持定位');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;

        try {
          const poi = await reverseMapbox(lat, lng);
          if (poi) {
            onChange(poi.name);
            onSelect(poi);
            setLocating(false);
            return;
          }
        } catch { /* fallback below */ }

        const fallback: LocationPoi = {
          id: `gps-${Date.now()}`,
          name: '我的位置',
          address: `${lat.toFixed(5)},${lng.toFixed(5)}`,
          location: `${lng},${lat}`,
          type: '',
        };
        onChange(fallback.name);
        onSelect(fallback);
        setLocating(false);
      },
      () => { setLocating(false); alert('定位失败，请检查定位权限'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    if (value.trim()) setShowResults(true);
  }, [value]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5">
        <div className="p-2 rounded-full bg-[#00FFB3]/10">
          <FaMapMarkerAlt className="text-[#00FFB3]" />
        </div>
        <input
          type="text"
          placeholder="先选城市（例：上海 / Edinburgh）"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-36 bg-transparent text-white placeholder-white/30 outline-none"
        />
        <input
          type="text"
          placeholder="搜索地点（如：星巴克、外滩）"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
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
        {value && (
          <button onClick={() => { onChange(''); setResults([]); }} className="p-2 text-white/40 hover:text-white">
            <FaTimes />
          </button>
        )}
        {city && (
          <button onClick={() => { setCity(''); }} className="p-2 text-white/40 hover:text-white">
            <FaTimes />
          </button>
        )}
      </div>

      <div className="flex gap-2 mt-2 flex-wrap text-xs text-white/70">
        {['上海', '北京', '广州', '深圳', '杭州', '成都', '爱丁堡', '伦敦'].map((c) => (
          <button
            key={c}
            onClick={() => { setCity(c); setNeedCityHint(false); if (value.trim()) searchLocation(value); }}
            className={`px-3 py-1 rounded-full border ${city === c ? 'border-[#00FFB3] text-[#00FFB3]' : 'border-white/10 text-white/70'} bg-white/5 hover:border-white/30 transition-colors`}
          >
            {c}
          </button>
        ))}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-xl bg-[#2a2a2a] border border-white/10 z-10">
          {results.map((poi) => (
            <button
              key={poi.id}
              onClick={() => handleSelect(poi)}
              className="w-full p-3 text-left hover:bg-white/5 border-b border-white/5 last:border-0"
            >
              <div className="text-white font-medium">{poi.name}</div>
              <div className="text-white/40 text-sm truncate">{poi.address || '暂无地址信息'}</div>
            </button>
          ))}
        </div>
      )}

      {showResults && !searching && value.trim() && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 p-4 rounded-xl bg-[#2a2a2a] border border-white/10 z-10 text-center">
          <p className="text-white/40 text-sm">{needCityHint ? '请先选择城市，再搜索具体地点' : '未找到相关地点'}</p>
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
