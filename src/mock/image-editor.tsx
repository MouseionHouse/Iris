// Mock of the upload board with the image editor, rendered with the real UploadBoard,
// UploadCardRenderer and ImageEditor on an in-memory client. Uploads take ?uploadMs (default
// 1500) and can be cancelled; Send builds the real image message content.
// Open /mock-image-editor.html on the vite dev server. Parameters: ?dark for the dark theme,
// ?encrypted for an encrypted room, ?editor=avatar for the avatar flow: Upload avatar, the square crop
// editor, the compact upload card. Not part of the app build.
import React, {
  ChangeEvent,
  ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { useAtom } from 'jotai';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Box,
  Button,
  OverlayContainerProvider,
  PopOutContainerProvider,
  Scroll,
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
import { CompactUploadCardRenderer, UploadCardRenderer } from '../app/components/upload-card';
import {
  UploadBoard,
  UploadBoardContent,
  UploadBoardHeader,
  UploadBoardImperativeHandlers,
} from '../app/components/upload-board';
import { useAvatarPicker } from '../app/hooks/useAvatarPicker';
import {
  TUploadItem,
  TUploadMetadata,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
} from '../app/state/room/roomInputDrafts';
import {
  Upload,
  UploadStatus,
  UploadSuccess,
  createUploadAtom,
  createUploadFamilyObserverAtom,
} from '../app/state/upload';
import { TUploadContent, decryptFile, encryptFile } from '../app/utils/matrix';
import { safeFile } from '../app/utils/mimeTypes';
import { fulfilledPromiseSettledResult } from '../app/utils/common';
import { getImageMsgContent } from '../app/features/room/msgContent';
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
  uploads: Record<string, Blob>;
  cancelled: number;
  sent: Record<string, unknown>[];
  items: () => TUploadItem[];
  decrypt: (mxc: string, item: Record<string, unknown>) => Promise<Blob>;
};
const mock: MockState = {
  uploads: {},
  cancelled: 0,
  sent: [],
  items: () => [],
  decrypt: async () => new Blob(),
};
(window as unknown as { mock: MockState }).mock = mock;

let uploadCount = 0;
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
        const steps = 5;
        for (let i = 1; i <= steps; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await later(uploadMs / steps);
          if (cancelled) return;
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

// ---- the composer's upload board, wired like RoomInput

function MockComposer() {
  const [items, setItems] = useAtom(roomIdToUploadItemsAtomFamily(ROOM_ID));
  const [log, setLog] = useState('Nothing sent yet');
  const [open, setOpen] = useState(true);
  const handlers = useRef<UploadBoardImperativeHandlers>();
  const inputRef = useRef<HTMLInputElement>(null);
  const observer = createUploadFamilyObserverAtom(
    roomUploadAtomFamily,
    items.map((f) => f.file)
  );
  mock.items = () => items;

  const handleFiles = useCallback(
    async (files: File[]) => {
      const safeFiles = files.map(safeFile);
      const fileItems: TUploadItem[] = encrypted
        ? fulfilledPromiseSettledResult(
            await Promise.allSettled(safeFiles.map((f) => encryptFile(f)))
          ).map((ef) => ({ ...ef, metadata: { markedAsSpoiler: false } }))
        : safeFiles.map((f) => ({
            file: f,
            originalFile: f,
            encInfo: undefined,
            metadata: { markedAsSpoiler: false },
          }));
      setItems({ type: 'PUT', item: fileItems });
    },
    [setItems]
  );

  useEffect(() => {
    if (params.has('empty')) return;
    makePhoto().then((photo) => handleFiles([makeHeic(), makeSvg(), makeGif(), photo]));
  }, [handleFiles]);

  const handleMetadata = (fileItem: TUploadItem, metadata: TUploadMetadata) =>
    setItems({ type: 'REPLACE', item: fileItem, replacement: { ...fileItem, metadata } });
  const handleReplace = (fileItem: TUploadItem, replacement: TUploadItem) => {
    setItems({ type: 'REPLACE', item: fileItem, replacement });
    roomUploadAtomFamily.remove(fileItem.file);
  };
  const handleRemove = (upload: TUploadContent | TUploadContent[]) => {
    const uploads = Array.isArray(upload) ? upload : [upload];
    setItems({ type: 'DELETE', item: items.filter((f) => uploads.includes(f.file)) });
    uploads.forEach((u) => roomUploadAtomFamily.remove(u));
  };
  const handleCancel = (uploads: Upload[]) => {
    uploads.forEach((u) => {
      if (u.status === UploadStatus.Loading) mx.cancelUpload(u.promise);
    });
    handleRemove(uploads.map((u) => u.file));
  };
  const handleSend = async (uploads: UploadSuccess[]) => {
    const contents = await Promise.all(
      uploads.map(async (upload) => {
        const fileItem = items.find((f) => f.file === upload.file);
        if (!fileItem) throw new Error('Broken upload');
        if (!fileItem.file.type.startsWith('image')) {
          return { msgtype: 'm.file', body: fileItem.file.name, url: upload.mxc };
        }
        return getImageMsgContent(mx, fileItem, upload.mxc);
      })
    );
    handleCancel(uploads);
    mock.sent.push(...contents);
    setLog(`sent ${contents.map((c) => c.body).join(', ')}`);
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
        alignItems="Center"
        gap="200"
        style={{
          padding: config.space.S300,
          borderBottom: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
        }}
      >
        <Box grow="Yes" direction="Column">
          <Text size="H5">{encrypted ? 'Household (encrypted)' : 'Household'}</Text>
          <Text id="mock-log" size="T200" priority="300">
            {log}
          </Text>
        </Box>
        <input
          ref={inputRef}
          id="mock-file"
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(evt: ChangeEvent<HTMLInputElement>) => {
            handleFiles(Array.from(evt.target.files ?? []));
            // eslint-disable-next-line no-param-reassign
            evt.target.value = '';
          }}
        />
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          onClick={() => inputRef.current?.click()}
        >
          <Text size="B300">Attach</Text>
        </Button>
      </Box>
      <Box grow="Yes" />
      <Box shrink="No" direction="Column" style={{ padding: config.space.S200 }}>
        {items.length > 0 && (
          <UploadBoard
            header={
              <UploadBoardHeader
                open={open}
                onToggle={() => setOpen(!open)}
                uploadFamilyObserverAtom={observer}
                onSend={handleSend}
                imperativeHandlerRef={handlers}
                onCancel={handleCancel}
              />
            }
          >
            {open && (
              <Scroll size="300" hideTrack visibility="Hover">
                <UploadBoardContent>
                  {Array.from(items)
                    .reverse()
                    .map((fileItem, index) => (
                      <UploadCardRenderer
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        isEncrypted={!!fileItem.encInfo}
                        fileItem={fileItem}
                        setMetadata={handleMetadata}
                        onReplace={handleReplace}
                        onRemove={handleRemove}
                      />
                    ))}
                </UploadBoardContent>
              </Scroll>
            )}
          </UploadBoard>
        )}
        <Box
          alignItems="Center"
          style={{
            marginTop: config.space.S200,
            padding: config.space.S300,
            borderRadius: config.radii.R400,
            backgroundColor: color.SurfaceVariant.Container,
          }}
        >
          <Text size="T300" priority="300" style={{ flexGrow: 1 }}>
            Send a message…
          </Text>
          <Button size="300" variant="Primary" onClick={() => handlers.current?.handleSend()}>
            <Text size="B300">Send</Text>
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// ---- the avatar flow: the real picker hook, editor and compact upload card

function MockAvatarFlow() {
  const [file, setFile] = useState<File>();
  const [log, setLog] = useState('idle');
  const uploadAtom = useMemo(() => (file ? createUploadAtom(file) : undefined), [file]);
  const [pickAvatar, avatarEditor] = useAvatarPicker(setFile);
  return (
    <Box direction="Column" gap="300" style={{ height: '100%', padding: config.space.S300 }}>
      <Text id="mock-log" size="T300">
        {log}
      </Text>
      {uploadAtom ? (
        <CompactUploadCardRenderer
          uploadAtom={uploadAtom}
          onRemove={() => {
            setFile(undefined);
            setLog('removed');
          }}
          onComplete={(upload) => {
            (window as unknown as { avatarSet: unknown }).avatarSet = upload.file;
            setFile(undefined);
            setLog(`set ${upload.file.name} ${upload.file.type}`);
          }}
        />
      ) : (
        <Box>
          <Button onClick={pickAvatar}>
            <Text size="B300">Upload avatar</Text>
          </Button>
        </Box>
      )}
      {avatarEditor}
    </Box>
  );
}

function MockApp() {
  const screenSize = useScreenSize();
  return (
    <ScreenSizeProvider value={screenSize}>
      {params.get('editor') === 'avatar' ? <MockAvatarFlow /> : <MockComposer />}
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
    <MediaConfigProvider value={{ 'm.upload.size': 50 * 1024 * 1024 }}>
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
