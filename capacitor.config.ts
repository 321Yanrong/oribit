import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wehihi.orbit',
  appName: 'Orbit 轨迹',
  webDir: 'dist',

  // // iOS 平台专属配置
  ios: {
    // 由前端自行处理 safe-area，允许页面真正贴到底部
    contentInset: 'never',
    // 关键：原生底层的背景色。当网页还没加载出来，或者你下拉回弹时，显示的颜色
    // 请确保这里的颜色和你 index.html 里的 #121212 完全一致
    backgroundColor: '#121212',
    // 禁用原生 WebView 的橡皮筋回弹
    scrollEnabled: false,
  },

  plugins: {
    // 状态栏配置：让状态栏（时间、电量）浮在网页上面，不占空间
    StatusBar: {
      overlaysWebView: true,
      // 如果你的 App 是深色背景，建议把状态栏文字设为白色 (LIGHT)
      // 如果是浅色背景，设为 DARK
      // style: 'LIGHT',
    },

    // 原生启动图配置：这是系统级别的“接力棒”
    SplashScreen: {
      // 原生启动图显示的时长（毫秒），建议设为 2000ms 左右
      launchShowDuration: 2000,
      // 自动隐藏，交给 React 接管
      launchAutoHide: true,
      // 原生启动图加载时的背景色
      backgroundColor: "#121212",
      // 禁用原生转圈圈，因为你已经在 React 里写了漂亮的动画
      showSpinner: false,
      iosSpinnerStyle: "small",
      splashFullScreen: true,
      splashImmersive: true,
    },

    Keyboard: {
      resize: 'none',
    },
  },
};

export default config;