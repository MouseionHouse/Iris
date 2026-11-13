// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import React, { MouseEventHandler, useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Text,
  color,
  config,
} from 'folds';
import { stopPropagation } from '../../../utils/keyboard';
import { daysToMs, timeDayMonthYear, timeHourMinute } from '../../../utils/time';
import { DatePicker, TimePicker } from '../../../components/time-date';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { scheduleTimeProblem } from '../../../utils/delayedEvents';
import { SchedulePresetId, schedulePresets } from './scheduleTime';
import { maxDelayText, sendTimeText } from './sendTimeText';
import * as css from './SchedulePickerDialog.css';

/** How far ahead the date picker goes while the server's limit is unknown. */
const UNKNOWN_MAX_DELAY = daysToMs(365);
const MINUTE = 60 * 1000;

const PRESET_LABELS: Record<SchedulePresetId, string> = {
  inOneHour: 'In 1 hour',
  tomorrowMorning: 'Tomorrow morning',
  tomorrowAfternoon: 'Tomorrow afternoon',
  mondayMorning: 'Monday morning',
};

/** The current time, a minute at a time, so a time that passes while the picker is open shows. */
const useNow = () => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

export type SchedulePickerProps = {
  /** the send time to start from; an hour from now when unset */
  initialTs?: number;
  /** the room is encrypted: the key goes to who is in it now */
  encrypted?: boolean;
  /** the longest delay the server takes, when known */
  maxDelayMs?: number;
  onSubmit: (sendTs: number) => void;
};

/** Presets, a date and a time, and a confirm button naming the time. */
export function SchedulePicker({
  initialTs,
  encrypted,
  maxDelayMs,
  onSubmit,
}: SchedulePickerProps) {
  const now = useNow();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const presets = schedulePresets(now);
  const [ts, setTs] = useState(() => initialTs ?? presets[0].sendTs);
  const [timeAnchor, setTimeAnchor] = useState<RectCords>();
  const [dateAnchor, setDateAnchor] = useState<RectCords>();

  const problem = scheduleTimeProblem(ts, now, maxDelayMs);
  const min = Math.ceil(now / MINUTE) * MINUTE;
  const max = now + (maxDelayMs ?? UNKNOWN_MAX_DELAY);

  const handleTimeAnchor: MouseEventHandler<HTMLButtonElement> = (evt) =>
    setTimeAnchor(evt.currentTarget.getBoundingClientRect());
  const handleDateAnchor: MouseEventHandler<HTMLButtonElement> = (evt) =>
    setDateAnchor(evt.currentTarget.getBoundingClientRect());

  const handleSubmit = () => {
    if (problem) return;
    onSubmit(ts);
  };

  const pickerTrap = (onDeactivate: () => void) => ({
    initialFocus: false as const,
    onDeactivate,
    clickOutsideDeactivates: true,
    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
    escapeDeactivates: stopPropagation,
  });

  return (
    <Box className={css.SchedulePicker} direction="Column" gap="500">
      <Box className={css.SchedulePresets} gap="200">
        {presets.map((preset) => {
          const unavailable = scheduleTimeProblem(preset.sendTs, now, maxDelayMs) !== undefined;
          const label = PRESET_LABELS[preset.id];
          const time = sendTimeText(preset.sendTs, hour24Clock, now);
          return (
            <Chip
              key={preset.id}
              className={css.SchedulePreset}
              variant={preset.sendTs === ts ? 'Primary' : 'SurfaceVariant'}
              radii="300"
              size="500"
              aria-pressed={preset.sendTs === ts}
              disabled={unavailable}
              title={`${label}, ${time}`}
              onClick={() => setTs(preset.sendTs)}
            >
              <Box direction="Column" alignItems="Start">
                <Text as="span" size="B300">
                  {label}
                </Text>
                <Text as="span" size="T200" priority="300">
                  {preset.id === 'mondayMorning'
                    ? `${dayjs(preset.sendTs).format('D MMM')}, ${timeHourMinute(
                        preset.sendTs,
                        hour24Clock
                      )}`
                    : timeHourMinute(preset.sendTs, hour24Clock)}
                </Text>
              </Box>
            </Chip>
          );
        })}
      </Box>
      <Box gap="300" wrap="Wrap">
        <Box direction="Column" gap="100">
          <Text as="label" size="L400" priority="400">
            Date
          </Text>
          <Chip
            size="500"
            variant="Surface"
            fill="None"
            outlined
            radii="300"
            aria-pressed={!!dateAnchor}
            after={<Icon size="50" src={Icons.ChevronBottom} />}
            onClick={handleDateAnchor}
          >
            <Text size="B300">{timeDayMonthYear(ts)}</Text>
          </Chip>
          <PopOut
            anchor={dateAnchor}
            offset={5}
            position="Bottom"
            align="Start"
            content={
              <FocusTrap focusTrapOptions={pickerTrap(() => setDateAnchor(undefined))}>
                <DatePicker min={min} max={max} value={ts} onChange={setTs} />
              </FocusTrap>
            }
          />
        </Box>
        <Box direction="Column" gap="100">
          <Text as="label" size="L400" priority="400">
            Time
          </Text>
          <Chip
            size="500"
            variant="Surface"
            fill="None"
            outlined
            radii="300"
            aria-pressed={!!timeAnchor}
            after={<Icon size="50" src={Icons.ChevronBottom} />}
            onClick={handleTimeAnchor}
          >
            <Text size="B300">{timeHourMinute(ts, hour24Clock)}</Text>
          </Chip>
          <PopOut
            anchor={timeAnchor}
            offset={5}
            position="Bottom"
            align="Start"
            content={
              <FocusTrap focusTrapOptions={pickerTrap(() => setTimeAnchor(undefined))}>
                <TimePicker min={min} max={max} value={ts} onChange={setTs} />
              </FocusTrap>
            }
          />
        </Box>
      </Box>
      {(encrypted || problem) && (
        <Box direction="Column" gap="100">
          {encrypted && (
            <Text size="T300" priority="400" data-schedule-note="encrypted">
              People who join before it’s sent can’t read this message
            </Text>
          )}
          {problem === 'past' && (
            <Text size="T300" style={{ color: color.Critical.Main }} role="alert">
              This time has passed
            </Text>
          )}
          {problem === 'tooFar' && maxDelayMs !== undefined && (
            <Text size="T300" style={{ color: color.Critical.Main }} role="alert">
              This server schedules messages up to {maxDelayText(maxDelayMs)} ahead
            </Text>
          )}
        </Box>
      )}
      <Button
        className={css.ScheduleConfirm}
        variant="Primary"
        aria-disabled={!!problem}
        disabled={!!problem}
        onClick={handleSubmit}
        data-action="confirm-schedule"
      >
        <Text size="B400">Schedule for {sendTimeText(ts, hour24Clock, now)}</Text>
      </Button>
    </Box>
  );
}

type SchedulePickerDialogProps = SchedulePickerProps & {
  onCancel: () => void;
};

export function SchedulePickerDialog({ onCancel, ...props }: SchedulePickerDialogProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" aria-label="Schedule message" role="dialog">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Schedule message</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300" aria-label="Close">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column">
              {/* eslint-disable-next-line react/jsx-props-no-spreading */}
              <SchedulePicker {...props} />
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
