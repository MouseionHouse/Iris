import { useEffect, useMemo } from 'react';
import { MatrixEvent, MatrixEventEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useForceUpdate } from './useForceUpdate';
import { useRoomLatestRenderedEvent } from './useRoomLatestRenderedEvent';
import { RoomPreview, getRoomPreview } from '../utils/roomPreview';
import { getMemberDisplayName } from '../utils/room';
import { getMxIdLocalPart } from '../utils/matrix';

export type RoomPreviewState = {
  preview?: RoomPreview;
  /** When the previewed event was sent. */
  ts?: number;
};

/**
 * The last-message line of a room for a list row. The latest event stays the same object while
 * it is decrypted, edited, redacted or confirmed by the server, so those are listened for too.
 */
export const useRoomPreview = (room: Room, direct: boolean): RoomPreviewState => {
  const mx = useMatrixClient();
  const latestEvent = useRoomLatestRenderedEvent(room);
  const [version, forceUpdate] = useForceUpdate();

  useEffect(() => {
    if (!latestEvent) return undefined;
    const handleRoomChange = (mEvent: MatrixEvent) => {
      // a redaction names its target, a local echo is the event itself
      if (mEvent === latestEvent || mEvent.getAssociatedId() === latestEvent.getId()) {
        forceUpdate();
      }
    };
    latestEvent.on(MatrixEventEvent.Decrypted, forceUpdate);
    latestEvent.on(MatrixEventEvent.Replaced, forceUpdate);
    room.on(RoomEvent.Redaction, handleRoomChange);
    room.on(RoomEvent.LocalEchoUpdated, handleRoomChange);
    return () => {
      latestEvent.removeListener(MatrixEventEvent.Decrypted, forceUpdate);
      latestEvent.removeListener(MatrixEventEvent.Replaced, forceUpdate);
      room.removeListener(RoomEvent.Redaction, handleRoomChange);
      room.removeListener(RoomEvent.LocalEchoUpdated, handleRoomChange);
    };
  }, [room, latestEvent, forceUpdate]);

  return useMemo(
    () => {
      if (!latestEvent) return {};
      return {
        preview: getRoomPreview(latestEvent, {
          myUserId: mx.getSafeUserId(),
          direct,
          getName: (userId) =>
            getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId,
        }),
        ts: latestEvent.getTs(),
      };
    },
    // version is the signal that the event changed in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, room, direct, latestEvent, version]
  );
};
