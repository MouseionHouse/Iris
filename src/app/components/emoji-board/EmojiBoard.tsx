import React, {
  ChangeEventHandler,
  DOMAttributes,
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Button, Chip, config, Icon, IconButton, Icons, Scroll, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import { Room } from 'matrix-js-sdk';
import { atom, PrimitiveAtom, useAtom, useSetAtom } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IEmoji, emojiGroups, emojis } from '../../plugins/emoji';
import { useEmojiGroupLabels } from './useEmojiGroupLabels';
import { useEmojiGroupIcons } from './useEmojiGroupIcons';
import { preventScrollWithArrowKey, stopPropagation } from '../../utils/keyboard';
import {
  useGlobalImagePacks,
  useRelevantImagePacks,
  useRoomsImagePacks,
  useUserImagePack,
} from '../../hooks/useImagePacks';
import { useRoomsPowerLevels } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRecentEmoji } from '../../hooks/useRecentEmoji';
import { isUserId, mxcUrlToHttp } from '../../utils/matrix';
import { editableActiveElement, targetFromEvent } from '../../utils/dom';
import { useAsyncSearch, UseAsyncSearchOptions } from '../../hooks/useAsyncSearch';
import { useDebounce } from '../../hooks/useDebounce';
import { useThrottle } from '../../hooks/useThrottle';
import { addRecentEmoji } from '../../plugins/recent-emoji';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import {
  getPackLabel,
  ImagePack,
  ImageUsage,
  normalizeShortcode,
  PackImageReader,
  packKey,
  shortcodeError,
  updatePack,
  withImage,
  withoutImage,
  withPackName,
  withRenamedImage,
} from '../../plugins/custom-emoji';
import { suffixRename } from '../../utils/common';
import { getEmoticonSearchStr } from '../../plugins/utils';
import {
  SearchInput,
  EmojiBoardTabs,
  SidebarStack,
  SidebarDivider,
  Sidebar,
  NoStickerPacks,
  createPreviewDataAtom,
  Preview,
  PreviewData,
  EmojiItem,
  StickerItem,
  CustomEmojiItem,
  ImageGroupIcon,
  GroupIcon,
  getEmojiItemInfo,
  EmojiGroup,
  EmojiBoardLayout,
  AddToPack,
  BoardAnchor,
  BoardBar,
  BoardMenu,
  BoardToast,
  BoardToastData,
  canEditRoomPacks,
  DeletePackConfirm,
  NameField,
  NewPackForm,
  PackMenu,
  StickerMenu,
} from './components';
import * as css from './components/styles.css';
import { EmojiBoardTab, EmojiType } from './types';
import { VirtualTile } from '../virtualizer';

const RECENT_GROUP_ID = 'recent_group';
const SEARCH_GROUP_ID = 'search_group';

type EmojiGroupItem = {
  id: string;
  name: string;
  items: Array<IEmoji | PackImageReader>;
};
type StickerGroupItem = {
  id: string;
  name: string;
  items: Array<PackImageReader>;
};

const useGroups = (
  tab: EmojiBoardTab,
  imagePacks: ImagePack[]
): [EmojiGroupItem[], StickerGroupItem[]] => {
  const mx = useMatrixClient();

  const recentEmojis = useRecentEmoji(mx, 21);
  const labels = useEmojiGroupLabels();

  const emojiGroupItems = useMemo(() => {
    const g: EmojiGroupItem[] = [];
    if (tab !== EmojiBoardTab.Emoji) return g;

    g.push({
      id: RECENT_GROUP_ID,
      name: 'Recent',
      items: recentEmojis,
    });

    imagePacks.forEach((pack) => {
      let label = pack.meta.name;
      if (!label) label = isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name;

      g.push({
        id: pack.id,
        name: label ?? 'Unknown',
        items: pack
          .getImages(ImageUsage.Emoticon)
          .sort((a, b) => a.shortcode.localeCompare(b.shortcode)),
      });
    });

    emojiGroups.forEach((group) => {
      g.push({
        id: group.id,
        name: labels[group.id],
        items: group.emojis,
      });
    });

    return g;
  }, [mx, recentEmojis, labels, imagePacks, tab]);

  const stickerGroupItems = useMemo(() => {
    const g: StickerGroupItem[] = [];
    if (tab !== EmojiBoardTab.Sticker) return g;

    imagePacks.forEach((pack) => {
      g.push({
        id: pack.id,
        name: getPackLabel(mx, pack),
        items: pack
          .getImages(ImageUsage.Sticker)
          .sort((a, b) => a.shortcode.localeCompare(b.shortcode)),
      });
    });

    return g;
  }, [mx, imagePacks, tab]);

  return [emojiGroupItems, stickerGroupItems];
};

const useItemRenderer = (tab: EmojiBoardTab) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const renderItem = (emoji: IEmoji | PackImageReader, index: number) => {
    if ('unicode' in emoji) {
      return <EmojiItem key={emoji.unicode + index} emoji={emoji} />;
    }
    if (tab === EmojiBoardTab.Sticker) {
      return (
        <StickerItem
          key={emoji.shortcode + index}
          mx={mx}
          useAuthentication={useAuthentication}
          image={emoji}
        />
      );
    }
    return (
      <CustomEmojiItem
        key={emoji.shortcode + index}
        mx={mx}
        useAuthentication={useAuthentication}
        image={emoji}
      />
    );
  };

  return renderItem;
};

type EmojiSidebarProps = {
  activeGroupAtom: PrimitiveAtom<string | undefined>;
  packs: ImagePack[];
  onScrollToGroup: (groupId: string) => void;
};
function EmojiSidebar({ activeGroupAtom, packs, onScrollToGroup }: EmojiSidebarProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupAtom);
  const usage = ImageUsage.Emoticon;
  const labels = useEmojiGroupLabels();
  const icons = useEmojiGroupIcons();

  const handleScrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onScrollToGroup(groupId);
  };

  return (
    <Sidebar>
      <SidebarStack>
        <GroupIcon
          active={activeGroupId === RECENT_GROUP_ID}
          id={RECENT_GROUP_ID}
          label="Recent"
          icon={Icons.RecentClock}
          onClick={handleScrollToGroup}
        />
      </SidebarStack>
      {packs.length > 0 && (
        <SidebarStack>
          <SidebarDivider />
          {packs.map((pack) => {
            let label = pack.meta.name;
            if (!label) label = isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name;

            const url =
              mxcUrlToHttp(mx, pack.getAvatarUrl(usage) ?? '', useAuthentication) ?? undefined;

            return (
              <ImageGroupIcon
                key={pack.id}
                active={activeGroupId === pack.id}
                id={pack.id}
                label={label ?? 'Unknown Pack'}
                url={url}
                onClick={handleScrollToGroup}
              />
            );
          })}
        </SidebarStack>
      )}
      <SidebarStack
        style={{
          position: 'sticky',
          bottom: '-67%',
          zIndex: 1,
        }}
      >
        <SidebarDivider />
        {emojiGroups.map((group) => (
          <GroupIcon
            key={group.id}
            active={activeGroupId === group.id}
            id={group.id}
            label={labels[group.id]}
            icon={icons[group.id]}
            onClick={handleScrollToGroup}
          />
        ))}
      </SidebarStack>
    </Sidebar>
  );
}

type StickerSidebarProps = {
  activeGroupAtom: PrimitiveAtom<string | undefined>;
  packs: ImagePack[];
  onScrollToGroup: (groupId: string) => void;
};
function StickerSidebar({ activeGroupAtom, packs, onScrollToGroup }: StickerSidebarProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupAtom);
  const usage = ImageUsage.Sticker;

  const handleScrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onScrollToGroup(groupId);
  };

  return (
    <Sidebar>
      <SidebarStack>
        {packs.map((pack) => {
          let label = pack.meta.name;
          if (!label) label = isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name;

          const url =
            mxcUrlToHttp(mx, pack.getAvatarUrl(usage) ?? '', useAuthentication) ?? undefined;

          return (
            <ImageGroupIcon
              key={pack.id}
              active={activeGroupId === pack.id}
              id={pack.id}
              label={label ?? 'Unknown Pack'}
              url={url}
              onClick={handleScrollToGroup}
            />
          );
        })}
      </SidebarStack>
    </Sidebar>
  );
}

type EmojiGroupHolderProps = {
  contentScrollRef: RefObject<HTMLDivElement | null>;
  previewAtom: PrimitiveAtom<PreviewData | undefined>;
  children?: ReactNode;
  onGroupItemClick: MouseEventHandler;
  /** Extra handlers on the items' container, for the sticker menu. */
  itemHandlers?: DOMAttributes<HTMLDivElement>;
};
function EmojiGroupHolder({
  contentScrollRef,
  previewAtom,
  onGroupItemClick,
  itemHandlers,
  children,
}: EmojiGroupHolderProps) {
  const setPreviewData = useSetAtom(previewAtom);

  const handleEmojiPreview = useCallback(
    (element: HTMLButtonElement) => {
      const emojiInfo = getEmojiItemInfo(element);
      if (!emojiInfo) return;

      setPreviewData({
        key: emojiInfo.data,
        shortcode: emojiInfo.shortcode,
      });
    },
    [setPreviewData]
  );

  const throttleEmojiHover = useThrottle(handleEmojiPreview, {
    wait: 200,
    immediate: true,
  });

  const handleEmojiHover: MouseEventHandler = (evt) => {
    const targetEl = targetFromEvent(evt.nativeEvent, 'button') as HTMLButtonElement | undefined;
    if (!targetEl) return;
    throttleEmojiHover(targetEl);
  };

  const handleEmojiFocus: FocusEventHandler = (evt) => {
    const targetEl = evt.target as HTMLButtonElement;
    handleEmojiPreview(targetEl);
  };

  return (
    <Scroll ref={contentScrollRef} size="400" onKeyDown={preventScrollWithArrowKey} hideTrack>
      <Box
        {...itemHandlers}
        onClick={onGroupItemClick}
        onMouseMove={handleEmojiHover}
        onFocus={handleEmojiFocus}
        direction="Column"
      >
        {children}
      </Box>
    </Scroll>
  );
}

const DefaultEmojiPreview: PreviewData = { key: '🙂', shortcode: 'slight_smile' };

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};

const VIRTUAL_OVER_SCAN = 2;

type EmojiBoardProps = {
  tab?: EmojiBoardTab;
  onTabChange?: (tab: EmojiBoardTab) => void;
  imagePackRooms: Room[];
  requestClose: () => void;
  returnFocusOnDeactivate?: boolean;
  onEmojiSelect?: (unicode: string, shortcode: string) => void;
  onCustomEmojiSelect?: (mxc: string, shortcode: string) => void;
  onStickerSelect?: (mxc: string, shortcode: string, label: string) => void;
  allowTextCustomEmoji?: boolean;
  addToRecentEmoji?: boolean;
};

const LONG_PRESS_MS = 500;
const UNDO_TOAST_MS = 6000;

type BoardPanel =
  | { kind: 'add'; packKey: string }
  | { kind: 'newPack' }
  | { kind: 'deletePack'; packKey: string };
type BoardMenuState =
  | { kind: 'sticker'; packKey: string; shortcode: string; anchor: BoardAnchor }
  | { kind: 'pack'; packKey: string; anchor: BoardAnchor };
type StickerRef = { packKey: string; shortcode: string };

export function EmojiBoard({
  tab = EmojiBoardTab.Emoji,
  onTabChange,
  imagePackRooms,
  requestClose,
  returnFocusOnDeactivate,
  onEmojiSelect,
  onCustomEmojiSelect,
  onStickerSelect,
  allowTextCustomEmoji,
  addToRecentEmoji = true,
}: EmojiBoardProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const userPack = useUserImagePack();
  const roomPacks = useRoomsImagePacks(imagePackRooms);
  const globalPacks = useGlobalImagePacks();
  const roomsPowerLevels = useRoomsPowerLevels(imagePackRooms);
  const editablePacks = useMemo(() => {
    const packs = [userPack ?? new ImagePack(mx.getUserId() ?? '', {}, undefined)];
    const seen = new Set<string>();
    roomPacks.concat(globalPacks).forEach((pack) => {
      const roomId = pack.address?.roomId;
      if (!roomId || pack.deleted || seen.has(packKey(pack))) return;
      seen.add(packKey(pack));
      if (canEditRoomPacks(mx, roomId)) packs.push(pack);
    });
    return packs;
    // roomsPowerLevels: recheck when power levels in this room or its spaces change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mx, userPack, roomPacks, globalPacks, roomsPowerLevels]);
  const editableKeys = useMemo(() => new Set(editablePacks.map(packKey)), [editablePacks]);
  const boardRoomIds = useMemo(() => imagePackRooms.map((room) => room.roomId), [imagePackRooms]);

  const emojiTab = tab === EmojiBoardTab.Emoji;
  const stickerTab = tab === EmojiBoardTab.Sticker;
  const usage = emojiTab ? ImageUsage.Emoticon : ImageUsage.Sticker;

  const [editMode, setEditMode] = useState(false);
  const editing = stickerTab && editMode;
  const [panel, setPanel] = useState<BoardPanel>();
  const [menu, setMenu] = useState<BoardMenuState>();
  const [renaming, setRenaming] = useState<StickerRef>();
  const [renamingPack, setRenamingPack] = useState<string>();
  const [toast, setToast] = useState<BoardToastData>();

  const previewAtom = useMemo(
    () => createPreviewDataAtom(emojiTab ? DefaultEmojiPreview : undefined),
    [emojiTab]
  );
  const activeGroupIdAtom = useMemo(() => atom<string | undefined>(undefined), []);
  const setActiveGroupId = useSetAtom(activeGroupIdAtom);
  const imagePacks = useRelevantImagePacks(usage, imagePackRooms);
  // in edit mode, packs you can edit show even with no stickers yet, to add to them
  const boardPacks = useMemo(() => {
    if (!editing) return imagePacks;
    const shown = new Set(imagePacks.map(packKey));
    return imagePacks.concat(editablePacks.filter((pack) => !shown.has(packKey(pack))));
  }, [editing, imagePacks, editablePacks]);
  const [emojiGroupItems, stickerGroupItems] = useGroups(tab, boardPacks);
  const groups = emojiTab ? emojiGroupItems : stickerGroupItems;
  const renderItem = useItemRenderer(tab);

  const packsByKey = useMemo(() => {
    const map = new Map<string, ImagePack>();
    boardPacks.concat(editablePacks).forEach((pack) => map.set(packKey(pack), pack));
    return map;
  }, [boardPacks, editablePacks]);
  const packsById = useMemo(() => new Map(boardPacks.map((pack) => [pack.id, pack])), [boardPacks]);
  const packOfImage = useMemo(() => {
    const map = new Map<PackImageReader, ImagePack>();
    if (!stickerTab) return map;
    boardPacks.forEach((pack) =>
      pack.getImages(ImageUsage.Sticker).forEach((image) => map.set(image, pack))
    );
    return map;
  }, [stickerTab, boardPacks]);

  const resolveSticker = (ref: StickerRef | undefined) => {
    const pack = ref && packsByKey.get(ref.packKey);
    const image = ref && pack?.images.collection.get(ref.shortcode);
    return pack && image ? { pack, image } : undefined;
  };

  const showToast = useCallback((data: BoardToastData) => setToast(data), []);
  useEffect(() => {
    if (!toast || toast.critical) return undefined;
    const timer = window.setTimeout(
      () => setToast((t) => (t === toast ? undefined : t)),
      UNDO_TOAST_MS
    );
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeAll = () => {
    setPanel(undefined);
    setMenu(undefined);
    setRenaming(undefined);
    setRenamingPack(undefined);
  };

  const handleDeleteSticker = (pack: ImagePack, image: PackImageReader) => {
    const { address } = pack;
    const { shortcode, content } = image;
    setMenu(undefined);
    setRenaming(undefined);
    updatePack(mx, address, (c) => withoutImage(c, shortcode)).then(
      () =>
        showToast({
          message: `Deleted “${shortcode}”`,
          onUndo: async () => {
            await updatePack(mx, address, (c) => {
              const isTaken = (sc: string) => !!c.images?.[sc];
              return withImage(
                c,
                isTaken(shortcode) ? suffixRename(shortcode, isTaken) : shortcode,
                content
              );
            });
          },
        }),
      (err) =>
        showToast({
          message: `Couldn’t delete “${shortcode}”${
            err instanceof Error ? `: ${err.message}` : ''
          }`,
          critical: true,
        })
    );
  };

  const boardRef = useRef<HTMLDivElement>(null);
  const anchorAt = (x: number, y: number): BoardAnchor => {
    const rect = boardRef.current?.getBoundingClientRect();
    return { x: x - (rect?.left ?? 0), y: y - (rect?.top ?? 0) };
  };
  const anchorBelow = (el: Element): BoardAnchor => {
    const rect = el.getBoundingClientRect();
    return anchorAt(rect.left, rect.bottom);
  };

  const openStickerMenu = (el: Element, point?: { x: number; y: number }) => {
    const ref = {
      packKey: el.getAttribute('data-pack-key') ?? '',
      shortcode: el.getAttribute('data-emoji-shortcode') ?? '',
    };
    if (!resolveSticker(ref)) return;
    const rect = el.getBoundingClientRect();
    // a keyboard-opened menu has no pointer position
    const anchor =
      point && (point.x !== 0 || point.y !== 0)
        ? anchorAt(point.x, point.y)
        : anchorAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setMenu({ kind: 'sticker', ...ref, anchor });
  };

  // long-press (touch) and right-click (or the context-menu key) open the sticker menu
  const STICKER_SELECTOR = `button[data-emoji-type="${EmojiType.Sticker}"]`;
  const pressRef = useRef<{ timer: number; x: number; y: number } | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const cancelPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = undefined;
  };
  useEffect(() => cancelPress, []);
  const handlePointerDown: PointerEventHandler = (evt) => {
    suppressClickRef.current = false;
    cancelPress();
    if (evt.pointerType === 'mouse') return;
    const el = targetFromEvent(evt.nativeEvent, STICKER_SELECTOR);
    if (!el) return;
    const { clientX: x, clientY: y } = evt;
    pressRef.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        pressRef.current = undefined;
        // the tap that ends this press must not also send the sticker
        suppressClickRef.current = true;
        openStickerMenu(el, { x, y });
      }, LONG_PRESS_MS),
    };
  };
  const handlePointerMove: PointerEventHandler = (evt) => {
    const press = pressRef.current;
    if (press && Math.hypot(evt.clientX - press.x, evt.clientY - press.y) > 10) cancelPress();
  };
  const handleContextMenu: MouseEventHandler = (evt) => {
    const el = targetFromEvent(evt.nativeEvent, STICKER_SELECTOR);
    if (!el) return;
    evt.preventDefault();
    cancelPress();
    openStickerMenu(el, { x: evt.clientX, y: evt.clientY });
  };
  const handleItemKeyDown: KeyboardEventHandler = (evt) => {
    if (!isKeyHotkey('shift+f10', evt) && evt.key !== 'ContextMenu') return;
    const el = targetFromEvent(evt.nativeEvent, STICKER_SELECTOR);
    if (!el) return;
    evt.preventDefault();
    openStickerMenu(el);
  };
  const stickerHandlers: DOMAttributes<HTMLDivElement> = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: handleContextMenu,
    onKeyDown: handleItemKeyDown,
  };

  const renderSticker = (image: PackImageReader, index: number) => {
    const pack = packOfImage.get(image);
    const key = pack ? packKey(pack) : undefined;
    const editable = !!pack && key !== undefined && editableKeys.has(key);
    const item = (
      <StickerItem
        key={image.shortcode + index}
        mx={mx}
        useAuthentication={useAuthentication}
        image={image}
        packKey={key}
        label={editing && editable ? `Rename ${image.shortcode}` : undefined}
      />
    );
    if (!editing || !editable || !pack) return item;
    return (
      <div key={image.shortcode + index} className={css.StickerEditItem}>
        {item}
        <button
          type="button"
          className={css.StickerDeleteBadge}
          aria-label={`Delete ${image.shortcode}`}
          title={`Delete ${image.shortcode}`}
          onClick={(evt) => {
            evt.stopPropagation();
            handleDeleteSticker(pack, image);
          }}
        >
          <Icon size="50" src={Icons.Cross} />
        </button>
      </div>
    );
  };
  const renderBoardItem = stickerTab
    ? (item: IEmoji | PackImageReader, index: number) =>
        'unicode' in item ? renderItem(item, index) : renderSticker(item, index)
    : renderItem;

  const isViewOnly = (groupId: string) => {
    const pack = packsById.get(groupId);
    return !!pack && !editableKeys.has(packKey(pack));
  };

  const renderGroupActions = (groupId: string) => {
    if (!editing) return undefined;
    const pack = packsById.get(groupId);
    if (!pack) return undefined;
    const key = packKey(pack);
    if (!editableKeys.has(key)) {
      return (
        <Text size="T200" priority="300">
          view only
        </Text>
      );
    }
    const label = getPackLabel(mx, pack);
    return (
      <>
        <Chip
          variant="Secondary"
          radii="Pill"
          before={<Icon size="50" src={Icons.Plus} />}
          aria-label={`Add stickers to ${label}`}
          onClick={() => setPanel({ kind: 'add', packKey: key })}
        >
          <Text size="B300">Add</Text>
        </Chip>
        <IconButton
          size="300"
          radii="Pill"
          variant="Secondary"
          aria-label={`${label} pack actions`}
          aria-haspopup="dialog"
          onClick={(evt: React.MouseEvent<HTMLButtonElement>) =>
            setMenu({ kind: 'pack', packKey: key, anchor: anchorBelow(evt.currentTarget) })
          }
        >
          <Icon size="100" src={Icons.HorizontalDots} />
        </IconButton>
      </>
    );
  };

  const searchList = useMemo(() => {
    let list: Array<PackImageReader | IEmoji> = [];
    list = list.concat(imagePacks.flatMap((pack) => pack.getImages(usage)));
    if (emojiTab) list = list.concat(emojis);
    return list;
  }, [emojiTab, usage, imagePacks]);

  const [result, search, resetSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );

  const searchedItems = result?.items.slice(0, 100);

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    useCallback(
      (evt) => {
        const term = evt.target.value;
        if (term) search(term);
        else resetSearch();
      },
      [search, resetSearch]
    ),
    { wait: 200 }
  );

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const virtualBaseRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => contentScrollRef.current,
    estimateSize: () => 40,
    overscan: VIRTUAL_OVER_SCAN,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleGroupItemClick: MouseEventHandler = (evt) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const targetEl = targetFromEvent(evt.nativeEvent, 'button');
    const emojiInfo = targetEl && getEmojiItemInfo(targetEl);
    if (!emojiInfo) return;

    if (editing && emojiInfo.type === EmojiType.Sticker) {
      // in edit mode a tap renames instead of sending
      const key = targetEl.getAttribute('data-pack-key');
      if (key !== null && editableKeys.has(key)) {
        setRenamingPack(undefined);
        setRenaming({ packKey: key, shortcode: emojiInfo.shortcode });
      }
      return;
    }

    if (emojiInfo.type === EmojiType.Emoji) {
      onEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode);
      if (!evt.altKey && !evt.shiftKey && addToRecentEmoji) {
        addRecentEmoji(mx, emojiInfo.data);
      }
    }
    if (emojiInfo.type === EmojiType.CustomEmoji) {
      onCustomEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode);
    }
    if (emojiInfo.type === EmojiType.Sticker) {
      onStickerSelect?.(emojiInfo.data, emojiInfo.shortcode, emojiInfo.label);
    }
    if (!evt.altKey && !evt.shiftKey) requestClose();
  };

  const handleTextCustomEmojiSelect = (textEmoji: string) => {
    onCustomEmojiSelect?.(textEmoji, textEmoji);
    requestClose();
  };

  const handleScrollToGroup = (groupId: string) => {
    const groupIndex = groups.findIndex((group) => group.id === groupId);
    virtualizer.scrollToIndex(groupIndex, { align: 'start' });
  };

  // sync active sidebar tab with scroll
  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (scrollElement) {
      const scrollTop = scrollElement.offsetTop + scrollElement.scrollTop;
      const offsetTop = virtualBaseRef.current?.offsetTop ?? 0;
      const inViewVItem = vItems.find((vItem) => scrollTop < offsetTop + vItem.end);

      const group = inViewVItem ? groups[inViewVItem?.index] : undefined;
      setActiveGroupId(group?.id);
    }
  }, [vItems, groups, setActiveGroupId, result?.query]);

  // reset scroll position on search
  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTo({ top: 0 });
    }
  }, [result?.query]);

  // reset scroll position on tab change
  useEffect(() => {
    if (groups.length > 0) {
      virtualizer.scrollToIndex(0, { align: 'start' });
    }
  }, [tab, virtualizer, groups]);

  const renderRenameBar = () => {
    if (!stickerTab) return null;
    const sticker = resolveSticker(renaming);
    if (sticker) {
      const { pack, image } = sticker;
      return (
        <BoardBar
          key={`sticker-${packKey(pack)}-${image.shortcode}`}
          before={
            <img
              className={css.BoardBarImg}
              src={mxcUrlToHttp(mx, image.url, useAuthentication) ?? ''}
              alt=""
            />
          }
          title={`Rename sticker in ${getPackLabel(mx, pack)}`}
        >
          <NameField
            defaultValue={image.shortcode}
            label="Sticker name"
            normalize={normalizeShortcode}
            validate={(name) =>
              shortcodeError(name, (sc) => sc !== image.shortcode && pack.images.collection.has(sc))
            }
            onSave={async (name) => {
              await updatePack(mx, pack.address, (c) => withRenamedImage(c, image.shortcode, name));
              setRenaming(undefined);
            }}
            onCancel={() => setRenaming(undefined)}
          />
        </BoardBar>
      );
    }
    const pack = renamingPack !== undefined ? packsByKey.get(renamingPack) : undefined;
    if (pack) {
      const current = pack.meta.name ?? getPackLabel(mx, pack);
      return (
        <BoardBar key={`pack-${packKey(pack)}`} title="Rename pack">
          <NameField
            defaultValue={current}
            label="Pack name"
            validate={(name) => (name ? undefined : 'Name can’t be empty')}
            onSave={async (name) => {
              await updatePack(mx, pack.address, (c) => withPackName(c, name));
              setRenamingPack(undefined);
            }}
            onCancel={() => setRenamingPack(undefined)}
          />
        </BoardBar>
      );
    }
    return null;
  };

  const renderMenu = () => {
    if (!stickerTab || !menu) return null;
    const close = () => setMenu(undefined);
    if (menu.kind === 'sticker') {
      const sticker = resolveSticker(menu);
      if (!sticker) return null;
      const { pack, image } = sticker;
      return (
        <BoardMenu anchor={menu.anchor} label={`${image.shortcode} sticker`} onClose={close}>
          <StickerMenu
            pack={pack}
            image={image}
            editable={editableKeys.has(menu.packKey)}
            targets={editablePacks.filter((p) => packKey(p) !== menu.packKey)}
            onRename={() => {
              close();
              setRenamingPack(undefined);
              setRenaming({ packKey: menu.packKey, shortcode: image.shortcode });
            }}
            onDelete={() => handleDeleteSticker(pack, image)}
            onDone={(data) => {
              close();
              showToast(data);
            }}
          />
        </BoardMenu>
      );
    }
    const pack = packsByKey.get(menu.packKey);
    if (!pack) return null;
    return (
      <BoardMenu anchor={menu.anchor} label={`${getPackLabel(mx, pack)} pack`} onClose={close}>
        <PackMenu
          pack={pack}
          onRename={() => {
            close();
            setRenaming(undefined);
            setRenamingPack(menu.packKey);
          }}
          onDelete={() => {
            close();
            setPanel({ kind: 'deletePack', packKey: menu.packKey });
          }}
          onNewPack={() => {
            close();
            setPanel({ kind: 'newPack' });
          }}
        />
      </BoardMenu>
    );
  };

  const renderPanel = () => {
    if (!stickerTab || !panel) return null;
    if (panel.kind === 'add') {
      return (
        <AddToPack
          packs={editablePacks}
          initialPackKey={panel.packKey}
          onDone={(count, pack) => {
            setPanel(undefined);
            showToast({
              message: `Added ${count} sticker${count === 1 ? '' : 's'} to ${getPackLabel(
                mx,
                pack
              )}`,
            });
          }}
          onCancel={() => setPanel(undefined)}
        />
      );
    }
    if (panel.kind === 'newPack') {
      return (
        <NewPackForm
          boardRoomIds={boardRoomIds}
          onCreated={(name) => {
            setPanel(undefined);
            showToast({ message: `Created pack “${name}”` });
          }}
          onCancel={() => setPanel(undefined)}
        />
      );
    }
    const pack = packsByKey.get(panel.packKey);
    if (!pack?.address) return null;
    return (
      <DeletePackConfirm
        pack={pack}
        address={pack.address}
        onDeleted={() => {
          setPanel(undefined);
          showToast({ message: `Deleted pack “${getPackLabel(mx, pack)}”` });
        }}
        onCancel={() => setPanel(undefined)}
      />
    );
  };
  const panelView = renderPanel();

  return (
    <FocusTrap
      focusTrapOptions={{
        returnFocusOnDeactivate,
        initialFocus: false,
        onDeactivate: requestClose,
        clickOutsideDeactivates: true,
        allowOutsideClick: true,
        isKeyForward: (evt: KeyboardEvent) =>
          !editableActiveElement() && isKeyHotkey(['arrowdown', 'arrowright'], evt),
        isKeyBackward: (evt: KeyboardEvent) =>
          !editableActiveElement() && isKeyHotkey(['arrowup', 'arrowleft'], evt),
        escapeDeactivates: stopPropagation,
      }}
    >
      <EmojiBoardLayout
        ref={boardRef}
        className={css.BoardRoot}
        header={
          <Box direction="Column" gap="200">
            {onTabChange && <EmojiBoardTabs tab={tab} onTabChange={onTabChange} />}
            <Box gap="200" alignItems="Center">
              <Box grow="Yes" direction="Column">
                <SearchInput
                  key={tab}
                  query={result?.query}
                  onChange={handleOnChange}
                  allowTextCustomEmoji={allowTextCustomEmoji}
                  onTextCustomEmojiSelect={handleTextCustomEmojiSelect}
                />
              </Box>
              {stickerTab && (
                <IconButton
                  variant={editMode ? 'Primary' : 'SurfaceVariant'}
                  size="400"
                  radii="300"
                  aria-label="Edit stickers"
                  title="Edit stickers"
                  aria-pressed={editMode}
                  onClick={() => {
                    closeAll();
                    setEditMode((e) => !e);
                  }}
                >
                  <Icon size="200" src={Icons.Pencil} />
                </IconButton>
              )}
            </Box>
          </Box>
        }
        sidebar={
          emojiTab ? (
            <EmojiSidebar
              activeGroupAtom={activeGroupIdAtom}
              packs={imagePacks}
              onScrollToGroup={handleScrollToGroup}
            />
          ) : (
            <StickerSidebar
              activeGroupAtom={activeGroupIdAtom}
              packs={boardPacks}
              onScrollToGroup={handleScrollToGroup}
            />
          )
        }
      >
        {panelView ?? (
          <>
            {renderRenameBar()}
            <Box grow="Yes">
              <EmojiGroupHolder
                key={tab}
                contentScrollRef={contentScrollRef}
                previewAtom={previewAtom}
                onGroupItemClick={handleGroupItemClick}
                itemHandlers={stickerTab ? stickerHandlers : undefined}
              >
                {searchedItems && (
                  <EmojiGroup
                    id={SEARCH_GROUP_ID}
                    label={searchedItems.length ? 'Search Results' : 'No Results found'}
                  >
                    {searchedItems.map(renderBoardItem)}
                  </EmojiGroup>
                )}
                <div
                  ref={virtualBaseRef}
                  style={{
                    position: 'relative',
                    height: virtualizer.getTotalSize(),
                  }}
                >
                  {vItems.map((vItem) => {
                    const group = groups[vItem.index];
                    const actions = renderGroupActions(group.id);

                    return (
                      <VirtualTile
                        virtualItem={vItem}
                        style={{ paddingTop: config.space.S200 }}
                        ref={virtualizer.measureElement}
                        key={vItem.index}
                      >
                        <EmojiGroup
                          key={group.id}
                          id={group.id}
                          label={group.name}
                          after={actions}
                          dimmed={editing && isViewOnly(group.id)}
                        >
                          {group.items.map(renderBoardItem)}
                        </EmojiGroup>
                      </VirtualTile>
                    );
                  })}
                </div>
                {editing && (
                  <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
                    <Button
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon size="100" src={Icons.Plus} />}
                      onClick={() => setPanel({ kind: 'newPack' })}
                    >
                      <Text size="B300">New pack</Text>
                    </Button>
                  </Box>
                )}
                {stickerTab && groups.length === 0 && <NoStickerPacks />}
              </EmojiGroupHolder>
            </Box>
          </>
        )}
        {stickerTab && toast && <BoardToast toast={toast} onDismiss={() => setToast(undefined)} />}
        {!panelView && <Preview previewAtom={previewAtom} />}
        {renderMenu()}
      </EmojiBoardLayout>
    </FocusTrap>
  );
}
