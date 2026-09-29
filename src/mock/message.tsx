// Mock of the room timeline for message interactions, rendered with the real Message component
// on fake data. Open /mock-message.html on the vite dev server, with touch emulation for the
// long-press action sheet. Append ?dark for the dark theme. Not part of the app build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Box,
  OverlayContainerProvider,
  PopOutContainerProvider,
  Scroll,
  Text,
  color,
  config,
  configClass,
  lightTheme,
  varsClass,
} from 'folds';
import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { darkTheme } from '../colors.css';
import { MatrixClientProvider } from '../app/hooks/useMatrixClient';
import { SpecVersionsProvider } from '../app/hooks/useSpecVersions';
import { Event, Message } from '../app/features/room/message';
import { MessageTextBody } from '../app/components/message';
import { MessageLayout, MessageSpacing } from '../app/state/settings';
import { handleBackButton } from '../app/native/backButton';

const MY_ID = '@hector:example.org';
const NAMES: Record<string, string> = {
  [MY_ID]: 'John',
  '@andromache:example.org': 'Andromache',
};

const mx = {
  getUserId: () => MY_ID,
  getAccountData: () => undefined,
  getRoom: () => null,
  mxcUrlToHttp: () => null,
  on: () => undefined,
  removeListener: () => undefined,
} as unknown as MatrixClient;

const room = {
  roomId: '!andromache:example.org',
  getMember: (userId: string) => ({
    userId,
    rawDisplayName: NAMES[userId],
    getMxcAvatarUrl: () => undefined,
  }),
  getTimelineForEvent: () => null,
} as unknown as Room;

const mockEvent = (index: number, sender: string, body: string, state?: boolean): MatrixEvent =>
  ({
    event: {},
    threadRootId: undefined,
    getId: () => `$event${index}`,
    getSender: () => sender,
    getTs: () => Date.now() - (60 - index) * 60000,
    getType: () => (state ? 'm.room.name' : 'm.room.message'),
    getStateKey: () => (state ? '' : undefined),
    getContent: () => (state ? { name: body } : { msgtype: 'm.text', body }),
    isRedacted: () => false,
    isEncrypted: () => false,
  } as unknown as MatrixEvent);

const TEXTS = [
  'Are we still on for the farmers market on Saturday?',
  'Yes! I want to get there before the good bread is gone.',
  'Then we leave at 8, and I will take the tote bags. Last time we carried everything by hand and the peaches did not survive the walk home.',
  'Deal. Can you add eggs to the list?',
  'Added 🥚',
];
const EVENTS = Array.from({ length: 14 }).map((_, i) =>
  mockEvent(i, i % 2 === 0 ? '@andromache:example.org' : MY_ID, TEXTS[i % TEXTS.length])
);
const STATE_EVENT = mockEvent(100, '@andromache:example.org', 'Household', true);

function MockTimeline() {
  const [log, setLog] = useState('Long-press a message');

  return (
    <Box
      direction="Column"
      style={{
        height: '100%',
        backgroundColor: color.Surface.Container,
        color: color.Surface.OnContainer,
      }}
    >
      <Box
        shrink="No"
        style={{
          padding: config.space.S300,
          borderBottom: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
        }}
      >
        <Text id="mock-log" size="T300" priority="300">
          {log}
        </Text>
      </Box>
      <Scroll variant="Surface" visibility="Hover">
        <Box direction="Column" style={{ padding: `${config.space.S600} 0` }}>
          <Event
            room={room}
            mEvent={STATE_EVENT}
            highlight={false}
            messageSpacing={'400' as MessageSpacing}
            canDelete
          >
            <Text size="T300" priority="300" style={{ paddingLeft: config.space.S400 }}>
              Andromache changed the room name to Household
            </Text>
          </Event>
          {EVENTS.map((mEvent) => (
            <Message
              key={mEvent.getId()}
              room={room}
              mEvent={mEvent}
              collapse={false}
              highlight={false}
              canDelete
              canSendReaction
              canPinEvent={false}
              hideReadReceipts
              messageLayout={MessageLayout.Modern}
              messageSpacing={'400' as MessageSpacing}
              onUserClick={() => setLog('user profile')}
              onUsernameClick={() => setLog('username')}
              onReplyClick={(evt, thread) =>
                setLog(`${thread ? 'thread' : 'reply'} ${mEvent.getId()}`)
              }
              onEditId={(id) => id && setLog(`edit ${id}`)}
              onReactionToggle={(id, key) => setLog(`react ${key} ${id}`)}
              hour24Clock={false}
              dateFormatString="D MMM YYYY"
            >
              <MessageTextBody>{mEvent.getContent().body}</MessageTextBody>
            </Message>
          ))}
        </Box>
      </Scroll>
    </Box>
  );
}

// the Android back button, for the console and for scripted checks
(window as any).mockBack = () => handleBackButton(false);

const dark = window.location.search.includes('dark');
document.body.classList.add(
  configClass,
  varsClass,
  ...(dark ? ['dark-theme', darkTheme, onDarkFontWeight] : [lightTheme, onLightFontWeight])
);

const style = document.createElement('style');
style.textContent = `#mock-root { width: 100%; height: 100%; }`;
document.head.appendChild(style);

const portalContainer = document.getElementById('portalContainer') ?? undefined;

createRoot(document.getElementById('mock-root')!).render(
  <SpecVersionsProvider value={{ versions: ['v1.11'] }}>
    <MatrixClientProvider value={mx}>
      <PopOutContainerProvider value={portalContainer}>
        <OverlayContainerProvider value={portalContainer}>
          <MockTimeline />
        </OverlayContainerProvider>
      </PopOutContainerProvider>
    </MatrixClientProvider>
  </SpecVersionsProvider>
);
