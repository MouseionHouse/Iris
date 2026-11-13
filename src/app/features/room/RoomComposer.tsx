import React, { forwardRef } from 'react';
import { Text, config } from 'folds';
import { EventType } from 'matrix-js-sdk';
import { MessageEvent } from '../../../types/matrix/room';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { RoomInput, RoomInputProps } from './RoomInput';

/**
 * The composer, or a note saying the user can't post. In an encrypted room a message goes out as
 * m.room.encrypted, so that is the permission it needs (Cinny #3092). Sending and scheduling both
 * live in RoomInput, so neither is offered without it. RoomView's block, moved here so the
 * scheduled-messages mock draws the same check.
 */
export const RoomComposer = forwardRef<HTMLDivElement, RoomInputProps>((props, ref) => {
  const { room, roomId } = props;
  const mx = useMatrixClient();
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const isEncrypted = mx.isRoomEncrypted(roomId);
  const canMessage = permissions.event(
    isEncrypted ? MessageEvent.RoomMessageEncrypted : EventType.RoomMessage,
    mx.getSafeUserId()
  );

  if (!canMessage) {
    return (
      <RoomInputPlaceholder
        data-composer="no-permission"
        style={{ padding: config.space.S200 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <Text align="Center">You do not have permission to post in this room</Text>
      </RoomInputPlaceholder>
    );
  }
  return <RoomInput {...props} ref={ref} />;
});
