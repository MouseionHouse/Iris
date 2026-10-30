import React, {
  KeyboardEventHandler,
  RefObject,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import { EventType, IContent, MsgType, RelationType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { Editor } from 'slate';
import {
  Box,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  Text,
  config,
  toRem,
} from 'folds';

import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  CustomEditor,
  Toolbar,
  toMatrixCustomHTML,
  toPlainText,
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  getAutocompleteQuery,
  getPrevWordRange,
  resetEditor,
  RoomMentionAutocomplete,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  createEmoticonElement,
  moveCursor,
  resetEditorHistory,
  customHtmlEqualsPlainText,
  trimCustomHtml,
  isEmptyEditor,
  getBeginCommand,
  trimCommand,
  getMentions,
} from '../../components/editor';
import { EmojiBoard, EmojiBoardTab } from '../../components/emoji-board';
import { UseStateProvider } from '../../components/UseStateProvider';
import { getImageInfo, getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useTypingStatusUpdater } from '../../hooks/useTypingStatusUpdater';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useFilePasteHandler } from '../../hooks/useFilePasteHandler';
import { useFileDropZone } from '../../hooks/useFileDrop';
import { roomIdToReplyDraftAtomFamily } from '../../state/room/roomInputDrafts';
import { useDraftSync } from '../../hooks/useDraftSync';
import {
  UploadStrip,
  UploadStripHandle,
  UploadsSendButton,
  useSendAfterUploads,
} from '../../components/upload-strip';
import { getImageUrlBlob, loadImageElement } from '../../utils/dom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { getMemberDisplayName, getMentionContent, trimReplyFromBody } from '../../utils/room';
import { CommandAutocomplete } from './CommandAutocomplete';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '../../hooks/useCommands';
import { mobileOrTablet } from '../../utils/user-agent';
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';
import { ReplyLayout, ThreadIndicator } from '../../components/message';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useImagePackRooms } from '../../hooks/useImagePackRooms';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import colorMXID from '../../../util/colorMXID';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useTheme } from '../../hooks/useTheme';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useComposingCheck } from '../../hooks/useComposingCheck';
import { useComposerUploads } from './useComposerUploads';

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
}
export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  ({ editor, fileDropContainerRef, roomId, room }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
    const direct = useIsDirectRoom();
    const commands = useCommands(mx, room);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(roomId));
    const replyUserID = replyDraft?.userId;

    const powerLevelTags = usePowerLevelTags(room, powerLevels);
    const creatorsTag = useRoomCreatorsTag();
    const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
    const theme = useTheme();
    const accessibleTagColors = useAccessiblePowerTagColors(
      theme.kind,
      creatorsTag,
      powerLevelTags
    );

    const replyPowerTag = replyUserID ? getMemberPowerTag(replyUserID) : undefined;
    const replyPowerColor = replyPowerTag?.color
      ? accessibleTagColors.get(replyPowerTag.color)
      : undefined;
    const replyUsernameColor =
      legacyUsernameColor || direct ? colorMXID(replyUserID ?? '') : replyPowerColor;

    const uploads = useComposerUploads(roomId);
    const uploadStripRef = useRef<UploadStripHandle>(null);

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [toolbar, setToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId);

    const { addFiles } = uploads;
    const handleFiles = useCallback(
      (files: File[]) => addFiles(files, room.hasEncryptionStateEvent()),
      [addFiles, room]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hideStickerBtn, setHideStickerBtn] = useState(document.body.clientWidth < 500);

    const isComposing = useComposingCheck();

    useElementSizeObserver(
      useCallback(() => fileDropContainerRef.current, [fileDropContainerRef]),
      useCallback((width) => setHideStickerBtn(width < 500), [])
    );

    // restores the room's draft, keeps it when the room is left, and syncs it to other devices
    const draftSync = useDraftSync(roomId, editor);

    /** Takes the text off the composer (running a command); returns the message to send. */
    const takeTextContent = useCallback((): IContent | undefined => {
      const commandName = getBeginCommand(editor);
      let plainText = toPlainText(editor.children, isMarkdown).trim();
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(editor.children, {
          allowTextFormatting: true,
          allowBlockMarkdown: isMarkdown,
          allowInlineMarkdown: isMarkdown,
        })
      );
      let msgType = MsgType.Text;

      if (commandName) {
        plainText = trimCommand(commandName, plainText);
        customHtml = trimCommand(commandName, customHtml);
      }
      if (commandName === Command.Me) {
        msgType = MsgType.Emote;
      } else if (commandName === Command.Notice) {
        msgType = MsgType.Notice;
      } else if (commandName === Command.Shrug) {
        plainText = `${SHRUG} ${plainText}`;
        customHtml = `${SHRUG} ${customHtml}`;
      } else if (commandName === Command.TableFlip) {
        plainText = `${TABLEFLIP} ${plainText}`;
        customHtml = `${TABLEFLIP} ${customHtml}`;
      } else if (commandName === Command.UnFlip) {
        plainText = `${UNFLIP} ${plainText}`;
        customHtml = `${UNFLIP} ${customHtml}`;
      } else if (commandName) {
        const commandContent = commands[commandName as Command];
        if (commandContent) {
          commandContent.exe(plainText);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        return undefined;
      }

      if (plainText === '') return undefined;

      const body = plainText;
      const formattedBody = customHtml;
      const mentionData = getMentions(mx, roomId, editor);

      const content: IContent = {
        msgtype: msgType,
        body,
      };

      if (replyDraft && replyDraft.userId !== mx.getUserId()) {
        mentionData.users.add(replyDraft.userId);
      }

      const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);
      content['m.mentions'] = mMentions;

      if (replyDraft || !customHtmlEqualsPlainText(formattedBody, body)) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = formattedBody;
      }
      if (replyDraft) {
        content['m.relates_to'] = {
          'm.in_reply_to': {
            event_id: replyDraft.eventId,
          },
        };
        if (replyDraft.relation?.rel_type === RelationType.Thread) {
          content['m.relates_to'].event_id = replyDraft.relation.event_id;
          content['m.relates_to'].rel_type = RelationType.Thread;
          content['m.relates_to'].is_falling_back = false;
        }
      }
      resetEditor(editor);
      resetEditorHistory(editor);
      setReplyDraft(undefined);
      sendTypingStatus(false);
      return content;
    }, [mx, roomId, editor, replyDraft, sendTypingStatus, setReplyDraft, isMarkdown, commands]);

    // the attachments go first, then the text; both leave the composer at once
    const sendDraft = () => {
      const uploadContents = uploads.takeContents();
      const textContent = takeTextContent();
      draftSync.flush();
      uploadContents.then((contents) => {
        contents.forEach((content) => mx.sendMessage(roomId, content as any));
        if (textContent) mx.sendMessage(roomId, textContent as any);
      });
    };

    const {
      pending: sendPending,
      request: submit,
      cancel: cancelSend,
    } = useSendAfterUploads(uploads.summary, sendDraft, (file) =>
      uploadStripRef.current?.reveal(file)
    );
    // a wait for uploads belongs to the room it was asked in
    useEffect(() => cancelSend, [roomId, cancelSend]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          submit();
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }
      },
      [submit, setReplyDraft, enterForNewline, autocompleteQuery, isComposing]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        if (!hideActivity) {
          sendTypingStatus(!isEmptyEditor(editor));
        }

        const prevWordRange = getPrevWordRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(editor, prevWordRange, AUTOCOMPLETE_PREFIXES)
          : undefined;
        setAutocompleteQuery(query);
      },
      [editor, sendTypingStatus, hideActivity]
    );

    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery(undefined);
      ReactEditor.focus(editor);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    const handleStickerSelect = async (mxc: string, shortcode: string, label: string) => {
      const stickerUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
      if (!stickerUrl) return;

      const info = await getImageInfo(
        await loadImageElement(stickerUrl),
        await getImageUrlBlob(stickerUrl)
      );

      mx.sendEvent(roomId, EventType.Sticker, {
        body: label,
        url: mxc,
        info,
      });
    };

    return (
      <div ref={ref}>
        <Overlay
          open={dropZoneVisible}
          backdrop={<OverlayBackdrop />}
          style={{ pointerEvents: 'none' }}
        >
          <OverlayCenter>
            <Dialog variant="Primary">
              <Box
                direction="Column"
                justifyContent="Center"
                alignItems="Center"
                gap="500"
                style={{ padding: toRem(60) }}
              >
                <Icon size="600" src={Icons.File} />
                <Text size="H4" align="Center">
                  {`Drop Files in "${room?.name || 'Room'}"`}
                </Text>
                <Text align="Center">Drag and drop files here or click for selection dialog</Text>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
        {autocompleteQuery?.prefix === AutocompletePrefix.RoomMention && (
          <RoomMentionAutocomplete
            roomId={roomId}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Command && (
          <CommandAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <CustomEditor
          editableName="RoomInput"
          editor={editor}
          placeholder="Send a message..."
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          onChange={draftSync.onChange}
          top={
            <>
              {replyDraft && (
                <div>
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    <IconButton
                      onClick={() => setReplyDraft(undefined)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                    >
                      <Icon src={Icons.Cross} size="50" />
                    </IconButton>
                    <Box direction="Row" gap="200" alignItems="Center">
                      {replyDraft.relation?.rel_type === RelationType.Thread && <ThreadIndicator />}
                      <ReplyLayout
                        userColor={replyUsernameColor}
                        username={
                          <Text size="T300" truncate>
                            <b>
                              {getMemberDisplayName(room, replyDraft.userId) ??
                                getMxIdLocalPart(replyDraft.userId) ??
                                replyDraft.userId}
                            </b>
                          </Text>
                        }
                      >
                        <Text size="T300" truncate>
                          {trimReplyFromBody(replyDraft.body)}
                        </Text>
                      </ReplyLayout>
                    </Box>
                  </Box>
                </div>
              )}
              {uploads.items.length > 0 && (
                <UploadStrip
                  ref={uploadStripRef}
                  items={uploads.items}
                  setMetadata={uploads.setMetadata}
                  onReplace={uploads.replace}
                  onRemove={uploads.remove}
                />
              )}
            </>
          }
          before={
            <IconButton
              onClick={() => pickFile('*')}
              variant="SurfaceVariant"
              size="300"
              radii="300"
            >
              <Icon src={Icons.PlusCircle} />
            </IconButton>
          }
          after={
            <>
              <IconButton
                variant="SurfaceVariant"
                size="300"
                radii="300"
                onClick={() => setToolbar(!toolbar)}
              >
                <Icon src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
              </IconButton>
              <UseStateProvider initial={undefined}>
                {(emojiBoardTab: EmojiBoardTab | undefined, setEmojiBoardTab) => (
                  <PopOut
                    offset={16}
                    alignOffset={-44}
                    position="Top"
                    align="End"
                    anchor={
                      emojiBoardTab === undefined
                        ? undefined
                        : emojiBtnRef.current?.getBoundingClientRect() ?? undefined
                    }
                    content={
                      <EmojiBoard
                        tab={emojiBoardTab}
                        onTabChange={setEmojiBoardTab}
                        imagePackRooms={imagePackRooms}
                        returnFocusOnDeactivate={false}
                        onEmojiSelect={handleEmoticonSelect}
                        onCustomEmojiSelect={handleEmoticonSelect}
                        onStickerSelect={handleStickerSelect}
                        requestClose={() => {
                          setEmojiBoardTab((t) => {
                            if (t) {
                              if (!mobileOrTablet()) ReactEditor.focus(editor);
                              return undefined;
                            }
                            return t;
                          });
                        }}
                      />
                    }
                  >
                    {!hideStickerBtn && (
                      <IconButton
                        aria-pressed={emojiBoardTab === EmojiBoardTab.Sticker}
                        onClick={() => setEmojiBoardTab(EmojiBoardTab.Sticker)}
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                      >
                        <Icon
                          src={Icons.Sticker}
                          filled={emojiBoardTab === EmojiBoardTab.Sticker}
                        />
                      </IconButton>
                    )}
                    <IconButton
                      ref={emojiBtnRef}
                      aria-pressed={
                        hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                      }
                      onClick={() => setEmojiBoardTab(EmojiBoardTab.Emoji)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                    >
                      <Icon
                        src={Icons.Smile}
                        filled={
                          hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                        }
                      />
                    </IconButton>
                  </PopOut>
                )}
              </UseStateProvider>
              <UploadsSendButton
                waiting={
                  sendPending && uploads.summary.state === 'running'
                    ? uploads.summary.progress
                    : undefined
                }
                onSend={submit}
                onCancel={cancelSend}
              />
            </>
          }
          bottom={
            toolbar && (
              <div>
                <Line variant="SurfaceVariant" size="300" />
                <Toolbar />
              </div>
            )
          }
        />
      </div>
    );
  }
);
