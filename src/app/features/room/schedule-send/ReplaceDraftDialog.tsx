import React from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  config,
} from 'folds';
import { stopPropagation } from '../../../utils/keyboard';

type ReplaceDraftDialogProps = {
  onReplace: () => void;
  onCancel: () => void;
};

/** Asked before Edit puts a scheduled message over text in the composer. */
export function ReplaceDraftDialog({ onReplace, onCancel }: ReplaceDraftDialogProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" role="alertdialog" aria-label="Replace your draft?">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Replace your draft?</Text>
              </Box>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="200">
              <Button variant="Primary" onClick={onReplace} data-action="confirm-replace">
                <Text size="B400">Replace</Text>
              </Button>
              <Button variant="Secondary" fill="Soft" onClick={onCancel}>
                <Text size="B400">Cancel</Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
