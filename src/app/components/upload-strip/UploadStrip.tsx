import React, {
  KeyboardEventHandler,
  ReactNode,
  WheelEventHandler,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
  percent,
  toRem,
} from 'folds';
import * as css from './UploadStrip.css';
import { UploadStatus, useBindUploadAtom } from '../../state/upload';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { TUploadContent, encryptFile } from '../../utils/matrix';
import { bytesToSize, getFileTypeIcon } from '../../utils/common';
import {
  roomUploadAtomFamily,
  TUploadItem,
  TUploadMetadata,
} from '../../state/room/roomInputDrafts';
import { useObjectURL } from '../../hooks/useObjectURL';
import { useMediaConfig } from '../../hooks/useMediaConfig';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { ImageEditorOverlay, ImageEditResult, isEditableImageType } from '../image-editor';
import { BottomSheet, BottomSheetMenu } from '../bottom-sheet';
import { stopPropagation } from '../../utils/keyboard';
import { UploadsProgress, isUploadTooBig } from './uploadSend';

type UploadProgressRingProps = {
  value: number;
  max: number;
  size?: number;
};
/** A ring that fills clockwise from the top; takes the colour of its text. */
export function UploadProgressRing({ value, max, size = 28 }: UploadProgressRingProps) {
  const stroke = Math.max(2, Math.round(size / 9));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = percent(0, max, value) / 100;
  return (
    <svg
      width={toRem(size)}
      height={toRem(size)}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
    >
      <circle
        className={css.ProgressRingTrack}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={css.ProgressRingValue}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
      />
    </svg>
  );
}

type UploadsSendButtonProps = {
  /** set while a send waits for the uploads: the button shows their progress and cancels */
  waiting?: UploadsProgress;
  onSend: () => void;
  onCancel: () => void;
};
/** The composer's Send. */
export function UploadsSendButton({ waiting, onSend, onCancel }: UploadsSendButtonProps) {
  if (waiting) {
    return (
      <IconButton
        onClick={onCancel}
        variant="SurfaceVariant"
        size="300"
        radii="300"
        aria-label="Sending when the uploads finish. Cancel"
      >
        <UploadProgressRing value={waiting.loaded} max={waiting.total} size={20} />
      </IconButton>
    );
  }
  return (
    <IconButton onClick={onSend} variant="SurfaceVariant" size="300" radii="300" aria-label="Send">
      <Icon src={Icons.Send} />
    </IconButton>
  );
}

const fileName = (file: TUploadContent): string => (file instanceof File ? file.name : 'file');

type TileThumbnailProps = {
  fileItem: TUploadItem;
  onDecoded: (decoded: boolean) => void;
};
function TileThumbnail({ fileItem, onDecoded }: TileThumbnailProps) {
  const { originalFile, metadata } = fileItem;
  const url = useObjectURL(originalFile);
  const media = classNames(css.UploadTileMedia, {
    [css.UploadTileSpoiler]: metadata.markedAsSpoiler,
  });

  if (url && originalFile.type.startsWith('image')) {
    return (
      <img
        className={media}
        alt=""
        src={url}
        onLoad={() => onDecoded(true)}
        onError={() => onDecoded(false)}
      />
    );
  }
  if (url && originalFile.type.startsWith('video')) {
    return (
      <>
        {/* the first frame; the fragment makes browsers that wait for play draw one */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video className={media} src={`${url}#t=0.001`} preload="metadata" muted playsInline />
        <span className={css.UploadTilePlay}>
          <Icon src={Icons.Play} size="50" filled />
        </span>
      </>
    );
  }
  return (
    <span className={css.UploadTileFile}>
      <Icon src={getFileTypeIcon(Icons, originalFile.type)} size="300" />
      <Text className={css.UploadTileFileName} as="span" size="T200" truncate>
        {fileName(fileItem.file)}
      </Text>
    </span>
  );
}

type TileAction = {
  label: string;
  icon: typeof Icons[keyof typeof Icons];
  critical?: boolean;
  onSelect: () => void;
};

function TileMenuItems({ actions }: { actions: TileAction[] }) {
  return (
    <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
      {actions.map((action) => (
        <MenuItem
          key={action.label}
          size="300"
          radii="300"
          variant={action.critical ? 'Critical' : 'Surface'}
          fill="None"
          after={<Icon size="100" src={action.icon} />}
          onClick={action.onSelect}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            {action.label}
          </Text>
        </MenuItem>
      ))}
    </Box>
  );
}

type UploadTileProps = {
  isEncrypted?: boolean;
  fileItem: TUploadItem;
  setMetadata: (fileItem: TUploadItem, metadata: TUploadMetadata) => void;
  /** swaps the item for its edited image; static images get Edit with it */
  onReplace?: (fileItem: TUploadItem, replacement: TUploadItem) => void;
  onRemove: (file: TUploadContent) => void;
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
};

/**
 * One attachment: a square thumbnail that uploads itself, with an ✕ to remove it and a menu (a
 * sheet on a phone) to edit, mark as spoiler, retry or remove it.
 */
function UploadTile({
  isEncrypted,
  fileItem,
  setMetadata,
  onReplace,
  onRemove,
  menuOpen,
  onMenuOpen,
}: UploadTileProps) {
  const mx = useMatrixClient();
  const mediaConfig = useMediaConfig();
  const allowSize = mediaConfig['m.upload.size'] || Infinity;
  const screenSize = useScreenSizeContext();

  const uploadAtom = roomUploadAtomFamily(fileItem.file);
  const { metadata } = fileItem;
  const { upload, startUpload, cancelUpload } = useBindUploadAtom(mx, uploadAtom, isEncrypted);
  const { file } = upload;
  const fileSizeExceeded = isUploadTooBig(file, allowSize);
  const name = fileName(file);

  if (upload.status === UploadStatus.Idle && !fileSizeExceeded) {
    startUpload();
  }

  // edits always start from the untouched source
  const editSource = fileItem.edit?.source ?? fileItem.originalFile;
  const [decoded, setDecoded] = useState(false);
  const [editing, setEditing] = useState(false);
  const canEdit = !!onReplace && decoded && isEditableImageType(editSource.type);

  const handleEdited = async (result: ImageEditResult | undefined) => {
    setEditing(false);
    // unedited and never edited: nothing to swap
    if (!result && !fileItem.edit) return;
    const edited = result?.file ?? editSource;
    await cancelUpload();
    const content = fileItem.encInfo
      ? await encryptFile(edited)
      : { file: edited, originalFile: edited, encInfo: undefined };
    onReplace?.(fileItem, {
      ...content,
      metadata: fileItem.metadata,
      edit: result ? { source: editSource, state: result.state } : undefined,
    });
  };

  const removeUpload = () => {
    cancelUpload();
    onRemove(file);
  };

  const tileRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<RectCords>();
  useLayoutEffect(() => {
    const tile = tileRef.current;
    if (!menuOpen || !tile) {
      setAnchor(undefined);
      return;
    }
    tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setAnchor(tile.getBoundingClientRect());
  }, [menuOpen]);

  const isMedia =
    fileItem.originalFile.type.startsWith('image') ||
    fileItem.originalFile.type.startsWith('video');
  const uploading = upload.status === UploadStatus.Loading || upload.status === UploadStatus.Idle;
  const failed = upload.status === UploadStatus.Error || fileSizeExceeded;
  const loaded = upload.status === UploadStatus.Loading ? upload.progress.loaded : 0;

  let status: ReactNode;
  if (fileSizeExceeded) {
    status = (
      <>
        The file size exceeds the limit. Maximum allowed size is <b>{bytesToSize(allowSize)}</b>,
        but the uploaded file is <b>{bytesToSize(file.size)}</b>.
      </>
    );
  } else if (upload.status === UploadStatus.Error) {
    status = `Upload failed: ${upload.error.message}`;
  } else if (upload.status === UploadStatus.Success) {
    status = `Uploaded · ${bytesToSize(file.size)}`;
  } else {
    status = `Uploading ${Math.round(percent(0, file.size, loaded))}% · ${bytesToSize(
      loaded
    )} / ${bytesToSize(file.size)}`;
  }
  let statusLabel = 'uploaded';
  if (failed) statusLabel = 'can not be sent';
  else if (uploading) statusLabel = 'uploading';

  const closeMenuThen = (action: () => void) => () => {
    onMenuOpen(false);
    action();
  };
  const actions: TileAction[] = [];
  if (canEdit) {
    actions.push({
      label: fileItem.edit ? 'Edit again' : 'Edit',
      icon: Icons.Pencil,
      onSelect: closeMenuThen(() => setEditing(true)),
    });
  }
  if (isMedia) {
    actions.push({
      label: metadata.markedAsSpoiler ? 'Unmark spoiler' : 'Mark as spoiler',
      icon: metadata.markedAsSpoiler ? Icons.Eye : Icons.EyeBlind,
      onSelect: closeMenuThen(() =>
        setMetadata(fileItem, { ...metadata, markedAsSpoiler: !metadata.markedAsSpoiler })
      ),
    });
  }
  if (upload.status === UploadStatus.Error) {
    actions.push({
      label: 'Retry upload',
      icon: Icons.Reload,
      onSelect: closeMenuThen(startUpload),
    });
  }
  actions.push({
    label: 'Remove',
    icon: Icons.Delete,
    critical: true,
    onSelect: closeMenuThen(removeUpload),
  });

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      onMenuOpen(true);
      return;
    }
    if (evt.key === 'Delete' || evt.key === 'Backspace') {
      evt.preventDefault();
      // keep the keyboard in the strip: the next tile, else the one before
      const wrap = evt.currentTarget.parentElement;
      const neighbour = (
        wrap?.nextElementSibling ?? wrap?.previousElementSibling
      )?.querySelector<HTMLElement>('[role="button"]');
      removeUpload();
      neighbour?.focus();
    }
  };

  const menuHeader = (
    <>
      <Text size="L400" truncate style={{ maxWidth: '100%' }}>
        {name}
      </Text>
      <Text size="T200" className={failed ? css.UploadMenuError : undefined} priority="300">
        {status}
      </Text>
    </>
  );

  return (
    <div className={css.UploadTile} role="listitem" data-upload-tile={name}>
      <div
        ref={tileRef}
        className={classNames(css.UploadTileFace, { [css.UploadTileFailed]: failed })}
        role="button"
        tabIndex={0}
        aria-label={`${name}, ${statusLabel}${fileItem.edit ? ', edited' : ''}${
          metadata.markedAsSpoiler ? ', spoiler' : ''
        }`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => onMenuOpen(true)}
        onKeyDown={handleKeyDown}
      >
        <TileThumbnail fileItem={fileItem} onDecoded={setDecoded} />
        {uploading && !fileSizeExceeded && (
          <span className={css.UploadTileScrim}>
            <UploadProgressRing value={loaded} max={file.size} />
          </span>
        )}
        {failed && (
          <span className={css.UploadTileScrim}>
            <Icon className={css.UploadTileFailedMark} src={Icons.Warning} size="200" filled />
          </span>
        )}
        {(fileItem.edit || metadata.markedAsSpoiler) && (
          <span className={css.UploadTileBadges}>
            {metadata.markedAsSpoiler && (
              <span className={classNames(css.UploadTileBadge, css.UploadTileBadgeSpoiler)}>
                Spoiler
              </span>
            )}
            {fileItem.edit && (
              <span className={classNames(css.UploadTileBadge, css.UploadTileBadgeEdited)}>
                Edited
              </span>
            )}
          </span>
        )}
      </div>
      <button
        type="button"
        className={css.UploadTileRemove}
        tabIndex={-1}
        aria-label={`Remove ${name}`}
        onClick={removeUpload}
      >
        <span className={css.UploadTileRemoveCircle}>
          <Icon src={Icons.Cross} size="50" />
        </span>
      </button>
      {menuOpen && screenSize === ScreenSize.Mobile && (
        <BottomSheet
          open
          requestClose={() => onMenuOpen(false)}
          aria-label={`${name} options`}
          header={<span className={css.UploadMenuSheetHeader}>{menuHeader}</span>}
        >
          <BottomSheetMenu iconLeading>
            <TileMenuItems actions={actions} />
          </BottomSheetMenu>
        </BottomSheet>
      )}
      {screenSize !== ScreenSize.Mobile && (
        <PopOut
          anchor={anchor}
          position="Top"
          align="Start"
          offset={8}
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => onMenuOpen(false),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu
                style={{ minWidth: toRem(200), maxWidth: toRem(280) }}
                aria-label={`${name} options`}
              >
                <div className={css.UploadMenuHeader}>{menuHeader}</div>
                <TileMenuItems actions={actions} />
              </Menu>
            </FocusTrap>
          }
        />
      )}
      {editing && (
        <ImageEditorOverlay
          source={editSource}
          name={editSource instanceof File ? editSource.name : name}
          initialState={fileItem.edit?.state}
          onDone={handleEdited}
          requestClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// tiles keep their identity across removals and edits of the others
const tileKeys = new WeakMap<TUploadContent, number>();
let nextTileKey = 0;
const tileKey = (file: TUploadContent): number => {
  let key = tileKeys.get(file);
  if (key === undefined) {
    nextTileKey += 1;
    key = nextTileKey;
    tileKeys.set(file, key);
  }
  return key;
};

export type UploadStripHandle = {
  /** brings a tile into view with its menu open, which says why it can't be sent */
  reveal: (file: TUploadContent) => void;
};

type UploadStripProps = {
  items: TUploadItem[];
  setMetadata: (fileItem: TUploadItem, metadata: TUploadMetadata) => void;
  onReplace?: (fileItem: TUploadItem, replacement: TUploadItem) => void;
  onRemove: (file: TUploadContent) => void;
};

/**
 * The attachments along the top of the composer: one row of tiles, scrolling sideways.
 */
export const UploadStrip = forwardRef<UploadStripHandle, UploadStripProps>(
  ({ items, setMetadata, onReplace, onRemove }, ref) => {
    const stripRef = useRef<HTMLDivElement>(null);
    const [menuFile, setMenuFile] = useState<TUploadContent>();

    useImperativeHandle(ref, () => ({ reveal: setMenuFile }), []);

    // a new attachment comes in at the end: show it
    const countRef = useRef(items.length);
    useEffect(() => {
      const strip = stripRef.current;
      if (strip && items.length > countRef.current) {
        strip.scrollLeft = strip.scrollWidth;
      }
      countRef.current = items.length;
    }, [items.length]);

    // a mouse wheel scrolls the row
    const handleWheel: WheelEventHandler<HTMLDivElement> = (evt) => {
      const strip = evt.currentTarget;
      if (Math.abs(evt.deltaY) <= Math.abs(evt.deltaX)) return;
      if (strip.scrollWidth <= strip.clientWidth) return;
      strip.scrollLeft += evt.deltaY;
    };

    return (
      <div
        ref={stripRef}
        className={css.UploadStrip}
        role="list"
        aria-label="Attachments"
        onWheel={handleWheel}
      >
        {items.map((fileItem) => (
          <UploadTile
            key={tileKey(fileItem.file)}
            isEncrypted={!!fileItem.encInfo}
            fileItem={fileItem}
            setMetadata={setMetadata}
            onReplace={onReplace}
            onRemove={onRemove}
            menuOpen={menuFile === fileItem.file}
            onMenuOpen={(open) => setMenuFile(open ? fileItem.file : undefined)}
          />
        ))}
      </div>
    );
  }
);
