// Mock of the composer's attachments with the image editor, rendered with the real CustomEditor,
// UploadStrip, Send button and ImageEditor, and the composer's own useComposerUploads, on an
// in-memory client. Uploads take ?uploadMs (default 1500) and can be cancelled; a file whose name
// has "fail" in it fails its first upload. Send builds the real message contents.
// Open /mock-image-editor.html on the vite dev server. Parameters: ?dark for the dark theme,
// ?encrypted for an encrypted room, ?set=one|four|eight|failed|big|empty for the attachments it
// starts with (default: the four images of the editor checks), ?editor=avatar for the editor
// alone with the square crop and round mask the avatar ticket needs. Not part of the app build.
import React, {
  ChangeEvent,
  ComponentProps,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  OverlayContainerProvider,
  PopOutContainerProvider,
  Text,
  color,
  config,
  configClass,
  varsClass,
} from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { irisDarkTheme, irisLightTheme } from '../colors.css';
import { MatrixClientProvider } from '../app/hooks/useMatrixClient';
import { SpecVersionsProvider } from '../app/hooks/useSpecVersions';
import { MediaConfigProvider } from '../app/hooks/useMediaConfig';
import { ScreenSizeProvider, useScreenSize } from '../app/hooks/useScreenSize';
import {
  UploadStrip,
  UploadStripHandle,
  UploadsSendButton,
  useSendAfterUploads,
} from '../app/components/upload-strip';
import { CustomEditor, resetEditor, toPlainText, useEditor } from '../app/components/editor';
import { ImageEditorOverlay } from '../app/components/image-editor';
import { TUploadItem } from '../app/state/room/roomInputDrafts';
import { decryptFile } from '../app/utils/matrix';
import { useComposerUploads } from '../app/features/room/useComposerUploads';
import { handleBackButton } from '../app/native/backButton';

type Client = ComponentProps<typeof MatrixClientProvider>['value'];

const params = new URLSearchParams(window.location.search);
const uploadMs = Number(params.get('uploadMs') ?? 1500);
const encrypted = params.has('encrypted');
const ROOM_ID = encrypted ? '!encrypted:mock' : '!plain:mock';

const later = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

// ---- the in-memory client: uploads are kept by mxc, and can be cancelled

type MockState = {
  /** holds every upload where it is, for screenshots */
  paused: boolean;
  uploads: Record<string, Blob>;
  cancelled: number;
  sent: Record<string, unknown>[];
  items: () => TUploadItem[];
  decrypt: (mxc: string, item: Record<string, unknown>) => Promise<Blob>;
};
const mock: MockState = {
  paused: false,
  uploads: {},
  cancelled: 0,
  sent: [],
  items: () => [],
  decrypt: async () => new Blob(),
};
(window as unknown as { mock: MockState }).mock = mock;

let uploadCount = 0;
const failedOnce = new Set<string>();
const cancels = new Map<Promise<unknown>, () => void>();
const mx = {
  getUserId: () => '@hector:example.org',
  getSafeUserId: () => '@hector:example.org',
  uploadContent: (file: Blob, opts?: { progressHandler?: (p: unknown) => void }) => {
    let cancelled = false;
    let reject: (e: Error) => void = () => undefined;
    const promise = new Promise<{ content_uri: string }>((resolve, rej) => {
      reject = rej;
      (async () => {
        const steps = 10;
        const name = file instanceof File ? file.name : '';
        for (let i = 1; i <= steps; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await later(uploadMs / steps);
          // eslint-disable-next-line no-await-in-loop
          while (mock.paused && !cancelled) await later(50);
          if (cancelled) return;
          if (i === 4 && name.includes('fail') && !failedOnce.has(name)) {
            failedOnce.add(name);
            rej(new Error('The server hung up'));
            return;
          }
          opts?.progressHandler?.({ loaded: (file.size * i) / steps, total: file.size });
        }
        uploadCount += 1;
        const mxc = `mxc://mock/upload${uploadCount}`;
        mock.uploads[mxc] = file;
        resolve({ content_uri: mxc });
      })();
    });
    cancels.set(promise, () => {
      cancelled = true;
      mock.cancelled += 1;
      reject(new Error('Upload cancelled'));
    });
    return promise;
  },
  cancelUpload: (promise: Promise<unknown>) => {
    cancels.get(promise)?.();
    return true;
  },
  mxcUrlToHttp: () => null,
  on: () => undefined,
  removeListener: () => undefined,
} as unknown as Client;

mock.decrypt = async (mxc, content) => {
  const blob = mock.uploads[mxc];
  const info = content.info as { mimetype: string };
  const file = content.file as Parameters<typeof decryptFile>[2] | undefined;
  if (!file) return blob;
  return decryptFile(await blob.arrayBuffer(), info.mimetype, file);
};

// ---- sample files

const canvasBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b as Blob), type, 0.9);
  });

/** a 1600 × 1200 "photo" with a marked corner in each quadrant, so turns and crops show */
const makePhoto = async (): Promise<File> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const sky = ctx.createLinearGradient(0, 0, 0, 1200);
  sky.addColorStop(0, '#6CA6E8');
  sky.addColorStop(0.6, '#F5D3A0');
  sky.addColorStop(1, '#4C8A4A');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1600, 1200);
  ctx.fillStyle = '#FFC53D';
  ctx.beginPath();
  ctx.arc(1150, 360, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2F5E2E';
  ctx.beginPath();
  ctx.moveTo(0, 1000);
  ctx.quadraticCurveTo(500, 700, 900, 950);
  ctx.quadraticCurveTo(1300, 1150, 1600, 900);
  ctx.lineTo(1600, 1200);
  ctx.lineTo(0, 1200);
  ctx.fill();
  const corners: [string, number, number, string][] = [
    ['TL', 0, 0, '#E5484D'],
    ['TR', 1400, 0, '#3E63DD'],
    ['BL', 0, 1000, '#FFFFFF'],
    ['BR', 1400, 1000, '#111111'],
  ];
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  corners.forEach(([label, x, y, fill]) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, 200, 200);
    ctx.fillStyle = fill === '#FFFFFF' ? '#111111' : '#FFFFFF';
    ctx.fillText(label, x + 100, y + 100);
  });
  return new File([await canvasBlob(canvas, 'image/jpeg')], 'garden.jpg', { type: 'image/jpeg' });
};

const GIF_1PX = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const makeGif = () =>
  new File([Uint8Array.from(atob(GIF_1PX), (c) => c.charCodeAt(0))], 'party.gif', {
    type: 'image/gif',
  });
const makeSvg = () =>
  new File(
    [
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="48" r="40" fill="#C7A3F0"/></svg>',
    ],
    'logo.svg',
    { type: 'image/svg+xml' }
  );
// bytes no browser here decodes, like a HEIC photo in the Android WebView
const makeHeic = () =>
  new File([new Uint8Array(4096).fill(7)], 'IMG_0042.heic', { type: 'image/heic' });

/** an 800 × 600 picture in one colour with its label, for the longer rows */
const makeSwatch = async (name: string, fill: string): Promise<File> => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 160px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 2).toUpperCase(), 400, 300);
  return new File([await canvasBlob(canvas, 'image/jpeg')], name, { type: 'image/jpeg' });
};

/** a short WebM clip recorded from a canvas, so the tile has a first frame to show */
const makeVideo = (): Promise<File> =>
  new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (evt) => chunks.push(evt.data);
    recorder.onstop = () => resolve(new File(chunks, 'birthday.webm', { type: 'video/webm' }));
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = '#3E63DD';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#FFC53D';
      ctx.beginPath();
      ctx.arc(60 + frame * 4, 120, 50, 0, Math.PI * 2);
      ctx.fill();
      frame += 1;
    };
    draw();
    recorder.start();
    const timer = window.setInterval(draw, 33);
    window.setTimeout(() => {
      window.clearInterval(timer);
      recorder.stop();
    }, 600);
  });

/** a second of silence as WAV */
const makeAudio = (): File => {
  const rate = 8000;
  const buffer = new ArrayBuffer(44 + rate);
  const view = new DataView(buffer);
  const text = (at: number, value: string) =>
    value.split('').forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + rate, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, rate, true);
  new Uint8Array(buffer, 44).fill(128);
  return new File([buffer], 'voice-note.wav', { type: 'audio/wav' });
};

const makePdf = () =>
  new File(['%PDF-1.4\n% mock\n'], 'household-budget-2026.pdf', { type: 'application/pdf' });

const UPLOAD_LIMIT = 50 * 1024 * 1024;
// over the mock server's limit
const makeBig = () =>
  new File([new Uint8Array(UPLOAD_LIMIT + 1024 * 1024)], 'photos-backup.zip', {
    type: 'application/zip',
  });

const SWATCHES: [string, string][] = [
  ['autumn.jpg', '#C2410C'],
  ['beach.jpg', '#0EA5E9'],
  ['cat.jpg', '#7C3AED'],
  ['dinner.jpg', '#15803D'],
  ['forest.jpg', '#166534'],
  ['kitchen.jpg', '#B45309'],
  ['lake.jpg', '#1D4ED8'],
];

const makeSet = async (set: string | null): Promise<File[]> => {
  if (set === 'one') return [await makePhoto()];
  if (set === 'four') return [await makePhoto(), await makeVideo(), makeAudio(), makePdf()];
  if (set === 'eight') {
    return [
      await makePhoto(),
      ...(await Promise.all(SWATCHES.map(([name, fill]) => makeSwatch(name, fill)))),
    ];
  }
  if (set === 'failed') return [await makePhoto(), await makeSwatch('fail-upload.jpg', '#E5484D')];
  if (set === 'big') return [await makePhoto(), makeBig()];
  return [makeHeic(), makeSvg(), makeGif(), await makePhoto()];
};

// ---- the composer, wired like RoomInput

function MockComposer() {
  const editor = useEditor();
  const uploads = useComposerUploads(ROOM_ID);
  const stripRef = useRef<UploadStripHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [log, setLog] = useState('Nothing sent yet');
  mock.items = () => uploads.items;

  const { addFiles } = uploads;
  useEffect(() => {
    if (params.get('set') === 'empty') return;
    makeSet(params.get('set')).then((files) => addFiles(files, encrypted));
  }, [addFiles]);

  // RoomInput's send: the attachments, then the text
  const sendDraft = () => {
    const uploadContents = uploads.takeContents();
    const text = toPlainText(editor.children, false).trim();
    resetEditor(editor);
    uploadContents.then((contents) => {
      const sent = [
        ...(contents as Record<string, unknown>[]),
        ...(text ? [{ msgtype: 'm.text', body: text }] : []),
      ];
      mock.sent.push(...sent);
      setLog(`sent ${sent.map((c) => c.body).join(', ')}`);
    });
  };
  const { pending, request, cancel } = useSendAfterUploads(uploads.summary, sendDraft, (file) =>
    stripRef.current?.reveal(file)
  );

  const handleKeyDown = (evt: KeyboardEvent) => {
    if (evt.key === 'Enter' && !evt.shiftKey) {
      evt.preventDefault();
      request();
    }
  };

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
        direction="Column"
        style={{
          padding: config.space.S300,
          borderBottom: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
        }}
      >
        <Text size="H5">{encrypted ? 'Household (encrypted)' : 'Household'}</Text>
        <Text id="mock-log" size="T200" priority="300">
          {log}
        </Text>
      </Box>
      <Box grow="Yes" />
      <input
        ref={inputRef}
        id="mock-file"
        type="file"
        multiple
        hidden
        onChange={(evt: ChangeEvent<HTMLInputElement>) => {
          addFiles(Array.from(evt.target.files ?? []), encrypted);
          // eslint-disable-next-line no-param-reassign
          evt.target.value = '';
        }}
      />
      <Box
        shrink="No"
        direction="Column"
        style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}
      >
        <CustomEditor
          editableName="RoomInput"
          editor={editor}
          placeholder="Send a message..."
          onKeyDown={handleKeyDown}
          top={
            uploads.items.length > 0 && (
              <UploadStrip
                ref={stripRef}
                items={uploads.items}
                setMetadata={uploads.setMetadata}
                onReplace={uploads.replace}
                onRemove={uploads.remove}
              />
            )
          }
          before={
            <IconButton
              onClick={() => inputRef.current?.click()}
              variant="SurfaceVariant"
              size="300"
              radii="300"
              aria-label="Attach"
            >
              <Icon src={Icons.PlusCircle} />
            </IconButton>
          }
          after={
            <UploadsSendButton
              waiting={
                pending && uploads.summary.state === 'running'
                  ? uploads.summary.progress
                  : undefined
              }
              onSend={request}
              onCancel={cancel}
            />
          }
        />
      </Box>
    </Box>
  );
}

// ---- the editor alone, with the avatar options

function MockAvatarEditor() {
  const [source, setSource] = useState<File>();
  const [log, setLog] = useState('editing');
  useEffect(() => {
    makePhoto().then(setSource);
  }, []);
  return (
    <Box direction="Column" style={{ height: '100%', padding: config.space.S300 }}>
      <Text id="mock-log" size="T300">
        {log}
      </Text>
      {source && log === 'editing' && (
        <ImageEditorOverlay
          source={source}
          name={source.name}
          aspect={1}
          round
          onDone={(result) => {
            (window as unknown as { avatarResult: unknown }).avatarResult = result;
            setLog(result ? `done ${result.file.name}` : 'done unedited');
          }}
          requestClose={() => setLog('closed')}
        />
      )}
    </Box>
  );
}

function MockApp() {
  const screenSize = useScreenSize();
  return (
    <ScreenSizeProvider value={screenSize}>
      {params.get('editor') === 'avatar' ? <MockAvatarEditor /> : <MockComposer />}
    </ScreenSizeProvider>
  );
}

// the Android back button, for the console and for scripted checks
(window as unknown as { mockBack: () => void }).mockBack = () => handleBackButton(false);

const dark = params.has('dark');
document.body.classList.add(
  configClass,
  varsClass,
  ...(dark
    ? ['iris-dark-theme', irisDarkTheme, onDarkFontWeight]
    : ['iris-light-theme', irisLightTheme, onLightFontWeight])
);

const style = document.createElement('style');
style.textContent = `#mock-root { width: 100%; height: 100%; }`;
document.head.appendChild(style);

const portalContainer = document.getElementById('portalContainer') ?? undefined;

createRoot(document.getElementById('mock-root') as HTMLElement).render(
  <SpecVersionsProvider value={{ versions: ['v1.11'] }}>
    <MediaConfigProvider value={{ 'm.upload.size': UPLOAD_LIMIT }}>
      <MatrixClientProvider value={mx}>
        <PopOutContainerProvider value={portalContainer}>
          <OverlayContainerProvider value={portalContainer}>
            <MockApp />
          </OverlayContainerProvider>
        </PopOutContainerProvider>
      </MatrixClientProvider>
    </MediaConfigProvider>
  </SpecVersionsProvider>
);
