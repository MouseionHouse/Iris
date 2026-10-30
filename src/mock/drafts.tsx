// Drafts that follow the account (mouseion/iris#60), for checking without a homeserver: two
// "devices", each the real composer (CustomEditor + useDraftSync) with its own jotai store, over
// one in-memory draft store that echoes every write after a delay, as sync would. Under each
// composer are the room's desktop row (the real pencil) and phone row (the real RoomRow).
//
// Open /mock-drafts.html on the vite dev server. ?echo= sets the echo delay in ms (default 300),
// ?dark and ?light override the system setting. window.__hub is the shared store and
// window.__editors each device's editor. Not part of the app build.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Provider as JotaiProvider, useAtom } from 'jotai';
import { MatrixClient } from 'matrix-js-sdk';
import { Editor } from 'slate';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Avatar,
  Box,
  Button,
  OverlayContainerProvider,
  PopOutContainerProvider,
  Text,
  color,
  configClass,
  varsClass,
} from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { irisDarkTheme, irisLightTheme } from '../colors.css';
import { ScreenSize, ScreenSizeProvider } from '../app/hooks/useScreenSize';
import { MatrixClientProvider } from '../app/hooks/useMatrixClient';
import {
  CustomEditor,
  createMentionElement,
  moveCursor,
  resetEditor,
  resetEditorHistory,
  useEditor,
} from '../app/components/editor';
import { DraftStoreProvider, useDraftSync, useRoomDraftPreview } from '../app/hooks/useDraftSync';
import {
  MemoryDraftHub,
  createMemoryDraftHub,
  createMemoryDraftStore,
} from '../app/state/room/draftSync';
import { roomIdToReplyDraftAtomFamily } from '../app/state/room/roomInputDrafts';
import { NavItem, NavItemContent, NavLink } from '../app/components/nav';
import { RoomDraftMark, RoomRow } from '../app/features/room-nav/RoomRow';

declare global {
  interface Window {
    __hub: MemoryDraftHub;
    __editors: Record<string, Editor>;
  }
}
window.__editors = {};

const params = new URLSearchParams(window.location.search);
const hub = createMemoryDraftHub(Number(params.get('echo') ?? 300));
window.__hub = hub;

const ROOM_ID = '!lounge:example.org';
const NAMES: Record<string, string> = { '@ada:example.org': 'Ada' };
const nameOf = (userId: string) => NAMES[userId] ?? userId;

// The composer reads no more of the client than this.
const mx = {
  getUserId: () => '@hector:example.org',
  getSafeUserId: () => '@hector:example.org',
  mxcUrlToHttp: () => null,
} as unknown as MatrixClient;

function Rows({ device }: { device: string }) {
  const draft = useRoomDraftPreview(ROOM_ID, nameOf);
  return (
    <Box direction="Column" gap="200">
      <div data-row="desktop" data-device={device}>
        <NavItem variant="Background" radii="400">
          <NavLink to="#">
            <NavItemContent>
              <Box as="span" grow="Yes" alignItems="Center" gap="100" style={{ minWidth: 0 }}>
                <Text as="span" size="Inherit" truncate>
                  Lounge
                </Text>
                {draft !== undefined && <RoomDraftMark draft={draft} />}
              </Box>
            </NavItemContent>
          </NavLink>
        </NavItem>
      </div>
      <div data-row="phone" data-device={device}>
        <RoomRow
          linkPath="#"
          name="Lounge"
          avatar={
            <Avatar size="400" radii="400">
              <Text size="H4">L</Text>
            </Avatar>
          }
          time="12:04"
          preview={{ sender: 'Ada', text: 'See you there' }}
          draft={draft}
          onOptions={() => undefined}
        />
      </div>
    </Box>
  );
}

function Composer({ device }: { device: string }) {
  const editor = useEditor();
  window.__editors[device] = editor;
  const draftSync = useDraftSync(ROOM_ID, editor);
  const [reply, setReply] = useAtom(roomIdToReplyDraftAtomFamily(ROOM_ID));

  // as RoomInput sends: the text and the reply leave the composer, then the draft saves
  const send = () => {
    resetEditor(editor);
    resetEditorHistory(editor);
    setReply(undefined);
    draftSync.flush();
  };

  return (
    <Box direction="Column" gap="200">
      <div data-composer={device}>
        <CustomEditor
          editableName={`composer-${device}`}
          editor={editor}
          placeholder="Send a message..."
          onChange={draftSync.onChange}
          top={
            reply && (
              <Text data-reply={device} size="T300" style={{ padding: '8px 12px 0' }}>
                Replying to <b>{nameOf(reply.userId)}</b>: {reply.body}
              </Text>
            )
          }
        />
      </div>
      <Box gap="200" wrap="Wrap">
        <Button size="300" data-action="send" onClick={send}>
          <Text size="B300">Send</Text>
        </Button>
        <Button
          size="300"
          variant="Secondary"
          data-action="mention"
          // keeps the caret in the composer, as the autocomplete does
          onMouseDown={(evt) => evt.preventDefault()}
          onClick={() => {
            editor.insertNode(createMentionElement('@ada:example.org', 'Ada', false));
            moveCursor(editor, true);
          }}
        >
          <Text size="B300">Mention Ada</Text>
        </Button>
        <Button
          size="300"
          variant="Secondary"
          data-action="reply"
          onClick={() =>
            setReply({ userId: '@ada:example.org', eventId: '$see-you', body: 'See you there' })
          }
        >
          <Text size="B300">Reply to Ada</Text>
        </Button>
      </Box>
    </Box>
  );
}

function Device({ device }: { device: string }) {
  // a reload: a new jotai store and a new editor, nothing kept in memory
  const [boot, setBoot] = useState(0);
  const store = useMemo(() => createMemoryDraftStore(hub, device), [device]);

  return (
    <Box direction="Column" gap="300" style={{ flex: 1, minWidth: 320 }}>
      <Box alignItems="Center" justifyContent="SpaceBetween">
        <Text size="H4">Device {device}</Text>
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          data-action="reload"
          data-device={device}
          onClick={() => setBoot((b) => b + 1)}
        >
          <Text size="B300">Reload</Text>
        </Button>
      </Box>
      <JotaiProvider key={boot}>
        <DraftStoreProvider value={store}>
          <Composer device={device} />
          <Rows device={device} />
        </DraftStoreProvider>
      </JotaiProvider>
    </Box>
  );
}

function App() {
  return (
    <MemoryRouter>
      <MatrixClientProvider value={mx}>
        <Box
          gap="600"
          wrap="Wrap"
          style={{
            padding: 24,
            minHeight: '100vh',
            backgroundColor: color.Background.Container,
            color: color.Background.OnContainer,
          }}
        >
          <Device device="A" />
          <Device device="B" />
        </Box>
      </MatrixClientProvider>
    </MemoryRouter>
  );
}

const dark = params.has('dark')
  ? true
  : !params.has('light') && window.matchMedia('(prefers-color-scheme: dark)').matches;
document.body.classList.add(
  configClass,
  varsClass,
  ...(dark
    ? ['iris-dark-theme', irisDarkTheme, onDarkFontWeight]
    : ['iris-light-theme', irisLightTheme, onLightFontWeight])
);

const portalContainer = document.getElementById('portalContainer') ?? undefined;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('mock-root')!).render(
  <ScreenSizeProvider value={ScreenSize.Desktop}>
    <PopOutContainerProvider value={portalContainer}>
      <OverlayContainerProvider value={portalContainer}>
        <App />
      </OverlayContainerProvider>
    </PopOutContainerProvider>
  </ScreenSizeProvider>
);
