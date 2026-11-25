// Iris only: scheduling on touch, in the action sheet messages use.
import React from 'react';
import { Box, Header, Text, config } from 'folds';
import { BottomSheet, BottomSheetMenu } from '../../../components/bottom-sheet';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { ScheduleSendMenuItems } from './ScheduleSendMenuItems';
import { SchedulePicker, SchedulePickerDialog, SchedulePickerProps } from './SchedulePickerDialog';

type ScheduleSendSheetProps = {
  open: boolean;
  requestClose: () => void;
  onSendNow: () => void;
  onSchedule: () => void;
};

/** Send now and Schedule message, opened by a long-press on send. */
export function ScheduleSendSheet({
  open,
  requestClose,
  onSendNow,
  onSchedule,
}: ScheduleSendSheetProps) {
  if (!open) return null;
  return (
    <BottomSheet open requestClose={requestClose} aria-label="Send options">
      <BottomSheetMenu iconLeading>
        <Box direction="Column" style={{ padding: `0 ${config.space.S200} ${config.space.S200}` }}>
          <ScheduleSendMenuItems onSendNow={onSendNow} onSchedule={onSchedule} />
        </Box>
      </BottomSheetMenu>
    </BottomSheet>
  );
}

type SchedulePickerOverlayProps = SchedulePickerProps & {
  onCancel: () => void;
};

/** The picker as a dialog, or on a phone as a bottom sheet. */
export function SchedulePickerOverlay({ onCancel, ...props }: SchedulePickerOverlayProps) {
  const screenSize = useScreenSizeContext();
  if (screenSize !== ScreenSize.Mobile) {
    return <SchedulePickerDialog onCancel={onCancel} {...props} />;
  }
  return (
    <BottomSheet
      open
      requestClose={onCancel}
      aria-label="Schedule message"
      header={
        <Header
          variant="Surface"
          size="400"
          style={{ width: '100%', padding: `0 ${config.space.S400}` }}
        >
          <Box grow="Yes">
            <Text size="H4">Schedule message</Text>
          </Box>
        </Header>
      }
    >
      <Box direction="Column" style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}>
        <SchedulePicker {...props} />
      </Box>
    </BottomSheet>
  );
}
