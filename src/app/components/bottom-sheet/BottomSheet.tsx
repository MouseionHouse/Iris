import React, {
  PointerEventHandler,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import FocusTrap from 'focus-trap-react';
import { Overlay, OverlayBackdrop } from 'folds';
import classNames from 'classnames';
import { stopPropagation } from '../../utils/keyboard';
import * as css from './BottomSheet.css';

const CLOSE_ANIMATION = 150;
const DRAG_DISMISS_DISTANCE = 96;
const DRAG_DISMISS_VELOCITY = 0.5; // px per ms

type BottomSheetProps = {
  open: boolean;
  requestClose: () => void;
  /**
   * Rendered in the drag handle, so it can't hold interactive content.
   */
  header?: ReactNode;
  children: ReactNode;
  'aria-label'?: string;
};

/**
 * Touch-first alternative of a popout menu: slides up from the bottom edge, sits within
 * thumb reach, and is dismissed by tapping outside or dragging its handle down.
 */
export function BottomSheet({
  open,
  requestClose,
  header,
  children,
  'aria-label': ariaLabel,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; time: number }>();
  const closeTimerRef = useRef<number>();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!open) setClosing(false);
    return () => window.clearTimeout(closeTimerRef.current);
  }, [open]);

  const dismiss = useCallback(() => {
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(requestClose, CLOSE_ANIMATION);
  }, [requestClose]);

  const setOffset = (offset: number, settle?: boolean) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.classList.toggle(css.BottomSheetSettle, !!settle);
    sheet.style.transform = offset > 0 ? `translateY(${offset}px)` : '';
  };

  const handleDragStart: PointerEventHandler<HTMLDivElement> = (evt) => {
    if (!evt.isPrimary) return;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    dragRef.current = { y: evt.clientY, time: evt.timeStamp };
  };

  const handleDragMove: PointerEventHandler<HTMLDivElement> = (evt) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset(Math.max(0, evt.clientY - drag.y));
  };

  const handleDragEnd: PointerEventHandler<HTMLDivElement> = (evt) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = undefined;

    const distance = Math.max(0, evt.clientY - drag.y);
    const velocity = distance / Math.max(1, evt.timeStamp - drag.time);
    if (
      evt.type !== 'pointercancel' &&
      (distance > DRAG_DISMISS_DISTANCE || (distance > 24 && velocity > DRAG_DISMISS_VELOCITY))
    ) {
      // continue from where the finger left it
      const sheet = sheetRef.current;
      sheet?.style.setProperty('transform', `translateY(${sheet.offsetHeight}px)`);
      sheet?.classList.add(css.BottomSheetSettle);
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(requestClose, CLOSE_ANIMATION);
      return;
    }
    setOffset(0, true);
  };

  return (
    <Overlay
      open={open}
      backdrop={<OverlayBackdrop onClick={dismiss} />}
      onContextMenu={(evt: any) => evt.stopPropagation()}
    >
      <FocusTrap
        focusTrapOptions={{
          initialFocus: false,
          onDeactivate: requestClose,
          // The backdrop dismisses the sheet. A pointer based check would also
          // catch the release of the long-press which opened it.
          clickOutsideDeactivates: false,
          allowOutsideClick: true,
          isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
          isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
          escapeDeactivates: stopPropagation,
        }}
      >
        <div
          ref={sheetRef}
          className={classNames(css.BottomSheet, { [css.BottomSheetClosing]: closing })}
          role="dialog"
          aria-modal
          aria-label={ariaLabel}
        >
          <div
            className={css.BottomSheetHandle}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <span className={css.BottomSheetHandleBar} />
            {header}
          </div>
          <div className={css.BottomSheetContent}>{children}</div>
        </div>
      </FocusTrap>
    </Overlay>
  );
}
