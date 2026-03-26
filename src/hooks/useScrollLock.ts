import { useEffect } from 'react';

let lockCount = 0;

/**
 * Prevents background scroll when a modal/drawer is open.
 * On iOS WebView, `overflow: hidden` alone is insufficient — we must also
 * intercept `touchmove` on the document and cancel it for touches that
 * originate outside any scrollable child inside the modal.
 */
export const useScrollLock = (lock: boolean) => {
    useEffect(() => {
        if (!lock) return;

        const root = document.getElementById('root');

        if (lockCount === 0) {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.top = `-${window.scrollY}px`;
            if (root) root.style.overflow = 'hidden';
        }

        const scrollY = window.scrollY;
        lockCount++;

        // iOS WebView ignores overflow:hidden on body for touch scrolling.
        // Block touchmove on document unless the touch is inside a scrollable element.
        const preventTouchMove = (e: TouchEvent) => {
            let node = e.target as HTMLElement | null;
            while (node && node !== document.body) {
                const { overflowY } = window.getComputedStyle(node);
                if (
                    (overflowY === 'auto' || overflowY === 'scroll') &&
                    node.scrollHeight > node.clientHeight
                ) {
                    return; // allow scroll inside scrollable child
                }
                node = node.parentElement;
            }
            e.preventDefault();
        };

        document.addEventListener('touchmove', preventTouchMove, { passive: false });

        return () => {
            document.removeEventListener('touchmove', preventTouchMove);
            lockCount--;
            if (lockCount <= 0) {
                document.body.style.overflow = '';
                document.body.style.touchAction = '';
                document.body.style.position = '';
                document.body.style.width = '';
                document.body.style.top = '';
                window.scrollTo(0, scrollY);
                if (root) root.style.overflow = '';
                lockCount = 0;
            }
        };
    }, [lock]);
};
