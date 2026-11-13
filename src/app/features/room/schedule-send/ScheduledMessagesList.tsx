// The open room's scheduled messages: a chip above the composer with the count, opening the list.
// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { useAtom } from 'jotai';
import { IContent } from 'matrix-js-sdk';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { DelayedEvent } from '../../../utils/delayedEvents';
import { trimReplyFromBody } from '../../../utils/room';
import { stopPropagation } from '../../../utils/keyboard';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { roomIdToScheduledListOpenAtomFamily } from '../../../state/scheduledMessages';
import {
  useRefreshScheduledMessages,
  useRoomScheduledMessages,
  useScheduledMessageContent,
  useScheduledMessagesStore,
} from './scheduledMessagesStore';
import { capitalize, sendTimeText } from './sendTimeText';
import * as css from './ScheduledMessagesList.css';

const messageText = (content: IContent | undefined): string | undefined => {
  const body = content?.body;
  if (typeof body !== 'string') return undefined;
  return trimReplyFromBody(body).trim() || undefined;
};

type CancelDialogProps = {
  text?: string;
  onCancelSend: () => void;
  onKeep: () => void;
};
function CancelSendDialog({ text, onCancelSend, onKeep }: CancelDialogProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onKeep,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" role="alertdialog" aria-label="Cancel this scheduled message?">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Cancel this scheduled message?</Text>
              </Box>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              {text && (
                <Text priority="400" className={css.Wrap}>
                  {text}
                </Text>
              )}
              <Box direction="Column" gap="200">
                <Button variant="Critical" onClick={onCancelSend} data-action="confirm-cancel">
                  <Text size="B400">Cancel send</Text>
                </Button>
                <Button variant="Secondary" fill="Soft" onClick={onKeep}>
                  <Text size="B400">Keep scheduled</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type RowProps = {
  event: DelayedEvent;
  onEdit: (event: DelayedEvent, content: IContent) => void;
};
function ScheduledMessageRow({ event, onEdit }: RowProps) {
  const store = useScheduledMessagesStore();
  const refresh = useRefreshScheduledMessages();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const { content, encrypted } = useScheduledMessageContent(event);
  const [expanded, setExpanded] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pending, setPending] = useState<'cancel' | 'send'>();
  const [failed, setFailed] = useState<'cancel' | 'send'>();

  const text = messageText(content);
  const readable = text !== undefined && content !== undefined;
  const time = capitalize(sendTimeText(event.sendTs, hour24Clock));

  const run = async (action: 'cancel' | 'send') => {
    if (pending) return;
    setPending(action);
    setFailed(undefined);
    try {
      if (action === 'cancel') await store.cancel(event.delayId);
      else await store.sendNow(event.delayId);
    } catch {
      setFailed(action);
    } finally {
      setPending(undefined);
      refresh();
    }
  };

  return (
    <Box
      className={css.ScheduledRow}
      direction="Column"
      gap="200"
      role="listitem"
      data-scheduled-row={event.delayId}
      data-encrypted={encrypted || undefined}
    >
      <Box alignItems="Center" gap="200">
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
          {readable ? (
            <button
              type="button"
              className={css.RowText}
              aria-expanded={expanded}
              title={text}
              onClick={() => setExpanded(!expanded)}
            >
              <Text as="span" size="T300">
                {text}
              </Text>
            </button>
          ) : (
            <Box alignItems="Center" gap="100">
              <Icon size="50" src={Icons.Lock} />
              <Text size="T300" priority="300">
                Encrypted message
              </Text>
            </Box>
          )}
          <Box alignItems="Center" gap="100">
            {encrypted && readable && <Icon size="50" src={Icons.Lock} aria-label="Encrypted" />}
            <Text size="T200" priority="300" truncate title={time}>
              {time}
            </Text>
          </Box>
        </Box>
        <Box gap="100" shrink="No" alignItems="Center">
          {pending && <Spinner size="100" variant="Secondary" />}
          {readable && (
            <IconButton
              size="300"
              variant="SurfaceVariant"
              radii="300"
              onClick={() => onEdit(event, content)}
              aria-label="Edit"
              title="Edit"
              disabled={!!pending}
              data-action="edit"
            >
              <Icon size="100" src={Icons.Pencil} />
            </IconButton>
          )}
          <IconButton
            size="300"
            variant="SurfaceVariant"
            radii="300"
            onClick={() => run('send')}
            aria-label="Send now"
            title="Send now"
            disabled={!!pending}
            data-action="send-now"
          >
            <Icon size="100" src={Icons.Send} />
          </IconButton>
          <IconButton
            size="300"
            variant="SurfaceVariant"
            radii="300"
            onClick={() => setConfirmCancel(true)}
            aria-label="Cancel send"
            title="Cancel send"
            disabled={!!pending}
            data-action="cancel"
          >
            <Icon size="100" src={Icons.Delete} />
          </IconButton>
        </Box>
      </Box>
      {failed && (
        <Box alignItems="Center" gap="200" role="alert">
          <Text
            size="T200"
            className={css.Wrap}
            style={{ color: color.Critical.Main, flexGrow: 1 }}
          >
            {failed === 'cancel' ? 'Couldn’t cancel the message' : 'Couldn’t send the message'}
          </Text>
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            radii="300"
            onClick={() => run(failed)}
          >
            <Text size="B300">Try again</Text>
          </Button>
        </Box>
      )}
      {confirmCancel && (
        <CancelSendDialog
          text={text}
          onKeep={() => setConfirmCancel(false)}
          onCancelSend={() => {
            setConfirmCancel(false);
            run('cancel');
          }}
        />
      )}
    </Box>
  );
}

type ScheduledMessagesListProps = {
  roomId: string;
  /** the one held in the composer for editing: left out until the edit is scheduled */
  editingDelayId?: string;
  onEdit: (event: DelayedEvent, content: IContent) => void;
};

export function ScheduledMessagesList({
  roomId,
  editingDelayId,
  onEdit,
}: ScheduledMessagesListProps) {
  const { messages, query } = useRoomScheduledMessages(roomId, true);
  const [open, setOpen] = useAtom(roomIdToScheduledListOpenAtomFamily(roomId));
  const visible = messages.filter((e) => e.delayId !== editingDelayId);

  if (query.isError && !query.data) {
    return (
      <Box className={css.ScheduledMessages} alignItems="Center" gap="200" role="alert">
        <Text size="T200" className={css.Wrap} style={{ color: color.Critical.Main }}>
          Couldn’t load scheduled messages
        </Text>
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          onClick={() => query.refetch()}
        >
          <Text size="B300">Try again</Text>
        </Button>
      </Box>
    );
  }
  if (visible.length === 0) return null;

  const count =
    visible.length === 1 ? '1 scheduled message' : `${visible.length} scheduled messages`;

  return (
    <Box className={css.ScheduledMessages} direction="Column" data-scheduled="list">
      <Box>
        <Chip
          variant={open ? 'Primary' : 'SurfaceVariant'}
          radii="Pill"
          before={<Icon size="50" src={Icons.Clock} />}
          after={<Icon size="50" src={open ? Icons.ChevronBottom : Icons.ChevronTop} />}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          data-action="scheduled-chip"
        >
          <Text size="B300">{count}</Text>
        </Chip>
      </Box>
      {open && (
        <div className={css.ScheduledPanel} role="list" aria-label="Scheduled messages">
          {visible.map((event) => (
            <ScheduledMessageRow key={event.delayId} event={event} onEdit={onEdit} />
          ))}
        </div>
      )}
    </Box>
  );
}
