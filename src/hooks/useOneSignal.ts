import { useEffect, useRef } from 'react';
import OneSignal from 'react-onesignal';
import { useUserStore } from '../store';

export function usePushSetup() {
  const { currentUser } = useUserStore();
  // 使用 useRef 充当最强的护盾，它在组件重新渲染时绝不会重置
  const hasInitialized = useRef(false);

  useEffect(() => {
    const syncPushState = async (userId: string) => {
      try {
        const playerId = await OneSignal.getUserId();
        if (playerId) {
          const { setOneSignalPlayerId } = await import('../api/supabase');
          await setOneSignalPlayerId(userId, playerId);
        }
        const store = useUserStore.getState();
        if (store.fetchNotificationPrefs) await store.fetchNotificationPrefs();
      } catch {
        // ignore player id / prefs sync errors
      }
    };

    const initOneSignal = async () => {
      // 1. 如果已经成功初始化过，直接登录并返回
      if (hasInitialized.current) {
        if (currentUser?.id) {
          // 加个 try-catch 保护一下内部报错
          try {
            await OneSignal.login(currentUser.id);
            await syncPushState(currentUser.id);
          } catch (e) {}
        }
        return;
      }

      try {
        hasInitialized.current = true; // 关门

        // 2. 尝试初始化
        await OneSignal.init({
          appId: import.meta.env.VITE_ONESIGNAL_APP_ID as string,
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false },
        });

        // 3. 请求通知权限（弹出系统授权弹窗，仅首次有效）
        try {
          const OneSignalAny: any = OneSignal;
          if (typeof OneSignalAny?.Notifications?.requestPermission === 'function') {
            await OneSignalAny.Notifications.requestPermission(true);
          } else if (typeof OneSignalAny?.showNativePrompt === 'function') {
            await OneSignalAny.showNativePrompt();
          }
        } catch {
          // 权限弹窗失败不阻断后续流程
        }

        // 4. 只有上面的 init 没有报错，才会走到这里执行 login！
        if (currentUser?.id) {
          await OneSignal.login(currentUser.id);
          await syncPushState(currentUser.id);

          // subscribe to subscription changes to keep Supabase in sync
          try {
            // react-onesignal proxies OneSignal API
            OneSignal.on && OneSignal.on('subscriptionChange', async (isSubscribed: boolean) => {
              try {
                const pid = await OneSignal.getUserId();
                const { setOneSignalPlayerId } = await import('../api/supabase');
                await setOneSignalPlayerId(currentUser.id, isSubscribed ? pid : null);
              } catch (e) {
                console.warn('subscriptionChange handler error', e);
              }
            });
          } catch (e) {
            // ignore
          }
        }

      } catch (error: any) {
        // 4. 如果遇到域名拦截报错，我们就在这里安静地拦截下来，绝不去触发 login
        if (error.message && error.message.includes('already initialized')) {
          // 静默处理重复初始化
          if (currentUser?.id) {
            try { await OneSignal.login(currentUser.id); } catch (e) {}
          }
        } else {
          console.warn('OneSignal 暂时处于休眠状态 (通常是因为本地环境未匹配正式域名):', error.message);
        }
      }
    };

    void initOneSignal();
  }, [currentUser?.id]);
}
