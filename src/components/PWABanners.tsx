import { useEffect, useMemo, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_DISMISSED_KEY = 'orbit_pwa_install_dismissed';

export default function PWABanners() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const updater = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });

    setUpdateServiceWorker(() => updater);
  }, []);

  useEffect(() => {
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

  const handleRefresh = async () => {
    if (!updateServiceWorker) return;
    await updateServiceWorker(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-24 z-[120] pointer-events-none px-4 space-y-2">
      {canInstall && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-[#00FFB3]/30 bg-[#0f1715]/95 p-3 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/90">📲 安装 Orbit 到主屏幕，获得更接近 App 的体验</p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleDismissInstall} className="text-xs text-white/40 hover:text-white/70">稍后</button>
              <button onClick={handleInstall} className="rounded-lg bg-[#00FFB3] px-3 py-1.5 text-xs font-semibold text-black">安装</button>
            </div>
          </div>
        </div>
      )}

      {needRefresh && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-[#FFD166]/30 bg-[#1a1610]/95 p-3 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/90">✨ 有新版本可用，点击更新立即生效</p>
            <button onClick={handleRefresh} className="rounded-lg bg-[#FFD166] px-3 py-1.5 text-xs font-semibold text-black">更新</button>
          </div>
        </div>
      )}

      {offlineReady && !isOffline && (
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-white/15 bg-black/70 p-3 shadow-xl">
          <p className="text-sm text-white/80">✅ 离线缓存已就绪，弱网也能更稳定打开</p>
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
