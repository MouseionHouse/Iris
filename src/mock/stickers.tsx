// Mock of the sticker popover, rendered with the real EmojiBoard on fake packs held by an
// in-memory client: edits commit to it and come back through the same subscriptions the app
// uses. Open /mock-stickers.html on the vite dev server; append ?dark for the dark theme.
// Not part of the app build.
import React, { ComponentProps, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import { Box, Text, color, config, configClass, varsClass } from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { irisDarkTheme, irisLightTheme } from '../colors.css';
import { MatrixClientProvider } from '../app/hooks/useMatrixClient';
import { SpecVersionsProvider } from '../app/hooks/useSpecVersions';
import { MediaConfigProvider } from '../app/hooks/useMediaConfig';
import { EmojiBoard, EmojiBoardTab } from '../app/components/emoji-board';

type Client = ComponentProps<typeof MatrixClientProvider>['value'];
type Content = Record<string, unknown>;
type Listener = (...args: unknown[]) => void;

const MY_ID = '@hector:example.org';
const ACCOUNT_DATA_EVENT = 'accountData';
const ROOM_STATE_EVENT = 'RoomState.events';

let eventCount = 0;
const mockEvent = (type: string, content: Content, roomId?: string, stateKey?: string) => {
  eventCount += 1;
  const id = `$mock${eventCount}`;
  return {
    event: { sender: '@admin:example.org', type, content, state_key: stateKey },
    getId: () => id,
    getType: () => type,
    getContent: () => content,
    getRoomId: () => roomId,
    getStateKey: () => stateKey,
    getSender: () => '@admin:example.org',
    getTs: () => Date.now(),
  };
};
type MockEvent = ReturnType<typeof mockEvent>;

const COLORS = ['#7BC86C', '#F5B445', '#E86A92', '#6CA6E8', '#A98BE8', '#4CC3B5', '#E8865A'];
const stickerSvg = (name: string) => {
  const hue = COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <circle cx="48" cy="44" r="36" fill="${hue}"/>
    <circle cx="36" cy="38" r="5" fill="#222"/><circle cx="60" cy="38" r="5" fill="#222"/>
    <path d="M32 54 Q48 68 64 54" stroke="#222" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="48" y="92" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#555">${name}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const images = (names: string[]) =>
  Object.fromEntries(
    names.map((name) => [
      name,
      { url: `mxc://mock/${name}`, info: { w: 96, h: 96, mimetype: 'image/svg+xml' } },
    ])
  );

type MockRoom = {
  roomId: string;
  name: string;
  space?: boolean;
  myPower: number;
  state: Map<string, Map<string, MockEvent>>;
};
const rooms: MockRoom[] = [
  { roomId: '!house:mock', name: 'Household', myPower: 100, state: new Map() },
  { roomId: '!space:mock', name: 'Mouseion', space: true, myPower: 0, state: new Map() },
  { roomId: '!books:mock', name: 'Book club', myPower: 100, state: new Map() },
  { roomId: '!garden:mock', name: 'Garden plans', myPower: 0, state: new Map() },
];
const setState = (room: MockRoom, type: string, stateKey: string, content: Content) => {
  const ev = mockEvent(type, content, room.roomId, stateKey);
  const byKey = room.state.get(type) ?? new Map<string, MockEvent>();
  const prev = byKey.get(stateKey) ?? null;
  byKey.set(stateKey, ev);
  room.state.set(type, byKey);
  return { ev, prev };
};
rooms.forEach((room) => {
  setState(room, 'm.room.create', '', { room_version: '10' });
  setState(room, 'm.room.power_levels', '', {
    users: { [MY_ID]: room.myPower },
    state_default: 50,
  });
});
setState(rooms[0], 'im.ponies.room_emotes', 'house', {
  pack: { display_name: 'House stickers', usage: ['sticker'] },
  images: images(['cat-wave', 'frog', 'thumbs-up', 'dinner', 'sleepy']),
});
setState(rooms[1], 'im.ponies.room_emotes', 'official', {
  pack: { display_name: 'Mouseion Official', usage: ['sticker'] },
  images: images(['mouse-hi', 'mouse-cheese', 'mouse-sleep']),
});

const accountData = new Map<string, MockEvent>();
accountData.set(
  'im.ponies.user_emotes',
  mockEvent('im.ponies.user_emotes', {
    pack: { usage: ['sticker'] },
    images: images(['frog', 'coffee', 'heart', 'party']),
  })
);

const listeners = new Map<string, Set<Listener>>();
const emit = (name: string, ...args: unknown[]) =>
  listeners.get(name)?.forEach((listener) => listener(...args));

const params = new URLSearchParams(window.location.search);
const uploadMs = Number(params.get('uploadMs') ?? 1200);
const failWrites = params.has('failWrites');
const later = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const makeRoom = (room: MockRoom) => {
  const state = {
    getStateEvents: (type: string, stateKey?: string) => {
      const byKey = room.state.get(type);
      if (stateKey === undefined) return byKey ? Array.from(byKey.values()) : [];
      return byKey?.get(stateKey) ?? null;
    },
  };
  return {
    roomId: room.roomId,
    name: room.name,
    getMyMembership: () => 'join',
    isSpaceRoom: () => !!room.space,
    getLiveTimeline: () => ({ getState: () => state }),
    currentState: state,
  };
};
const roomObjects = new Map(rooms.map((room) => [room.roomId, makeRoom(room)]));

const mx = {
  getUserId: () => MY_ID,
  getSafeUserId: () => MY_ID,
  getRoom: (roomId: string) => roomObjects.get(roomId) ?? null,
  getRooms: () => Array.from(roomObjects.values()),
  getAccountData: (type: string) => accountData.get(type),
  setAccountData: async (type: string, content: Content) => {
    await later(150);
    if (failWrites) throw new Error('The server is unreachable');
    const ev = mockEvent(type, content);
    accountData.set(type, ev);
    emit(ACCOUNT_DATA_EVENT, ev);
    return {};
  },
  sendStateEvent: async (roomId: string, type: string, content: Content, stateKey: string) => {
    await later(150);
    if (failWrites) throw new Error('The server is unreachable');
    const room = rooms.find((r) => r.roomId === roomId);
    if (!room) throw new Error('Unknown room');
    const { ev, prev } = setState(room, type, stateKey, content);
    emit(ROOM_STATE_EVENT, ev, roomObjects.get(roomId)?.currentState, prev);
    return { event_id: ev.getId() };
  },
  uploadContent: async (file: File, opts?: { progressHandler?: Listener }) => {
    const steps = 4;
    for (let i = 1; i <= steps; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await later(uploadMs / steps);
      opts?.progressHandler?.({ loaded: (file.size * i) / steps, total: file.size });
    }
    return { content_uri: `mxc://mock/${file.name.replace(/\.[^.]*$/, '')}` };
  },
  cancelUpload: () => undefined,
  mxcUrlToHttp: (mxc: string) => stickerSvg(mxc.replace('mxc://mock/', '')),
  on: (name: string, listener: Listener) => {
    const set = listeners.get(name) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(name, set);
  },
  removeListener: (name: string, listener: Listener) => {
    listeners.get(name)?.delete(listener);
  },
} as unknown as Client;

const imagePackRooms = [roomObjects.get('!house:mock'), roomObjects.get('!space:mock')] as never[];

function MockStickers() {
  const [tab, setTab] = useState(EmojiBoardTab.Sticker);
  const [log, setLog] = useState('Nothing sent yet');
  const [open, setOpen] = useState(true);

  return (
    <Box
      direction="Column"
      gap="300"
      alignItems="Center"
      style={{
        minHeight: '100%',
        padding: `${config.space.S400} 0`,
        backgroundColor: color.Background.Container,
        color: color.Background.OnContainer,
      }}
    >
      <Text id="mock-log" size="T300" priority="300">
        {log}
      </Text>
      {open ? (
        <EmojiBoard
          tab={tab}
          onTabChange={setTab}
          imagePackRooms={imagePackRooms}
          returnFocusOnDeactivate={false}
          onStickerSelect={(mxc, shortcode) => setLog(`sent sticker ${shortcode}`)}
          onEmojiSelect={(unicode) => setLog(`sent emoji ${unicode}`)}
          requestClose={() => setOpen(false)}
        />
      ) : (
        <button type="button" id="mock-reopen" onClick={() => setOpen(true)}>
          Reopen board
        </button>
      )}
    </Box>
  );
}

const dark = params.has('dark');
document.body.classList.add(
  configClass,
  varsClass,
  ...(dark
    ? ['iris-dark-theme', irisDarkTheme, onDarkFontWeight]
    : ['iris-light-theme', irisLightTheme, onLightFontWeight])
);

const style = document.createElement('style');
style.textContent = `#mock-root { width: 100%; min-height: 100%; }`;
document.head.appendChild(style);

createRoot(document.getElementById('mock-root') as HTMLElement).render(
  <SpecVersionsProvider value={{ versions: ['v1.11'] }}>
    <MediaConfigProvider value={{ 'm.upload.size': 50 * 1024 * 1024 }}>
      <MatrixClientProvider value={mx}>
        <MockStickers />
      </MatrixClientProvider>
    </MediaConfigProvider>
  </SpecVersionsProvider>
);
