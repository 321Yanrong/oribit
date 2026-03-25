import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.wehihi.orbit',
  appName: 'Orbit 轨迹',
  webDir: 'dist',
  // backgroundColor: '#0b1324', // 关键：确保 Capacitor 原生层的背景色和你的 React 层一致，避免启动闪白
  // // iOS 平台专属配置
  ios: {
    // 由前端自行处理 safe-area，允许页面真正贴到底部
    contentInset: 'never',
    // 关键：原生底层的背景色。当网页还没加载出来，或者你下拉回弹时，显示的颜色
    // 请确保这里的颜色和你 index.html 里的 #121212 完全一致
    backgroundColor: '#0b1324',
    // 禁用原生 WebView 的橡皮筋回弹
    scrollEnabled: false,
  },

  plugins: {
    // 状态栏配置：让状态栏（时间、电量）浮在网页上面，不占空间
    StatusBar: {
      overlaysWebView: true,
    },
    SplashScreen: {
      // 给一个保底时间（比如 3 秒），防止你的 React 彻底卡死导致永远卡在启动页
      launchShowDuration: 3000,

      // 🚀 核心命脉：禁止系统自动隐藏！死死举着这张图，直到 React 喊停！
      launchAutoHide: false,

      // 统一背景色：换成和你外层一模一样的暗蓝色，彻底消灭闪白！
      // backgroundColor: "#0b1324",

      // 强烈建议关掉系统自带的转轮，原生转轮通常很丑，破坏沉浸感
      showSpinner: false,

      androidSplashResourceName: "splash",
      iosSpinnerStyle: "small",
    },

    Keyboard: {
      resize: KeyboardResize.None,
    },
  },
};

export default config;