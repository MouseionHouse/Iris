// The composer's send button where the server holds delayed events: a split button whose chevron
// opens Send now and Schedule message. Based on cinnyapp/cinny#2671 by jasonlaguidice.
import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Icon, IconButton, Icons, Menu, PopOut, RectCords, Spinner, config } from 'folds';
import { stopPropagation } from '../../../utils/keyboard';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useLongPress } from '../../../hooks/useLongPress';
import { hapticTick } from '../../../native/haptics';
import { ScheduleSendSheet } from './ScheduleSendSheet';
import { ScheduleSendMenuItems } from './ScheduleSendMenuItems';
import * as css from './SchedulePickerDialog.css';

type ScheduleSendButtonProps = {
  /** a send time is set: the button schedules */
  scheduled: boolean;
  /** a schedule is on its way to the server */
  busy: boolean;
  onSend: () => void;
  onSendNow: () => void;
  onSchedule: () => void;
};
export function ScheduleSendButton({
  scheduled,
  busy,
  onSend,
  onSendNow,
  onSchedule,
}: ScheduleSendButtonProps) {
  const screenSize = useScreenSizeContext();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  // Iris: on touch, a long-press on send opens the choices in the action sheet
  const [sheet, setSheet] = useState(false);
  const longPressProps = useLongPress<HTMLButtonElement>(() => {
    hapticTick();
    setSheet(true);
  });

  const choose = (action: () => void) => () => {
    setMenuAnchor(undefined);
    setSheet(false);
    action();
  };

  let label = 'Send';
  if (busy) label = 'Scheduling…';
  else if (scheduled) label = 'Schedule message';

  return (
    <div className={css.SplitSend} data-send="split">
      <IconButton
        className={screenSize === ScreenSize.Mobile ? undefined : css.SplitSendMain}
        onClick={onSend}
        onContextMenu={(evt: React.MouseEvent) => {
          // Android reports a long-press as a context menu too
          if (evt.nativeEvent instanceof PointerEvent && evt.nativeEvent.pointerType === 'touch') {
            evt.preventDefault();
          }
        }}
        variant={scheduled ? 'Primary' : 'SurfaceVariant'}
        size="300"
        radii="300"
        aria-label={label}
        title={label}
        aria-disabled={busy}
        data-action="send"
        {...longPressProps}
      >
        {busy ? (
          <Spinner size="100" variant={scheduled ? 'Primary' : 'Secondary'} fill="Soft" />
        ) : (
          <Icon src={scheduled ? Icons.Clock : Icons.Send} />
        )}
      </IconButton>
      {screenSize !== ScreenSize.Mobile && (
        <PopOut
          anchor={menuAnchor}
          position="Top"
          align="End"
          offset={6}
          content={
            <FocusTrap
              focusTrapOptions={{
                onDeactivate: () => setMenuAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu style={{ padding: config.space.S100 }} aria-label="Send options">
                <ScheduleSendMenuItems
                  onSendNow={choose(onSendNow)}
                  onSchedule={choose(onSchedule)}
                />
              </Menu>
            </FocusTrap>
          }
        >
          <IconButton
            className={css.SplitSendChevron}
            onClick={(evt: React.MouseEvent<HTMLButtonElement>) =>
              setMenuAnchor(menuAnchor ? undefined : evt.currentTarget.getBoundingClientRect())
            }
            variant={scheduled ? 'Primary' : 'SurfaceVariant'}
            size="300"
            radii="300"
            aria-label="More send options"
            title="More send options"
            aria-haspopup="menu"
            aria-expanded={!!menuAnchor}
            aria-pressed={!!menuAnchor}
            data-action="send-options"
          >
            <Icon size="50" src={Icons.ChevronTop} />
          </IconButton>
        </PopOut>
      )}
      <ScheduleSendSheet
        open={sheet}
        requestClose={() => setSheet(false)}
        onSendNow={choose(onSendNow)}
        onSchedule={choose(onSchedule)}
      />
    </div>
  );
}
