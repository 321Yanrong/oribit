import { motion, AnimatePresence } from 'framer-motion';
import { FaMap, FaImages, FaWallet, FaUser, FaGamepad } from 'react-icons/fa';
import { useNavStore, useUserStore } from '../store';
import { useUIStore } from '../store/ui';
import { PageType } from '../types';

// 简笔画开心表情 SVG 组件
const HappyFace = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 100 100" className={`w-7 h-7 ${active ? 'text-orbit-mint' : 'text-white/40'}`}>
    <circle 
      cx="50" cy="50" r="45" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="4"
      strokeLinecap="round"
    />
    {/* 左眼 - 弯弯的 */}
    <path 
      d="M 30 40 Q 35 32 40 40" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="4"
      strokeLinecap="round"
    />
    {/* 右眼 - 弯弯的 */}
    <path 
      d="M 60 40 Q 65 32 70 40" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="4"
      strokeLinecap="round"
    />
    {/* 开心的嘴巴 */}
    <path 
      d="M 32 62 Q 50 80 68 62" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

const navItems: { id: PageType; icon: typeof FaMap; label: string }[] = [
  { id: 'map', icon: FaMap, label: '地图' },
  { id: 'memory', icon: FaImages, label: '记忆' },
  { id: 'ledger', icon: FaWallet, label: '账单' },
  { id: 'games', icon: FaGamepad, label: '游戏' },
  { id: 'profile', icon: FaUser, label: '我的' },
];

export default function BottomNav() {
  const { currentPage, setCurrentPage } = useNavStore();
  const pendingCount = useUserStore((s) => s.pendingRequests.length);
  const unreadCommentCount = useUIStore((s) => s.memoryCommentUnreadCount);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      <div className="mx-4 mb-4">
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass-card rounded-3xl px-2 py-3"
        >
          <div className="flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              const Icon = item.icon;
              
              return (
                <motion.button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative flex flex-col items-center gap-1 px-5 py-2 rounded-2xl transition-all"
                >
                  {/* 活跃背景 */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute inset-0 rounded-2xl bg-orbit-mint/10"
                      />
                    )}
                  </AnimatePresence>
                  
                  {/* 图标 */}
                  <div className="relative z-10">
                    <AnimatePresence mode="wait">
                      {isActive ? (
                        <motion.div
                          key="happy"
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 180 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        >
                          <HappyFace active={true} />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="icon"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                        >
                          <Icon
                            className="w-6 h-6 text-white/40"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {/* 记忆评论红点 */}
                    {item.id === 'memory' && unreadCommentCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-[#FF6B6B] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {unreadCommentCount > 99 ? '99+' : unreadCommentCount}
                      </span>
                    )}
                    {/* 好友申请红点 */}
                    {item.id === 'profile' && pendingCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-[#FF6B6B] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {pendingCount}
                      </span>
                    )}
                  </div>
                  
                  {/* 标签 */}
                  <span
                    className={`text-xs font-medium transition-colors duration-300 relative z-10 ${
                      isActive ? 'text-orbit-mint' : 'text-white/40'
                    }`}
                  >
                    {item.label}
                  </span>
                  
                  {/* 活跃小圆点 */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-orbit-mint shadow-lg"
                        style={{ boxShadow: '0 0 10px rgba(0, 255, 179, 0.6)' }}
                      />
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </nav>
  );
}
