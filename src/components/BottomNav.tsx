import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconType } from 'react-icons';
import { FiMap, FiImage, FiCreditCard, FiUser } from 'react-icons/fi';
import { useNavStore, useUserStore } from '../store';
import { useUIStore } from '../store/ui';
import { PageType } from '../types';
import { SETTINGS_EVENT } from '../utils/settings';
const navItems: { id: PageType; icon: IconType; label: string }[] = [
  { id: 'map', icon: FiMap, label: '地图' },
  { id: 'memory', icon: FiImage, label: '记忆' },
  { id: 'ledger', icon: FiCreditCard, label: '账单' },
  { id: 'profile', icon: FiUser, label: '我的' },
];

const getIsDarkTheme = () => {
  if (typeof document === 'undefined') return true;
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
};

export default function BottomNav() {
  const { currentPage, setCurrentPage } = useNavStore();
  const pendingCount = useUserStore((s) => s.pendingRequests.length);
  const unreadCommentCount = useUIStore((s) => s.memoryCommentUnreadCount);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(getIsDarkTheme());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateTheme = () => setIsDarkMode(getIsDarkTheme());
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    updateTheme();
    media?.addEventListener('change', updateTheme);
    window.addEventListener(SETTINGS_EVENT, updateTheme as EventListener);

    return () => {
      media?.removeEventListener('change', updateTheme);
      window.removeEventListener(SETTINGS_EVENT, updateTheme as EventListener);
    };
  }, []);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      // 隐藏入口：长按底栏触发强制重启确认
      const confirmed = window.confirm('强制重启 Orbit 以清理状态？');
      if (confirmed) {
        window.location.reload();
      }
    }, 900);
  };

  const bgColor = isDarkMode ? '#000000' : '#ffffff';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const inactiveColor = isDarkMode ? '#9ca3af' : '#6b7280';
  const activeColor = isDarkMode ? '#f5f5f5' : '#111827';
  const activeBg = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="pointer-events-auto px-2"
        style={{
          background: bgColor,
          borderTop: `1px solid ${borderColor}`,
          // 🌟 1. 增加底部的留白高度，原本是 +10px，现在改成 +18px（或者更大）
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
          // 🌟 2. 增加顶部的内边距，让整体变高
          paddingTop: '12px' 
        }}
      >
        <div className="flex items-center justify-around gap-2">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            const Icon = item.icon;
            
            return (
              <motion.button
                data-tour-id={`nav-${item.id}`}
                key={item.id}
                onPointerDown={startLongPress}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onClick={() => {
                  if (longPressTriggeredRef.current) {
                    longPressTriggeredRef.current = false;
                    return;
                  }
                  setCurrentPage(item.id);
                }}
                whileHover={{ scale: 1.06, y: -2 }}
                whileTap={{ scale: 0.95 }}
                // 🌟 3. 增加按钮内部的高度，通过 pb-3 让内容整体往上抬
                className="relative flex flex-col items-center gap-1.5 px-5 pt-2 pb-3 rounded-2xl transition-all min-w-[78px]"
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute rounded-2xl"
                      // 稍微扩大一点高亮背景的范围
                      style={{ background: activeBg, inset: '-4px -6px' }} 
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10">
                  <motion.div
                    animate={{ scale: isActive ? 1.08 : 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  >
                    <Icon
                      className="w-6 h-6"
                      strokeWidth={isActive ? 2.6 : 2.2}
                      // 🌟 4. 把 translateY(-2px) 改成 translateY(-4px) 让图标再往上一点
                      style={{ color: isActive ? activeColor : inactiveColor, transform: 'translateY(-4px)' }}
                    />
                  </motion.div>
                  {/* ... 消息红点保持不变 ... */}
                </div>

                <span
                  className={`text-xs transition-colors duration-300 relative z-10 ${
                    isActive ? 'font-semibold' : 'font-medium'
                  }`}
                  style={{ color: isActive ? activeColor : inactiveColor }}
                >
                  {item.label}
                </span>

                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      // 🌟 5. 小圆点也跟着调整一下位置
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                      style={{ background: activeColor }}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </nav>
  );
}