import React, { ReactNode, useCallback, useState } from 'react';
import { ImageEditorOverlay, isEditableImageType } from '../components/image-editor';
import { selectFile } from '../utils/dom';

export const AVATAR_MAX_EDGE = 1024;

/**
 * Picks an avatar image and, for a static image, has it cropped square in the editor first.
 * `onFile` gets the file to upload: the square crop, or the picked file itself for an
 * animated GIF or an SVG. Cancelling the editor hands over nothing.
 */
export const useAvatarPicker = (onFile: (file: File) => void): [() => void, ReactNode] => {
  const [pending, setPending] = useState<File>();

  const pick = useCallback(async () => {
    const file = await selectFile('image/*', false);
    if (!file) return;
    if (isEditableImageType(file.type)) setPending(file);
    else onFile(file);
  }, [onFile]);

  const handleClose = useCallback(() => setPending(undefined), []);

  const editor = pending && (
    <ImageEditorOverlay
      source={pending}
      name={pending.name}
      title="Crop avatar"
      aspect={1}
      round
      drawing={false}
      preview
      maxEdge={AVATAR_MAX_EDGE}
      onDone={(result) => {
        setPending(undefined);
        onFile(result?.file ?? pending);
      }}
      requestClose={handleClose}
    />
  );

  return [pick, editor];
};
