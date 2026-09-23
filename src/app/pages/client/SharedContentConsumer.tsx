import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom, useStore } from 'jotai';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { pendingSharedTextAtom } from '../../native/share';
import { getLastOpenedRoom } from '../../state/lastOpenedRoom';
import { roomIdToMsgDraftAtomFamily } from '../../state/room/roomInputDrafts';
import { BlockType } from '../../components/editor';
import type { CustomElement } from '../../components/editor/slate';

/**
 * Applies shared text received from another app (src/app/native/share.ts) to the
 * composer: the room currently on screen, or the last opened room when the app is on
 * another page (it navigates there). The text is placed as a draft, not sent — the
 * user reviews it and presses send.
 */
export function SharedContentConsumer() {
  const mx = useMatrixClient();
  const store = useStore();
  const navigate = useNavigate();
  const currentRoomId = useSelectedRoom();
  const [pending, setPending] = useAtom(pendingSharedTextAtom);

  useEffect(() => {
    if (!pending) return undefined;

    setPending(undefined);

    const userId = mx.getUserId();
    const lastOpened = userId ? getLastOpenedRoom(userId) : undefined;

    // Target room: the room on screen, else the last room the user opened.
    const targetRoomId = currentRoomId ?? lastOpened?.roomId;
    if (!targetRoomId) {
      console.warn('MouseionShare: no room to receive the shared text, dropping it');
      return undefined;
    }

    const draft: CustomElement[] = [
      { type: BlockType.Paragraph, children: [{ text: pending.text }] },
    ];
    store.set(roomIdToMsgDraftAtomFamily(targetRoomId), draft);

    if (currentRoomId !== targetRoomId && lastOpened?.path) {
      navigate(lastOpened.path);
    }

    // Best-effort focus: brings up the keyboard so the arrival is obvious.
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>('[data-slate-editor="true"]')?.focus();
    }, 500);

    return () => window.clearTimeout(timer);
  }, [pending, currentRoomId, mx, navigate, store, setPending]);

  return null;
}
