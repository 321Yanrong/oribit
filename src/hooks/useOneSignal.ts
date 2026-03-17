import { useEffect, useRef } from 'react';
import OneSignal from 'react-onesignal';
import { useUserStore } from '../store';

const ONE_SIGNAL_APP_ID = '48d60e01-82a6-482e-b8cc-d07ba2790f4b';

export function usePushSetup() {
  const { currentUser } = useUserStore();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initOneSignal = async () => {
      try {
        if (!hasInitialized.current) {
          await OneSignal.init({
            appId: ONE_SIGNAL_APP_ID,
            notifyButton: { enable: false },
          });
          hasInitialized.current = true;
        }

        if (currentUser?.id) {
          OneSignal.login(currentUser.id);
        }
      } catch (error) {
        console.error('OneSignal 初始化失败:', error);
      }
    };

    void initOneSignal();
  }, [currentUser?.id]);
}
