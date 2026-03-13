import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { FaTimes, FaDice, FaHeart, FaSyncAlt, FaGamepad } from 'react-icons/fa';
import { useUserStore, useMemoryStore } from '../store';

// ============================================================
// 1. 摇骰子
// ============================================================

// SVG pip layouts for each face value
const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[27, 27], [73, 73]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[27, 27], [73, 27], [27, 50], [73, 50], [27, 73], [73, 73]],
};

const DiceFace = ({ value, rolling }: { value: number; rolling: boolean }) => {
  const dots = PIP_POSITIONS[value] ?? PIP_POSITIONS[1];
  return (
    <motion.div
      animate={rolling ? { rotate: [0, 20, -20, 15, -15, 0], scale: [1, 1.15, 0.9, 1.1, 0.95, 1] } : { rotate: 0, scale: 1 }}
      transition={{ duration: 0.45, repeat: rolling ? Infinity : 0 }}
      className="w-16 h-16 rounded-2xl bg-white shadow-2xl p-1.5"
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="11" fill="#1a1a2e" />
        ))}
      </svg>
    </motion.div>
  );
};

const DiceGame = ({ onClose }: { onClose: () => void }) => {
  const [count, setCount] = useState(2);
  const [values, setValues] = useState<number[]>([1, 1]);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    const ticks = 12;
    let t = 0;
    const id = setInterval(() => {
      setValues(Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1));
      t++;
      if (t >= ticks) {
        clearInterval(id);
        setRolling(false);
      }
    }, 60);
  };

  const handleCountChange = (n: number) => {
    setCount(n);
    setValues(Array.from({ length: n }, () => 1));
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* 骰子显示区 */}
      <div className="flex flex-wrap justify-center gap-4 min-h-[80px] items-center">
        {values.map((v, i) => (
          <DiceFace key={i} value={v} rolling={rolling} />
        ))}
      </div>

      {/* 总点数 */}
      {!rolling && (
        <div className="text-center">
          <p className="text-white/40 text-sm">总点数</p>
          <p className="text-4xl font-black text-[#00FFB3]">{values.reduce((a, b) => a + b, 0)}</p>
        </div>
      )}

      {/* 骰子数量选择 */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map(n => (
          <button
            key={n}
            onClick={() => handleCountChange(n)}
            className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${count === n ? 'bg-[#00FFB3] text-black' : 'bg-white/10 text-white/60'}`}
          >
            {n}
          </button>
        ))}
        <span className="text-white/30 text-sm ml-1">颗</span>
      </div>

      {/* 摇按钮 */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={roll}
        disabled={rolling}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-black text-lg shadow-lg disabled:opacity-60"
      >
        🎲 摇！
      </motion.button>
    </div>
  );
};

// ============================================================
// 2. 真心话大冒险
// ============================================================
const truthCards = [
  '你最后一次哭是因为什么？',
  '你做过最冲动的事是什么？',
  '你有没有对朋友撒过谎？说的什么？',
  '你最近在暗恋谁吗？',
  '你最尴尬的一次经历是什么？',
  '你对自己最不满意的地方是什么？',
  '你做过最后悔的决定是什么？',
  '你有没有偷偷喜欢过在场某人？',
  '你觉得谁是在场最帅/最美的？',
  '如果只能联系一个朋友，你会选谁？',
  '你最想改变自己的什么？',
  '你对未来最大的恐惧是什么？',
];

const dareCards = [
  '学猫叫 10 秒钟',
  '用旁边的人的头发做发型 30 秒',
  '对着镜头深情说一句情话',
  '用最搞笑的声音朗读最近发的一条消息',
  '给妈妈发一条"我爱你"',
  '闭着眼睛猜猜谁摸了你的手',
  '连续说 3 分钟不重复的废话',
  '做 10 个深蹲，不能停',
  '换上旁边人的衣服穿 5 分钟',
  '模仿在座一个人，让大家猜是谁',
  '把手机最近的一张照片展示给大家',
  '表演 30 秒无声哑剧，让大家猜你在干什么',
];

const TruthDareGame = ({ onClose }: { onClose: () => void }) => {
  const [mode, setMode] = useState<'truth' | 'dare' | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [flipping, setFlipping] = useState(false);

  const draw = (type: 'truth' | 'dare') => {
    setMode(type);
    setFlipping(true);
    setTimeout(() => {
      const pool = type === 'truth' ? truthCards : dareCards;
      setCard(pool[Math.floor(Math.random() * pool.length)]);
      setFlipping(false);
    }, 300);
  };

  return (
    <div className="flex flex-col items-center gap-5 p-6">
      {/* 卡片展示 */}
      <AnimatePresence mode="wait">
        {card && !flipping ? (
          <motion.div
            key={card}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`w-full rounded-3xl p-6 min-h-[140px] flex items-center justify-center text-center shadow-2xl ${
              mode === 'truth'
                ? 'bg-gradient-to-br from-[#667eea] to-[#764ba2]'
                : 'bg-gradient-to-br from-[#f093fb] to-[#f5576c]'
            }`}
          >
            <div>
              <p className={`text-xs font-bold mb-3 uppercase tracking-widest opacity-70 ${mode === 'truth' ? 'text-blue-200' : 'text-pink-200'}`}>
                {mode === 'truth' ? '💬 真心话' : '🔥 大冒险'}
              </p>
              <p className="text-white text-lg font-semibold leading-relaxed">{card}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="placeholder"
            className="w-full rounded-3xl p-6 min-h-[140px] flex items-center justify-center bg-white/5 border-2 border-dashed border-white/20"
          >
            <p className="text-white/30 text-sm">点击下方按钮抽卡</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 两个按钮 */}
      <div className="flex gap-3 w-full">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => draw('truth')}
          className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white font-bold text-base shadow-lg"
        >
          💬 真心话
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => draw('dare')}
          className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[#f093fb] to-[#f5576c] text-white font-bold text-base shadow-lg"
        >
          🔥 大冒险
        </motion.button>
      </div>

      {card && (
        <button onClick={() => { setCard(null); setMode(null); }} className="text-white/30 text-sm">
          重置
        </button>
      )}
    </div>
  );
};

// ============================================================
// 3. 解压气泡纸
// ============================================================
const BUBBLE_ROWS = 8;
const BUBBLE_COLS = 6;

const BubbleWrapGame = ({ onClose }: { onClose: () => void }) => {
  const total = BUBBLE_ROWS * BUBBLE_COLS;
  const [popped, setPopped] = useState<Set<number>>(new Set());
  const [combo, setCombo] = useState(0);

  const popBubble = (i: number) => {
    if (popped.has(i)) return;
    // haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(15);
    setPopped(prev => new Set([...prev, i]));
    setCombo(c => c + 1);
  };

  const reset = () => { setPopped(new Set()); setCombo(0); };
  const allPopped = popped.size === total;

  return (
    <div className="flex flex-col items-center gap-4 p-5">
      <div className="flex items-center gap-4 w-full justify-between">
        <p className="text-white/50 text-sm">{popped.size}/{total} 已戳破</p>
        {allPopped ? (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[#00FFB3] font-bold text-sm">全部戳破 🎉</motion.div>
        ) : (
          <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF]"
              animate={{ width: `${(popped.size / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* 气泡网格 */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${BUBBLE_COLS}, 1fr)` }}
      >
        {Array.from({ length: total }, (_, i) => {
          const isPop = popped.has(i);
          return (
            <motion.button
              key={i}
              onClick={() => popBubble(i)}
              animate={isPop ? { scale: [1, 0.6, 0], opacity: [1, 0.5, 0.2] } : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              className={`w-11 h-11 rounded-full transition-all ${
                isPop
                  ? 'bg-white/5 border border-dashed border-white/10'
                  : 'bg-gradient-to-br from-[#a8edea] to-[#fed6e3] shadow-inner shadow-white/30 border border-white/20 active:scale-90'
              }`}
            />
          );
        })}
      </div>

      {allPopped && (
        <motion.button
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          onClick={reset}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#00FFB3] text-black font-bold"
        >
          <FaSyncAlt /> 再来一张
        </motion.button>
      )}
    </div>
  );
};

// ============================================================
// 4. 今天谁买单（转盘）
// ============================================================
const COLORS = ['#00FFB3', '#FF9F43', '#FF6B6B', '#00D9FF', '#a29bfe', '#fd79a8', '#55efc4', '#fdcb6e'];

const SpinnerGame = ({ onClose }: { onClose: () => void }) => {
  const { friends } = useUserStore();
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');

  const baseNames = friends.map((f: any) => f.friend?.username || '好友');
  const names = [...baseNames, ...extraNames].filter(Boolean);
  const n = names.length;

  const addName = () => {
    if (newName.trim() && !names.includes(newName.trim())) {
      setExtraNames(prev => [...prev, newName.trim()]);
    }
    setNewName('');
  };

  const spin = () => {
    if (spinning || n < 2) return;
    setResult(null);
    setSpinning(true);
    const spins = 5 + Math.random() * 5; // 5~10 圈
    const extraDeg = Math.floor(Math.random() * 360);
    const totalDeg = spins * 360 + extraDeg;
    const newAngle = angle + totalDeg;
    setAngle(newAngle);

    setTimeout(() => {
      setSpinning(false);
      // 指针在顶部(270°)，算落在哪个扇区
      const normalised = ((newAngle % 360) + 360) % 360;
      const pointer = (360 - normalised + 270) % 360;
      const segSize = 360 / n;
      const idx = Math.floor(pointer / segSize) % n;
      setResult(names[idx]);
    }, 4000);
  };

  if (n === 0) {
    return (
      <div className="p-6 text-center text-white/40">
        <p className="mb-4">先去好友页添加好友，或者在下方输入名字</p>
        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addName()} placeholder="输入名字" className="flex-1 px-3 py-2 rounded-xl bg-white/10 text-white placeholder-white/30 outline-none" />
          <button onClick={addName} className="px-4 py-2 rounded-xl bg-[#00FFB3] text-black font-bold">添加</button>
        </div>
      </div>
    );
  }

  const segSize = 360 / n;
  const r = 110; // 半径

  return (
    <div className="flex flex-col items-center gap-4 p-5">
      {/* 手动加人 */}
      <div className="flex gap-2 w-full">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addName()}
          placeholder="加人（可选）"
          className="flex-1 px-3 py-2 rounded-xl bg-white/10 text-white text-sm placeholder-white/30 outline-none border border-white/10"
        />
        <button onClick={addName} className="px-3 py-2 rounded-xl bg-white/10 text-white/70 text-sm">+ 加</button>
      </div>

      {/* 转盘 SVG */}
      <div className="relative" style={{ width: 260, height: 260 }}>
        {/* 指针 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 text-2xl drop-shadow-lg">▼</div>
        <motion.svg
          width={260} height={260}
          animate={{ rotate: angle }}
          transition={{ duration: 4, ease: [0.17, 0.67, 0.12, 1] }}
          style={{ transformOrigin: '130px 130px' }}
        >
          {names.map((name, i) => {
            const startAngle = (i * segSize - 90) * (Math.PI / 180);
            const endAngle = ((i + 1) * segSize - 90) * (Math.PI / 180);
            const x1 = 130 + r * Math.cos(startAngle);
            const y1 = 130 + r * Math.sin(startAngle);
            const x2 = 130 + r * Math.cos(endAngle);
            const y2 = 130 + r * Math.sin(endAngle);
            const largeArc = segSize > 180 ? 1 : 0;
            const midAngle = (startAngle + endAngle) / 2;
            const tx = 130 + (r * 0.65) * Math.cos(midAngle);
            const ty = 130 + (r * 0.65) * Math.sin(midAngle);
            return (
              <g key={i}>
                <path
                  d={`M130,130 L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`}
                  fill={COLORS[i % COLORS.length]}
                  stroke="#1a1a1a" strokeWidth="2"
                />
                <text
                  x={tx} y={ty}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#000" fontSize="11" fontWeight="bold"
                  transform={`rotate(${(i + 0.5) * segSize}, ${tx}, ${ty})`}
                >
                  {name.length > 5 ? name.slice(0, 5) + '…' : name}
                </text>
              </g>
            );
          })}
          <circle cx="130" cy="130" r="16" fill="#1a1a1a" stroke="white" strokeWidth="3" />
        </motion.svg>
      </div>

      {/* 结果 */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <p className="text-white/50 text-sm">今天买单的是</p>
            <p className="text-3xl font-black text-[#FF9F43] mt-1">🎉 {result}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={spin}
        disabled={spinning || n < 2}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white font-black text-lg shadow-lg disabled:opacity-50"
      >
        {spinning ? '转中…' : '🌀 开转！'}
      </motion.button>
    </div>
  );
};

// ============================================================
// 5. 翻翻记忆（配对游戏）
// ============================================================

// 大图库：每次游戏随机取 8 个，增加趣味性
const ALL_EMOJI_POOL = [
  '🌊', '☕', '🍜', '🎸', '🌙', '🦋', '🌸', '🎠',
  '🎯', '🍕', '🎨', '🎭', '🌺', '🎪', '🍦', '🎲',
  '🦄', '🌈', '🎵', '🏄', '🌿', '🍓', '🎈', '🦊',
  '🍑', '🐬', '🌴', '🎀', '🧋', '🍩', '🔮', '🪄',
];

const MemoryMatchGame = ({ onClose }: { onClose: () => void }) => {
  const { memories } = useMemoryStore();

  const photoPool = memories.flatMap((m: any) => m.photos || []).slice(0, 8);
  const hasEnough = photoPool.length >= 2;

  // 每次新游戏随机从大池子取 8 个 emoji，增加变化
  const pick8Emojis = () => {
    const shuffled = [...ALL_EMOJI_POOL].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8);
  };
  const buildCards = () => {
    const imgs = hasEnough
      ? photoPool.slice(0, 8)
      : pick8Emojis();
    const pairs = [...imgs, ...imgs].map((src, i) => ({ id: i, src, matched: false, flipped: false }));
    // shuffle
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs;
  };

  const [cards, setCards] = useState(buildCards);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [moves, setMoves] = useState(0);
  const matched = cards.filter(c => c.matched).length / 2;
  const total = cards.length / 2;
  const won = matched === total;

  const flip = (idx: number) => {
    if (locked || cards[idx].flipped || cards[idx].matched) return;
    const newFlipped = [...flipped, idx];
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, flipped: true } : c));
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setLocked(true);
      setMoves(m => m + 1);
      const [a, b] = newFlipped;
      if (cards[a].src === cards[b].src) {
        setTimeout(() => {
          setCards(prev => prev.map((c, i) => (i === a || i === b) ? { ...c, matched: true } : c));
          setFlipped([]);
          setLocked(false);
        }, 400);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map((c, i) => (i === a || i === b) ? { ...c, flipped: false } : c));
          setFlipped([]);
          setLocked(false);
        }, 800);
      }
    }
  };

  const restart = () => { setCards(buildCards()); setFlipped([]); setLocked(false); setMoves(0); };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <div className="flex items-center gap-4 w-full">
        <span className="text-white/40 text-sm">{matched}/{total} 对</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div className="h-full rounded-full bg-[#00FFB3]" animate={{ width: `${(matched / total) * 100}%` }} />
        </div>
        <span className="text-white/40 text-sm">{moves} 步</span>
      </div>

      {/* 牌阵 4×4 */}
      <div className="grid grid-cols-4 gap-2.5">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            onClick={() => flip(i)}
            animate={{ rotateY: card.flipped || card.matched ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            style={{ perspective: 600 }}
            className="w-16 h-16 cursor-pointer"
          >
            <div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
              {/* Back */}
              <div
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#2d3561] to-[#5d4777] flex items-center justify-center"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span className="text-white/30 text-lg">?</span>
              </div>
              {/* Front */}
              <div
                className={`absolute inset-0 rounded-2xl overflow-hidden flex items-center justify-center ${card.matched ? 'ring-2 ring-[#00FFB3]' : ''}`}
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                {card.src.startsWith('http') ? (
                  <img src={card.src} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center text-3xl">
                    {card.src}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {won && (
        <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <p className="text-[#00FFB3] font-black text-xl">🎉 全部配对！</p>
          <p className="text-white/40 text-sm">{moves} 步完成</p>
          <button onClick={restart} className="mt-3 px-6 py-2 rounded-2xl bg-[#00FFB3] text-black font-bold">再玩一局</button>
        </motion.div>
      )}
    </div>
  );
};

// ============================================================
// 主 GamesPage
// ============================================================
const games = [
  {
    id: 'dice',
    icon: '🎲',
    title: '摇骰子',
    desc: '决定谁付钱？谁点菜？摇出来再说',
    color: '#00FFB3',
    bg: 'from-[#00FFB3]/20 to-[#00D9FF]/10',
    border: 'border-[#00FFB3]/20',
    component: DiceGame,
  },
  {
    id: 'truth',
    icon: '🃏',
    title: '真心话大冒险',
    desc: '说真话还是挑战？抽卡决定命运',
    color: '#a29bfe',
    bg: 'from-[#a29bfe]/20 to-[#fd79a8]/10',
    border: 'border-[#a29bfe]/20',
    component: TruthDareGame,
  },
  {
    id: 'bubble',
    icon: '🫧',
    title: '解压气泡纸',
    desc: '咔哒咔哒，把每颗气泡都戳破',
    color: '#74b9ff',
    bg: 'from-[#74b9ff]/20 to-[#a29bfe]/10',
    border: 'border-[#74b9ff]/20',
    component: BubbleWrapGame,
  },
  {
    id: 'spinner',
    icon: '🎡',
    title: '今天谁买单',
    desc: '转盘自动读取好友列表，公平公正',
    color: '#FF9F43',
    bg: 'from-[#FF9F43]/20 to-[#FF6B6B]/10',
    border: 'border-[#FF9F43]/20',
    component: SpinnerGame,
  },
  {
    id: 'match',
    icon: '🎴',
    title: '翻翻记忆',
    desc: '用你的记忆照片玩配对，重温旅途',
    color: '#fd79a8',
    bg: 'from-[#fd79a8]/20 to-[#e17055]/10',
    border: 'border-[#fd79a8]/20',
    component: MemoryMatchGame,
  },
];

export default function GamesPage() {
  const [activeGame, setActiveGame] = useState<typeof games[0] | null>(null);

  return (
    <div className="relative min-h-screen bg-orbit-black pb-28">
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: `radial-gradient(circle at 30% 20%, rgba(162,155,254,0.3) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,255,179,0.2) 0%, transparent 40%)` }}
      />

      {/* 顶部标题 */}
      <div className="relative z-10 safe-top px-4 pt-4 pb-2">
        <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <FaGamepad className="text-[#a29bfe]" /> 小游戏
          </h1>
          <p className="text-white/40 text-sm mt-1">朋友聚会的快乐，从这里开始</p>
        </motion.div>
      </div>

      {/* 游戏卡片列表 */}
      <div className="relative z-10 px-4 mt-4 space-y-3">
        {games.map((game, i) => (
          <motion.button
            key={game.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveGame(game)}
            className={`w-full glass-card rounded-2xl p-5 flex items-center gap-4 border bg-gradient-to-r ${game.bg} ${game.border} text-left`}
          >
            <div className="w-14 h-14 rounded-2xl bg-black/30 flex items-center justify-center text-3xl shrink-0">
              {game.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base">{game.title}</p>
              <p className="text-white/40 text-sm mt-0.5 leading-snug">{game.desc}</p>
            </div>
            <div className="text-white/20 text-xl shrink-0">›</div>
          </motion.button>
        ))}
      </div>

      {/* 游戏弹窗 */}
      <AnimatePresence>
        {activeGame && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-end justify-center"
            onClick={() => setActiveGame(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg bg-[#1a1a1a] rounded-t-3xl border-t border-white/10 pb-8 max-h-[88vh] overflow-y-auto hide-scrollbar"
            >
              {/* 游戏标题栏 */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{activeGame.icon}</span>
                  <div>
                    <h2 className="text-white font-bold">{activeGame.title}</h2>
                    <p className="text-white/30 text-xs">{activeGame.desc}</p>
                  </div>
                </div>
                <button onClick={() => setActiveGame(null)} className="p-2 rounded-full bg-white/10 text-white/60">
                  <FaTimes />
                </button>
              </div>

              {/* 游戏内容 */}
              <activeGame.component onClose={() => setActiveGame(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
