import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaSyncAlt, FaGamepad, FaTrash } from 'react-icons/fa';

// ============================================================
// 游戏音效（轻量 Web Audio）
// ============================================================
type SfxType = 'tap' | 'pop' | 'roll' | 'flip' | 'match' | 'win' | 'lose' | 'spin' | 'line' | 'drop' | 'rotate' | 'move';

const SFX_STORAGE_KEY = 'orbit_sfx_settings';
const SFX_EVENT = 'orbit:sfx-settings';
const DEFAULT_SFX = { muted: false, volume: 0.45 };

const readSfxSettings = () => {
  if (typeof window === 'undefined') return DEFAULT_SFX;
  try {
    const raw = localStorage.getItem(SFX_STORAGE_KEY);
    if (!raw) return DEFAULT_SFX;
    const parsed = JSON.parse(raw);
    return {
      muted: Boolean(parsed?.muted),
      volume: typeof parsed?.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SFX.volume,
    };
  } catch {
    return DEFAULT_SFX;
  }
};

const writeSfxSettings = (next: { muted: boolean; volume: number }) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SFX_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(SFX_EVENT, { detail: next }));
};

const useGameSfx = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const lastPlayRef = useRef(0);
  const settingsRef = useRef(readSfxSettings());

  useEffect(() => {
    settingsRef.current = readSfxSettings();
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ muted: boolean; volume: number }>).detail;
      if (detail) settingsRef.current = detail;
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(SFX_EVENT, onUpdate as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(SFX_EVENT, onUpdate as EventListener);
      }
    };
  }, []);

  const ensureCtx = () => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctxRef.current) ctxRef.current = new AudioCtx();
    return ctxRef.current;
  };

  const play = useCallback((type: SfxType) => {
    const ctx = ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // 避免极短时间内过密触发
    if (now - lastPlayRef.current < 0.02) return;
    lastPlayRef.current = now;

    const settings = settingsRef.current || DEFAULT_SFX;
    if (settings.muted || settings.volume <= 0) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);

    const setEnvelope = (duration = 0.12, peak = 0.12) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak * settings.volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.stop(now + duration + 0.02);
    };

    switch (type) {
      case 'pop':
        osc.type = 'square';
        osc.frequency.setValueAtTime(520, now);
        setEnvelope(0.08, 0.08);
        break;
      case 'roll':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.2);
        setEnvelope(0.22, 0.08);
        break;
      case 'flip':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
        setEnvelope(0.14, 0.08);
        break;
      case 'match':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
        setEnvelope(0.18, 0.12);
        break;
      case 'win':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(1040, now + 0.22);
        setEnvelope(0.26, 0.14);
        break;
      case 'lose':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);
        setEnvelope(0.26, 0.12);
        break;
      case 'spin':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.26);
        setEnvelope(0.3, 0.08);
        break;
      case 'line':
        osc.type = 'square';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
        setEnvelope(0.16, 0.1);
        break;
      case 'drop':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(360, now);
        setEnvelope(0.1, 0.08);
        break;
      case 'rotate':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        setEnvelope(0.1, 0.06);
        break;
      case 'move':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        setEnvelope(0.08, 0.05);
        break;
      default:
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        setEnvelope(0.08, 0.05);
        break;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
  }, []);

  return { play };
};

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
  const { play } = useGameSfx();

  const roll = () => {
    if (rolling) return;
    play('roll');
    setRolling(true);
    const ticks = 12;
    let t = 0;
    const id = setInterval(() => {
      setValues(Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1));
      t++;
      if (t >= ticks) {
        clearInterval(id);
        setRolling(false);
        play('tap');
      }
    }, 60);
  };

  const handleCountChange = (n: number) => {
    setCount(n);
    setValues(Array.from({ length: n }, () => 1));
    play('tap');
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
  const { play } = useGameSfx();

  const draw = (type: 'truth' | 'dare') => {
    setMode(type);
    play('flip');
    setFlipping(true);
    setTimeout(() => {
      const pool = type === 'truth' ? truthCards : dareCards;
      setCard(pool[Math.floor(Math.random() * pool.length)]);
      setFlipping(false);
      play('tap');
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
  const { play } = useGameSfx();

  const popBubble = (i: number) => {
    if (popped.has(i)) return;
    // haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(15);
    play('pop');
    if (popped.size + 1 === total) play('win');
    setPopped(prev => new Set([...prev, i]));
    setCombo(c => c + 1);
  };

  const reset = () => { setPopped(new Set()); setCombo(0); play('tap'); };
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
// 4. 俄罗斯方块
// ============================================================
const TETRIS_COLS = 10;
const TETRIS_ROWS = 20;
const TETRIS_BASE_DROP_MS = 650;
const TETRIS_MIN_DROP_MS = 140;
const TETRIS_LEVEL_LINES = 8;
const TETRIS_BEST_KEY = 'orbit_tetris_best_score';

const TETROMINOES = [
  { color: '#00D9FF', shape: [[1, 1, 1, 1]] }, // I
  { color: '#FF9F43', shape: [[1, 0, 0], [1, 1, 1]] }, // J
  { color: '#F368E0', shape: [[0, 0, 1], [1, 1, 1]] }, // L
  { color: '#00FFB3', shape: [[1, 1], [1, 1]] }, // O
  { color: '#6C5CE7', shape: [[0, 1, 1], [1, 1, 0]] }, // S
  { color: '#FFD166', shape: [[0, 1, 0], [1, 1, 1]] }, // T
  { color: '#FF6B6B', shape: [[1, 1, 0], [0, 1, 1]] }, // Z
];

type TetrisCell = { filled: boolean; color?: string };
type TetrisPiece = { shape: number[][]; x: number; y: number; color: string };

const createEmptyBoard = () =>
  Array.from({ length: TETRIS_ROWS }, () =>
    Array.from({ length: TETRIS_COLS }, () => ({ filled: false } as TetrisCell))
  );

const rotateMatrix = (matrix: number[][]) =>
  matrix[0].map((_, idx) => matrix.map((row) => row[idx]).reverse());

const randomPiece = (): TetrisPiece => {
  const pick = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
  const width = pick.shape[0].length;
  return {
    shape: pick.shape.map((row) => [...row]),
    x: Math.floor((TETRIS_COLS - width) / 2),
    y: -1,
    color: pick.color,
  };
};

const hasCollision = (board: TetrisCell[][], piece: TetrisPiece, offsetX = 0, offsetY = 0) => {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (!piece.shape[y][x]) continue;
      const newX = piece.x + x + offsetX;
      const newY = piece.y + y + offsetY;
      if (newX < 0 || newX >= TETRIS_COLS || newY >= TETRIS_ROWS) return true;
      if (newY >= 0 && board[newY][newX].filled) return true;
    }
  }
  return false;
};

const mergePiece = (board: TetrisCell[][], piece: TetrisPiece) => {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (!piece.shape[y][x]) continue;
      const by = piece.y + y;
      const bx = piece.x + x;
      if (by >= 0 && by < TETRIS_ROWS && bx >= 0 && bx < TETRIS_COLS) {
        next[by][bx] = { filled: true, color: piece.color };
      }
    }
  }
  return next;
};

const clearLines = (board: TetrisCell[][]) => {
  const remaining = board.filter((row) => row.some((cell) => !cell.filled));
  const cleared = TETRIS_ROWS - remaining.length;
  if (cleared === 0) return { board, cleared: 0 };
  const newRows = Array.from({ length: cleared }, () =>
    Array.from({ length: TETRIS_COLS }, () => ({ filled: false } as TetrisCell))
  );
  return { board: [...newRows, ...remaining], cleared };
};

const TetrisGame = ({ onClose }: { onClose: () => void }) => {
  const [board, setBoard] = useState<TetrisCell[][]>(createEmptyBoard());
  const [current, setCurrent] = useState<TetrisPiece>(randomPiece());
  const [next, setNext] = useState<TetrisPiece>(randomPiece());
  const [isRunning, setIsRunning] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const { play } = useGameSfx();

  const level = Math.max(1, Math.floor(lines / TETRIS_LEVEL_LINES) + 1);
  const dropMs = Math.max(TETRIS_MIN_DROP_MS, TETRIS_BASE_DROP_MS - (level - 1) * 55);

  const reset = () => {
    setBoard(createEmptyBoard());
    setCurrent(randomPiece());
    setNext(randomPiece());
    setScore(0);
    setLines(0);
    setIsOver(false);
    setIsRunning(true);
    play('tap');
  };

  const spawnNext = (nextPiece = next) => {
    const fresh = { ...nextPiece, x: Math.floor((TETRIS_COLS - nextPiece.shape[0].length) / 2), y: -1 };
    setCurrent(fresh);
    setNext(randomPiece());
    if (hasCollision(board, fresh, 0, 0)) {
      setIsRunning(false);
      setIsOver(true);
      play('lose');
    }
  };

  const stepDown = () => {
    if (hasCollision(board, current, 0, 1)) {
      const merged = mergePiece(board, current);
      const { board: clearedBoard, cleared } = clearLines(merged);
      if (cleared > 0) {
        setLines((l) => l + cleared);
        setScore((s) => s + cleared * 120 * Math.max(1, Math.floor(lines / TETRIS_LEVEL_LINES) + 1));
        play('line');
      }
      setBoard(clearedBoard);
      spawnNext();
    } else {
      setCurrent((p) => ({ ...p, y: p.y + 1 }));
    }
  };

  const move = (dx: number) => {
    if (!hasCollision(board, current, dx, 0)) {
      setCurrent((p) => ({ ...p, x: p.x + dx }));
      play('move');
    }
  };

  const rotate = () => {
    const rotated = { ...current, shape: rotateMatrix(current.shape) };
    if (!hasCollision(board, rotated, 0, 0)) {
      setCurrent(rotated);
      play('rotate');
    }
  };

  const hardDrop = () => {
    let drop = 0;
    while (!hasCollision(board, current, 0, drop + 1)) drop++;
    if (drop > 0) setCurrent((p) => ({ ...p, y: p.y + drop }));
    if (drop > 0) setScore((s) => s + drop * 2);
    if (drop > 0) play('drop');
    stepDown();
  };

  const softDrop = () => {
    if (!hasCollision(board, current, 0, 1)) {
      setCurrent((p) => ({ ...p, y: p.y + 1 }));
      setScore((s) => s + 1);
      play('drop');
    } else {
      stepDown();
    }
  };

  useEffect(() => {
    if (!isRunning || isOver) return;
    const id = setInterval(() => stepDown(), dropMs);
    return () => clearInterval(id);
  }, [isRunning, isOver, current, board, dropMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isRunning || isOver) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowDown') softDrop();
      if (e.key === 'ArrowUp') rotate();
      if (e.key === ' ') hardDrop();
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [isRunning, isOver, current, board]);

  useEffect(() => {
    const stored = Number(localStorage.getItem(TETRIS_BEST_KEY) || 0);
    if (!Number.isNaN(stored)) setBestScore(stored);
  }, []);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem(TETRIS_BEST_KEY, String(score));
    }
  }, [score, bestScore]);

  const renderBoard = () => {
    return board.map((row, y) =>
      row.map((cell, x) => {
        let filled = cell.filled;
        let color = cell.color;
        const localX = x - current.x;
        const localY = y - current.y;
        if (localY >= 0 && localY < current.shape.length && localX >= 0 && localX < current.shape[0].length) {
          if (current.shape[localY][localX]) {
            filled = true;
            color = current.color;
          }
        }
        return { filled, color };
      })
    );
  };

  const displayBoard = renderBoard();

  return (
    <div className="flex flex-col items-center gap-4 p-5">
      <div className="w-full flex items-center justify-between">
        <div className="text-white/60 text-xs">等级 {level} · 行数 {lines} · 分数 {score} · 最高 {bestScore}</div>
        <button
          onClick={() => { setIsRunning((r) => !r); play('tap'); }}
          className="px-3 py-1.5 rounded-full bg-white/10 text-white/70 text-xs"
          disabled={isOver}
        >
          {isRunning ? '暂停' : '继续'}
        </button>
      </div>

      <div className="w-full flex items-start gap-4">
        <div className="bg-black/50 border border-white/10 rounded-2xl p-3">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${TETRIS_COLS}, 1fr)` }}>
            {displayBoard.flatMap((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`${x}-${y}`}
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-[4px]"
                  style={{
                    background: cell.filled ? cell.color : 'rgba(255,255,255,0.06)',
                    boxShadow: cell.filled ? `0 0 8px ${cell.color}` : 'none',
                  }}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-white/70 text-xs">
            <p className="text-white/80 font-semibold mb-2">下一块</p>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${next.shape[0].length}, 1fr)` }}>
              {next.shape.map((row, y) =>
                row.map((v, x) => (
                  <div
                    key={`${x}-${y}`}
                    className="w-3.5 h-3.5 rounded-[3px]"
                    style={{ background: v ? next.color : 'rgba(255,255,255,0.08)' }}
                  />
                ))
              )}
            </div>
          </div>
          <button onClick={reset} className="px-4 py-2 rounded-2xl bg-[#00FFB3] text-black font-bold text-sm">重新开始</button>
          {isOver && <div className="text-xs text-[#FF6B6B]">游戏结束</div>}
        </div>
      </div>

      <div className="w-full flex items-center justify-center gap-2">
        <button onClick={() => move(-1)} className="px-4 py-3 rounded-2xl bg-white/10 text-white">←</button>
        <button onClick={() => rotate()} className="px-4 py-3 rounded-2xl bg-white/10 text-white">旋转</button>
        <button onClick={() => move(1)} className="px-4 py-3 rounded-2xl bg-white/10 text-white">→</button>
      </div>
      <div className="w-full flex items-center justify-center gap-2">
        <button onClick={() => stepDown()} className="flex-1 px-4 py-3 rounded-2xl bg-white/10 text-white">下落</button>
        <button onClick={() => hardDrop()} className="flex-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-bold">一键到底</button>
      </div>

      {!isRunning && !isOver && (
        <button onClick={() => { setIsRunning(true); play('tap'); }} className="text-white/60 text-xs">点击开始</button>
      )}
    </div>
  );
};

// ============================================================
// 4. 今天谁买单（转盘）
// ============================================================
const COLORS = ['#00FFB3', '#FF9F43', '#FF6B6B', '#00D9FF', '#a29bfe', '#fd79a8', '#55efc4', '#fdcb6e'];
const SPINNER_STORAGE_KEY = 'orbit_spinner_names';

const SpinnerGame = ({ onClose }: { onClose: () => void }) => {
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const { play } = useGameSfx();

  // 从本地存储恢复上次输入的名字
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SPINNER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
        setExtraNames(Array.from(new Set(clean)));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // 持久化用户自定义名字
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SPINNER_STORAGE_KEY, JSON.stringify(extraNames));
    } catch {
      // ignore
    }
  }, [extraNames]);

  const names = extraNames.filter(Boolean);
  const n = names.length;

  const addName = () => {
    const clean = newName.trim();
    if (clean && !names.includes(clean)) {
      setExtraNames(prev => [...prev, clean]);
      play('tap');
    }
    setNewName('');
  };

  const removeExtraName = (name: string) => {
    setExtraNames(prev => prev.filter((n) => n !== name));
    play('tap');
  };

  const clearNames = () => {
    setExtraNames([]);
    play('tap');
  };

  const clearHistory = () => { setHistory([]); play('tap'); };

  const spin = () => {
    if (spinning || n < 2) return;
    play('spin');
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
      const winner = names[idx];
      setResult(winner);
      setHistory((prev) => [winner, ...prev].slice(0, 5));
      play('win');
    }, 4000);
  };

  if (n === 0) {
    return (
      <div className="p-6 text-center text-white/40">
        <p className="mb-4">请输入至少两个名字来转盘</p>
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
        <button onClick={clearNames} className="px-3 py-2 rounded-xl bg-white/5 text-white/50 text-sm border border-white/10">清空</button>
      </div>

      {/* 额外名单 */}
      {extraNames.length > 0 && (
        <div className="w-full flex flex-wrap gap-2">
          {extraNames.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 text-white/70 text-xs">
              {name}
              <button onClick={() => removeExtraName(name)} className="text-white/40 hover:text-red-300">
                <FaTrash className="text-[10px]" />
              </button>
            </span>
          ))}
        </div>
      )}

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
            <p className="text-white/35 text-xs mt-1">恭喜你被幸运女神点名买单～</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 最近结果 */}
      {history.length > 0 && (
        <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/40 text-xs">最近结果</p>
            <button onClick={clearHistory} className="text-white/30 hover:text-white/60 text-xs">清空</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((h, i) => (
              <span key={`${h}-${i}`} className={`px-2 py-1 rounded-full text-xs ${i === 0 ? 'bg-[#FF9F43]/20 text-[#FF9F43]' : 'bg-white/10 text-white/60'}`}>
                {i === 0 ? '本轮 ' : ''}{h}
              </span>
            ))}
          </div>
        </div>
      )}

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
// 5. 卡通翻牌（配对游戏）
// ============================================================

type ToonCard = { id: string; emoji: string; name: string; bg: string };
type MatchTheme = 'ocean' | 'dessert' | 'space';
type MatchLevel = '4x4' | '6x6';
type MatchBestRecord = { theme: MatchTheme; timeMs: number; moves: number; createdAt: string };

const MATCH_BEST_TIME_KEY = 'orbit_match_6x6_best_times_v1';

const loadBestRecords = (): MatchBestRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MATCH_BEST_TIME_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: any) => item && typeof item.timeMs === 'number' && typeof item.moves === 'number' && item.theme);
  } catch {
    return [];
  }
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

const DEFAULT_THEME: MatchTheme = 'ocean';
const DEFAULT_LEVEL: MatchLevel = '4x4';

const MATCH_LEVELS: Record<MatchLevel, { label: string; pairs: number; cols: number; cardClass: string; emojiClass: string; nameClass: string }> = {
  '4x4': { label: '轻松 4×4', pairs: 8, cols: 4, cardClass: 'w-16 h-16', emojiClass: 'text-3xl', nameClass: 'text-[10px]' },
  '6x6': { label: '进阶 6×6', pairs: 18, cols: 6, cardClass: 'w-11 h-11', emojiClass: 'text-xl', nameClass: 'text-[8px]' },
};

const MATCH_THEMES: Record<MatchTheme, { label: string; icon: string; cards: ToonCard[] }> = {
  ocean: {
    label: '海洋',
    icon: '🌊',
    cards: [
      { id: 'ocean-whale', emoji: '🐋', name: '鲸鱼', bg: 'from-sky-500/45 to-cyan-300/30' },
      { id: 'ocean-dolphin', emoji: '🐬', name: '海豚', bg: 'from-cyan-500/45 to-sky-300/30' },
      { id: 'ocean-fish', emoji: '🐟', name: '小鱼', bg: 'from-blue-500/45 to-cyan-300/30' },
      { id: 'ocean-octopus', emoji: '🐙', name: '章鱼', bg: 'from-fuchsia-500/40 to-violet-300/30' },
      { id: 'ocean-crab', emoji: '🦀', name: '螃蟹', bg: 'from-red-500/40 to-orange-300/30' },
      { id: 'ocean-shell', emoji: '🐚', name: '贝壳', bg: 'from-amber-400/40 to-orange-200/30' },
      { id: 'ocean-coral', emoji: '🪸', name: '珊瑚', bg: 'from-rose-500/40 to-pink-300/30' },
      { id: 'ocean-shrimp', emoji: '🦐', name: '虾虾', bg: 'from-orange-500/40 to-rose-300/30' },
      { id: 'ocean-seal', emoji: '🦭', name: '海豹', bg: 'from-slate-400/40 to-cyan-300/30' },
      { id: 'ocean-seahorse', emoji: '🐠', name: '海马', bg: 'from-yellow-400/40 to-orange-300/30' },
      { id: 'ocean-wave', emoji: '🌊', name: '浪花', bg: 'from-cyan-500/45 to-blue-400/30' },
      { id: 'ocean-water', emoji: '💧', name: '水滴', bg: 'from-blue-500/45 to-sky-300/30' },
      { id: 'ocean-island', emoji: '🏝️', name: '小岛', bg: 'from-emerald-500/35 to-cyan-300/30' },
      { id: 'ocean-sun', emoji: '🌞', name: '海上日光', bg: 'from-yellow-400/45 to-orange-300/30' },
      { id: 'ocean-boat', emoji: '⛵', name: '帆船', bg: 'from-blue-500/40 to-emerald-300/30' },
      { id: 'ocean-star', emoji: '⭐', name: '海星', bg: 'from-amber-400/45 to-yellow-300/30' },
      { id: 'ocean-bubble', emoji: '🫧', name: '泡泡', bg: 'from-cyan-400/40 to-slate-200/35' },
      { id: 'ocean-palm', emoji: '🌴', name: '棕榈', bg: 'from-emerald-500/40 to-lime-300/30' },
    ],
  },
  dessert: {
    label: '甜品',
    icon: '🍰',
    cards: [
      { id: 'dessert-cake', emoji: '🍰', name: '蛋糕', bg: 'from-pink-500/45 to-rose-300/30' },
      { id: 'dessert-cupcake', emoji: '🧁', name: '纸杯蛋糕', bg: 'from-fuchsia-500/40 to-pink-300/30' },
      { id: 'dessert-donut', emoji: '🍩', name: '甜甜圈', bg: 'from-amber-500/40 to-rose-300/30' },
      { id: 'dessert-cookie', emoji: '🍪', name: '曲奇', bg: 'from-yellow-500/40 to-orange-300/30' },
      { id: 'dessert-candy', emoji: '🍬', name: '糖果', bg: 'from-violet-500/40 to-pink-300/30' },
      { id: 'dessert-choco', emoji: '🍫', name: '巧克力', bg: 'from-amber-700/45 to-orange-500/30' },
      { id: 'dessert-honey', emoji: '🍯', name: '蜂蜜', bg: 'from-amber-500/45 to-yellow-300/30' },
      { id: 'dessert-icecream', emoji: '🍦', name: '冰淇淋', bg: 'from-sky-400/40 to-pink-300/30' },
      { id: 'dessert-shaved', emoji: '🍧', name: '刨冰', bg: 'from-cyan-400/40 to-violet-300/30' },
      { id: 'dessert-pudding', emoji: '🍮', name: '布丁', bg: 'from-orange-500/40 to-yellow-300/30' },
      { id: 'dessert-pie', emoji: '🥧', name: '派', bg: 'from-orange-600/40 to-amber-300/30' },
      { id: 'dessert-strawberry', emoji: '🍓', name: '草莓', bg: 'from-rose-500/45 to-red-300/30' },
      { id: 'dessert-peach', emoji: '🍑', name: '桃子', bg: 'from-orange-400/40 to-pink-300/30' },
      { id: 'dessert-cherry', emoji: '🍒', name: '樱桃', bg: 'from-red-500/40 to-rose-300/30' },
      { id: 'dessert-grape', emoji: '🍇', name: '葡萄', bg: 'from-violet-600/40 to-fuchsia-300/30' },
      { id: 'dessert-boba', emoji: '🧋', name: '奶茶', bg: 'from-amber-700/35 to-yellow-500/25' },
      { id: 'dessert-macaroon', emoji: '🟣', name: '马卡龙', bg: 'from-fuchsia-400/40 to-violet-300/30' },
      { id: 'dessert-jelly', emoji: '🍭', name: '果冻糖', bg: 'from-pink-500/45 to-purple-300/30' },
    ],
  },
  space: {
    label: '太空',
    icon: '🚀',
    cards: [
      { id: 'space-rocket', emoji: '🚀', name: '火箭', bg: 'from-slate-700/55 to-purple-500/35' },
      { id: 'space-ufo', emoji: '🛸', name: '飞碟', bg: 'from-cyan-500/45 to-violet-400/30' },
      { id: 'space-planet', emoji: '🪐', name: '行星', bg: 'from-violet-600/45 to-fuchsia-300/30' },
      { id: 'space-star', emoji: '⭐', name: '星星', bg: 'from-amber-400/45 to-yellow-300/30' },
      { id: 'space-moon', emoji: '🌙', name: '月亮', bg: 'from-slate-400/45 to-indigo-300/30' },
      { id: 'space-earth', emoji: '🌍', name: '地球', bg: 'from-emerald-500/45 to-sky-400/30' },
      { id: 'space-galaxy', emoji: '🌌', name: '银河', bg: 'from-indigo-600/50 to-fuchsia-500/35' },
      { id: 'space-comet', emoji: '☄️', name: '彗星', bg: 'from-slate-500/45 to-cyan-300/30' },
      { id: 'space-astronaut', emoji: '👨‍🚀', name: '宇航员', bg: 'from-sky-500/45 to-indigo-300/30' },
      { id: 'space-satellite', emoji: '🛰️', name: '卫星', bg: 'from-cyan-500/40 to-slate-300/30' },
      { id: 'space-robot', emoji: '🤖', name: '机器人', bg: 'from-zinc-500/45 to-cyan-300/30' },
      { id: 'space-alien', emoji: '👽', name: '外星人', bg: 'from-lime-500/45 to-emerald-300/30' },
      { id: 'space-ring', emoji: '💫', name: '星环', bg: 'from-violet-500/45 to-sky-300/30' },
      { id: 'space-sun', emoji: '🌞', name: '恒星', bg: 'from-orange-500/45 to-yellow-300/30' },
      { id: 'space-antenna', emoji: '📡', name: '天线', bg: 'from-slate-500/45 to-cyan-300/30' },
      { id: 'space-crystal', emoji: '🔮', name: '星能球', bg: 'from-violet-600/45 to-fuchsia-400/30' },
      { id: 'space-bolt', emoji: '⚡', name: '脉冲', bg: 'from-yellow-400/45 to-amber-300/30' },
      { id: 'space-meteor', emoji: '🌠', name: '流星', bg: 'from-indigo-600/45 to-cyan-300/30' },
    ],
  },
};

const shuffleArray = <T,>(source: T[]) => {
  const list = [...source];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const buildMatchCards = (theme: MatchTheme, level: MatchLevel) => {
  const levelConfig = MATCH_LEVELS[level];
  const basePool = MATCH_THEMES[theme].cards;
  const fallbackPool = Object.values(MATCH_THEMES).flatMap((group) => group.cards);
  const mergedPool = Array.from(new Map([...basePool, ...fallbackPool].map((item) => [item.id, item])).values());
  const selected = shuffleArray(mergedPool).slice(0, levelConfig.pairs);
  const pairs = shuffleArray([...selected, ...selected]).map((toon, i) => ({ id: i, toon, matched: false, flipped: false }));
  return pairs;
};

const MemoryMatchGame = ({ onClose }: { onClose: () => void }) => {
  const [theme, setTheme] = useState<MatchTheme>(DEFAULT_THEME);
  const [level, setLevel] = useState<MatchLevel>(DEFAULT_LEVEL);
  const [cards, setCards] = useState(() => buildMatchCards(DEFAULT_THEME, DEFAULT_LEVEL));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [moves, setMoves] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [hasRecordedWin, setHasRecordedWin] = useState(false);
  const [bestRecords, setBestRecords] = useState<MatchBestRecord[]>(() => loadBestRecords());
  const { play } = useGameSfx();
  const currentLevel = MATCH_LEVELS[level];
  const matched = cards.filter(c => c.matched).length / 2;
  const total = cards.length / 2;
  const won = matched === total;
  const themeBest = useMemo(
    () => bestRecords.filter((r) => r.theme === theme).sort((a, b) => a.timeMs - b.timeMs || a.moves - b.moves).slice(0, 5),
    [bestRecords, theme]
  );

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedMs((prev) => prev + 100);
    }, 100);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    if (level !== '6x6') {
      setTimerRunning(false);
      setElapsedMs(0);
      setHasRecordedWin(false);
    }
  }, [level]);

  useEffect(() => {
    if (!won || level !== '6x6' || hasRecordedWin) return;

    setTimerRunning(false);
    const record: MatchBestRecord = {
      theme,
      timeMs: elapsedMs,
      moves,
      createdAt: new Date().toISOString(),
    };

    setBestRecords((prev) => {
      const next = [...prev, record]
        .sort((a, b) => a.timeMs - b.timeMs || a.moves - b.moves)
        .slice(0, 20);
      if (typeof window !== 'undefined') {
        localStorage.setItem(MATCH_BEST_TIME_KEY, JSON.stringify(next));
      }
      return next;
    });

    setHasRecordedWin(true);
    play('win');
  }, [won, level, hasRecordedWin, theme, elapsedMs, moves]);

  useEffect(() => {
    if (won && level !== '6x6') {
      play('win');
    }
  }, [won, level]);

  const flip = (idx: number) => {
    if (locked || cards[idx].flipped || cards[idx].matched) return;
    play('flip');
    if (level === '6x6' && !timerRunning && !won) {
      setTimerRunning(true);
    }
    const newFlipped = [...flipped, idx];
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, flipped: true } : c));
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setLocked(true);
      setMoves(m => m + 1);
      const [a, b] = newFlipped;
      if (cards[a].toon.id === cards[b].toon.id) {
        setTimeout(() => {
          setCards(prev => prev.map((c, i) => (i === a || i === b) ? { ...c, matched: true } : c));
          setFlipped([]);
          setLocked(false);
          play('match');
        }, 400);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map((c, i) => (i === a || i === b) ? { ...c, flipped: false } : c));
          setFlipped([]);
          setLocked(false);
          play('tap');
        }, 800);
      }
    }
  };

  const restart = (nextTheme: MatchTheme = theme, nextLevel: MatchLevel = level) => {
    setCards(buildMatchCards(nextTheme, nextLevel));
    setFlipped([]);
    setLocked(false);
    setMoves(0);
    setElapsedMs(0);
    setTimerRunning(false);
    setHasRecordedWin(false);
    play('tap');
  };

  const handleChangeTheme = (nextTheme: MatchTheme) => {
    setTheme(nextTheme);
    restart(nextTheme, level);
    play('tap');
  };

  const handleChangeLevel = (nextLevel: MatchLevel) => {
    setLevel(nextLevel);
    restart(theme, nextLevel);
    play('tap');
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* 主题选择 */}
      <div className="w-full">
        <p className="text-white/35 text-xs mb-2">主题皮肤</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(MATCH_THEMES) as MatchTheme[]).map((key) => {
            const item = MATCH_THEMES[key];
            const active = key === theme;
            return (
              <button
                key={key}
                onClick={() => handleChangeTheme(key)}
                className={`rounded-xl px-2 py-2 text-xs border transition-all ${active ? 'bg-[#00FFB3]/20 border-[#00FFB3]/40 text-[#00FFB3]' : 'bg-white/5 border-white/10 text-white/60'}`}
              >
                <span className="mr-1">{item.icon}</span>{item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 难度选择 */}
      <div className="w-full">
        <p className="text-white/35 text-xs mb-2">难度档位</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(MATCH_LEVELS) as MatchLevel[]).map((key) => {
            const item = MATCH_LEVELS[key];
            const active = key === level;
            return (
              <button
                key={key}
                onClick={() => handleChangeLevel(key)}
                className={`rounded-xl px-3 py-2 text-xs border transition-all ${active ? 'bg-[#FF9F43]/20 border-[#FF9F43]/40 text-[#FF9F43]' : 'bg-white/5 border-white/10 text-white/60'}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 w-full">
        <span className="text-white/40 text-sm">{matched}/{total} 对</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div className="h-full rounded-full bg-[#00FFB3]" animate={{ width: `${(matched / total) * 100}%` }} />
        </div>
        <span className="text-white/40 text-sm">{moves} 步</span>
      </div>

      {level === '6x6' && (
        <div className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 flex items-center justify-between">
          <span className="text-white/40 text-xs">⏱ 当前计时</span>
          <span className="text-[#00FFB3] font-mono text-sm">{formatDuration(elapsedMs)}</span>
        </div>
      )}

      <p className="text-white/35 text-xs">翻开的是 {MATCH_THEMES[theme].label} 主题卡通角色，不使用回忆照片</p>

      {/* 牌阵（支持 4x4 / 6x6） */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${currentLevel.cols}, minmax(0, 1fr))` }}>
        {cards.map((card, i) => (
          <button
            key={card.id}
            onClick={() => flip(i)}
            type="button"
            disabled={locked || card.matched}
            className={`${currentLevel.cardClass} relative cursor-pointer rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00FFB3]/60 disabled:cursor-default`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {card.flipped || card.matched ? (
                <motion.div
                  key={`front-${card.id}-${card.flipped ? 'open' : 'matched'}`}
                  initial={{ opacity: 0, scaleX: 0.72 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0.72 }}
                  transition={{ duration: 0.18 }}
                  className={`absolute inset-0 rounded-2xl overflow-hidden flex items-center justify-center ${card.matched ? 'ring-2 ring-[#00FFB3]' : ''}`}
                >
                  <div className={`w-full h-full bg-gradient-to-br ${card.toon.bg} flex flex-col items-center justify-center`}>
                    <span className={`${currentLevel.emojiClass} drop-shadow`}>{card.toon.emoji}</span>
                    <span className={`${currentLevel.nameClass} text-black/70 font-semibold mt-0.5`}>{card.toon.name}</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={`back-${card.id}`}
                  initial={{ opacity: 0, scaleX: 0.72 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0.72 }}
                  transition={{ duration: 0.18 }}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#2d3561] to-[#5d4777] flex items-center justify-center"
                >
                  <span className={`text-white/30 ${level === '6x6' ? 'text-sm' : 'text-lg'}`}>?</span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        ))}
      </div>

      {won && (
        <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <p className="text-[#00FFB3] font-black text-xl">🎉 全部配对！</p>
          <p className="text-white/40 text-sm">{moves} 步完成</p>
          {level === '6x6' && <p className="text-[#00FFB3]/80 text-sm mt-1">用时 {formatDuration(elapsedMs)}</p>}
          <button onClick={() => restart()} className="mt-3 px-6 py-2 rounded-2xl bg-[#00FFB3] text-black font-bold">再玩一局</button>
        </motion.div>
      )}

      {level === '6x6' && (
        <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-3">
          <p className="text-white/40 text-xs mb-2">🏆 本地最佳（{MATCH_THEMES[theme].label} / 6x6）</p>
          {themeBest.length === 0 ? (
            <p className="text-white/30 text-xs">还没有记录，完成一局来上榜吧</p>
          ) : (
            <div className="space-y-1.5">
              {themeBest.map((item, idx) => (
                <div key={`${item.createdAt}-${idx}`} className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${idx === 0 ? 'text-[#FFD166]' : 'text-white/55'}`}>#{idx + 1}</span>
                  <span className="text-[#00FFB3] font-mono">{formatDuration(item.timeMs)}</span>
                  <span className="text-white/40">{item.moves} 步</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!won && (
        <button onClick={() => restart()} className="text-white/35 text-xs underline underline-offset-2">重开本局</button>
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
    title: '翻翻卡通',
    desc: '支持海洋/甜品/太空皮肤 + 4x4/6x6 难度',
    color: '#fd79a8',
    bg: 'from-[#fd79a8]/20 to-[#e17055]/10',
    border: 'border-[#fd79a8]/20',
    component: MemoryMatchGame,
  },
  {
    id: 'tetris',
    icon: '🧱',
    title: '俄罗斯方块',
    desc: '左右移动、旋转与一键到底，看看你能消几行',
    color: '#00D9FF',
    bg: 'from-[#00D9FF]/20 to-[#6C5CE7]/10',
    border: 'border-[#00D9FF]/20',
    component: TetrisGame,
  },
];

export default function GamesPage() {
  const [activeGame, setActiveGame] = useState<typeof games[0] | null>(null);
  const [sfxMuted, setSfxMuted] = useState(() => readSfxSettings().muted);
  const [sfxVolume, setSfxVolume] = useState(() => readSfxSettings().volume);

  useEffect(() => {
    writeSfxSettings({ muted: sfxMuted, volume: sfxVolume });
  }, [sfxMuted, sfxVolume]);

  const isLightMode = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  const cardBase = isLightMode
    ? 'glass-card rounded-2xl p-5 flex items-center gap-4 border bg-white/80 backdrop-blur'
    : 'glass-card rounded-2xl p-5 flex items-center gap-4 border bg-gradient-to-r';
  const iconBg = isLightMode ? 'bg-white/70 border border-black/5' : 'bg-black/30';

  return (
    <div className={`relative min-h-screen pb-28 ${isLightMode ? 'bg-white' : 'bg-orbit-black'}`}>
      {/* <PullToRefresh onRefresh={handlePullRefresh} isRefreshing={isRefreshingPull} /> */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: isLightMode
          ? 'radial-gradient(circle at 30% 20%, rgba(162,155,254,0.12) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,255,179,0.10) 0%, transparent 40%)'
          : 'radial-gradient(circle at 30% 20%, rgba(162,155,254,0.3) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,255,179,0.2) 0%, transparent 40%)' }}
      />

      {/* 顶部标题 */}
      <div className="relative z-10 safe-top px-4 pt-4 pb-2">
        <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <FaGamepad className="text-[#a29bfe]" /> 小游戏
          </h1>
          <p className="text-white/40 text-sm mt-1">朋友聚会的快乐，从这里开始</p>
        </motion.div>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={() => setSfxMuted((v) => !v)}
            className="px-3 py-1.5 rounded-full bg-white/10 text-white/70 text-xs border border-white/10 w-fit"
          >
            {sfxMuted ? '🔇 已静音' : '🔊 音效开'}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-xs">音量</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sfxVolume}
              onChange={(e) => setSfxVolume(Number(e.target.value))}
              className="w-40 accent-[#00FFB3]"
              disabled={sfxMuted}
            />
            <span className="text-white/40 text-xs w-10 text-right">{Math.round(sfxVolume * 100)}%</span>
          </div>
        </div>
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
            className={`w-full ${cardBase} ${isLightMode ? '' : `${game.bg} ${game.border}`} text-left`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${iconBg}`}>
              {game.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`${isLightMode ? 'text-gray-900' : 'text-white'} font-bold text-base`}>{game.title}</p>
              <p className={`${isLightMode ? 'text-gray-500' : 'text-white/40'} text-sm mt-0.5 leading-snug`}>{game.desc}</p>
            </div>
            <div className={`${isLightMode ? 'text-gray-300' : 'text-white/20'} text-xl shrink-0`}>›</div>
          </motion.button>
        ))}
      </div>

      {/* 游戏弹窗 */}
      <AnimatePresence>
        {activeGame && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setActiveGame(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-t-3xl pb-8 max-h-[88vh] overflow-y-auto hide-scrollbar shadow-2xl"
              style={{ background: 'var(--orbit-surface)', borderTop: `1px solid var(--orbit-border)`, color: 'var(--orbit-text)' }}
            >
              {/* 游戏标题栏 */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b"
                style={{ borderColor: 'var(--orbit-border)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{activeGame.icon}</span>
                  <div>
                    <h2 className="font-bold" style={{ color: 'var(--orbit-text)' }}>{activeGame.title}</h2>
                    <p className="text-xs" style={{ color: 'var(--orbit-text-muted, #6b7280)' }}>{activeGame.desc}</p>
                  </div>
                </div>
                <button onClick={() => setActiveGame(null)} className="p-2 rounded-full shadow-sm"
                  style={{ background: 'color-mix(in srgb, var(--orbit-surface) 92%, rgba(0,0,0,0.05))', border: `1px solid var(--orbit-border)`, color: 'var(--orbit-text-muted, #6b7280)' }}
                >
                  <FaTimes />
                </button>
              </div>

              {/* 游戏内容 */}
              <div className="px-3 sm:px-5 pb-4" style={{ color: 'var(--orbit-text)' }}>
                <activeGame.component onClose={() => setActiveGame(null)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
