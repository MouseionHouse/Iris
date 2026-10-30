import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { Descendant } from 'slate';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { IEventRelation } from 'matrix-js-sdk';
import { createUploadAtomFamily } from '../upload';
import { TUploadContent } from '../../utils/matrix';
import { createListAtom } from '../list';
import type { ImageEditState } from '../../components/image-editor/imageEdit';

export type TUploadMetadata = {
  markedAsSpoiler: boolean;
};

/** An edited image keeps its untouched source and the edit, so it can be edited again. */
export type TUploadEdit = {
  source: TUploadContent;
  state: ImageEditState;
};

export type TUploadItem = {
  file: TUploadContent;
  originalFile: TUploadContent;
  metadata: TUploadMetadata;
  encInfo: EncryptedAttachmentInfo | undefined;
  edit?: TUploadEdit;
};

export type TUploadListAtom = ReturnType<typeof createListAtom<TUploadItem>>;

export const roomIdToUploadItemsAtomFamily = atomFamily<string, TUploadListAtom>(createListAtom);

export const roomUploadAtomFamily = createUploadAtomFamily();

export type RoomIdToMsgAction =
  | {
      type: 'PUT';
      roomId: string;
      msg: Descendant[];
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

const createMsgDraftAtom = () => atom<Descendant[]>([]);
export type TMsgDraftAtom = ReturnType<typeof createMsgDraftAtom>;
export const roomIdToMsgDraftAtomFamily = atomFamily<string, TMsgDraftAtom>(() =>
  createMsgDraftAtom()
);

/**
 * Where this device stands with the room's synced draft (state/room/draftSync.ts): `key` is the
 * draft it last saved or loaded, `ts` the newest synced draft it has seen. A composer that no
 * longer matches `key` has unsaved changes.
 */
export type TDraftSyncState = { ts: number; key: string };
const createDraftSyncAtom = () => atom<TDraftSyncState>({ ts: 0, key: '' });
export type TDraftSyncAtom = ReturnType<typeof createDraftSyncAtom>;
export const roomIdToDraftSyncAtomFamily = atomFamily<string, TDraftSyncAtom>(() =>
  createDraftSyncAtom()
);

export type IReplyDraft = {
  userId: string;
  eventId: string;
  body: string;
  formattedBody?: string | undefined;
  relation?: IEventRelation | undefined;
};
const createReplyDraftAtom = () => atom<IReplyDraft | undefined>(undefined);
export type TReplyDraftAtom = ReturnType<typeof createReplyDraftAtom>;
export const roomIdToReplyDraftAtomFamily = atomFamily<string, TReplyDraftAtom>(() =>
  createReplyDraftAtom()
);
