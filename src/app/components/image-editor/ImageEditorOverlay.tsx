import React from 'react';
import FocusTrap from 'focus-trap-react';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import classNames from 'classnames';
import { ImageEditor, ImageEditorProps } from './ImageEditor';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { ModalWide } from '../../styles/Modal.css';
import { stopPropagation } from '../../utils/keyboard';
import * as css from './ImageEditor.css';

type ImageEditorOverlayProps = Omit<ImageEditorProps, 'compact'>;

/**
 * The editor in the portal: full screen on a phone, the wide modal on desktop. Escape, and
 * so the Android back button, closes it and drops the edit. A click outside does not: it
 * would throw away a drawing.
 */
export function ImageEditorOverlay({ requestClose, ...props }: ImageEditorOverlayProps) {
  const compact = useScreenSizeContext() === ScreenSize.Mobile;

  const editor = (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: false,
        fallbackFocus: () => document.body,
        onDeactivate: requestClose,
        clickOutsideDeactivates: false,
        escapeDeactivates: stopPropagation,
      }}
    >
      {compact ? (
        <div className={css.ImageEditorFullScreen} role="dialog" aria-label="Edit image">
          <ImageEditor compact requestClose={requestClose} {...props} />
        </div>
      ) : (
        <Modal
          className={classNames(ModalWide, css.ImageEditorModal)}
          variant="Surface"
          size="500"
          role="dialog"
          aria-label="Edit image"
        >
          <ImageEditor requestClose={requestClose} {...props} />
        </Modal>
      )}
    </FocusTrap>
  );

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      {compact ? editor : <OverlayCenter>{editor}</OverlayCenter>}
    </Overlay>
  );
}
