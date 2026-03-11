import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaClock, FaUsers, FaUser, FaMapMarkerAlt, FaWallet, FaPlus, FaTimes, FaSpinner, FaImages, FaChevronRight, FaEdit } from 'react-icons/fa';
import { useLedgerStore, useUserStore, getUserById, useMemoryStore } from '../store';

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
  
  const [amount, setAmount] = useState(editData?.total_amount?.toString() || '');
  const [description, setDescription] = useState(editData?.description || '');
  const [selectedMemoryId, setSelectedMemoryId] = useState(editData?.memory_id || '');
  const [expenseType, setExpenseType] = useState<'shared' | 'personal'>(editData?.expense_type || 'shared'); 
  // 回显参与者
  const [selectedFriends, setSelectedFriends] = useState<string[]>(
    editData?.participants?.filter((p:any) => p.user_id !== editData.creator_id).map((p:any) => p.user_id) || []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFriend = (friendId: string) => setSelectedFriends(prev => prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]);

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0 || !selectedMemoryId) return;
    setIsSubmitting(true);
    
    const memory = memories.find(m => m.id === selectedMemoryId);
    const tripName = memory?.location?.name || memory?.content?.substring(0, 10) || '未命名旅程';
    const finalParticipants = expenseType === 'personal' ? [] : selectedFriends;
    
    await onSave({
      id: editData?.id, // 如果有id就是编辑
      amount: parseFloat(amount), 
      description: description || (expenseType === 'personal' ? '个人日常消费' : '共同消费'), 
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl" onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[#1a1a1a] border-t border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-4 py-4 bg-[#1a1a1a] border-b border-white/5 z-10">
          <button onClick={onClose} className="text-white/60 hover:text-white">取消</button>
          <span className="text-white font-semibold">{isEdit ? '修改账单' : '记一笔'}</span>
          <button onClick={handleSave} disabled={!amount || parseFloat(amount) <= 0 || !selectedMemoryId || isSubmitting} className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#FF9F43] to-[#FF6B6B] text-white font-semibold disabled:opacity-30">
            {isSubmitting ? <FaSpinner className="animate-spin" /> : '保存'}
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div className="flex p-1 bg-white/5 rounded-xl">
            <button onClick={() => setExpenseType('shared')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${expenseType === 'shared' ? 'bg-white/10 text-white shadow' : 'text-white/40'}`}>👫 多人 AA</button>
            <button onClick={() => setExpenseType('personal')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${expenseType === 'personal' ? 'bg-[#00FFB3]/20 text-[#00FFB3] shadow' : 'text-white/40'}`}>🙋 个人消费</button>
          </div>

          <div className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl">
            <span className="text-white/60 text-2xl">¥</span>
            <input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1 bg-transparent text-white text-4xl font-bold outline-none" />
          </div>

          <div className="space-y-3">
            <div className="relative">
              <FaImages className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00FFB3]" />
              <select value={selectedMemoryId} onChange={(e) => setSelectedMemoryId(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none appearance-none cursor-pointer">
                <option value="" disabled className="bg-[#1a1a1a] text-white/40">选择要关联的记忆...</option>
                {memories.map(m => (
                  <option key={m.id} value={m.id} className="bg-[#1a1a1a] text-white">
                    {new Date(m.memory_date || m.created_at).toLocaleDateString()} · {m.location?.name || m.content?.substring(0, 15)}
                  </option>
                ))}
              </select>
              <FaChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 rotate-90 pointer-events-none" />
            </div>

            {/* 备注：个人/多人消费都始终显示 */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm select-none">💬</span>
              <input
                type="text"
                placeholder={expenseType === 'personal' ? '备注（如：午餐、书籍、门票…）' : '备注（如：三里屯晚餐）'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none"
              />
            </div>
          </div>

          <AnimatePresence>
            {expenseType === 'shared' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <p className="text-white/40 text-sm mb-3">选择参与者（默认含自己）</p>
                <div className="flex flex-wrap gap-2">
                  {friends.map((friendship: any) => {
                    const friend = friendship.friend;
                    const isSelected = selectedFriends.includes(friend.id);
                    return (
                      <motion.button key={friend.id} onClick={() => toggleFriend(friend.id)} className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all ${isSelected ? 'bg-[#FF9F43]/20 border-[#FF9F43] text-[#FF9F43]' : 'bg-white/5 border-white/10 text-white/60'}`}>
                        <img src={friend.avatar_url} alt={friend.username} className="w-5 h-5 rounded-full" />
                        <span className="text-sm">{friend.username}</span>
                      </motion.button>
                    );
                  })}
                </div>
                {amount && parseFloat(amount) > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <span className="text-white/60 text-sm">总计 {selectedFriends.length + 1} 人均摊，每人 </span>
                    <span className="text-[#FF9F43] font-bold">¥{(parseFloat(amount) / (selectedFriends.length + 1)).toFixed(2)}</span>
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
  const { ledgers, addLedger } = useLedgerStore();
  const { currentUser, friends } = useUserStore();
  const { memories } = useMemoryStore();
  
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [editingLedger, setEditingLedger] = useState<any>(null);
  const [groupBy, setGroupBy] = useState<'memory' | 'city'>('memory');
  
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
    const groups: Record<string, { memory: any; ledgers: any[] }> = {};
    ledgers.forEach(ledger => {
      const key = ledger.memory_id || 'uncategorized';
      if (!groups[key]) {
        const memory = memories.find(m => m.id === key);
        groups[key] = { memory, ledgers: [] };
      }
      groups[key].ledgers.push(ledger);
    });
    return Object.values(groups).sort((a, b) => {
      const dateA = a.memory ? new Date(a.memory.memory_date || a.memory.created_at).getTime() : 0;
      const dateB = b.memory ? new Date(b.memory.memory_date || b.memory.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [ledgers, memories]);

  const handleSaveLedger = (data: any) => {
    const ledgerData = {
      id: data.id || `ledger-${Date.now()}`,
      memory_id: data.memoryId,
      trip_name: data.tripName,
      expense_type: data.expenseType,
      description: data.description,
      creator_id: currentUser?.id || '',
      total_amount: data.amount,
      currency: 'CNY',
      participants: data.expenseType === 'personal'
        ? [{ user_id: currentUser?.id || '', amount: data.amount, paid: true }]
        : [
            { user_id: currentUser?.id || '', amount: data.amount / (data.participants.length + 1), paid: true },
            ...data.participants.map((id: string) => ({ user_id: id, amount: data.amount / (data.participants.length + 1), paid: false }))
          ],
      status: 'settled' as const,
      created_at: new Date().toISOString(),
    };
    addLedger(ledgerData as any);
  };

  return (
    <div className="relative min-h-screen bg-orbit-black pb-28">
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
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className={`font-medium text-sm ${isPersonal ? 'text-white' : 'text-[#FF9F43]'}`}>{isPersonal ? `¥${myPart.toFixed(2)}` : `摊 ¥${myPart.toFixed(2)}`}</span>
                            <button onClick={() => setEditingLedger(item)} className="p-1.5 rounded-full bg-white/5 hover:bg-[#00FFB3] hover:text-black text-white/40 transition-colors"><FaEdit className="text-xs" /></button>
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
                <motion.div key={memory?.id || 'uncategorized'} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }} className="glass-card rounded-3xl p-5 border border-white/5">
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
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className={`font-medium text-sm ${isPersonal ? 'text-white' : 'text-[#FF9F43]'}`}>{isPersonal ? `¥${myPart.toFixed(2)}` : `摊 ¥${myPart.toFixed(2)}`}</span>
                            <button onClick={() => setEditingLedger(item)} className="p-1.5 rounded-full bg-white/5 hover:bg-[#00FFB3] hover:text-black text-white/40 transition-colors"><FaEdit className="text-xs" /></button>
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