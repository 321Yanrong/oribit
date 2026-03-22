import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconType } from 'react-icons';
import { FiMap, FiImage, FiCreditCard, FiUser, FiCamera } from 'react-icons/fi';
import { useNavStore, useUserStore } from '../store';
import { useUIStore } from '../store/ui';
import { PageType } from '../types';
import { SETTINGS_EVENT } from '../utils/settings';

type NavItem = { id: PageType | 'capture'; icon?: IconType; label?: string; special?: boolean };
export const BOTTOM_NAV_CONTENT_GAP = 'calc(env(safe-area-inset-bottom, 0px) + 92px)';

const navItems: NavItem[] = [
  { id: 'map', icon: FiMap, label: '地图' },
  { id: 'memory', icon: FiImage, label: '记忆' },
  { id: 'capture', special: true },
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
  const { memoryCommentUnreadCount: unreadCommentCount, triggerMemoryComposerRequest } = useUIStore((s) => ({
    memoryCommentUnreadCount: s.memoryCommentUnreadCount,
    triggerMemoryComposerRequest: s.triggerMemoryComposerRequest,
  }));
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

  const bgColor = isDarkMode ? '#000000' : '#f5f5f5ff';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const inactiveColor = isDarkMode ? '#9ca3af' : '#6b7280';
  const activeColor = isDarkMode ? '#f5f5f5' : '#111827';
  const activeBg = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const handleCaptureClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (currentPage !== 'memory') {
      setCurrentPage('memory');
    }
    triggerMemoryComposerRequest();
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[120] pointer-events-auto">
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        // className="pointer-events-auto pb-[env(safe-area-inset-bottom)] rounded-t-3xl"
        className="pointer-events-auto rounded-t-2xl shadow-[0_-8px_30px_rgb(0,0,0,0.04)]"
        style={{
          background: bgColor,
          borderTop: `1px solid ${borderColor}`,
          paddingTop: '6px',
          // 动态贴合不同机型底部安全区，视觉到底、按钮不被系统手势区吞掉
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          zIndex: 50, // 确保导航栏在内容之上
          marginBottom: '-1px',
          touchAction: 'manipulation',
        }}
      >
        {/* <div className="flex items-center justify-around gap-2 h-[60px] px-4"> */}
        <div className="flex items-center h-[54px] w-full">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            const Icon = item.icon;

            if (item.special) {
              return (
                <motion.button
                  key="capture"
                  aria-label="发布记忆"
                  onClick={handleCaptureClick}
                  whileHover={{ scale: 1.08, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  // className="relative flex flex-col items-center justify-center px-3"
                  // 修改相机按钮的 className
                  className="relative flex-1 flex flex-col items-center justify-center"
                >
                  <div
                    className="relative w-12 h-12 rounded-3xl flex items-center justify-center"
                    style={{
                      background: '#FDE047',
                      boxShadow: '0 12px 24px rgba(253, 224, 71, 0.35)',
                      border: '1px solid rgba(120, 53, 15, 0.15)'
                    }}
                  >
                    <div
                      className="absolute inset-1 rounded-[22px]"
                      style={{ border: '2px solid rgba(255, 255, 255, 0.35)' }}
                    />
                    <FiCamera
                      className="relative w-6 h-6"
                      strokeWidth={2.6}
                      style={{ color: '#78350f' }}
                    />
                  </div>
                </motion.button>
              );
            }

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
                // className="relative flex flex-col items-center gap-1.5 px-5 pt-1 pb-2 rounded-2xl transition-all min-w-[78px]"
                // 修改标准按钮的 className
                className="relative flex-1 flex flex-col items-center gap-0.5 transition-all"
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute rounded-2xl"
                      style={{ background: activeBg, inset: '-3px -5px' }}
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10">
                  <motion.div
                    animate={{ scale: isActive ? 1.08 : 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  >
                    <Icon
                      className="w-[22px] h-[22px]"
                      strokeWidth={isActive ? 2.6 : 2.2}
                      style={{ color: isActive ? activeColor : inactiveColor, transform: 'translateY(-2px)' }}
                    />
                  </motion.div>
                </div>

                <span
                  className={`text-xs transition-colors duration-300 relative z-10 ${isActive ? 'font-semibold' : 'font-medium'}`}
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