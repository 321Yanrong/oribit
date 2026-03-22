// src/hooks/useScrollLock.ts
import { useEffect } from 'react';

let lockCount = 0; // 全局计数器，放在函数外面

export const useScrollLock = (lock: boolean) => {
    useEffect(() => {
        if (!lock) return;

        const root = document.getElementById('root');

        // 只有第一个弹窗打开时，才真正操作 DOM
        if (lockCount === 0) {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            if (root) root.style.overflow = 'hidden';
        }

        lockCount++;

        return () => {
            lockCount--;
            // 只有最后一个弹窗关闭时，才恢复滚动
            if (lockCount <= 0) {
                document.body.style.overflow = '';
                document.body.style.touchAction = '';
                if (root) root.style.overflow = '';
                lockCount = 0;
            }
        };
    }, [lock]);
};
