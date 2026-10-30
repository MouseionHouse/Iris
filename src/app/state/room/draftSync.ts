import { MatrixClient, MatrixEvent, RoomEvent } from 'matrix-js-sdk';
import { Descendant, Element, Text } from 'slate';
import { BlockType } from '../../components/editor/types';
import { IReplyDraft } from './roomInputDrafts';

/*
 * Composer drafts that follow the account (mouseion/iris#60). Each room's draft is the
 * `house.mouseion.draft` room account-data event, so every device of the user sees the same one,
 * the way `house.mouseion.sidebar` carries the sidebar's sections.
 *
 * A cleared draft keeps its `ts` and `device` and drops `msg` and `reply`: nothing is deleted.
 */

export const DRAFT_EVENT_TYPE = 'house.mouseion.draft';

export type SyncedDraft = {
  /** When the draft last changed, in ms. The newer of two drafts wins. */
  ts: number;
  /** The device that changed it. */
  device: string;
  /** The composer's Slate nodes, so mentions, emoji and formatting survive. */
  msg?: Descendant[];
  reply?: IReplyDraft;
};

/** Where drafts are kept: one per room, readable at once, with a change feed. */
export type DraftStore = {
  /** This device. Its own echoes are not news. */
  device: string;
  get: (roomId: string) => SyncedDraft | undefined;
  /** Rejects when the draft was not kept. */
  put: (roomId: string, draft: SyncedDraft) => Promise<void>;
  /** Every draft that arrives for the room, this device's own echoes included. */
  subscribe: (roomId: string, onDraft: (draft: SyncedDraft) => void) => () => void;
};

const isEmptyMsg = (msg: Descendant[] | undefined): boolean =>
  !msg ||
  msg.every(
    (node) =>
      Element.isElement(node) &&
      node.type === BlockType.Paragraph &&
      node.children.every((child) => Text.isText(child) && child.text === '')
  );

/** The draft as stored: an empty composer is no `msg`. */
export const makeDraft = (
  ts: number,
  device: string,
  msg: Descendant[] | undefined,
  reply: IReplyDraft | undefined
): SyncedDraft => {
  const draft: SyncedDraft = { ts, device };
  if (!isEmptyMsg(msg)) draft.msg = JSON.parse(JSON.stringify(msg));
  if (reply) draft.reply = reply;
  return draft;
};

/** Two drafts with the same text and reply have the same key; no draft is ''. */
export const draftKey = (msg: Descendant[] | undefined, reply: IReplyDraft | undefined): string =>
  isEmptyMsg(msg) && !reply ? '' : JSON.stringify([isEmptyMsg(msg) ? null : msg, reply ?? null]);

export const hasDraft = (draft: SyncedDraft | undefined): draft is SyncedDraft =>
  !!draft && (!isEmptyMsg(draft.msg) || !!draft.reply);

export const parseDraft = (content: unknown): SyncedDraft | undefined => {
  if (!content || typeof content !== 'object') return undefined;
  const { ts, device, msg, reply } = content as Partial<SyncedDraft>;
  if (typeof ts !== 'number') return undefined;
  return {
    ts,
    device: typeof device === 'string' ? device : '',
    msg: Array.isArray(msg) ? msg : undefined,
    reply: reply && typeof reply.eventId === 'string' ? reply : undefined,
  };
};

/** Blocks made of lines: their lines are joined with a space. */
const LINE_CONTAINERS: string[] = [
  BlockType.BlockQuote,
  BlockType.CodeBlock,
  BlockType.OrderedList,
  BlockType.UnorderedList,
];

const nodeText = (node: Descendant): string => {
  if (Text.isText(node)) return node.text;
  switch (node.type) {
    case BlockType.Mention:
      return node.name;
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://') ? `:${node.shortcode}:` : node.key;
    case BlockType.Command:
      return `/${node.command}`;
    default:
      return node.children
        .map((child) => nodeText(child as Descendant))
        .join(LINE_CONTAINERS.includes(node.type) ? ' ' : '');
  }
};

/** The draft's text on one line, as the room list shows it. */
export const draftText = (msg: Descendant[] | undefined): string =>
  (msg ?? []).map(nodeText).join(' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------------------------
// Stores

/** Drafts in the user's room account data. */
export const createMatrixDraftStore = (mx: MatrixClient): DraftStore => ({
  device: mx.getDeviceId() ?? '',
  get: (roomId) => parseDraft(mx.getRoom(roomId)?.getAccountData(DRAFT_EVENT_TYPE)?.getContent()),
  put: async (roomId, draft) => {
    await mx.setRoomAccountData(roomId, DRAFT_EVENT_TYPE, draft);
  },
  // on the room, not the client: every row of the room list listens
  subscribe: (roomId, onDraft) => {
    const room = mx.getRoom(roomId);
    if (!room) return () => undefined;
    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== DRAFT_EVENT_TYPE) return;
      const draft = parseDraft(event.getContent());
      if (draft) onDraft(draft);
    };
    room.on(RoomEvent.AccountData, handleAccountData);
    return () => {
      room.removeListener(RoomEvent.AccountData, handleAccountData);
    };
  },
});

/** What several in-memory stores share, standing in for the homeserver. */
export type MemoryDraftHub = {
  drafts: Map<string, SyncedDraft>;
  listeners: Set<(roomId: string, draft: SyncedDraft) => void>;
  /** How long a write takes to come back through sync, in ms. */
  echoMs: number;
  /** Every write fails, as when the homeserver can't be reached. */
  failPuts: boolean;
};

export const createMemoryDraftHub = (echoMs: number): MemoryDraftHub => ({
  drafts: new Map(),
  listeners: new Set(),
  echoMs,
  failPuts: false,
});

/** One device's view of a hub: a write lands, and is announced, `echoMs` later. */
export const createMemoryDraftStore = (hub: MemoryDraftHub, device: string): DraftStore => ({
  device,
  get: (roomId) => hub.drafts.get(roomId),
  put: async (roomId, draft) => {
    if (hub.failPuts) throw new Error('offline');
    const copy = JSON.parse(JSON.stringify(draft));
    window.setTimeout(() => {
      hub.drafts.set(roomId, copy);
      hub.listeners.forEach((listener) => listener(roomId, copy));
    }, hub.echoMs);
  },
  subscribe: (roomId, onDraft) => {
    const listener = (id: string, draft: SyncedDraft) => {
      if (id === roomId) onDraft(draft);
    };
    hub.listeners.add(listener);
    return () => {
      hub.listeners.delete(listener);
    };
  },
});
