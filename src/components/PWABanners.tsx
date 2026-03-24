import { useEffect, useMemo, useState } from 'react';
import { App } from '@capacitor/app';
import { registerSW } from 'virtual:pwa-register';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_DISMISSED_KEY = 'orbit_pwa_install_dismissed';
const IOS_GUIDE_DISMISSED_KEY = 'orbit_pwa_ios_guide_dismissed';
const ANDROID_GUIDE_DISMISSED_KEY = 'orbit_pwa_android_guide_dismissed';
const OFFLINE_READY_DISMISSED_KEY = 'orbit_pwa_offline_ready_dismissed';

type DeviceKind = 'android' | 'ios' | 'other';

export default function PWABanners() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deviceKind, setDeviceKind] = useState<DeviceKind>('other');
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [iosGuideDismissed, setIosGuideDismissed] = useState(false);
  const [androidGuideDismissed, setAndroidGuideDismissed] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const [offlineReadyDismissed, setOfflineReadyDismissed] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateRetryCount, setUpdateRetryCount] = useState(0);

  useEffect(() => {
    const updater = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        setSwRegistration(registration || null);
      },
      onNeedRefresh() {
        setNeedRefresh(true);
        setIsUpdating(true);
      },
      onOfflineReady() {
        if (localStorage.getItem(OFFLINE_READY_DISMISSED_KEY) === '1') return;
        setOfflineReady(true);
      },
    });

    setUpdateServiceWorker(() => updater);
  }, []);

  useEffect(() => {
    const userAgent = window.navigator.userAgent || '';
    const uaData = (window.navigator as any).userAgentData;
    const platformHint = String(uaData?.platform || '').toLowerCase();
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    const isAndroid = /android/i.test(userAgent) || platformHint.includes('android');
    const isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios|chrome|android/i.test(userAgent);

    if (isAndroid) setDeviceKind('android');
    else if (isIOS) setDeviceKind('ios');
    else setDeviceKind('other');

    setIsIosSafari(isIOS && isSafari);
    setIosGuideDismissed(localStorage.getItem(IOS_GUIDE_DISMISSED_KEY) === '1');
    setAndroidGuideDismissed(localStorage.getItem(ANDROID_GUIDE_DISMISSED_KEY) === '1');
    setOfflineReadyDismissed(localStorage.getItem(OFFLINE_READY_DISMISSED_KEY) === '1');

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return;
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      localStorage.removeItem(INSTALL_DISMISSED_KEY);
    };

    const onDisplayModeChanged = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
      if (e.matches) {
        setDeferredPrompt(null);
      }
    };

    const media = window.matchMedia('(display-mode: standalone)');

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onDisplayModeChanged);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onDisplayModeChanged);
    };
  }, []);

  useEffect(() => {
    if (!swRegistration) return;

    const checkForUpdate = () => {
      swRegistration.update().catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    const onOnline = () => {
      setIsOffline(false);
      checkForUpdate();
    };

    const onOffline = () => setIsOffline(true);

    const interval = window.setInterval(checkForUpdate, 5 * 60 * 1000);
    const initial = window.setTimeout(checkForUpdate, 4000);

    const setupListener = async () => {
      // Capacitor app state change listener
      return await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) checkForUpdate();
      });
    };
    const listenerPromise = setupListener();

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initial);
      listenerPromise.then(l => l.remove());
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [swRegistration]);

  useEffect(() => {
    if (!needRefresh || !updateServiceWorker) return;
    if (isOffline) return;

    let cancelled = false;
    let reloadTimer: number | null = null;

    const tryUpdate = async () => {
      try {
        await updateServiceWorker(true);
      } catch {
        if (!cancelled) {
          setUpdateRetryCount((c) => c + 1);
        }
      }
    };

    const interval = window.setInterval(tryUpdate, 3000);
    const initial = window.setTimeout(tryUpdate, 500);
    reloadTimer = window.setTimeout(() => {
      if (!cancelled) {
        window.location.reload();
      }
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(initial);
      if (reloadTimer) window.clearTimeout(reloadTimer);
    };
  }, [needRefresh, updateServiceWorker, isOffline]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const canInstall = useMemo(() => Boolean(deferredPrompt && !isInstalled), [deferredPrompt, isInstalled]);
  const canShowAndroidGuide = useMemo(
    () => Boolean(deviceKind === 'android' && !isInstalled && !deferredPrompt && !androidGuideDismissed),
    [androidGuideDismissed, deferredPrompt, deviceKind, isInstalled]
  );
  const canShowIosGuide = useMemo(
    () => Boolean(isIosSafari && !isInstalled && !deferredPrompt && !iosGuideDismissed),
    [deferredPrompt, iosGuideDismissed, isInstalled, isIosSafari]
  );

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome !== 'accepted') {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    }
    setDeferredPrompt(null);
  };

  const handleDismissInstall = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    setDeferredPrompt(null);
  };

  const handleDismissIosGuide = () => {
    localStorage.setItem(IOS_GUIDE_DISMISSED_KEY, '1');
    setIosGuideDismissed(true);
  };

  const handleDismissAndroidGuide = () => {
    localStorage.setItem(ANDROID_GUIDE_DISMISSED_KEY, '1');
    setAndroidGuideDismissed(true);
  };

  const handleRefresh = async () => {
    if (!updateServiceWorker) return;
    await updateServiceWorker(true);
  };

  const handleDismissOfflineReady = () => {
    localStorage.setItem(OFFLINE_READY_DISMISSED_KEY, '1');
    setOfflineReadyDismissed(true);
    setOfflineReady(false);
  };

  return (
    <div className="fixed inset-x-0 top-4 z-[120] pointer-events-none px-4 space-y-2">
      {canInstall && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-[#00FFB3]/30 bg-[#0f1715]/95 p-3 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/90">
              {deviceKind === 'android'
                ? '🤖 检测到安卓设备：可一键安装 Orbit 到桌面'
                : '📲 安装 Orbit 到主屏幕，获得更接近 App 的体验'}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleDismissInstall} className="text-xs text-white/40 hover:text-white/70">稍后</button>
              <button onClick={handleInstall} className="rounded-lg bg-[#00FFB3] px-3 py-1.5 text-xs font-semibold text-black">安装</button>
            </div>
          </div>
        </div>
      )}

      {canShowAndroidGuide && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-[#00FFB3]/30 bg-[#0f1715]/95 p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-white/90">🤖 安卓安装指引：点右上角菜单（⋮）→ 选择「安装应用 / 添加到主屏幕」</p>
            <button onClick={handleDismissAndroidGuide} className="shrink-0 text-xs text-white/45 hover:text-white/70">知道了</button>
          </div>
        </div>
      )}

      {canShowIosGuide && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-[#4DA3FF]/30 bg-[#0f1420]/95 p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-white/90">🍎 iPhone 安装引导：Safari 底部点「分享」→ 选「添加到主屏幕」→ 点「添加」</p>
            <button onClick={handleDismissIosGuide} className="shrink-0 text-xs text-white/45 hover:text-white/70">知道了</button>
          </div>
        </div>
      )}

      {needRefresh && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="w-[90%] max-w-sm rounded-2xl border border-[#FFD166]/40 bg-gradient-to-r from-[#1a1610]/95 via-[#251a12]/95 to-[#1a1610]/95 p-5 shadow-2xl text-center">
            <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-[#FFD166]/70 border-t-transparent animate-spin" />
            <p className="text-white text-base font-semibold">正在更新到最新版本</p>
            <p className="text-white/60 text-sm mt-2">
              {isOffline ? '当前离线，联网后将自动完成更新' : '请稍候，更新完成后会自动刷新'}
            </p>
            {updateRetryCount > 0 && !isOffline && (
              <p className="text-white/40 text-xs mt-2">正在重试更新（{updateRetryCount}）</p>
            )}
            {isOffline && (
              <button
                onClick={handleRefresh}
                className="mt-4 rounded-lg bg-[#FFD166] px-4 py-2 text-xs font-semibold text-black shadow-sm"
              >手动重试</button>
            )}
          </div>
        </div>
      )}

      {offlineReady && !isOffline && !offlineReadyDismissed && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-white/15 bg-black/70 p-3 shadow-xl flex items-center justify-between gap-3">
          <p className="text-sm text-white/80">✅ 离线缓存已就绪，弱网也能更稳定打开</p>
          <button onClick={handleDismissOfflineReady} className="text-xs text-white/50 hover:text-white/80">知道了</button>
        </div>
      )}

      {isOffline && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-[#FF6B6B]/30 bg-[#1a1010]/95 p-3 shadow-xl">
          <p className="text-sm text-white/90">⚠️ 当前离线中：可浏览已缓存内容，发布/上传等操作需联网</p>
        </div>
      )}
    </div>
  );
}
