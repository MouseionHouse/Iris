import React, { FormEventHandler, MouseEventHandler, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Text,
  config,
} from 'folds';
import { stopPropagation } from '../../utils/keyboard';
import { EmojiBoard } from '../../components/emoji-board';
import { SidebarSection, sectionName } from '../../state/sidebar';

type SectionDialogProps = {
  /** The section being renamed, or undefined to create one. */
  section?: SidebarSection;
  onSubmit: (name: string, emoji?: string) => void;
  onCancel: () => void;
};

/** Slack's create / rename section dialog: a name and an optional emoji. */
export function SectionDialog({ section, onSubmit, onCancel }: SectionDialogProps) {
  const [name, setName] = useState(section ? sectionName(section) : '');
  const [emoji, setEmoji] = useState<string | undefined>(section?.emoji);
  const [emojiAnchor, setEmojiAnchor] = useState<RectCords>();
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  const handleEmojiButton: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (emoji) {
      setEmoji(undefined);
      return;
    }
    setEmojiAnchor(evt.currentTarget.getBoundingClientRect());
  };
  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), emoji);
  };

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
          <Dialog variant="Surface">
            <Header
              style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">{section ? 'Rename section' : 'Create new section'}</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box
              as="form"
              onSubmit={handleSubmit}
              style={{ padding: config.space.S400, paddingTop: 0 }}
              direction="Column"
              gap="400"
            >
              <Box gap="200" alignItems="End">
                <Box direction="Column" gap="100" shrink="No">
                  <Text size="L400">Emoji</Text>
                  <PopOut
                    anchor={emojiAnchor}
                    position="Bottom"
                    align="Start"
                    content={
                      <EmojiBoard
                        imagePackRooms={[]}
                        returnFocusOnDeactivate={false}
                        addToRecentEmoji={false}
                        onEmojiSelect={(unicode) => {
                          setEmoji(unicode);
                          setEmojiAnchor(undefined);
                        }}
                        requestClose={() => setEmojiAnchor(undefined)}
                      />
                    }
                  >
                    <Chip
                      ref={emojiButtonRef}
                      type="button"
                      variant="Secondary"
                      radii="300"
                      size="500"
                      aria-pressed={!!emojiAnchor}
                      onClick={handleEmojiButton}
                      before={emoji ? undefined : <Icon size="100" src={Icons.Smile} />}
                      after={emoji ? <Icon size="50" src={Icons.Cross} /> : undefined}
                    >
                      {emoji && <Text size="T400">{emoji}</Text>}
                    </Chip>
                  </PopOut>
                </Box>
                <Box direction="Column" gap="100" grow="Yes">
                  <Text size="L400">Name</Text>
                  <Input
                    size="500"
                    autoFocus
                    variant="Background"
                    placeholder="Family"
                    value={name}
                    onChange={(evt) => setName(evt.currentTarget.value)}
                    required
                  />
                </Box>
              </Box>
              <Text size="T200" priority="300">
                Chats and rooms can be moved here from their menu.
              </Text>
              <Button type="submit" variant="Primary" disabled={!name.trim()}>
                <Text size="B400">{section ? 'Save' : 'Create'}</Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
