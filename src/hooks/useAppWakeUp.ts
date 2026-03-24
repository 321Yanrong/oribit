import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '../api/supabase'; // 引入你的 supabase 实例

export function useAppWakeUp() {
    useEffect(() => {
        let appListener: any;

        // 监听 App 的前后台状态变化
        const setupListener = async () => {
            appListener = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
                if (isActive) {
                    console.log('🟢 App 刚刚从假死中苏醒！开始抢救连接...');

                    // 抢救动作 1：强制刷新 Supabase 登录状态（最关键！）
                    // 很多时候点不动，是因为退到后台时 Auth Token 过期或断开了
                    const { error } = await supabase.auth.refreshSession();
                    if (error) {
                        console.warn('登录状态可能已失效，需重新登录', error);
                        // 这里可以触发一个强制登出的逻辑，或者重新加载用户数据
                    }

                    // 抢救动作 3：解除可能卡死的 UI 锁
                    // 比如你之前做的禁止背景滚动的锁，如果退后台时刚好开着弹窗，可能切回来就永久卡死了
                    document.body.style.overflow = '';
                    document.body.style.touchAction = '';

                    // 抢救动作 4：静默刷新当前页面的核心数据（比如回忆流、最新评论）
                    // triggerGlobalDataRefresh(); 
                } else {
                    console.log('🔴 App 退到了后台，准备冬眠...');
                    // 这里可以做一些清理工作，比如暂停视频播放、保存草稿等
                }
            });
        };

        setupListener();

        return () => {
            if (appListener) {
                appListener.remove();
            }
        };
    }, []);
}
