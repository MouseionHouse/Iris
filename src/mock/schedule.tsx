// Scheduled messages, for checking without a homeserver: the real composer
// (RoomComposer and RoomInput, with its split send button, picker, time bar and list of scheduled messages) over an
// in-memory delayed-events store that behaves as Synapse 1.165 does, with a 7-day limit.
//
// Open /mock-schedule.html on the vite dev server. ?phone draws the phone layout, ?dark and ?light
// override the system setting, ?plain makes the room unencrypted, ?unsupported is a server
// without MSC4140 (and seeds nothing), ?empty seeds nothing, ?limit=1 sets the server's limit to an
// hour (default 7 days). ?no-encrypted makes m.room.encrypted need power 50, ?no-message the same
// for m.room.message; Hector has 0, so the first leaves him no composer in the encrypted room.
// window.__schedule is the store:
// its `requests` counts every call. Not part of the app build.
import React, { useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { Provider as JotaiProvider } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IContent, MatrixClient, Room } from 'matrix-js-sdk';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Box,
  OverlayContainerProvider,
  PopOutContainerProvider,
  Text,
  color,
  config,
  configClass,
  varsClass,
} from 'folds';
import { ScreenSize, ScreenSizeProvider } from '../app/hooks/useScreenSize';
import { MatrixClientProvider } from '../app/hooks/useMatrixClient';
import { SpecVersionsProvider } from '../app/hooks/useSpecVersions';
import { MediaConfigProvider } from '../app/hooks/useMediaConfig';
import { PowerLevelsContextProvider } from '../app/hooks/usePowerLevels';
import { IrisDarkTheme, IrisLightTheme, ThemeContextProvider } from '../app/hooks/useTheme';
import { DraftStoreProvider } from '../app/hooks/useDraftSync';
import { createMemoryDraftHub, createMemoryDraftStore } from '../app/state/room/draftSync';
import { useEditor } from '../app/components/editor';
import { RoomComposer } from '../app/features/room/RoomComposer';
import {
  ScheduledMessagesStore,
  ScheduledMessagesStoreProvider,
} from '../app/features/room/schedule-send';
import { DelayedEvent } from '../app/utils/delayedEvents';

const params = new URLSearchParams(window.location.search);
const phone = params.has('phone');
const encrypted = !params.has('plain');
const supported = !params.has('unsupported');
// ?limit=1 sets the server's limit in hours
const MAX_DELAY_MS = Number(params.get('limit') ?? 7 * 24) * 60 * 60 * 1000;
const MY_ID = '@hector:example.org';
const powerLevels = {
  users: {},
  users_default: 0,
  events: {
    ...(params.has('no-encrypted') ? { 'm.room.encrypted': 50 } : {}),
    ...(params.has('no-message') ? { 'm.room.message': 50 } : {}),
  },
};
const ROOM_ID = '!lounge:example.org';

// ---- the in-memory store: Synapse 1.165's answers, a little later

type MemoryScheduledStore = ScheduledMessagesStore & {
  events: DelayedEvent[];
  sent: { roomId: string; content: IContent }[];
  requests: Record<string, number>;
  /** the next schedule fails as the network would */
  failNext: boolean;
};

const ciphertext = (n: number) => ({
  algorithm: 'm.megolm.v1.aes-sha2',
  ciphertext: `AwgAEoAB${n}hX3u0ZQWv6Y`,
  device_id: 'IRISMOCK',
  sender_key: 'Zm9vYmFyYmF6',
  session_id: 'c2Vzc2lvbg',
});

const createMemoryScheduledStore = (): MemoryScheduledStore => {
  const clear = new Map<string, IContent>();
  let next = 1;
  const store: MemoryScheduledStore = {
    events: [],
    sent: [],
    requests: {},
    failNext: false,
    list: async () => {
      store.requests.list = (store.requests.list ?? 0) + 1;
      await new Promise((r) => {
        setTimeout(r, 150);
      });
      const now = Date.now();
      // the server sends what is due
      store.events = store.events.filter((e) => {
        if (e.sendTs > now) return true;
        store.sent.push({ roomId: e.roomId, content: clear.get(e.delayId) ?? e.content });
        return false;
      });
      return store.events.map((e) => ({ ...e }));
    },
    schedule: async (room, content, delayMs) => {
      store.requests.schedule = (store.requests.schedule ?? 0) + 1;
      await new Promise((r) => {
        setTimeout(r, 400);
      });
      if (store.failNext) {
        store.failNext = false;
        throw new Error('Failed to fetch');
      }
      if (delayMs > MAX_DELAY_MS) {
        const error = `The requested delay (${delayMs}ms) exceeds the allowed maximum (${MAX_DELAY_MS}ms)`;
        throw Object.assign(new Error(`MatrixError: [400] ${error}`), {
          errcode: 'ORG.MATRIX.MSC4140_DELAY_TOO_LARGE',
          data: { errcode: 'ORG.MATRIX.MSC4140_DELAY_TOO_LARGE', error },
        });
      }
      const delayId = `syd_mock${next}`;
      next += 1;
      const now = Date.now();
      const isEncrypted = room.hasEncryptionStateEvent();
      if (isEncrypted) clear.set(delayId, content);
      store.events.push({
        delayId,
        roomId: room.roomId,
        type: isEncrypted ? 'm.room.encrypted' : 'm.room.message',
        content: isEncrypted ? ciphertext(next) : content,
        delayMs,
        delayedSinceTs: now,
        sendTs: now + delayMs,
      });
      return delayId;
    },
    cancel: async (delayId) => {
      store.requests.cancel = (store.requests.cancel ?? 0) + 1;
      await new Promise((r) => {
        setTimeout(r, 200);
      });
      if (!store.events.some((e) => e.delayId === delayId)) {
        throw Object.assign(new Error('Delayed event not found'), { errcode: 'M_NOT_FOUND' });
      }
      store.events = store.events.filter((e) => e.delayId !== delayId);
    },
    sendNow: async (delayId) => {
      store.requests.sendNow = (store.requests.sendNow ?? 0) + 1;
      const event = store.events.find((e) => e.delayId === delayId);
      if (!event)
        throw Object.assign(new Error('Delayed event not found'), { errcode: 'M_NOT_FOUND' });
      store.events = store.events.filter((e) => e.delayId !== delayId);
      store.sent.push({ roomId: event.roomId, content: clear.get(delayId) ?? event.content });
    },
    send: async (roomId, content) => {
      store.requests.send = (store.requests.send ?? 0) + 1;
      store.sent.push({ roomId, content });
    },
    decrypt: async (event) => {
      store.requests.decrypt = (store.requests.decrypt ?? 0) + 1;
      if (event.type !== 'm.room.encrypted') return event.content;
      return clear.get(event.delayId);
    },
  };

  if (supported && !params.has('empty')) {
    const now = Date.now();
    const at = (days: number, hour: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(hour, 0, 0, 0);
      return d.getTime();
    };
    const seed = (
      type: string,
      content: IContent,
      sendTs: number,
      clearContent?: IContent
    ): void => {
      const delayId = `syd_seed${next}`;
      next += 1;
      if (clearContent) clear.set(delayId, clearContent);
      store.events.push({
        delayId,
        roomId: ROOM_ID,
        type,
        content,
        delayMs: sendTs - now + 3600000,
        delayedSinceTs: now - 3600000,
        sendTs,
      });
    };
    seed(
      'm.room.message',
      {
        msgtype: 'm.text',
        body: 'Bins go out tonight: it’s recycling week, so the blue one and the glass box, and the garden waste if there’s room',
      },
      at(1, 7)
    );
    seed('m.room.encrypted', ciphertext(0), at(2, 8), {
      msgtype: 'm.text',
      body: 'The new door code is 4321',
      format: 'org.matrix.custom.html',
      formatted_body: 'The new door code is <strong>4321</strong>',
    });
    // scheduled from another device, whose room key this one doesn't have
    seed('m.room.encrypted', ciphertext(1), at(3, 13));
  }
  return store;
};

const schedule = createMemoryScheduledStore();
declare global {
  interface Window {
    __schedule: MemoryScheduledStore;
  }
}
window.__schedule = schedule;

// ---- the client and room, as far as the composer reads them

const noop = () => undefined;
const stateEvents = new Map<string, unknown>();
const room = {
  roomId: ROOM_ID,
  name: 'Lounge',
  client: undefined as unknown,
  hasEncryptionStateEvent: () => encrypted,
  getMember: (userId: string) => ({ userId, rawDisplayName: 'Hector', name: 'Hector' }),
  getJoinedMembers: () => [],
  getMembers: () => [],
  getLiveTimeline: () => ({
    getState: () => ({
      getStateEvents: (type: string) => stateEvents.get(type),
      on: noop,
      removeListener: noop,
    }),
  }),
  findEventById: () => undefined,
  getCanonicalAlias: () => null,
  getAltAliases: () => [],
  isSpaceRoom: () => false,
  getMxcAvatarUrl: () => null,
  getType: () => undefined,
} as unknown as Room;

const mxTarget: Record<string, unknown> = {
  getUserId: () => MY_ID,
  getSafeUserId: () => MY_ID,
  getRoom: () => room,
  getRooms: () => [room],
  getAccountData: () => undefined,
  mxcUrlToHttp: () => null,
  sendTyping: async () => ({}),
  sendMessage: async () => ({ event_id: '$sent' }),
  isRoomEncrypted: () => encrypted,
  getCrypto: () => undefined,
  getUser: () => null,
  on: noop,
  off: noop,
  once: noop,
  removeListener: noop,
};
// any other method answers nothing
const mx = new Proxy(mxTarget, {
  get: (target, prop: string) => (prop in target ? target[prop] : noop),
}) as unknown as MatrixClient;
(room as unknown as { client: MatrixClient }).client = mx;

const queryClient = new QueryClient();
const draftStore = createMemoryDraftStore(createMemoryDraftHub(100), 'mock');

function Composer() {
  const editor = useEditor();
  const dropRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={dropRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        grow="Yes"
        direction="Column"
        justifyContent="End"
        gap="200"
        style={{ padding: config.space.S400 }}
      >
        <Text size="H4">Lounge</Text>
        <Text size="T300" priority="300">
          {encrypted ? 'Encrypted room' : 'Unencrypted room'}
          {supported ? ', server with delayed events' : ', server without delayed events'}
        </Text>
      </Box>
      <div style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}>
        <RoomComposer editor={editor} fileDropContainerRef={dropRef} roomId={ROOM_ID} room={room} />
      </div>
    </div>
  );
}

function App() {
  const dark = useMemo(
    () =>
      params.has('dark')
        ? true
        : !params.has('light') && window.matchMedia('(prefers-color-scheme: dark)').matches,
    []
  );
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <MatrixClientProvider value={mx}>
            <SpecVersionsProvider
              value={{
                versions: ['v1.11'],
                unstable_features: { 'org.matrix.msc4140': supported },
              }}
            >
              <MediaConfigProvider value={{ 'm.upload.size': 100 * 1024 * 1024 }}>
                <PowerLevelsContextProvider value={powerLevels as never}>
                  <ThemeContextProvider value={dark ? IrisDarkTheme : IrisLightTheme}>
                    <DraftStoreProvider value={draftStore}>
                      <ScheduledMessagesStoreProvider value={schedule}>
                        <div
                          style={{
                            height: '100vh',
                            maxWidth: phone ? undefined : 900,
                            backgroundColor: color.Background.Container,
                            color: color.Background.OnContainer,
                          }}
                        >
                          <Composer />
                        </div>
                      </ScheduledMessagesStoreProvider>
                    </DraftStoreProvider>
                  </ThemeContextProvider>
                </PowerLevelsContextProvider>
              </MediaConfigProvider>
            </SpecVersionsProvider>
          </MatrixClientProvider>
        </JotaiProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const dark = params.has('dark')
  ? true
  : !params.has('light') && window.matchMedia('(prefers-color-scheme: dark)').matches;
document.body.classList.add(
  configClass,
  varsClass,
  ...(dark ? IrisDarkTheme.classNames : IrisLightTheme.classNames)
);
document.body.style.margin = '0';

const portalContainer = document.getElementById('portalContainer') ?? undefined;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('mock-root')!).render(
  <ScreenSizeProvider value={phone ? ScreenSize.Mobile : ScreenSize.Desktop}>
    <PopOutContainerProvider value={portalContainer}>
      <OverlayContainerProvider value={portalContainer}>
        <App />
      </OverlayContainerProvider>
    </PopOutContainerProvider>
  </ScreenSizeProvider>
);
