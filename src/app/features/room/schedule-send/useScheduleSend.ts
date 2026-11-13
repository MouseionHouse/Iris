// Scheduling from the composer: one schedule at a time, the edited one before the old one goes.
// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import { useCallback, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { IContent, Room } from 'matrix-js-sdk';
import { ScheduleError, computeDelayMs, parseDelayTooLarge } from '../../../utils/delayedEvents';
import {
  roomIdToEditingScheduledAtomFamily,
  roomIdToScheduledTimeAtomFamily,
  serverMaxDelayMsAtom,
} from '../../../state/scheduledMessages';
import { useRefreshScheduledMessages, useScheduledMessagesStore } from './scheduledMessagesStore';
import { ScheduleFailure } from './ScheduleComposerBars';

const reasonOf = (e: unknown): string | undefined => {
  const data = (e as { data?: { error?: unknown } } | undefined)?.data;
  if (typeof data?.error === 'string') return data.error;
  return e instanceof Error ? e.message : undefined;
};

const isNotFound = (e: unknown): boolean =>
  (e as { errcode?: unknown } | undefined)?.errcode === 'M_NOT_FOUND';

export const useScheduleSend = (room: Room) => {
  const { roomId } = room;
  const store = useScheduledMessagesStore();
  const refresh = useRefreshScheduledMessages();
  const [sendTs, setSendTs] = useAtom(roomIdToScheduledTimeAtomFamily(roomId));
  const [editingDelayId, setEditingDelayId] = useAtom(roomIdToEditingScheduledAtomFamily(roomId));
  const [maxDelayMs, setMaxDelayMs] = useAtom(serverMaxDelayMsAtom);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<ScheduleFailure>();

  /** After the new one is out: the old one goes, and if it can't, both stay listed. */
  const replaceOld = useCallback(
    async (oldDelayId: string | undefined): Promise<ScheduleFailure | undefined> => {
      if (!oldDelayId) return undefined;
      try {
        await store.cancel(oldDelayId);
        return undefined;
      } catch (e) {
        return isNotFound(e) ? { kind: 'oldAlreadySent' } : { kind: 'oldNotCancelled' };
      }
    },
    [store]
  );

  /** Runs one request at a time: a second Enter while the first is out does nothing. */
  const exclusive = useCallback(async (work: () => Promise<boolean>): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      return await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** Schedules `content` for the set time; true when the server has it. */
  const schedule = useCallback(
    (content: IContent): Promise<boolean> =>
      exclusive(async () => {
        if (sendTs === undefined) return false;
        let delayMs: number;
        try {
          delayMs = computeDelayMs(sendTs, maxDelayMs);
        } catch (e) {
          setFailure(
            e instanceof ScheduleError && e.kind === 'tooFar'
              ? { kind: 'tooFar', maxDelayMs }
              : { kind: 'past' }
          );
          return false;
        }
        try {
          await store.schedule(room, content, delayMs);
        } catch (e) {
          const tooLarge = parseDelayTooLarge(e);
          if (tooLarge) {
            if (tooLarge.maxDelayMs !== undefined) setMaxDelayMs(tooLarge.maxDelayMs);
            setFailure({ kind: 'tooFar', maxDelayMs: tooLarge.maxDelayMs });
          } else if (e instanceof ScheduleError && e.kind === 'encryption') {
            setFailure({ kind: 'encryption' });
          } else {
            setFailure({ kind: 'failed', reason: reasonOf(e) });
          }
          return false;
        }
        const old = editingDelayId;
        setSendTs(undefined);
        setEditingDelayId(undefined);
        setFailure(await replaceOld(old));
        refresh();
        return true;
      }),
    [
      exclusive,
      sendTs,
      maxDelayMs,
      store,
      room,
      editingDelayId,
      setSendTs,
      setEditingDelayId,
      setMaxDelayMs,
      replaceOld,
      refresh,
    ]
  );

  /** Sends the edited message now, then cancels the scheduled one it replaces. */
  const sendEditedNow = useCallback(
    (content: IContent): Promise<boolean> =>
      exclusive(async () => {
        try {
          await store.send(roomId, content);
        } catch (e) {
          setFailure({ kind: 'sendFailed', reason: reasonOf(e) });
          return false;
        }
        const old = editingDelayId;
        setSendTs(undefined);
        setEditingDelayId(undefined);
        setFailure(await replaceOld(old));
        refresh();
        return true;
      }),
    [exclusive, store, roomId, editingDelayId, setSendTs, setEditingDelayId, replaceOld, refresh]
  );

  /** Clears the time and lets go of the scheduled message being edited, which stays as it was. */
  const clear = useCallback(() => {
    setSendTs(undefined);
    setEditingDelayId(undefined);
    setFailure(undefined);
  }, [setSendTs, setEditingDelayId]);

  return {
    sendTs,
    setSendTs,
    editingDelayId,
    setEditingDelayId,
    maxDelayMs,
    busy,
    failure,
    setFailure,
    schedule,
    sendEditedNow,
    clear,
  };
};
