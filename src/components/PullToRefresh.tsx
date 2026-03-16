import { useEffect, useRef, useState } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  isRefreshing?: boolean;
  disabled?: boolean;
  threshold?: number;
  maxPull?: number;
}

export default function PullToRefresh({
  onRefresh,
  isRefreshing = false,
  disabled = false,
  threshold = 70,
  maxPull = 120,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const distanceRef = useRef(0);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (disabled || isRefreshing) return;
      if (window.scrollY > 0) return;
      startYRef.current = event.touches[0]?.clientY || 0;
      activeRef.current = true;
      setIsPulling(false);
      setPullDistance(0);
      distanceRef.current = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || disabled || isRefreshing) return;
      const currentY = event.touches[0]?.clientY || 0;
      const dy = currentY - startYRef.current;
      if (dy <= 0) return;
      if (window.scrollY > 0) return;
      event.preventDefault();
      const dist = Math.min(maxPull, dy);
      distanceRef.current = dist;
      setPullDistance(dist);
      setIsPulling(dist > 0);
    };

    const onTouchEnd = async () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      const dist = distanceRef.current;
      if (dist >= threshold && !disabled && !isRefreshing) {
        setPullDistance(threshold);
        setIsPulling(false);
        try {
          await onRefresh();
        } finally {
          setPullDistance(0);
          distanceRef.current = 0;
        }
      } else {
        setPullDistance(0);
        distanceRef.current = 0;
        setIsPulling(false);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [disabled, isRefreshing, maxPull, onRefresh, threshold]);

  const show = isRefreshing || pullDistance > 0;
  const ready = pullDistance >= threshold;
  const indicatorText = isRefreshing
    ? '正在刷新...'
    : ready
      ? '松开刷新'
      : isPulling
        ? '下拉刷新'
        : '';

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[60] flex justify-center pointer-events-none"
      style={{ transform: `translateY(${show ? Math.min(pullDistance, threshold) : 0}px)` }}
    >
      <div className={`mt-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs text-white/80 shadow-lg ${show ? 'opacity-100' : 'opacity-0'}`}>
        <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full border-2 border-white/50 border-t-transparent ${isRefreshing ? 'animate-spin' : ''}`} />
        {indicatorText || '下拉刷新'}
      </div>
    </div>
  );
}
