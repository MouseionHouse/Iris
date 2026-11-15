import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import { MatrixClient } from 'matrix-js-sdk';
import { getMemberDisplayName } from '../utils/room';
import { RoomToUnread } from '../../types/matrix/room';
import { roomToUnreadAtom } from '../state/room/roomToUnread';
import { mDirectAtom } from '../state/mDirectList';
import { clearLoginData, logoutClient, startClient } from '../../client/initMatrix';
import { IrisLightTheme, MouseionTheme, hubThemeAtom } from '../hooks/useTheme';
import {
  HUB_PROTOCOL_VERSION,
  getHubOrigin,
  isFramed,
  parseHubMessage,
  postToHub,
  ChatHighlightMessage,
} from './hubBridge';

/**
 * Summarise the per-room unread map into the numbers the hub wants.
 *
 * Only leaf rooms (entries whose `from` is `null`) are counted: space rooms
 * appear in the map as aggregators of their children, so counting them too
 * would double-count. `total` is always >= `highlight` (see `getUnreadInfo`),
 * so a room with any unread has `total > 0`. `direct` is the unread in direct
 * messages: like a mention, a DM is addressed to the member, and the hub turns
 * its cue red for either.
 */
export const computeUnreadSummary = (
  roomToUnread: RoomToUnread,
  directs: Set<string>
): { rooms: number; messages: number; highlights: number; direct: number } => {
  let rooms = 0;
  let messages = 0;
  let highlights = 0;
  let direct = 0;
  roomToUnread.forEach((unread, roomId) => {
    if (unread.from !== null) return;
    if (unread.total > 0 || unread.highlight > 0) {
      rooms += 1;
      messages += unread.total;
      highlights += unread.highlight;
      if (directs.has(roomId)) direct += unread.total;
    }
  });
  return { rooms, messages, highlights, direct };
};

/**
 * Build a `chat.highlight` payload for a room whose highlight count just
 * increased, pulling the sender name and a short preview from the room's most
 * recent live event.
 */
const makeHighlightMessage = (
  mx: MatrixClient,
  roomId: string
): ChatHighlightMessage | undefined => {
  const room = mx.getRoom(roomId);
  if (!room) return undefined;
  const events = room.getLiveTimeline().getEvents();
  const latest = events[events.length - 1];
  const senderId = latest?.getSender();
  const body = latest?.getContent<{ body?: string }>()?.body;
  return {
    type: 'chat.highlight',
    roomId: room.roomId,
    roomName: room.name || room.roomId,
    sender:
      (senderId ? getMemberDisplayName(room, senderId) : undefined) ?? senderId ?? room.roomId,
    preview: (body ?? '').trim().slice(0, 140),
    ts: Date.now(),
  };
};

/**
 * Wire the client into the hub's `postMessage` protocol.
 *
 * Call this from the authenticated client root (it needs the matrix client,
 * the router and the jotai store). It is a complete no-op when the client is
 * not framed in the hub, or the build names no hub.
 *
 * @param mx the active matrix client (undefined until the client has loaded)
 * @param loading true until the client has reached the `PREPARED` sync state
 */
export const useHubBridge = (mx: MatrixClient | undefined, loading: boolean): void => {
  const location = useLocation();
  const navigate = useNavigate();
  const setHubTheme = useSetAtom(hubThemeAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const directs = useAtomValue(mDirectAtom);

  /* ---- inbound (hub -> chat) ---- */

  // The latest handler closures, kept in a ref so the once-registered message
  // listener always dispatches to fresh `mx` / `navigate` values.
  const handlersRef = useRef<{
    theme: (mode: 'dark' | 'light') => void;
    visible: (visible: boolean) => void;
    navigate: (path: string) => void;
    signOut: () => void;
  } | null>(null);

  handlersRef.current = {
    theme: (mode) => {
      // Match the hub's light/dark mode. Dark maps to the Mouseion palette so
      // the framed client blends into the dark hub shell.
      setHubTheme(mode === 'dark' ? MouseionTheme : IrisLightTheme);
    },
    visible: (visible) => {
      if (!mx) return;
      if (visible) {
        // Resume: restart the sync long-poll (and with it presence/typing).
        if (!mx.clientRunning) startClient(mx);
      } else if (mx.clientRunning) {
        // Hidden behind another spoke: stop the sync long-poll so we stop
        // receiving state/presence/typing updates and stop broadcasting them.
        mx.stopClient();
      }
    },
    navigate: (path) => {
      // Only accept in-app paths (leading slash) to avoid open-redirects.
      if (typeof path === 'string' && path.startsWith('/')) navigate(path);
    },
    signOut: () => {
      // The same teardown the in-app logout uses; both post `chat.signedOut`
      // before reloading.
      if (mx) logoutClient(mx);
      else clearLoginData();
    },
  };

  useEffect(() => {
    if (!isFramed()) return undefined;
    const hubOrigin = getHubOrigin();
    if (!hubOrigin) return undefined;
    const onMessage = (event: MessageEvent) => {
      // Origin-check every inbound message; ignore anything not from the hub.
      if (event.origin !== hubOrigin) return;
      const message = parseHubMessage(event.data);
      if (!message) return;
      const handlers = handlersRef.current;
      if (!handlers) return;
      switch (message.type) {
        case 'hub.theme':
          handlers.theme(message.mode);
          break;
        case 'hub.visible':
          handlers.visible(message.visible);
          break;
        case 'hub.navigate':
          handlers.navigate(message.path);
          break;
        case 'hub.signOut':
          handlers.signOut();
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /* ---- outbound (chat -> hub) ---- */

  // chat.ready — once, on boot, after the client is ready.
  const readySentRef = useRef(false);
  useEffect(() => {
    if (!loading && mx && !readySentRef.current) {
      readySentRef.current = true;
      postToHub({ type: 'chat.ready', version: HUB_PROTOCOL_VERSION });
    }
  }, [loading, mx]);

  // chat.route — the current client path on every navigation (and on mount).
  useEffect(() => {
    postToHub({ type: 'chat.route', path: location.pathname });
  }, [location.pathname]);

  // chat.unread — whenever the unread/notification counts change.
  const unreadSummary = useMemo(
    () => computeUnreadSummary(roomToUnread, directs),
    [roomToUnread, directs]
  );
  useEffect(() => {
    postToHub({ type: 'chat.unread', ...unreadSummary });
  }, [unreadSummary]);

  // chat.highlight — when a room's highlight/mention count increases.
  //
  // We diff the per-room highlight counts from the same `roomToUnreadAtom` that
  // powers `chat.unread`. The baseline is captured once the client is ready so
  // pre-existing highlights are not reported as new.
  const highlightBaselineRef = useRef<Map<string, number>>(new Map());
  const highlightPrimedRef = useRef(false);
  useEffect(() => {
    if (loading || !mx) return;

    const next = new Map<string, number>();
    roomToUnread.forEach((unread, roomId) => {
      if (unread.from === null) next.set(roomId, unread.highlight);
    });

    if (!highlightPrimedRef.current) {
      highlightBaselineRef.current = next;
      highlightPrimedRef.current = true;
      return;
    }

    const baseline = highlightBaselineRef.current;
    const emits: ChatHighlightMessage[] = [];
    next.forEach((highlight, roomId) => {
      const before = baseline.get(roomId) ?? 0;
      if (highlight > before) {
        const message = makeHighlightMessage(mx, roomId);
        if (message) emits.push(message);
      }
    });
    highlightBaselineRef.current = next;
    emits.forEach(postToHub);
  }, [roomToUnread, mx, loading]);
};
