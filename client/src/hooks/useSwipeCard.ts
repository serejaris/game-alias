import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  SWIPE_CLAMP_PX,
  SWIPE_ENTER_MS,
  SWIPE_EXIT_MS,
  SWIPE_MAX_ROTATION,
  SWIPE_TRIGGER_PX
} from '../config/constants';
import type { SwipeDirection } from '../types/game';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface SwipeState {
  dragging: boolean;
  startX: number;
  deltaX: number;
  pointerId: number | null;
  isAnimating: boolean;
}

interface UseSwipeCardOptions {
  enabled: boolean;
  onSwipe: (direction: SwipeDirection) => boolean;
}

export interface SwipeCardBindings {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export interface SwipeCardResult {
  cardClassName: string;
  cardStyle: CSSProperties | undefined;
  hintLeftOpacity: number;
  hintRightOpacity: number;
  bindings: SwipeCardBindings;
  triggerSwipe: (direction: SwipeDirection) => void;
  reset: () => void;
}

export function useSwipeCard({ enabled, onSwipe }: UseSwipeCardOptions): SwipeCardResult {
  const swipeRef = useRef<SwipeState>({
    dragging: false,
    startX: 0,
    deltaX: 0,
    pointerId: null,
    isAnimating: false
  });

  const exitTimerRef = useRef<number | null>(null);
  const enterTimerRef = useRef<number | null>(null);

  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);
  const [entering, setEntering] = useState(false);

  const clearTimers = useCallback(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enterTimerRef.current !== null) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    swipeRef.current.dragging = false;
    swipeRef.current.deltaX = 0;
    swipeRef.current.pointerId = null;
    swipeRef.current.isAnimating = false;

    setDragging(false);
    setOffset(0);
    setExitDirection(null);
    setEntering(false);
  }, [clearTimers]);

  const triggerSwipe = useCallback((direction: SwipeDirection) => {
    if (!enabled) return;

    const swipe = swipeRef.current;
    if (swipe.isAnimating) return;

    const accepted = onSwipe(direction);
    if (!accepted) return;

    swipe.isAnimating = true;
    swipe.dragging = false;
    swipe.deltaX = 0;

    setDragging(false);
    setExitDirection(direction);

    clearTimers();
    exitTimerRef.current = window.setTimeout(() => {
      setExitDirection(null);
      setOffset(0);
      setEntering(true);

      enterTimerRef.current = window.setTimeout(() => {
        setEntering(false);
        swipeRef.current.isAnimating = false;
        enterTimerRef.current = null;
      }, SWIPE_ENTER_MS);

      exitTimerRef.current = null;
    }, SWIPE_EXIT_MS);
  }, [clearTimers, enabled, onSwipe]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled) return;

    const swipe = swipeRef.current;
    if (swipe.isAnimating) return;

    swipe.dragging = true;
    swipe.startX = event.clientX;
    swipe.deltaX = 0;
    swipe.pointerId = event.pointerId;

    setDragging(true);
    setEntering(false);
    setExitDirection(null);
    setOffset(0);

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [enabled]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe.dragging) return;

    swipe.deltaX = event.clientX - swipe.startX;
    setOffset(clamp(swipe.deltaX, -SWIPE_CLAMP_PX, SWIPE_CLAMP_PX));
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe.dragging) return;

    swipe.dragging = false;
    setDragging(false);

    if (swipe.pointerId !== null) {
      event.currentTarget.releasePointerCapture?.(swipe.pointerId);
    }

    if (Math.abs(swipe.deltaX) >= SWIPE_TRIGGER_PX) {
      triggerSwipe(swipe.deltaX > 0 ? 'right' : 'left');
      return;
    }

    setOffset(0);
  }, [triggerSwipe]);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe.dragging) return;

    swipe.dragging = false;
    swipe.deltaX = 0;

    setDragging(false);

    if (swipe.pointerId !== null) {
      event.currentTarget.releasePointerCapture?.(swipe.pointerId);
    }

    setOffset(0);
  }, []);

  useEffect(() => {
    if (enabled) return;
    reset();
  }, [enabled, reset]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const strength = Math.min(1, Math.abs(offset) / SWIPE_TRIGGER_PX);
  const rotation = clamp(offset * 0.1, -SWIPE_MAX_ROTATION, SWIPE_MAX_ROTATION);

  const cardClassName = useMemo(() => ([
    'swipe-card',
    offset < -20 ? 'swiping-left' : '',
    offset > 20 ? 'swiping-right' : '',
    exitDirection === 'left' ? 'exit-left' : '',
    exitDirection === 'right' ? 'exit-right' : '',
    entering ? 'entering' : ''
  ].filter(Boolean).join(' ')), [entering, exitDirection, offset]);

  const cardStyle = (exitDirection || entering)
    ? undefined
    : {
      transform: `translateX(${offset}px) rotate(${rotation}deg)`,
      transition: dragging ? 'none' : 'transform 180ms ease'
    };

  return {
    cardClassName,
    cardStyle,
    hintLeftOpacity: offset < 0 ? strength : 0,
    hintRightOpacity: offset > 0 ? strength : 0,
    bindings: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel
    },
    triggerSwipe,
    reset
  };
}
