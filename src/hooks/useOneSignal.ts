import { useEffect, useRef } from 'react';
import OneSignal from 'onesignal-cordova-plugin';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useUserStore, useNavStore } from '../store';

/** iOS OSNotificationPermission (OneSignal): NotDetermined=0, Denied=1, Authorized=2, Provisional=3, Ephemeral=4 */
const IOS_NOTIF_DENIED = 1;
const IOS_NOTIF_AUTHORIZED = 2;
const IOS_NOTIF_PROVISIONAL = 3;
const IOS_NOTIF_EPHEMERAL = 4;

type OrbitOpenAppSettingsPlugin = { open(): Promise<void> };
const OrbitOpenAppSettings = registerPlugin<OrbitOpenAppSettingsPlugin>('OrbitOpenAppSettings');

function notificationAllowedByNativeEnum(native: number | null): boolean {
  return (
    native === IOS_NOTIF_AUTHORIZED ||
    native === IOS_NOTIF_PROVISIONAL ||
    native === IOS_NOTIF_EPHEMERAL
  );
}

/** Android OneSignal maps permissionNative to 2=granted, 1=not granted. */
function shouldPromptOpenNotificationSettings(
  platform: string,
  native: number | null,
  canRequest: boolean | null,
): boolean {
  if (notificationAllowedByNativeEnum(native)) return false;
  if (platform === 'ios') {
    return native === IOS_NOTIF_DENIED;
  }
  if (platform === 'android') {
    return native === IOS_NOTIF_DENIED && canRequest === false;
  }
  return false;
}

const MEMORY_TYPES = new Set(['at', 'comment', 'like']);

/** Cordova bridge must exist before OneSignal Cordova plugin exec() calls. */
async function waitForCordovaBridge(maxMs = 8000): Promise<void> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  while (typeof window !== 'undefined') {
    const w = window as unknown as { cordova?: { exec?: unknown } };
    if (w.cordova?.exec) return;
    if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start > maxMs) {
      console.warn('[OneSignal] cordova.exec not available after wait — login/init may no-op');
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function handleNotificationClick(event: any) {
  const notification = event?.notification;
  const data = notification?.additionalData as Record<string, any> | undefined;

  const { setPendingDeepLink, setCurrentPage, setPendingAnnouncement } = useNavStore.getState();

  // Admin announcement — show popup with title + body
  if (!data?.type || data.type === 'announcement') {
    const title = data?.title || notification?.title || notification?.headings?.en || '';
    const body  = data?.body  || notification?.body  || notification?.contents?.en || '';
    if (title || body) {
      setPendingAnnouncement({ title, body });
    }
    return;
  }

  if (MEMORY_TYPES.has(data.type) && data.memory_id) {
    setPendingDeepLink({ type: data.type, memoryId: data.memory_id, actorId: data.actor_id });
    setCurrentPage('memory');
  } else if (data.type === 'friend_request' || data.type === 'friend_accepted' || data.type === 'friend_bind') {
    setPendingDeepLink({ type: data.type, actorId: data.actor_id });
    setCurrentPage('profile');
  }
}

export function usePushSetup() {
  const { currentUser } = useUserStore();
  const hasInitialized = useRef(false);
  const hasSubscriptionObserver = useRef(false);
  const hasResumeObserver = useRef(false);
  const resumeUnsubRef = useRef<null | (() => Promise<void>)>(null);
  const hasShownOpenSettingsHint = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const userId = currentUser?.id ?? null;

    if (!userId) {
      return;
    }

    // Do NOT skip runs when userId is unchanged: the first attempt may have failed
    // (missing app id, init error, React Strict Mode cleanup) before OneSignal.login ran.

    const readPermissionSnapshot = async () => {
      const notificationsApi = (OneSignal as any)?.Notifications;
      let permissionGranted: boolean | null = null;
      let canRequestPermission: boolean | null = null;
      let permissionNative: number | null = null;

      try {
        if (typeof notificationsApi?.permission === 'boolean') {
          permissionGranted = notificationsApi.permission;
        }
      } catch {
        // ignore
      }

      try {
        if (typeof notificationsApi?.canRequestPermission === 'boolean') {
          canRequestPermission = notificationsApi.canRequestPermission;
        } else if (typeof notificationsApi?.canRequestPermission === 'function') {
          canRequestPermission = await notificationsApi.canRequestPermission();
        }
      } catch {
        // ignore
      }

      try {
        if (typeof notificationsApi?.permissionNative === 'function') {
          const v = await notificationsApi.permissionNative();
          permissionNative = typeof v === 'number' ? v : null;
        } else if (typeof notificationsApi?.getPermissionAsync === 'function') {
          const v = await notificationsApi.getPermissionAsync();
          permissionNative = typeof v === 'number' ? v : null;
        }
      } catch {
        // ignore
      }

      return { permissionGranted, canRequestPermission, permissionNative };
    };

    const maybeGuideOpenSettings = async (snapshot: {
      permissionGranted: boolean | null;
      canRequestPermission: boolean | null;
      permissionNative: number | null;
    }) => {
      const platform = Capacitor.getPlatform();
      if (snapshot.permissionGranted === true) return;
      if (!shouldPromptOpenNotificationSettings(platform, snapshot.permissionNative, snapshot.canRequestPermission)) {
        return;
      }
      if (hasShownOpenSettingsHint.current) return;
      hasShownOpenSettingsHint.current = true;
      const msg =
        platform === 'ios'
          ? '你当前关闭了 Orbit 的通知权限，系统不会再弹窗。要现在跳转到系统设置手动开启吗？'
          : '你当前关闭了 Orbit 的通知权限。要现在跳转到系统设置手动开启吗？';
      const shouldOpen = window.confirm(msg);
      if (!shouldOpen) return;
      try {
        await OrbitOpenAppSettings.open();
      } catch {
        alert(platform === 'ios' ? '请打开 iPhone 设置 > Orbit > 通知，并允许通知。' : '请打开系统设置，在应用通知中为 Orbit 开启通知。');
      }
    };

    const syncPushState = async (uid: string, reason: string) => {
      // Retry up to 8 times with increasing delay (APNs registration can be slow on fresh installs)
      const delays = [0, 1500, 3000, 5000, 8000, 12000, 18000, 25000];
      for (let i = 0; i < delays.length; i++) {
        if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));

        // Bail if user changed while we were waiting
        if (useUserStore.getState().currentUser?.id !== uid) {
          console.log('[OneSignal] user changed during retry, stopping sync for', uid);
          return;
        }

        try {
          const permissionSnapshot = await readPermissionSnapshot();
          let playerId: string | null = null;
          // Cordova plugin: User.pushSubscription (camelCase). User.PushSubscription is undefined → was breaking init.
          const sub = OneSignal.User.pushSubscription;
          try { playerId = await sub.getIdAsync(); } catch { /* ignore */ }
          let token: string | null = null;
          try { token = await sub.getTokenAsync(); } catch { /* ignore */ }
          console.log(`[OneSignal] [${reason}] attempt ${i + 1}: permission=`, permissionSnapshot.permissionGranted, 'canRequest=', permissionSnapshot.canRequestPermission, 'native=', permissionSnapshot.permissionNative, 'playerId=', playerId, 'token=', token ? 'yes' : 'null', 'for', uid);

          if (playerId) {
            const { setOneSignalPlayerId } = await import('../api/supabase');
            try {
              await setOneSignalPlayerId(uid, playerId);
              console.log('[OneSignal] player id saved to DB for', uid, playerId);
            } catch (saveErr: any) {
              console.warn('[OneSignal] failed to save player id for', uid, saveErr?.message ?? saveErr);
              throw saveErr;
            }
            const store = useUserStore.getState();
            if (store.fetchNotificationPrefs) await store.fetchNotificationPrefs();
            return; // success
          }
          // playerId 仍为空多半是 APNs/订阅尚未就绪，不要用 canRequest===false 误判为「已关通知」
        } catch (e: any) {
          console.warn(`[OneSignal] attempt ${i + 1} error:`, e?.message ?? e);
        }
      }
      console.warn('[OneSignal] all attempts exhausted, player id still null for', uid);
    };

    const setup = async () => {
      if (!hasInitialized.current) {
        const appId = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;
        if (!appId) {
          console.warn('[OneSignal] VITE_ONESIGNAL_APP_ID is not set, skipping push setup');
          return;
        }

        hasInitialized.current = true;

        try {
          await waitForCordovaBridge();
          OneSignal.initialize(appId);
          if (import.meta.env.DEV) {
            try {
              const Debug = (OneSignal as { Debug?: { setLogLevel?: (n: number) => void } }).Debug;
              Debug?.setLogLevel?.(6);
            } catch {
              // ignore
            }
          }
          OneSignal.Notifications.addEventListener('click', handleNotificationClick);
          const beforePermission = await readPermissionSnapshot();
          console.log('[OneSignal] before permission request:', beforePermission);
          if (!hasSubscriptionObserver.current) {
            hasSubscriptionObserver.current = true;
            OneSignal.User.pushSubscription.addEventListener('change', async (state: any) => {
              try {
                const newId = state?.current?.id ?? null;
                const activeUserId = useUserStore.getState().currentUser?.id;
                console.log('[OneSignal] subscription changed, new id:', newId, 'active user:', activeUserId);
                if (!activeUserId) return;
                const { setOneSignalPlayerId } = await import('../api/supabase');
                await setOneSignalPlayerId(activeUserId, newId);
                if (!newId) {
                  await syncPushState(activeUserId, 'subscription-change-recover');
                }
              } catch (e: any) {
                console.warn('[OneSignal] subscription change sync error:', e?.message ?? e);
              }
            });
          }
          const granted = await OneSignal.Notifications.requestPermission(true);
          console.log('[OneSignal] notification permission granted:', granted);
          const afterPermission = await readPermissionSnapshot();
          console.log('[OneSignal] after permission request:', afterPermission);
          if (granted === false) {
            await maybeGuideOpenSettings(afterPermission);
          }
        } catch (e: any) {
          console.warn('[OneSignal] init error:', e?.message ?? e);
          hasInitialized.current = false;
          return;
        }
      }

      try {
        // Cordova: login/logout live on the root plugin, not OneSignal.User
        OneSignal.login(userId);
        console.log('[OneSignal] login called for', userId);
        // login() uses cordova.exec with no JS-side error callback — verify native side applied external id
        for (let v = 0; v < 6; v++) {
          await new Promise((r) => setTimeout(r, v === 0 ? 400 : 800));
          try {
            const ext = await OneSignal.User.getExternalId();
            console.log('[OneSignal] getExternalId after login (check', v + 1, '):', ext, 'expected:', userId);
            if (ext === userId) break;
            if (v === 5 && ext !== userId) {
              console.warn('[OneSignal] External User Id still not set — native login may have failed or wrong OneSignal app');
            }
          } catch (e: any) {
            console.warn('[OneSignal] getExternalId error:', e?.message ?? e);
          }
        }
        await syncPushState(userId, 'login');
        // A second explicit sync after account switch/login to avoid missing late APNs registration.
        window.setTimeout(() => {
          if (useUserStore.getState().currentUser?.id === userId) {
            void syncPushState(userId, 'post-login-recheck');
          }
        }, 12000);
        if (!hasResumeObserver.current) {
          hasResumeObserver.current = true;
          const handle = await CapacitorApp.addListener('resume', () => {
            const activeUserId = useUserStore.getState().currentUser?.id;
            if (activeUserId) {
              void syncPushState(activeUserId, 'app-resume');
            }
          });
          resumeUnsubRef.current = async () => { await handle.remove(); };
        }
      } catch (e: any) {
        console.warn('[OneSignal] login/sync error:', e?.message ?? e);
      }
    };

    void setup();

    return () => {
      if (resumeUnsubRef.current) {
        void resumeUnsubRef.current();
        resumeUnsubRef.current = null;
        hasResumeObserver.current = false;
      }
    };
  }, [currentUser?.id]);
}
