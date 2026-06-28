// ─────────────────────────────────────────────────────────────────────────────
// useLongPress — Hook for detecting long-press gestures on touch/mouse elements
// ─────────────────────────────────────────────────────────────────────────────
// Detects long-press events with configurable duration. Works with both
// touch (mobile) and mouse (desktop) events. Cancels if the user moves
// their finger/cursor beyond a small threshold (prevents false triggers
// during scrolling).
//
// Returns event handlers (onTouchStart, onTouchEnd, onTouchMove, onMouseDown,
// onMouseUp, onMouseLeave) to spread onto any element.
//
// @param onLongPress - callback fired when long-press is detected
// @param ms - duration threshold in milliseconds (default: 400ms)
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useCallback, useMemo } from 'react';

export function useLongPress(onLongPress, ms = 400) {
  const timerRef = useRef(null);
  const isLongPressRef = useRef(false);
  const startPosRef = useRef(null);

  const start = useCallback(
    (e) => {
      isLongPressRef.current = false;
      const touch = e.touches ? e.touches[0] : e;
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress?.();
      }, ms);
    },
    [onLongPress, ms]
  );

  const move = useCallback((e) => {
    if (!timerRef.current || !startPosRef.current) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = Math.abs(touch.clientX - startPosRef.current.x);
    const dy = Math.abs(touch.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const end = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isLongPressRef.current) {
      e.preventDefault?.();
    }
    startPosRef.current = null;
  }, []);

  const handlers = useMemo(
    () => ({
      onMouseDown: start,
      onMouseUp: end,
      onMouseLeave: end,
      onTouchStart: start,
      onTouchEnd: end,
      onTouchMove: move,
    }),
    [start, end, move]
  );

  return { handlers };
}
