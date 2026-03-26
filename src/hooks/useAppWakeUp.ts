import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

export function useAppWakeUp(onResume?: () => void) {
    useEffect(() => {
        let appListener: any;

        // 监听 App 的前后台状态变化
        const setupListener = async () => {
            appListener = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
                if (isActive) {
                    (window as any).__orbit_foreground_at = Date.now();
                    console.log('[App] 回到前台 (appStateChange) → 将触发 performSafeResume 与全局面络探针（与是否在发布页无关）');

                    // 🚀 直接触发全局唤醒，由 App.tsx 统一接管（包含 800ms 网络缓冲和所有恢复逻辑）
                    if (onResume) {
                        onResume();
                    }

                    // 1.5 抢救动作：如果正在显示闪屏或 UI 异常，尝试重置关键状态
                    try {
                        // 如果有残留的 Capacitor 闪屏（虽然逻辑上不应该），强制隐藏
                        const { SplashScreen: CapacitorSplashScreen } = await import('@capacitor/splash-screen');
                        await CapacitorSplashScreen.hide();
                    } catch (e) { }

                    // 2. 解除可能卡死的 UI 锁
                    try {
                        const style = document.body.style;
                        if (style.overflow === 'hidden' || style.touchAction === 'none') {
                            console.log('🔓 解除 UI 锁定状态');
                            style.overflow = '';
                            style.touchAction = '';
                        }
                    } catch (e) { }

                } else {
                    (window as any).__orbit_background_at = Date.now();
                    console.log('🔴 App 退到了后台，准备冬眠...');
                }
            });
        };

        setupListener();

        return () => {
            if (appListener) {
                appListener.remove();
            }
        };
    }, [onResume]);
}
