import React from 'react';
import { motion } from 'framer-motion';

// Fullscreen splash to cover initial loading, matching Orbit brand gradients
export const SplashScreen: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#05070d]"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 30%, rgba(0, 255, 179, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 50% 70%, rgba(0, 217, 255, 0.1) 0%, transparent 50%)`,
        color: '#ffffff',
        mixBlendMode: 'normal',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="flex flex-col items-center text-white"
        style={{ color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}
      >
        <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(0,255,179,0.25)] mb-6 bg-[#0b0d14]">
          <img
            src="/icons/orbit-logo.svg"
            alt="Orbit 品牌标志"
            className="w-full h-full object-cover"
            loading="eager"
            draggable={false}
          />
        </div>
        <h1
          className="text-3xl font-bold tracking-wider mb-2"
          style={{ color: '#ffffff', textShadow: '0 2px 14px rgba(0,0,0,0.5)' }}
        >
          Orbit
        </h1>
        <p
          className="text-sm tracking-[0.3em] uppercase"
          style={{ color: '#f5f7ff', textShadow: '0 1px 12px rgba(0,0,0,0.55)' }}
        >
          记录共同轨迹
        </p>
      </motion.div>
    </motion.div>
  );
};

export default SplashScreen;
