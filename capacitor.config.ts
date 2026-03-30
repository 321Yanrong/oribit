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
    backgroundColor: '#ffffff',
    // 禁用原生 WebView 的橡皮筋回弹
    scrollEnabled: false,
    // 让 OneSignal 插件处理推送注册，避免 "APNS Delegate Never Fired" 错误
    handleApplicationNotifications: false,
  },

  plugins: {
    // 状态栏配置：让状态栏（时间、电量）浮在网页上面，不占空间
    StatusBar: {
      overlaysWebView: true,
    },
    "CapacitorHttp": {
      "enabled": true
    },

    Keyboard: {
      resize: KeyboardResize.Body,
    },
  },
};

export default config;