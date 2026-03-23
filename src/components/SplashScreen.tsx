import React from 'react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';
import { SplashScreen as NativeSplash } from '@capacitor/splash-screen';
// Fullscreen splash to cover initial loading, matching Orbit brand gradients
export const SplashScreen: React.FC = () => {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // 给 100ms 的缓冲时间，确保 React 的光晕和图标已经完全画在屏幕上了
      const timer = setTimeout(() => {
        NativeSplash.hide();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      // 核心修复：保留了 fixed 全屏覆盖，并加上双模背景色
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center top-safe"
      style={{
        backgroundColor: 'var(--orbit-bg)',
        color: 'var(--orbit-text, #ffffff)',
        // 保留你原本好看的青蓝色氛围光晕
        backgroundImage: `radial-gradient(circle at 50% 30%, rgba(0, 255, 179, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 50% 70%, rgba(0, 217, 255, 0.1) 0%, transparent 50%)`,
        mixBlendMode: 'normal',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0 }}
        className="flex flex-col items-center"
      >
        {/* App 图标：白天浅灰底，黑夜深色底 */}
        <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(0,255,179,0.2)] dark:shadow-[0_0_40px_rgba(0,255,179,0.25)] mb-6"
          style={{ backgroundColor: 'var(--orbit-surface)', border: '1px solid var(--orbit-border)' }}>
          <img
            src="/icons/icon-384.png"
            alt="Orbit 品牌标志"
            className="w-full h-full object-cover"
            loading="eager"
            draggable={false}
          />
        </div>

        {/* 标题：白天深灰近黑，黑夜纯白 */}
        <h1 className="text-3xl font-bold tracking-wider mb-2">Orbit</h1>

        {/* 副标题：白天中度灰，黑夜浅白灰 */}
        <p className="text-sm tracking-[0.3em] uppercase">记录共同轨迹</p>
      </motion.div>
    </motion.div>
  );
};

export default SplashScreen;