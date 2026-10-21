import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shows a horizontal scrollbar while the user scrolls, then hides it after idleMs.
 * Uses a callback ref so listeners attach when the scroll container mounts (e.g. after async load).
 */
export default function useAutoHideScrollbar(idleMs = 4000, active = true) {
  const [scrollEl, setScrollEl] = useState(null);
  const [scrollVisible, setScrollVisible] = useState(false);
  const timerRef = useRef(null);

  const ref = useCallback((node) => {
    setScrollEl(node || null);
  }, []);

  const reveal = useCallback(() => {
    setScrollVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setScrollVisible(false), idleMs);
  }, [idleMs]);

  useEffect(() => {
    if (!active || !scrollEl) return undefined;

    scrollEl.addEventListener('scroll', reveal, { passive: true });
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) > 0 || (e.shiftKey && Math.abs(e.deltaY) > 0)) reveal();
    };
    scrollEl.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      scrollEl.removeEventListener('scroll', reveal);
      scrollEl.removeEventListener('wheel', onWheel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, scrollEl, reveal]);

  return { ref, scrollVisible };
}
