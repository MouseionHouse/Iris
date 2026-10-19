import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, UploadStatus } from '../../state/upload';
import { TUploadContent } from '../../utils/matrix';

export type UploadsProgress = { loaded: number; total: number };

/**
 * Where the attachments stand for a send: all uploaded (or none), some still uploading, or one
 * that can't be sent (failed, or over the server's size limit) and blocks the send.
 */
export type UploadsSummary =
  | { state: 'ready' }
  | { state: 'running'; progress: UploadsProgress }
  | { state: 'failed'; file: TUploadContent };

export const isUploadTooBig = (file: TUploadContent, allowSize: number): boolean =>
  file.size >= allowSize;

export const summarizeUploads = (uploads: Upload[], allowSize: number): UploadsSummary => {
  const failed = uploads.find(
    (upload) =>
      upload.status === UploadStatus.Error ||
      (upload.status === UploadStatus.Idle && isUploadTooBig(upload.file, allowSize))
  );
  if (failed) return { state: 'failed', file: failed.file };

  if (uploads.every((upload) => upload.status === UploadStatus.Success)) return { state: 'ready' };

  const progress = uploads.reduce<UploadsProgress>(
    (acc, upload) => {
      acc.total += upload.file.size;
      if (upload.status === UploadStatus.Loading) acc.loaded += upload.progress.loaded;
      if (upload.status === UploadStatus.Success) acc.loaded += upload.file.size;
      return acc;
    },
    { loaded: 0, total: 0 }
  );
  return { state: 'running', progress };
};

/**
 * Send once the attachments are uploaded. `request` sends now when they are, waits while any is
 * still uploading, and hands a failed one to `onBlocked` instead of sending. A wait ends in the
 * send, in `onBlocked` if an upload fails meanwhile, or in `cancel`.
 */
export const useSendAfterUploads = (
  summary: UploadsSummary,
  send: () => void,
  onBlocked: (file: TUploadContent) => void
) => {
  const [pending, setPending] = useState(false);
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const sendRef = useRef(send);
  sendRef.current = send;
  const blockedRef = useRef(onBlocked);
  blockedRef.current = onBlocked;

  const request = useCallback(() => {
    const { current } = summaryRef;
    if (current.state === 'ready') sendRef.current();
    else if (current.state === 'failed') blockedRef.current(current.file);
    else setPending(true);
  }, []);

  const cancel = useCallback(() => setPending(false), []);

  useEffect(() => {
    if (!pending) return;
    if (summary.state === 'ready') {
      setPending(false);
      sendRef.current();
    } else if (summary.state === 'failed') {
      setPending(false);
      blockedRef.current(summary.file);
    }
  }, [pending, summary]);

  return { pending, request, cancel };
};
