import { useEffect, useRef } from 'react';
import OneSignal from 'onesignal-cordova-plugin';
import { useUserStore } from '../store';

export function usePushSetup() {
  const { currentUser } = useUserStore();
  const hasInitialized = useRef(false);

  useEffect(() => {
    const syncPushState = async (userId: string) => {
      try {
        const playerId = OneSignal.User.PushSubscription.id ?? null;
        const { setOneSignalPlayerId } = await import('../api/supabase');
        if (playerId) {
          await setOneSignalPlayerId(userId, playerId);
        }
        const store = useUserStore.getState();
        if (store.fetchNotificationPrefs) await store.fetchNotificationPrefs();
      } catch {
        // ignore player id / prefs sync errors
      }
    };

    const initOneSignal = async () => {
      // If already initialized, just re-login the new user
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

      try {
        OneSignal.initialize(import.meta.env.VITE_ONESIGNAL_APP_ID as string);

        // Request iOS native notification permission prompt
        await OneSignal.Notifications.requestPermission(false);

        if (currentUser?.id) {
          OneSignal.User.login(currentUser.id);
          await syncPushState(currentUser.id);

          // Keep Supabase player ID in sync when subscription state changes
          OneSignal.User.PushSubscription.addEventListener('change', async (state) => {
            try {
              const { setOneSignalPlayerId } = await import('../api/supabase');
              await setOneSignalPlayerId(currentUser.id, state.current.id ?? null);
            } catch (e) {
              console.warn('PushSubscription change handler error', e);
            }
          });
        }
      } catch (e: any) {
        console.warn('OneSignal init error:', e?.message ?? e);
      }
    };

    void initOneSignal();
  }, [currentUser?.id]);
}
