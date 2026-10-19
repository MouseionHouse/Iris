import React, {
  ComponentProps,
  FormEventHandler,
  KeyboardEventHandler,
  ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Menu,
  MenuItem,
  Scroll,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import {
  createRoomPack,
  enableGlobalPack,
  getPackLabel,
  ImagePack,
  ImageUsage,
  imageUsageEqual,
  normalizeShortcode,
  PackAddress,
  PackImageReader,
  packKey,
  shortcodeError,
  updatePack,
  withImage,
  withoutImage,
} from '../../../plugins/custom-emoji';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { getPowersLevelFromMatrixEvent } from '../../../hooks/usePowerLevels';
import { getRoomPermissionsAPI } from '../../../hooks/useRoomPermissions';
import { getRoomCreatorsForRoomId } from '../../../hooks/useRoomCreators';
import { StateEvent } from '../../../../types/matrix/room';
import { getStateEvent } from '../../../utils/room';
import { editableActiveElement } from '../../../utils/dom';
import * as css from './styles.css';

type Client = ReturnType<typeof useMatrixClient>;
type PackRoom = { roomId: string; name: string; isSpaceRoom: () => boolean };

export const canEditRoomPacks = (mx: Client, roomId: string): boolean => {
  const room = mx.getRoom(roomId);
  const userId = mx.getUserId();
  if (!room || !userId || room.getMyMembership() !== 'join') return false;
  const powerLevels = getPowersLevelFromMatrixEvent(
    getStateEvent(room, StateEvent.RoomPowerLevels)
  );
  return getRoomPermissionsAPI(getRoomCreatorsForRoomId(mx, roomId), powerLevels).stateEvent(
    StateEvent.PoniesRoomEmotes,
    userId
  );
};

const errorMessage = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'Something went wrong';

/**
 * Copy a sticker into another pack, and for a move remove it from its pack after the copy is
 * written. Resolves to a message saying what happened; a move whose removal failed resolves too,
 * with `partial` set, since the copy stays.
 */
export const transferSticker = async (
  mx: Client,
  source: ImagePack,
  image: PackImageReader,
  target: ImagePack,
  shortcode: string,
  move: boolean
): Promise<{ message: string; partial?: boolean }> => {
  const usage = image.usage ?? source.meta.usage;
  const content = {
    ...image.content,
    usage: imageUsageEqual(usage, target.meta.usage) ? undefined : usage,
  };
  const targetLabel = getPackLabel(mx, target);
  await updatePack(mx, target.address, (c) => withImage(c, shortcode, content));
  if (!move) return { message: `Copied “${shortcode}” to ${targetLabel}` };
  try {
    await updatePack(mx, source.address, (c) => withoutImage(c, image.shortcode));
  } catch {
    return {
      message: `Copied “${shortcode}” to ${targetLabel}, but couldn’t remove it from ${getPackLabel(
        mx,
        source
      )}`,
      partial: true,
    };
  }
  return { message: `Moved “${shortcode}” to ${targetLabel}` };
};

type NameFieldProps = {
  defaultValue: string;
  label: string;
  normalize?: (value: string) => string;
  validate: (value: string) => string | undefined;
  saveLabel?: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
};
/**
 * A name input that saves on Enter or Save and cancels on Esc, with the error under it.
 */
export function NameField({
  defaultValue,
  label,
  normalize = (v) => v.trim(),
  validate,
  saveLabel = 'Save',
  onSave,
  onCancel,
}: NameFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const name = normalize(value);
  const unchanged = name === defaultValue;
  const error = validate(name);

  const [saveState, save] = useAsyncCallback(useCallback(() => onSave(name), [onSave, name]));
  const saving = saveState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler = (evt) => {
    evt.preventDefault();
    if (saving || error) return;
    if (unchanged) {
      onCancel();
      return;
    }
    save().catch(() => undefined);
  };

  const handleKeyDown: KeyboardEventHandler = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      onCancel();
    }
  };

  const shownError =
    error ?? (saveState.status === AsyncStatus.Error ? errorMessage(saveState.error) : undefined);

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
      <Box gap="100" alignItems="Center">
        <Box grow="Yes" direction="Column">
          <Input
            value={value}
            onChange={(evt) => setValue(evt.currentTarget.value)}
            onKeyDown={handleKeyDown}
            aria-label={label}
            aria-invalid={!!error}
            variant={error ? 'Critical' : 'Background'}
            size="300"
            radii="300"
            readOnly={saving}
            autoFocus
          />
        </Box>
        <Button
          type="submit"
          variant="Primary"
          size="300"
          radii="300"
          disabled={!!error || saving}
          before={saving && <Spinner variant="Primary" fill="Solid" size="100" />}
        >
          <Text size="B300">{saveLabel}</Text>
        </Button>
        <IconButton
          type="button"
          size="300"
          radii="300"
          variant="SurfaceVariant"
          aria-label="Cancel"
          onClick={onCancel}
        >
          <Icon size="100" src={Icons.Cross} />
        </IconButton>
      </Box>
      {shownError && (
        <Text size="T200" role="alert" style={{ color: color.Critical.Main }}>
          {shownError}
        </Text>
      )}
    </Box>
  );
}

type BoardBarProps = {
  before?: ReactNode;
  title: ReactNode;
  children: ReactNode;
};
/**
 * A strip at the top or bottom of the board's content, for inline rename and status.
 */
export function BoardBar({ before, title, children }: BoardBarProps) {
  return (
    <Box className={css.BoardBar} direction="Column" gap="100" shrink="No">
      <Box alignItems="Center" gap="200">
        {before}
        <Text size="L400" truncate>
          {title}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

export type BoardToastData = {
  message: string;
  critical?: boolean;
  onUndo?: () => Promise<void>;
};
type BoardToastProps = {
  toast: BoardToastData;
  onDismiss: () => void;
};
export function BoardToast({ toast, onDismiss }: BoardToastProps) {
  const [undoState, undo] = useAsyncCallback(
    useCallback(async () => {
      await toast.onUndo?.();
      onDismiss();
    }, [toast, onDismiss])
  );
  const undoing = undoState.status === AsyncStatus.Loading;

  return (
    <Box
      className={css.BoardBar}
      style={{ marginBottom: config.space.S200 }}
      role="status"
      alignItems="Center"
      gap="200"
      shrink="No"
    >
      <Box grow="Yes">
        <Text
          size="T200"
          style={
            toast.critical || undoState.status === AsyncStatus.Error
              ? { color: color.Critical.Main }
              : undefined
          }
        >
          {undoState.status === AsyncStatus.Error
            ? `Couldn’t undo: ${errorMessage(undoState.error)}`
            : toast.message}
        </Text>
      </Box>
      {toast.onUndo && undoState.status !== AsyncStatus.Error && (
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          disabled={undoing}
          before={undoing && <Spinner size="100" variant="Secondary" />}
          onClick={() => undo().catch(() => undefined)}
        >
          <Text size="B300">Undo</Text>
        </Button>
      )}
      <IconButton
        size="300"
        radii="300"
        variant="SurfaceVariant"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <Icon size="100" src={Icons.Cross} />
      </IconButton>
    </Box>
  );
}

export type BoardAnchor = { x: number; y: number };

type BoardMenuProps = {
  anchor: BoardAnchor;
  label: string;
  onClose: () => void;
  children: ReactNode;
};
/**
 * A menu drawn inside the board, at a point relative to it. It isn't portalled: the board's
 * focus trap closes the board on any click outside it.
 */
export function BoardMenu({ anchor, label, onClose, children }: BoardMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });

  // keep the menu inside the board as its content changes
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return undefined;
    const place = () => {
      const parent = el.offsetParent as HTMLElement | null;
      if (!parent) return;
      const margin = 8;
      const maxLeft = parent.clientWidth - el.offsetWidth - margin;
      const maxTop = parent.clientHeight - el.offsetHeight - margin;
      const left = Math.max(margin, Math.min(anchor.x, maxLeft));
      const top = Math.max(margin, Math.min(anchor.y, maxTop));
      setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor]);

  return (
    <>
      <div className={css.BoardMenuBackdrop} onClick={onClose} aria-hidden />
      <FocusTrap
        focusTrapOptions={{
          onDeactivate: onClose,
          clickOutsideDeactivates: true,
          escapeDeactivates: true,
          fallbackFocus: () => menuRef.current ?? document.body,
          isKeyForward: (evt: KeyboardEvent) =>
            !editableActiveElement() && isKeyHotkey('arrowdown', evt),
          isKeyBackward: (evt: KeyboardEvent) =>
            !editableActiveElement() && isKeyHotkey('arrowup', evt),
        }}
      >
        <Menu
          ref={menuRef}
          className={css.BoardMenu}
          style={{ left: pos.left, top: pos.top }}
          role="dialog"
          aria-label={label}
        >
          {children}
        </Menu>
      </FocusTrap>
    </>
  );
}

function MenuTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box direction="Column" style={{ padding: config.space.S200 }}>
      <Text size="H6" truncate>
        {title}
      </Text>
      {subtitle && (
        <Text size="T200" priority="300" truncate>
          {subtitle}
        </Text>
      )}
    </Box>
  );
}

function MenuAction({
  label,
  icon,
  critical,
  disabled,
  onClick,
}: {
  label: string;
  icon: ComponentProps<typeof Icon>['src'];
  critical?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <MenuItem
      size="300"
      radii="300"
      variant={critical ? 'Critical' : 'Surface'}
      fill="None"
      before={<Icon size="100" src={icon} />}
      disabled={disabled}
      onClick={onClick}
    >
      <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
        {label}
      </Text>
    </MenuItem>
  );
}

type StickerMenuProps = {
  pack: ImagePack;
  image: PackImageReader;
  editable: boolean;
  /** Editable packs to move or copy into; the sticker's own pack is left out here. */
  targets: ImagePack[];
  onRename: () => void;
  onDelete: () => void;
  onDone: (toast: BoardToastData) => void;
};
type TransferStep = { move: boolean; target?: ImagePack };
export function StickerMenu({
  pack,
  image,
  editable,
  targets,
  onRename,
  onDelete,
  onDone,
}: StickerMenuProps) {
  const mx = useMatrixClient();
  const [step, setStep] = useState<TransferStep>();

  const [transferState, transfer] = useAsyncCallback(
    useCallback(
      async (target: ImagePack, shortcode: string, move: boolean) => {
        const result = await transferSticker(mx, pack, image, target, shortcode, move);
        onDone({ message: result.message, critical: result.partial });
      },
      [mx, pack, image, onDone]
    )
  );
  const busy = transferState.status === AsyncStatus.Loading;

  const chooseTarget = (target: ImagePack, move: boolean) => {
    if (target.images.collection.has(image.shortcode)) {
      setStep({ move, target });
      return;
    }
    transfer(target, image.shortcode, move).catch(() => undefined);
  };

  const title = <MenuTitle title={image.shortcode} subtitle={getPackLabel(mx, pack)} />;

  if (step?.target) {
    const { target, move } = step;
    return (
      <Box direction="Column" gap="100">
        {title}
        <Box direction="Column" gap="100" style={{ padding: config.space.S200 }}>
          <Text size="T200">
            {move ? 'Move' : 'Copy'} to {getPackLabel(mx, target)} as:
          </Text>
          <NameField
            defaultValue={image.shortcode}
            label="New sticker name"
            normalize={normalizeShortcode}
            validate={(name) => shortcodeError(name, (sc) => target.images.collection.has(sc))}
            saveLabel={move ? 'Move' : 'Copy'}
            onSave={(name) => transfer(target, name, move)}
            onCancel={() => setStep(undefined)}
          />
        </Box>
      </Box>
    );
  }

  if (step) {
    return (
      <Box direction="Column" gap="100">
        {title}
        <Line size="300" />
        <Text size="L400" style={{ padding: `${config.space.S100} ${config.space.S200}` }}>
          {step.move ? 'Move to pack' : 'Copy to pack'}
        </Text>
        {targets.length === 0 && (
          <Text size="T200" style={{ padding: config.space.S200 }}>
            No other pack you can edit.
          </Text>
        )}
        {targets.map((target) => (
          <MenuItem
            key={packKey(target)}
            size="300"
            radii="300"
            fill="None"
            variant="Surface"
            disabled={busy}
            onClick={() => chooseTarget(target, step.move)}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              {getPackLabel(mx, target)}
            </Text>
          </MenuItem>
        ))}
        {busy && (
          <Box justifyContent="Center" style={{ padding: config.space.S100 }}>
            <Spinner size="200" variant="Secondary" />
          </Box>
        )}
        {transferState.status === AsyncStatus.Error && (
          <Text
            size="T200"
            role="alert"
            style={{ color: color.Critical.Main, padding: config.space.S200 }}
          >
            {errorMessage(transferState.error)}
          </Text>
        )}
        <MenuAction label="Back" icon={Icons.ArrowLeft} onClick={() => setStep(undefined)} />
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="100">
      {title}
      <Line size="300" />
      {editable && <MenuAction label="Rename" icon={Icons.Pencil} onClick={onRename} />}
      {editable && (
        <MenuAction
          label="Move to pack…"
          icon={Icons.ArrowRight}
          onClick={() => setStep({ move: true })}
        />
      )}
      <MenuAction
        label="Copy to pack…"
        icon={Icons.Plus}
        onClick={() => setStep({ move: false })}
      />
      {editable && <MenuAction label="Delete" icon={Icons.Delete} critical onClick={onDelete} />}
    </Box>
  );
}

type PackMenuProps = {
  pack: ImagePack;
  onRename: () => void;
  onDelete: () => void;
  onNewPack: () => void;
};
export function PackMenu({ pack, onRename, onDelete, onNewPack }: PackMenuProps) {
  const mx = useMatrixClient();
  return (
    <Box direction="Column" gap="100">
      <MenuTitle
        title={getPackLabel(mx, pack)}
        subtitle={pack.address ? 'Room pack' : 'Personal pack'}
      />
      <Line size="300" />
      <MenuAction label="Rename pack" icon={Icons.Pencil} onClick={onRename} />
      <MenuAction label="New pack…" icon={Icons.Plus} onClick={onNewPack} />
      {pack.address && (
        <MenuAction label="Delete pack…" icon={Icons.Delete} critical onClick={onDelete} />
      )}
    </Box>
  );
}

type BoardPanelProps = {
  title: string;
  onBack: () => void;
  backDisabled?: boolean;
  children: ReactNode;
};
/**
 * Takes the place of the sticker grid, like the add-to-pack view.
 */
export function BoardPanel({ title, onBack, backDisabled, children }: BoardPanelProps) {
  return (
    <Box grow="Yes" direction="Column">
      <Box alignItems="Center" gap="200" style={{ padding: config.space.S200 }} shrink="No">
        <IconButton
          size="300"
          radii="300"
          onClick={onBack}
          disabled={backDisabled}
          aria-label="Back"
        >
          <Icon size="100" src={Icons.ArrowLeft} />
        </IconButton>
        <Text size="T300">{title}</Text>
      </Box>
      <Scroll size="400" hideTrack>
        <Box direction="Column" gap="200" style={{ padding: config.space.S200 }}>
          {children}
        </Box>
      </Scroll>
    </Box>
  );
}

type DeletePackConfirmProps = {
  pack: ImagePack;
  address: PackAddress;
  onDeleted: () => void;
  onCancel: () => void;
};
export function DeletePackConfirm({ pack, address, onDeleted, onCancel }: DeletePackConfirmProps) {
  const mx = useMatrixClient();
  const label = getPackLabel(mx, pack);
  const roomName = mx.getRoom(address.roomId)?.name ?? 'the room';
  const count = pack.images.collection.size;

  const [deleteState, deletePack] = useAsyncCallback(
    useCallback(async () => {
      await updatePack(mx, address, () => ({}));
      onDeleted();
    }, [mx, address, onDeleted])
  );
  const deleting = deleteState.status === AsyncStatus.Loading;

  return (
    <BoardPanel title="Delete pack" onBack={onCancel} backDisabled={deleting}>
      <Box role="alertdialog" aria-label={`Delete ${label}?`} direction="Column" gap="300">
        <Text size="H5">Delete “{label}”?</Text>
        <Text size="T300">
          This removes the pack and its {count} image{count === 1 ? '' : 's'} for everyone in{' '}
          <b>{roomName}</b>. It can’t be undone.
        </Text>
        {deleteState.status === AsyncStatus.Error && (
          <Text size="T200" role="alert" style={{ color: color.Critical.Main }}>
            Failed to delete the pack: {errorMessage(deleteState.error)}
          </Text>
        )}
        <Box gap="200">
          <Button
            variant="Critical"
            size="300"
            radii="300"
            disabled={deleting}
            before={deleting && <Spinner variant="Critical" fill="Solid" size="100" />}
            onClick={() => deletePack().catch(() => undefined)}
          >
            <Text size="B300">Delete pack</Text>
          </Button>
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            disabled={deleting}
            onClick={onCancel}
            autoFocus
          >
            <Text size="B300">Cancel</Text>
          </Button>
        </Box>
      </Box>
    </BoardPanel>
  );
}

type NewPackFormProps = {
  /** Rooms whose packs already show on this board; other rooms get the pack enabled globally. */
  boardRoomIds: string[];
  onCreated: (name: string) => void;
  onCancel: () => void;
};
export function NewPackForm({ boardRoomIds, onCreated, onCancel }: NewPackFormProps) {
  const mx = useMatrixClient();
  const rooms: PackRoom[] = useMemo(
    () =>
      mx
        .getRooms()
        .filter((room: PackRoom) => canEditRoomPacks(mx, room.roomId))
        .sort((a: PackRoom, b: PackRoom) => {
          const aBoard = boardRoomIds.includes(a.roomId) ? 0 : 1;
          const bBoard = boardRoomIds.includes(b.roomId) ? 0 : 1;
          return aBoard - bBoard || a.name.localeCompare(b.name);
        }),
    [mx, boardRoomIds]
  );

  const [query, setQuery] = useState('');
  const [roomId, setRoomId] = useState<string | undefined>(
    rooms.find((room) => boardRoomIds.includes(room.roomId))?.roomId
  );
  const [name, setName] = useState('');

  const shownRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const [createState, create] = useAsyncCallback(
    useCallback(async () => {
      const room = roomId ? mx.getRoom(roomId) : undefined;
      if (!room) throw new Error('Pick a room');
      const address = await createRoomPack(mx, room, name, [ImageUsage.Sticker]);
      if (!boardRoomIds.includes(room.roomId)) await enableGlobalPack(mx, address);
      onCreated(name.trim());
    }, [mx, roomId, name, boardRoomIds, onCreated])
  );
  const creating = createState.status === AsyncStatus.Loading;
  const canCreate = !!roomId && !!name.trim() && !creating;

  const handleSubmit: FormEventHandler = (evt) => {
    evt.preventDefault();
    if (canCreate) create().catch(() => undefined);
  };

  return (
    <BoardPanel title="New pack" onBack={onCancel} backDisabled={creating}>
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="300">
        <Box direction="Column" gap="100">
          <Text size="L400">Name</Text>
          <Input
            value={name}
            onChange={(evt) => setName(evt.currentTarget.value)}
            aria-label="Pack name"
            variant="Background"
            size="300"
            radii="300"
            readOnly={creating}
            autoFocus
          />
        </Box>
        <Box direction="Column" gap="100">
          <Text size="L400">Room</Text>
          <Text size="T200" priority="300">
            Everyone in the room can use the pack. Rooms where you may edit packs:
          </Text>
          {rooms.length > 6 && (
            <Input
              value={query}
              onChange={(evt) => setQuery(evt.currentTarget.value)}
              aria-label="Filter rooms"
              placeholder="Filter rooms"
              before={<Icon size="50" src={Icons.Search} />}
              variant="Background"
              size="300"
              radii="300"
            />
          )}
          {rooms.length === 0 && (
            <Text size="T300">There is no room where you may add a pack.</Text>
          )}
          <Box direction="Column" gap="100" role="radiogroup" aria-label="Room">
            {shownRooms.map((room) => {
              const selected = room.roomId === roomId;
              return (
                <MenuItem
                  key={room.roomId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  size="300"
                  radii="300"
                  variant={selected ? 'Primary' : 'SurfaceVariant'}
                  fill={selected ? 'Soft' : 'None'}
                  after={selected && <Icon size="100" src={Icons.Check} />}
                  disabled={creating}
                  onClick={() => setRoomId(room.roomId)}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    {room.name}
                    {room.isSpaceRoom() ? ' (space)' : ''}
                  </Text>
                </MenuItem>
              );
            })}
          </Box>
          {roomId && !boardRoomIds.includes(roomId) && (
            <Text size="T200" priority="300">
              The pack will also be turned on for you in every room.
            </Text>
          )}
        </Box>
        {createState.status === AsyncStatus.Error && (
          <Text size="T200" role="alert" style={{ color: color.Critical.Main }}>
            Failed to create the pack: {errorMessage(createState.error)}
          </Text>
        )}
        <Button
          type="submit"
          variant="Primary"
          size="300"
          radii="300"
          disabled={!canCreate}
          before={creating && <Spinner variant="Primary" fill="Solid" size="100" />}
        >
          <Text size="B300">Create pack</Text>
        </Button>
      </Box>
    </BoardPanel>
  );
}
