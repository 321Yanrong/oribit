/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色调 - 深邃星空黑
        'orbit-black': '#121212',
        'orbit-dark': '#1a1a1a',
        'orbit-gray': '#2a2a2a',
        
        // 点缀色 - 荧光薄荷绿
        'orbit-mint': '#00FFB3',
        'orbit-mint-dim': '#00cc8f',
        
        // 点缀色 - 晚霞橘
        'orbit-orange': '#FF6B35',
        'orbit-orange-dim': '#cc5529',
        
        // 辅助色
        'orbit-purple': '#A855F7',
        'orbit-blue': '#3B82F6',
      },
      fontFamily: {
        'sans': ['Inter', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #00FFB3, 0 0 10px #00FFB3, 0 0 15px #00FFB3' },
          '100%': { boxShadow: '0 0 10px #00FFB3, 0 0 20px #00FFB3, 0 0 30px #00FFB3' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
