import { PointerEventHandler, useCallback, useEffect, useRef } from 'react';

const LONG_PRESS_DELAY = 450;
const MOVE_TOLERANCE = 10;
const CLICK_SUPPRESS_LIMIT = 10000;

// Releasing the finger after a long-press still produces a click. Swallow it, so it
// neither activates what is under the finger nor dismisses what the long-press opened.
const suppressNextClick = () => {
  let limitTimer: number | undefined;
  const stop = (evt: Event) => {
    evt.preventDefault();
    evt.stopPropagation();
  };
  const clear = () => {
    window.clearTimeout(limitTimer);
    window.removeEventListener('click', stop, true);
  };
  const release = () => {
    window.removeEventListener('pointerup', release, true);
    window.removeEventListener('pointercancel', release, true);
    window.clearTimeout(limitTimer);
    // the click is dispatched right after the pointerup
    limitTimer = window.setTimeout(clear, 50);
  };

  window.addEventListener('click', stop, true);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  limitTimer = window.setTimeout(release, CLICK_SUPPRESS_LIMIT);
};

export type LongPressPoint = {
  x: number;
  y: number;
};

export type UseLongPressOptions = {
  disabled?: boolean;
  delay?: number;
  /**
   * Selector of descendants that keep their own press behaviour.
   */
  ignore?: string;
};

export type LongPressProps<T extends Element> = {
  onPointerDown: PointerEventHandler<T>;
  onPointerMove: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
};

/**
 * Touch long-press. Mouse and pen are ignored, they have the context menu and hover.
 * Moving the finger (scrolling) or putting a second one down (pinch-zoom) cancels it.
 */
export const useLongPress = <T extends Element = HTMLElement>(
  onLongPress: (point: LongPressPoint) => void,
  options?: UseLongPressOptions
): LongPressProps<T> => {
  const { disabled, delay = LONG_PRESS_DELAY, ignore } = options ?? {};

  const timerRef = useRef<number | undefined>(undefined);
  const startRef = useRef<LongPressPoint | undefined>(undefined);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const cancel = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    startRef.current = undefined;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown: PointerEventHandler<T> = (evt) => {
    cancel();
    if (disabled || evt.pointerType !== 'touch' || !evt.isPrimary) return;

    const target = evt.target as Element;
    // React bubbles events out of portals: a press inside an overlay rendered by
    // the element is not a press on the element.
    if (!evt.currentTarget.contains(target)) return;
    if (ignore && target.closest(ignore)) return;

    const point = { x: evt.clientX, y: evt.clientY };
    startRef.current = point;
    timerRef.current = window.setTimeout(() => {
      cancel();
      suppressNextClick();
      callbackRef.current(point);
    }, delay);
  };

  const onPointerMove: PointerEventHandler<T> = (evt) => {
    const start = startRef.current;
    if (!start) return;
    if (Math.hypot(evt.clientX - start.x, evt.clientY - start.y) > MOVE_TOLERANCE) cancel();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
};
