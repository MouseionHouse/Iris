import { useCallback, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaConfig } from '../../hooks/useMediaConfig';
import {
  TUploadItem,
  TUploadMetadata,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
} from '../../state/room/roomInputDrafts';
import { UploadStatus, createUploadFamilyObserverAtom } from '../../state/upload';
import { summarizeUploads } from '../../components/upload-strip';
import { TUploadContent, encryptFile } from '../../utils/matrix';
import { safeFile } from '../../utils/mimeTypes';
import { fulfilledPromiseSettledResult } from '../../utils/common';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
} from './msgContent';

/**
 * A room composer's attachments: adding, changing and removing them, where their uploads stand,
 * and taking the uploaded ones off as messages.
 */
export const useComposerUploads = (roomId: string) => {
  const mx = useMatrixClient();
  const mediaConfig = useMediaConfig();
  const [items, setItems] = useAtom(roomIdToUploadItemsAtomFamily(roomId));
  const uploads = useAtomValue(
    useMemo(
      () =>
        createUploadFamilyObserverAtom(
          roomUploadAtomFamily,
          items.map((f) => f.file)
        ),
      [items]
    )
  );
  const summary = summarizeUploads(uploads, mediaConfig['m.upload.size'] || Infinity);

  const addFiles = useCallback(
    async (files: File[], encrypted: boolean) => {
      const safeFiles = files.map(safeFile);
      const fileItems: TUploadItem[] = [];

      if (encrypted) {
        const encryptFiles = fulfilledPromiseSettledResult(
          await Promise.allSettled(safeFiles.map((f) => encryptFile(f)))
        );
        encryptFiles.forEach((ef) =>
          fileItems.push({
            ...ef,
            metadata: {
              markedAsSpoiler: false,
            },
          })
        );
      } else {
        safeFiles.forEach((f) =>
          fileItems.push({
            file: f,
            originalFile: f,
            encInfo: undefined,
            metadata: {
              markedAsSpoiler: false,
            },
          })
        );
      }
      setItems({
        type: 'PUT',
        item: fileItems,
      });
    },
    [setItems]
  );

  const setMetadata = useCallback(
    (fileItem: TUploadItem, metadata: TUploadMetadata) => {
      setItems({
        type: 'REPLACE',
        item: fileItem,
        replacement: { ...fileItem, metadata },
      });
    },
    [setItems]
  );

  const replace = useCallback(
    (fileItem: TUploadItem, replacement: TUploadItem) => {
      setItems({ type: 'REPLACE', item: fileItem, replacement });
      roomUploadAtomFamily.remove(fileItem.file);
    },
    [setItems]
  );

  const remove = useCallback(
    (upload: TUploadContent | TUploadContent[]) => {
      const files = Array.isArray(upload) ? upload : [upload];
      setItems({
        type: 'DELETE',
        item: items.filter((f) => files.find((u) => u === f.file)),
      });
      files.forEach((u) => roomUploadAtomFamily.remove(u));
    },
    [setItems, items]
  );

  /** Takes the uploaded attachments off the composer; resolves to their messages, in order. */
  const takeContents = async (): Promise<unknown[]> => {
    const uploaded = items.flatMap((fileItem) => {
      const upload = uploads.find((u) => u.file === fileItem.file);
      return upload?.status === UploadStatus.Success ? [{ fileItem, mxc: upload.mxc }] : [];
    });
    if (uploaded.length === 0) return [];
    const contentsPromises = uploaded.map(async ({ fileItem, mxc }) => {
      if (fileItem.file.type.startsWith('image')) {
        return getImageMsgContent(mx, fileItem, mxc);
      }
      if (fileItem.file.type.startsWith('video')) {
        return getVideoMsgContent(mx, fileItem, mxc);
      }
      if (fileItem.file.type.startsWith('audio')) {
        return getAudioMsgContent(fileItem, mxc);
      }
      return getFileMsgContent(fileItem, mxc);
    });
    remove(uploaded.map(({ fileItem }) => fileItem.file));
    return fulfilledPromiseSettledResult(await Promise.allSettled(contentsPromises));
  };

  return { items, summary, addFiles, setMetadata, replace, remove, takeContents };
};
