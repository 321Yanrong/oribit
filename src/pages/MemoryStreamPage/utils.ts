const META_PREFIX = '[orbit_meta:';

export const AMAP_KEY = '2c322381589d30cd71d9275748b8b02c';

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

export const formatDateGroup = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return '今天';
  if (isYesterday) return '昨天';

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[date.getDay()];

  if (year === today.getFullYear()) {
    return `${month}月${day}日 ${weekday}`;
  }
  return `${year}年${month}月${day}日 ${weekday}`;
};

export const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const decodeMemoryContent = (
  content: string
): { text: string; weather: string; mood: string; route: string } => {
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

export const encodeMemoryContent = (text: string, meta: { weather: string; mood: string; route: string }) => {
  if (!meta.weather && !meta.mood && !meta.route) return text;
  return `${META_PREFIX}${JSON.stringify(meta)}]
${text}`;
};

export const getCityFromMemory = (memory: any): string => {
  const addr = memory.location?.address || '';
  const name = memory.location?.name || '';
  const cityMatch = addr.match(/([\u4e00-\u9fa5]{2,8}(?:市|州))/);
  if (cityMatch) return cityMatch[1];
  const nameMatch = name.match(/([\u4e00-\u9fa5]{2,6}(?:市|州))/);
  if (nameMatch) return nameMatch[1];
  if (memory.location?.name) return memory.location.name.slice(0, 4) + '附近';
  return '未知地点';
};

export const groupMemoriesByDate = (memories: any[]) => {
  const groups: { [key: string]: any[] } = {};
  const sortedMemories = [...memories].sort((a, b) => {
    const dateA = new Date(a.memory_date || a.created_at);
    const dateB = new Date(b.memory_date || b.created_at);
    return dateB.getTime() - dateA.getTime();
  });

  sortedMemories.forEach((memory) => {
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

export const groupMemoriesByCity = (memories: any[]) => {
  const groups: Record<string, any[]> = {};
  memories.forEach((m) => {
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

export const getLocalDateTimeValue = (dateInput?: string) => {
  if (dateInput) {
    const d = new Date(dateInput);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};
