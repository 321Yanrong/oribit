import { useEffect, useRef, useState, type RefObject } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  isRefreshing?: boolean;
  disabled?: boolean;
  threshold?: number;
  maxPull?: number;
  scrollRef?: RefObject<HTMLElement | null>;
}

export default function PullToRefresh({
  onRefresh,
  isRefreshing = false,
  disabled = false,
  threshold = 70,
  maxPull = 120,
  scrollRef,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const activeRef = useRef(false);
  const directionLockedRef = useRef<'vertical' | 'horizontal' | null>(null);
  const distanceRef = useRef(0);

  // Keep refs in sync so touch handlers always read the latest values
  const disabledRef = useRef(disabled);
  const refreshingRef = useRef(isRefreshing);
  const onRefreshRef = useRef(onRefresh);
  const thresholdRef = useRef(threshold);
  const maxPullRef = useRef(maxPull);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { refreshingRef.current = isRefreshing; }, [isRefreshing]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
  useEffect(() => { maxPullRef.current = maxPull; }, [maxPull]);

  const getScrollTop = () => {
    if (scrollRef?.current) return Math.max(0, scrollRef.current.scrollTop);
    return Math.max(0, window.scrollY
      || document.documentElement?.scrollTop
      || document.body?.scrollTop
      || 0);
  };

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (disabledRef.current || refreshingRef.current) return;
      if (event.touches.length !== 1) return;
      const container = scrollRef?.current;
      if (container && !container.contains(event.target as Node)) return;
      if (getScrollTop() > 1) return;
      startYRef.current = event.touches[0]?.clientY || 0;
      startXRef.current = event.touches[0]?.clientX || 0;
      activeRef.current = true;
      directionLockedRef.current = null;
      setIsPulling(false);
      setPullDistance(0);
      distanceRef.current = 0;
    };

    const DAMPING = 0.45;
    const START_DEAD_ZONE = 12;

    const onTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || disabledRef.current || refreshingRef.current) return;

      const currentY = event.touches[0]?.clientY || 0;
      const currentX = event.touches[0]?.clientX || 0;
      const dy = currentY - startYRef.current;
      const dx = Math.abs(currentX - startXRef.current);

      if (directionLockedRef.current === null && (dy > START_DEAD_ZONE || dx > START_DEAD_ZONE)) {
        directionLockedRef.current = dx > dy ? 'horizontal' : 'vertical';
      }

      if (directionLockedRef.current === 'horizontal') return;
      if (dy < START_DEAD_ZONE) return;
      if (getScrollTop() > 1) {
        activeRef.current = false;
        distanceRef.current = 0;
        setPullDistance(0);
        setIsPulling(false);
        return;
      }

      if (event.cancelable) event.preventDefault();

      const dist = Math.min(maxPullRef.current, dy * DAMPING);
      distanceRef.current = dist;
      setPullDistance(dist);
      setIsPulling(true);
    };

    const onTouchEnd = async () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      directionLockedRef.current = null;
      const dist = distanceRef.current;
      if (dist >= thresholdRef.current && !disabledRef.current && !refreshingRef.current) {
        setPullDistance(thresholdRef.current);
        setIsPulling(false);
        try {
          await onRefreshRef.current();
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

    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollRef]);

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
      <div className={`mt-2 rounded-full border border-black/10 bg-white/90 px-4 py-2 text-xs text-black/80 shadow-lg ${show ? 'opacity-100' : 'opacity-0'}`}>
        <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full border-2 border-black/40 border-t-transparent ${isRefreshing ? 'animate-spin' : ''}`} />
        {indicatorText || '下拉刷新'}
      </div>
    </div>
  );
}
