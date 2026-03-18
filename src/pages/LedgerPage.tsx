import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaClock, FaUsers, FaUser, FaMapMarkerAlt, FaWallet, FaPlus, FaTimes, FaSpinner, FaImages, FaChevronRight, FaEdit, FaTrash } from 'react-icons/fa';
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

// ==========================================
// 账单组件：类型 / 分类 / 计算器
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
              className={`py-3 rounded-xl text-sm font-semibold active:scale-95 transition-all border ${
                ['÷', '×', '-', '+'].includes(btn) ? 'bg-[#fff7ed] text-[#d97706] border-[#fbbf24]' :
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
// 1. 账单表单弹窗 (支持 新建 & 编辑 双模式)
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
  // 回显参与者
  const [selectedFriends, setSelectedFriends] = useState<string[]>(
    editData?.participants?.filter((p:any) => p.user_id !== editData.creator_id).map((p:any) => p.user_id) || []
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

          {/* 关联记忆 */}
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

          {/* 多项账单 */}
          <div className="space-y-3">
            {ledgerItems.map(item => (
              <div key={item.id} className="rounded-2xl p-3 space-y-2 border" style={{ backgroundColor: 'var(--orbit-card, #ffffff)', borderColor: 'var(--orbit-border, #e5e7eb)' }}>
                {/* 分类选择 */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {CATEGORIES.map(cat => (
                      <button key={cat} type="button"
                        onClick={() => updateLedgerItem(item.id, 'category', cat)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                          item.category === cat
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
                {/* 备注 + 金额 */}
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
// 2. 主页面 (LedgerPage)
// ==========================================
export default function LedgerPage() {
  const { ledgers, fetchLedgers, deleteLedger } = useLedgerStore();
  const { currentUser, friends } = useUserStore();
  const { memories } = useMemoryStore();
  
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [editingLedger, setEditingLedger] = useState<any>(null);
  const [groupBy, setGroupBy] = useState<'memory' | 'city'>('memory');
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
  
  // 按城市分组
  const cityGrouped = useMemo(() => {
    const map: Record<string, { city: string; ledgers: any[]; total: number }> = {};
    ledgers.forEach(ledger => {
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
  }, [ledgers, memories, currentUser]);
  
  // 按记忆分组（日历风格）
  const groupedByMemory = useMemo(() => {
    const groups: Record<string, { key: string; memory: any; ledgers: any[] }> = {};
    ledgers.forEach(ledger => {
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
      return dateB - dateA;
    });
  }, [ledgers, memories]);

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
        // 编辑模式：更新已有账单
        await updateLedger(data.id, currentUser.id, total, participants, data.memoryId, data.expenseType);
      } else {
        // 新建模式
        await createLedger(currentUser.id, total, participants, data.memoryId, data.expenseType);
      }
      await fetchLedgers();
    } catch (e) {
      console.error('保存账单失败', e);
      alert('保存失败，请重试');
    }
  };

  return (
    <div className="relative min-h-screen bg-orbit-black pb-28">
      {/* <PullToRefresh onRefresh={handlePullRefresh} isRefreshing={isRefreshingPull} /> */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_20%,rgba(255,179,71,0.2)_0%,transparent_50%)]" />

      {/* 顶部标题栏 */}
      <div className="relative z-10 safe-top mx-4 mt-4">
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card rounded-3xl p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#00FFB3]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <FaWallet className="text-[#00FFB3]" /> 财务足迹
              </h1>
              <p className="text-white/40 text-sm mt-1">
                {groupedByMemory.length > 0 ? `共 ${groupedByMemory.length} 段记忆旅程` : '还没有任何消费记录'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGroupBy(g => g === 'memory' ? 'city' : 'memory')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  groupBy === 'city' ? 'bg-[#FF9F43]/20 text-[#FF9F43] border-[#FF9F43]/40' : 'bg-white/5 text-white/50 border-white/10'
                }`}
              >
                {groupBy === 'city' ? '🏙 按城市' : '📍 按记忆'}
              </button>
              <button
                onClick={() => setShowLedgerModal(true)}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <FaPlus />
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 记忆消费时间轴（日历风格） or 城市视图 */}
      <div className="relative z-10 px-4 mt-6">
        {groupedByMemory.length > 0 ? (
          groupBy === 'city' ? (
            /* ── 城市视图 ── */
            <div className="space-y-4">
              {cityGrouped.map((cg, idx) => (
                <motion.div key={cg.city} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }} className="glass-card rounded-3xl p-5 border border-white/5">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#FF9F43]/10 border border-[#FF9F43]/20 flex items-center justify-center text-lg">🏙</div>
                      <div>
                        <p className="text-white font-bold">{cg.city}</p>
                        <p className="text-white/40 text-xs">{cg.ledgers.length} 笔支出</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white/40 text-[10px]">合计</p>
                      <p className="text-[#FF9F43] font-bold">¥{cg.total.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {cg.ledgers.map((item: any) => {
                      const isPersonal = item.expense_type === 'personal';
                      const myPart = isPersonal ? item.total_amount : item.participants?.find((p: any) => p.user_id === currentUser?.id)?.amount || 0;
                      return (
                        <div key={item.id} className="flex justify-between items-center bg-white/5 px-3 py-2.5 rounded-xl border border-white/5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs">{isPersonal ? '🙋' : '👫'}</span>
                            <div className="min-w-0">
                              <p className="text-white/80 text-sm truncate">{item.description}</p>
                              {item._memory?.location?.name && <p className="text-white/30 text-[10px] truncate">📍 {item._memory.location.name}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className={`font-medium text-sm ${isPersonal ? 'text-white' : 'text-[#FF9F43]'}`}>{isPersonal ? `¥${myPart.toFixed(2)}` : `摊 ¥${myPart.toFixed(2)}`}</span>
                            <button onClick={() => setEditingLedger(item)} className="p-1.5 rounded-full bg-white/5 hover:bg-[#00FFB3] hover:text-black text-white/40 transition-colors"><FaEdit className="text-xs" /></button>
                            <button onClick={() => handleDeleteLedger(item.id)} className="p-1.5 rounded-full bg-white/5 hover:bg-red-500 hover:text-white text-red-400/40 transition-colors"><FaTrash className="text-xs" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
          /* ── 记忆视图（原有） ── */
          <div className="space-y-4">
            {groupedByMemory.map((group, index) => {
              const memory = group.memory;
              const date = memory ? new Date(memory.memory_date || memory.created_at) : null;
              const myTripCost = group.ledgers.reduce((sum: number, l: any) => {
                if (l.expense_type === 'personal') return sum + l.total_amount;
                const myPart = l.participants?.find((p: any) => p.user_id === currentUser?.id);
                return sum + (myPart ? myPart.amount : 0);
              }, 0);

              return (
                <motion.div key={group.key || memory?.id || 'uncategorized'} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }} className="glass-card rounded-3xl p-5 border border-white/5">
                  <div className="flex gap-4 mb-4 pb-4 border-b border-white/10">
                    {date ? (
                      <div className="flex flex-col items-center justify-center w-12 h-14 rounded-2xl bg-[#00FFB3]/10 border border-[#00FFB3]/20 shrink-0">
                        <span className="text-[#00FFB3] text-xl font-black leading-none">{date.getDate()}</span>
                        <span className="text-[#00FFB3]/60 text-[10px] mt-0.5">{date.toLocaleDateString('zh-CN', { month: 'short' })}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center w-12 h-14 rounded-2xl bg-white/5 border border-white/10 shrink-0">
                        <span className="text-white/30 text-xl font-black">?</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{memory?.location?.name || memory?.content?.substring(0, 15) || '未分类消费'}</p>
                      {date && <p className="text-white/40 text-xs mt-0.5">{date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>}
                      <p className="text-white/30 text-xs mt-0.5">{group.ledgers.length} 笔支出</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white/40 text-[10px]">我花费</p>
                      <p className="text-[#00FFB3] font-bold text-base">¥{myTripCost.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {group.ledgers.map((item: any) => {
                      const isPersonal = item.expense_type === 'personal';
                      const myPart = isPersonal ? item.total_amount : item.participants?.find((p: any) => p.user_id === currentUser?.id)?.amount || 0;
                      return (
                        <div key={item.id} className="flex justify-between items-center bg-white/5 px-3 py-2.5 rounded-xl border border-white/5 hover:border-white/20 transition-all">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs shrink-0">{isPersonal ? '🙋' : '👫'}</span>
                            <span className="text-white/80 text-sm truncate">{item.description}</span>
                            {!isPersonal && <span className="text-white/30 text-[10px] shrink-0 bg-white/5 px-1.5 py-0.5 rounded">总¥{item.total_amount}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className={`font-medium text-sm ${isPersonal ? 'text-white' : 'text-[#FF9F43]'}`}>{isPersonal ? `¥${myPart.toFixed(2)}` : `摊 ¥${myPart.toFixed(2)}`}</span>
                            <button onClick={() => setEditingLedger(item)} className="p-1.5 rounded-full bg-white/5 hover:bg-[#00FFB3] hover:text-black text-white/40 transition-colors"><FaEdit className="text-xs" /></button>
                            <button onClick={() => handleDeleteLedger(item.id)} className="p-1.5 rounded-full bg-white/5 hover:bg-red-500 hover:text-white text-red-400/40 transition-colors"><FaTrash className="text-xs" /></button>
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
          <div className="text-center mt-20 opacity-50">
            <FaWallet className="text-5xl mx-auto mb-4 text-white/20" />
            <p className="text-white/60">空空如也，记下第一笔开销吧</p>
          </div>
        )}
      </div>

      {/* 弹窗挂载 */}
      <AnimatePresence>
        {showLedgerModal && <LedgerModal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} onSave={handleSaveLedger} friends={friends} />}
        {editingLedger && <LedgerModal isOpen={!!editingLedger} onClose={() => setEditingLedger(null)} onSave={handleSaveLedger} friends={friends} editData={editingLedger} />}
      </AnimatePresence>
    </div>
  );
}