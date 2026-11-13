// What the composer shows above the text while a send time is set, and when a schedule failed.
// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import React from 'react';
import { Box, Button, Icon, IconButton, Icons, Text, color, config } from 'folds';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { capitalize, maxDelayText, sendTimeText } from './sendTimeText';
import * as css from './ScheduledMessagesList.css';

type ScheduledTimeBarProps = {
  sendTs: number;
  /** the composer holds a scheduled message being edited */
  editing: boolean;
  onClear: () => void;
  onChange: () => void;
};

/** Like the reply bar: the send time, a button to clear it, and the time opens the picker. */
export function ScheduledTimeBar({ sendTs, editing, onClear, onChange }: ScheduledTimeBarProps) {
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const text = `Sends ${sendTimeText(sendTs, hour24Clock)}`;
  return (
    <Box
      alignItems="Center"
      gap="300"
      style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
      data-bar="scheduled-time"
    >
      <IconButton
        onClick={onClear}
        variant="SurfaceVariant"
        size="300"
        radii="300"
        aria-label="Clear time"
        title="Clear time"
      >
        <Icon src={Icons.Cross} size="50" />
      </IconButton>
      <button
        type="button"
        className={css.TimeBarButton}
        onClick={onChange}
        title={editing ? `${text}\nEditing a scheduled message` : text}
        aria-label={`${text}. Change time`}
      >
        <Icon size="100" src={Icons.Clock} />
        <Box direction="Column" style={{ minWidth: 0 }}>
          <Text as="span" size="T300" truncate>
            {text}
          </Text>
          {editing && (
            <Text as="span" size="T200" priority="300" truncate>
              Editing a scheduled message
            </Text>
          )}
        </Box>
      </button>
    </Box>
  );
}

export type ScheduleFailure =
  | { kind: 'past' }
  | { kind: 'tooFar'; maxDelayMs?: number }
  | { kind: 'encryption' }
  | { kind: 'attachments' }
  | { kind: 'failed'; reason?: string }
  | { kind: 'sendFailed'; reason?: string }
  | { kind: 'oldNotCancelled' }
  | { kind: 'oldAlreadySent' };

type ScheduleErrorBarProps = {
  failure: ScheduleFailure;
  onDismiss: () => void;
  onPickTime: () => void;
  onRetry: () => void;
  onSendNow: () => void;
  onShowList: () => void;
};

/** What failed, then the way out. Wraps; never cut off. */
export function ScheduleErrorBar({
  failure,
  onDismiss,
  onPickTime,
  onRetry,
  onSendNow,
  onShowList,
}: ScheduleErrorBarProps) {
  let title: string;
  let detail: string | undefined;
  let action: { label: string; onClick: () => void } | undefined;
  switch (failure.kind) {
    case 'past':
      title = 'Couldn’t schedule the message';
      detail = 'This time has passed';
      action = { label: 'Pick another time', onClick: onPickTime };
      break;
    case 'tooFar':
      title = 'Couldn’t schedule the message';
      detail =
        failure.maxDelayMs !== undefined
          ? `This server schedules messages up to ${maxDelayText(failure.maxDelayMs)} ahead`
          : 'This time is too far ahead for this server';
      action = { label: 'Pick another time', onClick: onPickTime };
      break;
    case 'encryption':
      title = 'Couldn’t encrypt the message';
      detail = 'Nothing was sent';
      action = { label: 'Try again', onClick: onRetry };
      break;
    case 'attachments':
      title = 'Attachments can’t be scheduled';
      action = { label: 'Send now', onClick: onSendNow };
      break;
    case 'failed':
      title = 'Couldn’t schedule the message';
      detail = failure.reason;
      action = { label: 'Try again', onClick: onRetry };
      break;
    case 'sendFailed':
      title = 'Couldn’t send the message';
      detail = failure.reason;
      action = { label: 'Try again', onClick: onRetry };
      break;
    case 'oldNotCancelled':
      title = 'Couldn’t cancel the earlier version';
      detail = 'Both versions are scheduled';
      action = { label: 'Show scheduled messages', onClick: onShowList };
      break;
    default:
      title = 'The earlier version was already sent';
      detail = 'The edited one is scheduled too';
      break;
  }

  return (
    <Box
      alignItems="Start"
      gap="300"
      style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
      role="alert"
      data-bar="schedule-error"
    >
      <IconButton
        onClick={onDismiss}
        variant="SurfaceVariant"
        size="300"
        radii="300"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <Icon src={Icons.Cross} size="50" />
      </IconButton>
      <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
        <Text size="T300" className={css.Wrap} style={{ color: color.Critical.Main }}>
          <b>{title}</b>
        </Text>
        {detail && (
          <Text size="T300" priority="400" className={css.Wrap}>
            {capitalize(detail)}
          </Text>
        )}
      </Box>
      {action && (
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          onClick={action.onClick}
          style={{ flexShrink: 0 }}
        >
          <Text size="B300">{action.label}</Text>
        </Button>
      )}
    </Box>
  );
}
