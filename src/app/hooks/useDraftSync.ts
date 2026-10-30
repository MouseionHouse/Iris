import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtomValue, useStore } from 'jotai';
import { Descendant, Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import { useMatrixClient } from './useMatrixClient';
import { isEmptyEditor, resetEditor, resetEditorHistory } from '../components/editor';
import {
  DraftStore,
  SyncedDraft,
  createMatrixDraftStore,
  draftKey,
  draftText,
  hasDraft,
  makeDraft,
} from '../state/room/draftSync';
import {
  roomIdToDraftSyncAtomFamily,
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
} from '../state/room/roomInputDrafts';

/** How long the composer stays still before its draft is saved. */
const SAVE_DELAY_MS = 1500;

/** The sync key after a failed save: matches no composer, so it counts as unsaved. */
const UNSAVED = '\u0000unsaved';

const DraftStoreContext = createContext<DraftStore | undefined>(undefined);

/** Swaps the account-data store for another (the mocks' in-memory one). */
export const DraftStoreProvider = DraftStoreContext.Provider;

export const useDraftStore = (): DraftStore => {
  const provided = useContext(DraftStoreContext);
  const mx = useMatrixClient();
  return useMemo(() => provided ?? createMatrixDraftStore(mx), [provided, mx]);
};

/** The room's synced draft, if it has one. */
export const useRoomDraft = (roomId: string): SyncedDraft | undefined => {
  const store = useDraftStore();
  const [draft, setDraft] = useState(() => store.get(roomId));
  useEffect(() => {
    setDraft(store.get(roomId));
    return store.subscribe(roomId, setDraft);
  }, [store, roomId]);
  return hasDraft(draft) ? draft : undefined;
};

/** What the room list says of the room's draft: its text, or who it replies to. */
export const useRoomDraftPreview = (
  roomId: string,
  nameOf: (userId: string) => string
): string | undefined => {
  const draft = useRoomDraft(roomId);
  if (!draft) return undefined;
  return draftText(draft.msg) || `replying to ${nameOf(draft.reply?.userId ?? '')}`;
};

/** Puts `msg` in the composer in place of what is there. */
const replaceContent = (editor: Editor, msg: Descendant[] | undefined) => {
  const empty = !msg || msg.length === 0;
  if (empty && isEmptyEditor(editor)) return;
  if (!isEmptyEditor(editor)) resetEditor(editor);
  if (!empty) {
    Transforms.insertFragment(editor, JSON.parse(JSON.stringify(msg)), {
      at: Editor.end(editor, []),
    });
  }
  resetEditorHistory(editor);
  if (ReactEditor.isFocused(editor as ReactEditor)) {
    Transforms.select(editor, Editor.end(editor, []));
  }
};

/**
 * Keeps a room's composer and reply bar in step with its synced draft (mouseion/iris#60).
 *
 * The composer saves 1.5 s after it stops changing, and at once when the room is left or the page
 * is hidden; `flush` saves now (after a send). A draft from elsewhere replaces the composer only
 * while this device has no unsaved changes, so text being typed is never replaced.
 *
 * Owns the composer's content for the room: it restores the draft when the room opens and keeps it
 * in `roomIdToMsgDraftAtomFamily` when the room is left.
 */
export const useDraftSync = (roomId: string, editor: Editor) => {
  const store = useDraftStore();
  const jotai = useStore();
  const msgAtom = roomIdToMsgDraftAtomFamily(roomId);
  const replyAtom = roomIdToReplyDraftAtomFamily(roomId);
  const syncAtom = roomIdToDraftSyncAtomFamily(roomId);
  const replyDraft = useAtomValue(replyAtom);
  const timerRef = useRef<number>();

  const currentKey = useCallback(
    () => draftKey(editor.children, jotai.get(replyAtom)),
    [editor, jotai, replyAtom]
  );

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const reply = jotai.get(replyAtom);
    const key = draftKey(editor.children, reply);
    const sync = jotai.get(syncAtom);
    if (key === sync.key) return;
    // later than any draft seen here, whatever this device's clock says
    const ts = Math.max(Date.now(), sync.ts + 1);
    jotai.set(syncAtom, { ts, key });
    store.put(roomId, makeDraft(ts, store.device, editor.children, reply)).catch(() => {
      // not kept: unsaved again, so the next change or hide retries and nothing replaces it
      const now = jotai.get(syncAtom);
      if (now.key === key) jotai.set(syncAtom, { ...now, key: UNSAVED });
    });
  }, [roomId, editor, store, jotai, replyAtom, syncAtom]);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current =
      currentKey() === jotai.get(syncAtom).key
        ? undefined
        : window.setTimeout(flush, SAVE_DELAY_MS);
  }, [currentKey, flush, jotai, syncAtom]);

  // opening the room: this device's draft, or a newer one from elsewhere
  useEffect(() => {
    const local = jotai.get(msgAtom);
    const sync = jotai.get(syncAtom);
    const remote = store.get(roomId);
    const unsaved = draftKey(local, jotai.get(replyAtom)) !== sync.key;

    if (remote && remote.ts > sync.ts && !unsaved) {
      replaceContent(editor, remote.msg);
      jotai.set(replyAtom, remote.reply);
      jotai.set(syncAtom, { ts: remote.ts, key: draftKey(editor.children, remote.reply) });
    } else {
      replaceContent(editor, local);
      if (remote && remote.ts > sync.ts) jotai.set(syncAtom, { ...sync, ts: remote.ts });
      scheduleSave();
    }

    const unsubscribeRemote = store.subscribe(roomId, (draft) => {
      const now = jotai.get(syncAtom);
      // this device's own echo, or older than what it has
      if (draft.ts <= now.ts) return;
      if (currentKey() !== now.key) {
        // unsaved changes here: they save later than this, and win
        jotai.set(syncAtom, { ...now, ts: draft.ts });
        return;
      }
      replaceContent(editor, draft.msg);
      jotai.set(replyAtom, draft.reply);
      jotai.set(syncAtom, { ts: draft.ts, key: draftKey(editor.children, draft.reply) });
    });

    // text shared from another app while the room is open (SharedContentConsumer)
    const unsubscribeShared = jotai.sub(msgAtom, () => {
      const shared = jotai.get(msgAtom);
      if (shared.length === 0) return;
      Transforms.insertFragment(editor, shared);
      scheduleSave();
    });

    return () => {
      unsubscribeRemote();
      unsubscribeShared();
      flush();
      jotai.set(msgAtom, isEmptyEditor(editor) ? [] : JSON.parse(JSON.stringify(editor.children)));
      replaceContent(editor, undefined);
    };
    // only on opening and leaving the room
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, editor, store]);

  // the reply bar saves like the text
  useEffect(() => {
    scheduleSave();
  }, [replyDraft, scheduleSave]);

  // Android may kill a hidden app: save before that
  useEffect(() => {
    const handleHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', handleHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  return { onChange: scheduleSave, flush };
};
