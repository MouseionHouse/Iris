// Editing a scheduled message: its content back into the composer, formatting, mentions and reply
// kept, the way the timeline's message editor loads a message.
import { IContent, MatrixClient, MatrixEvent, RelationType, Room } from 'matrix-js-sdk';
import { Descendant, Editor, Transforms } from 'slate';
import {
  htmlToEditorInput,
  plainToEditorInput,
  resetEditor,
  resetEditorHistory,
} from '../../../components/editor';
import { trimReplyFromBody, trimReplyFromFormattedBody } from '../../../utils/room';
import { IReplyDraft } from '../../../state/room/roomInputDrafts';

/** The message as composer nodes: from its formatted body when it has one. */
export const scheduledToEditorInput = (content: IContent, markdown: boolean): Descendant[] => {
  const { body, format, formatted_body: formattedBody } = content;
  if (format === 'org.matrix.custom.html' && typeof formattedBody === 'string') {
    return htmlToEditorInput(trimReplyFromFormattedBody(formattedBody), markdown);
  }
  return plainToEditorInput(typeof body === 'string' ? trimReplyFromBody(body) : '', markdown);
};

/** Replaces what the composer holds with `nodes`. */
export const putInComposer = (editor: Editor, nodes: Descendant[]) => {
  resetEditor(editor);
  Transforms.select(editor, { anchor: Editor.start(editor, []), focus: Editor.end(editor, []) });
  editor.insertFragment(nodes);
  resetEditorHistory(editor);
};

/** The reply bar for a scheduled reply, from the message it answers. */
export const scheduledReplyDraft = async (
  mx: MatrixClient,
  room: Room,
  content: IContent
): Promise<IReplyDraft | undefined> => {
  const relatesTo = content['m.relates_to'];
  const replyId: unknown = relatesTo?.['m.in_reply_to']?.event_id;
  if (typeof replyId !== 'string') return undefined;

  let replied: MatrixEvent | undefined = room.findEventById(replyId);
  if (!replied) {
    try {
      replied = new MatrixEvent(await mx.fetchRoomEvent(room.roomId, replyId));
    } catch {
      return undefined;
    }
  }
  const senderId = replied.getSender();
  const { body, formatted_body: formattedBody } = replied.getContent();
  if (!senderId || typeof body !== 'string') return undefined;
  const relation =
    relatesTo?.rel_type === RelationType.Thread && typeof relatesTo.event_id === 'string'
      ? { rel_type: RelationType.Thread, event_id: relatesTo.event_id }
      : undefined;
  return { userId: senderId, eventId: replyId, body, formattedBody, relation };
};
