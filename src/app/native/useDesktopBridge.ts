import { useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { roomToUnreadAtom } from '../state/room/roomToUnread';
import { mDirectAtom } from '../state/mDirectList';
import { computeUnreadSummary } from '../hub/useHubBridge';
import { desktopDarkAtom } from '../hooks/useTheme';
import {
  createUnreadSender,
  desktopSetUnread,
  isDesktopShell,
  onDesktopColorScheme,
} from './desktop';

/**
 * Follow the Plasma colour scheme inside the desktop shell. It only sets `desktopDarkAtom`; the
 * theme code decides whether the member's settings let the system choose. A no-op elsewhere.
 */
export const useDesktopColorScheme = (): void => {
  const setDesktopDark = useSetAtom(desktopDarkAtom);
  useEffect(() => {
    if (!isDesktopShell()) return undefined;
    return onDesktopColorScheme(({ dark }) => setDesktopDark(dark));
  }, [setDesktopDark]);
};

/**
 * The desktop shell's side of the app: the unread badge on the taskbar, from the same counts the
 * Hub gets (`computeUnreadSummary`: unread messages, of which mentions), a few times a second at
 * most. Call it next to `useHubBridge`. A no-op outside the shell.
 */
export const useDesktopBridge = (): void => {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const directs = useAtomValue(mDirectAtom);
  const summary = useMemo(
    () => computeUnreadSummary(roomToUnread, directs),
    [roomToUnread, directs]
  );

  useDesktopColorScheme();

  const sender = useMemo(
    () => (isDesktopShell() ? createUnreadSender(desktopSetUnread) : undefined),
    []
  );
  useEffect(() => {
    sender?.push({ total: summary.messages, highlight: summary.highlights });
  }, [sender, summary]);
  // Signed out (or the app torn down): the badge goes with the session.
  useEffect(
    () => () => {
      if (!sender) return;
      sender.cancel();
      desktopSetUnread({ total: 0, highlight: 0 });
    },
    [sender]
  );
};
