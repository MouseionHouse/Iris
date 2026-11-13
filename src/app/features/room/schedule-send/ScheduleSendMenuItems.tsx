// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import React from 'react';
import { Icon, Icons, MenuItem, Text } from 'folds';

type ScheduleSendMenuItemsProps = {
  onSendNow: () => void;
  onSchedule: () => void;
};
export function ScheduleSendMenuItems({ onSendNow, onSchedule }: ScheduleSendMenuItemsProps) {
  return (
    <>
      <MenuItem
        size="300"
        radii="300"
        onClick={onSendNow}
        after={<Icon size="100" src={Icons.Send} />}
        data-action="send-now"
      >
        <Text as="span" size="T300" style={{ flexGrow: 1 }}>
          Send now
        </Text>
      </MenuItem>
      <MenuItem
        size="300"
        radii="300"
        onClick={onSchedule}
        after={<Icon size="100" src={Icons.Clock} />}
        data-action="schedule"
      >
        <Text as="span" size="T300" style={{ flexGrow: 1 }}>
          Schedule message
        </Text>
      </MenuItem>
    </>
  );
}
