import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaClock, FaUsers, FaUser, FaMapMarkerAlt, FaWallet, FaPlus, FaTimes, FaSpinner, FaImages, FaChevronRight, FaEdit, FaTrash, FaChevronDown } from 'react-icons/fa';
import { useLedgerStore, useUserStore, getUserById, useMemoryStore } from '../store';
import PullToRefresh from '../components/PullToRefresh';
import { shouldAllowRefresh } from '../utils/settings';

const getCityFromMemory = (memory: any): string => {
  const addr = memory?.location?.address || '';
  const name = memory?.location?.name || '';
  const cityMatch = addr.match(/([\u4e00-\u9fa5]{2,8}(?:市|州))/);
  if (cityMatch) return cityMatch[1];
  const nameMatch = name.match(/([\u4e00-\u9fa5]{2,6}(?:市|州))/);
  if (nameMatch) return nameMatch[1];
  if (name) return name.slice(0, 4) + '附近';
  return '未分类';
};

const getIsDarkTheme = () => {
  if (typeof document === 'undefined') return true;
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
};

// ==========================================
// 账单组件：类型 / 分类 / 计算器（保持原样，完全未改动）
// ==========================================
interface LedgerItem {
  id: string;
  category: string;
  note: string;
  amount: string;
}

const CATEGORIES = ['🍜 饮食', '🏨 住宿', '🚗 交通', '🎢 娱乐', '🛍️ 购物', '💊 其他'];

function CalcPad({ expr, onChange, onConfirm }: { expr: string; onChange: (v: string) => void; onConfirm: (v: string) => void }) {
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
    <div className="rounded-2xl p-3 space-y-2 border shadow-sm" style={{ backgroundColor: 'var(--orbit-card, #ffffff)', borderColor: 'var(--orbit-border, #e5e7eb)' }}>
      <div className="text-right px-2 py-1 font-mono text-xl min-h-[2.5rem] tracking-wide" style={{ color: 'var(--orbit-text, #0f172a)' }}>{expr || '0'}</div>
      {BTN_ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-4 gap-1.5">
          {row.map(btn => (
            <button key={btn} type="button" onClick={() => press(btn)}
              className={`py-3 rounded-xl text-sm font-semibold active:scale-95 transition-all border ${['÷', '×', '-', '+'].includes(btn) ? 'bg-[#fff7ed] text-[#d97706] border-[#fbbf24]' :
                  btn === 'C' ? 'bg-[#fef2f2] text-[#b91c1c] border-[#fecdd3]' :
                    btn === '←' ? 'bg-[#f8fafc] text-[#475569] border-[#e2e8f0]' :
                      'bg-[#f8fafc] text-[#0f172a] border-[#e2e8f0]'}`}>{btn}</button>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => { const r = evaluate(expr); if (r !== null) onConfirm(r); }}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#34d399] to-[#22d3ee] text-black font-bold border border-transparent">= 确认</button>
    </div>
  );
}

// ==========================================
// 1. 账单表单弹窗 (保持原样，完全未改动)
// ==========================================
const LedgerModal = ({
  isOpen, onClose, onSave, friends, editData
}: {
  isOpen: boolean; onClose: () => void;
  onSave: (data: any) => void;
  friends: any[]; editData?: any;
}) => {
  const { memories } = useMemoryStore();
  const isEdit = !!editData;

  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>(() =>
    editData?.total_amount
      ? [{ id: '1', category: '🍜 饮食', note: editData?.description || '', amount: String(editData.total_amount) }]
      : [{ id: '1', category: '🍜 饮食', note: '', amount: '' }]
  );
  const [activeCalcId, setActiveCalcId] = useState<string | null>(null);
  const totalAmount = ledgerItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const addLedgerItem = () => setLedgerItems(prev => [...prev, { id: Date.now().toString(), category: '💊 其他', note: '', amount: '' }]);
  const removeLedgerItem = (id: string) => setLedgerItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);
  const updateLedgerItem = (id: string, field: keyof LedgerItem, value: string) =>
    setLedgerItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  const [selectedMemoryId, setSelectedMemoryId] = useState(editData?.memory_id || '');
  const [expenseType, setExpenseType] = useState<'shared' | 'personal'>(editData?.expense_type || 'shared');
  const [selectedFriends, setSelectedFriends] = useState<string[]>(
    editData?.participants?.filter((p: any) => p.user_id !== editData.creator_id).map((p: any) => p.user_id) || []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFriend = (friendId: string) => setSelectedFriends(prev => prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]);

  const handleSave = async () => {
    if (totalAmount <= 0 || !selectedMemoryId) return;
    setIsSubmitting(true);

    const memory = memories.find(m => m.id === selectedMemoryId);
    const tripName = memory?.location?.name || memory?.content?.substring(0, 10) || '未命名旅程';
    const finalParticipants = expenseType === 'personal' ? [] : selectedFriends;
    const description = ledgerItems.map(i => i.category + (i.note ? ` ${i.note}` : '')).join('，');

    await onSave({
      id: editData?.id,
      amount: totalAmount,
      description,
      participants: finalParticipants,
      expenseType,
      tripName,
      memoryId: selectedMemoryId
    });

    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur" onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto rounded-t-3xl shadow-2xl" style={{ backgroundColor: 'var(--orbit-surface, #ffffff)', color: 'var(--orbit-text, #0f172a)', borderTop: '1px solid var(--orbit-border, #e5e7eb)' }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-4 py-4 z-10" style={{ backgroundColor: 'var(--orbit-surface, #ffffff)', borderBottom: '1px solid var(--orbit-border, #e5e7eb)' }}>
          <button onClick={onClose} className="text-[#475569] hover:text-[#0f172a]">取消</button>
          <span className="font-semibold" style={{ color: 'var(--orbit-text, #0f172a)' }}>{isEdit ? '修改账单' : '记一笔'}</span>
          <button onClick={handleSave} disabled={totalAmount <= 0 || !selectedMemoryId || isSubmitting} className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#f97316] to-[#fb7185] text-white font-semibold disabled:opacity-50">
            {isSubmitting ? <FaSpinner className="animate-spin" /> : '保存'}
          </button>
        </div>

        <div className="p-4 space-y-5" style={{ color: 'var(--orbit-text, #0f172a)' }}>
          <div className="flex p-1 rounded-xl" style={{ backgroundColor: '#f6f7fb', border: '1px solid var(--orbit-border, #e5e7eb)' }}>
            <button onClick={() => setExpenseType('shared')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${expenseType === 'shared' ? 'bg-white shadow text-[#0f172a] border border-[var(--orbit-border,#e5e7eb)]' : 'text-[#94a3b8]'}`}>👫 多人 AA</button>
            <button onClick={() => setExpenseType('personal')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${expenseType === 'personal' ? 'bg-[#e6fff5] text-[#047857] shadow border border-[#a7f3d0]' : 'text-[#94a3b8]'}`}>🙋 个人消费</button>
          </div>

          <div className="relative">
            <FaImages className="absolute left-4 top-1/2 -translate-y-1/2 text-[#10b981]" />
            <select value={selectedMemoryId} onChange={(e) => setSelectedMemoryId(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border outline-none appearance-none cursor-pointer" style={{ backgroundColor: 'var(--orbit-card, #ffffff)', borderColor: 'var(--orbit-border, #e5e7eb)', color: 'var(--orbit-text, #0f172a)' }}>
              <option value="" disabled className="text-[#94a3b8]">选择要关联的记忆...</option>
              {memories.map(m => (
                <option key={m.id} value={m.id} className="text-[#0f172a]">
                  {new Date(m.memory_date || m.created_at).toLocaleDateString()} · {m.location?.name || m.content?.substring(0, 15)}
                </option>
              ))}
            </select>
            <FaChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-[#cbd5e1] rotate-90 pointer-events-none" />
          </div>

          <div className="space-y-3">
            {ledgerItems.map(item => (
              <div key={item.id} className="rounded-2xl p-3 space-y-2 border" style={{ backgroundColor: 'var(--orbit-card, #ffffff)', borderColor: 'var(--orbit-border, #e5e7eb)' }}>
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {CATEGORIES.map(cat => (
                      <button key={cat} type="button"
                        onClick={() => updateLedgerItem(item.id, 'category', cat)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${item.category === cat
                            ? 'bg-[#fff7ed] text-[#d97706] border-[#fdba74]'
                            : 'bg-[#f8fafc] text-[#475569] border-[#e2e8f0]'
                          }`}>{cat}</button>
                    ))}
                  </div>
                  {ledgerItems.length > 1 && (
                    <button type="button" onClick={() => removeLedgerItem(item.id)}
                      className="shrink-0 p-1.5 text-[#cbd5e1] hover:text-[#ef4444] transition-colors">
                      <FaTimes className="text-xs" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="备注（选填）" value={item.note}
                    onChange={e => updateLedgerItem(item.id, 'note', e.target.value)}
                    className="flex-1 rounded-xl px-3 py-2 text-sm outline-none border"
                    style={{ backgroundColor: 'var(--orbit-card, #ffffff)', borderColor: 'var(--orbit-border, #e5e7eb)', color: 'var(--orbit-text, #0f172a)' }} />
                  <button type="button"
                    onClick={() => setActiveCalcId(activeCalcId === item.id ? null : item.id)}
                    className="shrink-0 min-w-[80px] flex items-center justify-end px-3 py-2 rounded-xl font-mono font-bold text-sm border" style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74', color: '#d97706' }}>
                    ¥{item.amount || '0'}
                  </button>
                </div>
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
            <button type="button" onClick={addLedgerItem}
              className="w-full py-2.5 rounded-xl border border-dashed text-sm flex items-center justify-center gap-1.5 transition-colors"
              style={{ borderColor: 'var(--orbit-border, #e5e7eb)', color: '#64748b' }}
            >
              <FaPlus className="text-xs" /> 添加项目
            </button>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74' }}>
              <span className="text-[#d97706] text-sm">合计</span>
              <span className="text-[#d97706] font-bold text-xl">¥ {totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <AnimatePresence>
            {expenseType === 'shared' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <p className="text-[#64748b] text-sm mb-3">选择参与者（默认含自己）</p>
                <div className="flex flex-wrap gap-2">
                  {friends.filter((fs: any) => !fs.friend?.id?.startsWith('temp-')).map((friendship: any) => {
                    const friend = friendship.friend;
                    const isSelected = selectedFriends.includes(friend.id);
                    return (
                      <motion.button key={friend.id} onClick={() => toggleFriend(friend.id)} className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all ${isSelected ? 'bg-[#e6fff5] border-[#34d399] text-[#047857]' : 'bg-[#f8fafc] border-[#e2e8f0] text-[#475569]'}`}>
                        <img src={friend.avatar_url} alt={friend.username} className="w-5 h-5 rounded-full" />
                        <span className="text-sm">{friend.username}</span>
                      </motion.button>
                    );
                  })}
                </div>
                {totalAmount > 0 && (
                  <div className="mt-4 p-4 rounded-xl border text-center" style={{ backgroundColor: '#f8fafc', borderColor: 'var(--orbit-border, #e5e7eb)' }}>
                    <span className="text-[#475569] text-sm">总计 {selectedFriends.length + 1} 人均摊，每人 </span>
                    <span className="text-[#d97706] font-bold">¥{(totalAmount / (selectedFriends.length + 1)).toFixed(2)}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="h-10" />
      </motion.div>
    </motion.div>
  );
};

// ==========================================
// 2. 主页面 (LedgerPage) - 高级线条重构版
// ==========================================
export default function LedgerPage() {
  const { ledgers, fetchLedgers, deleteLedger } = useLedgerStore();
  const { currentUser, friends } = useUserStore();
  const { memories } = useMemoryStore();
  const [isDarkMode, setIsDarkMode] = useState(getIsDarkTheme());

  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [editingLedger, setEditingLedger] = useState<any>(null);
  const [groupBy, setGroupBy] = useState<'memory' | 'city'>('memory');
  const [currentMonth, setCurrentMonth] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // 2. 过滤出当前月份的账单，并计算本月我花费的总额
  const { filteredLedgers, monthlyTotal } = useMemo(() => {
    let total = 0;
    const filtered = ledgers.filter(ledger => {
      const memory = memories.find(m => m.id === ledger.memory_id);
      const dateStr = memory?.memory_date || memory?.created_at || new Date().toISOString();
      const month = dateStr.slice(0, 7); // 截取 YYYY-MM
      if (!currentMonth || month === currentMonth) {
        // 计算属于我的金额
        const myPart = ledger.expense_type === 'personal'
          ? ledger.total_amount
          : ledger.participants?.find((p: any) => p.user_id === currentUser?.id)?.amount || 0;
        total += myPart;
        return true;
      }
      return false;
    });
    return { filteredLedgers: filtered, monthlyTotal: total };
  }, [ledgers, memories, currentMonth, currentUser]);
  const [isRefreshingPull, setIsRefreshingPull] = useState(false);

  const handleDeleteLedger = async (id: string) => {
    if (!window.confirm('确定删除这笔账单？')) return;
    try {
      await deleteLedger(id);
    } catch (e) {
      alert('删除失败');
    }
  };

  useEffect(() => { fetchLedgers(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsDarkMode(getIsDarkTheme());
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    update();
    media?.addEventListener('change', update);
    window.addEventListener('settings:update', update as EventListener);
    return () => {
      media?.removeEventListener('change', update);
      window.removeEventListener('settings:update', update as EventListener);
    };
  }, []);

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
    } finally {
      setIsRefreshingPull(false);
    }
  };
  const currentMonthLabel = currentMonth ? currentMonth.replace('-', ' / ') : '全部';

  const cityGrouped = useMemo(() => {
    const map: Record<string, { city: string; ledgers: any[]; total: number }> = {};
    filteredLedgers.forEach(ledger => {
      const memory = memories.find(m => m.id === ledger.memory_id);
      const city = getCityFromMemory(memory);
      if (!map[city]) map[city] = { city, ledgers: [], total: 0 };
      map[city].ledgers.push({ ...ledger, _memory: memory });
      const myPart = ledger.expense_type === 'personal'
        ? ledger.total_amount
        : ledger.participants?.find((p: any) => p.user_id === currentUser?.id)?.amount || 0;
      map[city].total += myPart;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredLedgers, memories, currentUser]);

  const groupedByMemory = useMemo(() => {
    const groups: Record<string, { key: string; memory: any; ledgers: any[] }> = {};
    filteredLedgers.forEach(ledger => {
      const key = ledger.memory_id || 'uncategorized';
      if (!groups[key]) {
        const memory = memories.find(m => m.id === key);
        groups[key] = { key, memory, ledgers: [] };
      }
      groups[key].ledgers.push(ledger);
    });
    return Object.values(groups).sort((a, b) => {
      const dateA = a.memory ? new Date(a.memory.memory_date || a.memory.created_at).getTime() : 0;
      const dateB = b.memory ? new Date(b.memory.memory_date || b.memory.created_at).getTime() : 0;
      return sortOrder === 'desc' ? (dateB - dateA) : (dateA - dateB);
    });
  }, [filteredLedgers, memories, sortOrder]);

  const handleSaveLedger = async (data: any) => {
    if (!currentUser) return;
    try {
      const { createLedger, updateLedger } = await import('../api/supabase');
      const realParticipantIds = (data.participants as string[]).filter(id => !id.startsWith('temp-'));
      const total = data.amount;
      const share = total / (realParticipantIds.length + 1);
      const participants = data.expenseType === 'personal'
        ? [{ userId: currentUser.id, amount: total }]
        : [
          { userId: currentUser.id, amount: share },
          ...realParticipantIds.map((id: string) => ({ userId: id, amount: share }))
        ];
      if (data.id) {
        await updateLedger(data.id, currentUser.id, total, participants, data.memoryId, data.expenseType);
      } else {
        await createLedger(currentUser.id, total, participants, data.memoryId, data.expenseType);
      }
      await fetchLedgers();
    } catch (e) {
      console.error('保存账单失败', e);
      alert('保存失败，请重试');
    }
  };

  // 全局变量抽取，控制线条版主题
  const bgMain = isDarkMode ? 'bg-[#121212]' : 'bg-white';
  const textPrimary = isDarkMode ? 'text-neutral-100' : 'text-neutral-900';
  const textSecondary = isDarkMode ? 'text-neutral-400' : 'text-neutral-500';
  const borderLine = isDarkMode ? 'border-neutral-800' : 'border-neutral-200';

  return (
    <div className={`relative min-h-screen pb-28 ${bgMain} ${textPrimary}`} style={{ fontFamily: '"PingFang SC", "Helvetica Neue", sans-serif' }}>
      {/* 顶部标题栏 (高级线条版 + 月份筛选 + Q弹渐变按钮) */}
      <div
        className={`sticky top-0 z-20 px-6 pb-5 ${bgMain} border-b ${borderLine}`}
        style={{ top: 0, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
      >

        {/* 第一行：标题、月份筛选、记一笔 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-medium tracking-widest">财务足迹</h1>

            {/* 顶部月份筛选 + 排序（与财务页保持一致） */}
            <div className="flex items-center gap-2">
              {/* 外层容器：只负责背景色和边框，注意去掉了 relative */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                style={{ backgroundColor: 'var(--orbit-card)', borderColor: 'var(--orbit-border)' }}
              >
                {/* 1. 隔离区：只让 input 盖住文字和箭头，绝不越界 */}
                <div className="relative flex items-center gap-1.5">
                  <span className="text-sm font-mono font-medium">{currentMonthLabel}</span>
                  <FaChevronDown className="text-[10px] opacity-50" />
                  <input
                    type="month"
                    value={currentMonth}
                    onChange={e => setCurrentMonth(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    style={{ colorScheme: 'light', zIndex: 1 }}
                  />
                </div>

                {/* 2. 清空筛选 */}
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

              <button
                onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium border"
                style={{ backgroundColor: 'var(--orbit-card)', color: 'var(--orbit-text)', borderColor: 'var(--orbit-border)' }}
              >
                时间 {sortOrder === 'desc' ? '↓' : '↑'}
              </button>
            </div>
          </div>

          {/* 统一风格的荧光 Q 弹按钮 */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowLedgerModal(true)}
            className="px-4 py-2 rounded-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-white font-semibold text-sm shrink-0 shadow-md shadow-[#00D9FF]/20"
          >
            记一笔
          </motion.button>
        </div>

        {/* 第二行：总支出看板 & 视图切换 */}
        <div className="flex items-end justify-between">
          <div>
            <p className={`text-xs tracking-widest uppercase mb-1 ${textSecondary}`}>{currentMonth ? '本月总支出' : '累计总支出'}</p>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold tracking-tight">¥ {monthlyTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* 高级感切换 Tab */}
          <div className={`flex p-1 rounded-lg border ${borderLine} ${isDarkMode ? 'bg-white/5' : 'bg-black/5'}`}>
            <button
              onClick={() => setGroupBy('memory')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${groupBy === 'memory' ? (isDarkMode ? 'bg-white text-black' : 'bg-white shadow-sm text-black') : textSecondary}`}>
              按记忆
            </button>
            <button
              onClick={() => setGroupBy('city')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${groupBy === 'city' ? (isDarkMode ? 'bg-white text-black' : 'bg-white shadow-sm text-black') : textSecondary}`}>
              按城市
            </button>
          </div>
        </div>
      </div>

      {/* 列表区域：去除了圆角卡片，仅用细线分隔，去除 Emoji */}
      <div className="px-6 mt-6">
        {groupedByMemory.length > 0 ? (
          groupBy === 'city' ? (
            /* ── 城市视图 (线条版) ── */
            <div className="space-y-10">
              {cityGrouped.map((cg, idx) => (
                <motion.div key={cg.city} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                  <div className={`flex items-baseline justify-between mb-4 pb-2 border-b ${borderLine}`}>
                    <h2 className="text-xl font-medium tracking-widest">{cg.city}</h2>
                    <span className="font-mono text-lg">¥ {cg.total.toFixed(2)}</span>
                  </div>
                  <div className="space-y-4">
                    {cg.ledgers.map((item: any) => {
                      const isPersonal = item.expense_type === 'personal';
                      const myPart = isPersonal ? item.total_amount : item.participants?.find((p: any) => p.user_id === currentUser?.id)?.amount || 0;
                      // 移除旧版的 Emoji，直接展示干净的文字
                      // const cleanDesc = item.description.replace(/^[^\s]+\s/, ''); 
                      const cleanDesc = (item.description || '').replace(/^[^\s]+\s/, '');
                      return (
                        <div key={item.id} className="flex justify-between items-start group">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-base font-medium truncate">{cleanDesc || item.description}</p>
                            <div className={`flex items-center gap-2 mt-1 text-xs ${textSecondary}`}>
                              <span>{isPersonal ? '个人消费' : '多人均摊'}</span>
                              {item._memory?.location?.name && <span>· {item._memory.location.name}</span>}
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <span className="font-mono text-base">¥ {myPart.toFixed(2)}</span>
                            <div className="flex items-center gap-3 mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingLedger(item)} className={`${textSecondary} hover:${textPrimary}`}><FaEdit size={14} /></button>
                              <button onClick={() => handleDeleteLedger(item.id)} className={`${textSecondary} hover:text-red-500`}><FaTrash size={14} /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            /* ── 记忆视图 (线条版) ── */
            <div className="space-y-10">
              {groupedByMemory.map((group, index) => {
                const memory = group.memory;
                const date = memory ? new Date(memory.memory_date || memory.created_at) : null;
                const myTripCost = group.ledgers.reduce((sum: number, l: any) => {
                  if (l.expense_type === 'personal') return sum + l.total_amount;
                  const myPart = l.participants?.find((p: any) => p.user_id === currentUser?.id);
                  return sum + (myPart ? myPart.amount : 0);
                }, 0);

                return (
                  <motion.div key={group.key || memory?.id || 'uncategorized'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                    <div className={`flex items-end justify-between mb-6 pb-2 border-b ${borderLine}`}>
                      <div>
                        {date && <p className={`text-xs tracking-widest uppercase mb-1 ${textSecondary}`}>{date.getFullYear()} / {(date.getMonth() + 1).toString().padStart(2, '0')} / {date.getDate().toString().padStart(2, '0')}</p>}
                        <h2 className="text-xl font-medium tracking-wide">{memory?.location?.name || memory?.content?.substring(0, 15) || '未分类消费'}</h2>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs tracking-widest uppercase mb-1 ${textSecondary}`}>我花费</p>
                        <p className="font-mono text-xl">¥ {myTripCost.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="space-y-5">
                      {group.ledgers.map((item: any) => {
                        const isPersonal = item.expense_type === 'personal';
                        const myPart = isPersonal ? item.total_amount : item.participants?.find((p: any) => p.user_id === currentUser?.id)?.amount || 0;
                        // const cleanDesc = item.description.replace(/^[^\s]+\s/, ''); 
                        const cleanDesc = (item.description || '').replace(/^[^\s]+\s/, '');
                        return (
                          <div key={item.id} className="flex justify-between items-center group">
                            <div className="flex-1 pr-4">
                              <p className="text-base">{cleanDesc || item.description}</p>
                              <p className={`text-xs mt-1 ${textSecondary}`}>{isPersonal ? '个人消费' : `总花费 ¥${item.total_amount}`}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-mono text-base font-medium">¥ {myPart.toFixed(2)}</span>
                              <div className="flex items-center gap-4 text-xs">
                                <button onClick={() => setEditingLedger(item)} className={`${textSecondary} hover:${textPrimary} transition-colors`}>编辑</button>
                                <button onClick={() => handleDeleteLedger(item.id)} className={`${textSecondary} hover:text-red-500 transition-colors`}>删除</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )
        ) : (
          <div className={`text-center mt-32 ${textSecondary}`}>
            <FaWallet className="text-4xl mx-auto mb-4 opacity-20" />
            <p className="text-sm tracking-widest">空空如也，记下第一笔开销吧</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showLedgerModal && <LedgerModal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} onSave={handleSaveLedger} friends={friends} />}
        {editingLedger && <LedgerModal isOpen={!!editingLedger} onClose={() => setEditingLedger(null)} onSave={handleSaveLedger} friends={friends} editData={editingLedger} />}
      </AnimatePresence>
    </div>
  );
}