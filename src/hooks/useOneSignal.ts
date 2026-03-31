import { useEffect, useRef } from 'react';
import OneSignal from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';
import { useUserStore, useNavStore } from '../store';

const MEMORY_TYPES = new Set(['at', 'comment', 'like']);

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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const syncPushState = async (userId: string) => {
      try {
        const playerId = await OneSignal.User.PushSubscription.getIdAsync().catch(() => null);
        console.log('[OneSignal] player id resolved:', playerId);
        const { setOneSignalPlayerId } = await import('../api/supabase');
        if (playerId) {
          await setOneSignalPlayerId(userId, playerId);
          console.log('[OneSignal] player id saved to DB');
        } else {
          console.warn('[OneSignal] player id is null — device not yet registered with APNs');
        }
        const store = useUserStore.getState();
        if (store.fetchNotificationPrefs) await store.fetchNotificationPrefs();
      } catch (e: any) {
        console.warn('[OneSignal] syncPushState error:', e?.message ?? e);
      }
    };

    const initOneSignal = async () => {
      if (hasInitialized.current) {
        if (currentUser?.id) {
          try {
            OneSignal.User.login(currentUser.id);
            await syncPushState(currentUser.id);
          } catch {}
        }
        return;
      }

      hasInitialized.current = true;

      const appId = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;
      if (!appId) {
        console.warn('[OneSignal] VITE_ONESIGNAL_APP_ID is not set, skipping push setup');
        return;
      }

      try {
        OneSignal.initialize(appId);

        OneSignal.Notifications.addEventListener('click', handleNotificationClick);

        const granted = await OneSignal.Notifications.requestPermission(true);
        console.log('[OneSignal] notification permission granted:', granted);

        if (currentUser?.id) {
          OneSignal.User.login(currentUser.id);
          await syncPushState(currentUser.id);

          OneSignal.User.PushSubscription.addEventListener('change', async (state) => {
            try {
              const newId = state.current.id ?? null;
              console.log('[OneSignal] subscription changed, new id:', newId);
              const { setOneSignalPlayerId } = await import('../api/supabase');
              await setOneSignalPlayerId(currentUser.id, newId);
            } catch (e) {
              console.warn('[OneSignal] PushSubscription change handler error', e);
            }
          });
        }
      } catch (e: any) {
        console.warn('[OneSignal] init error:', e?.message ?? e);
      }
    };

    void initOneSignal();
  }, [currentUser?.id]);
}
