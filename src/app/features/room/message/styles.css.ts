import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, FocusOutline, color, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
});

// A long-press opens the action sheet on touch screens, where it would otherwise
// start a text selection. Not applied while editing: it breaks the editor in Safari.
export const MessageTouchActions = style({
  '@media': {
    '(hover: none) and (pointer: coarse)': {
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
    },
  },
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'absolute',
    top: toRem(-30),
    right: 0,
    zIndex: 1,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);

export const BubbleAvatarBase = style({
  paddingTop: 0,
});

export const MessageAvatar = style({
  cursor: 'pointer',
});

export const MessageQuickReaction = style({
  minWidth: toRem(32),
});

export const MessageMenuGroup = style({
  padding: config.space.S100,
});

export const MessageMenuItemText = style({
  flexGrow: 1,
});

/**
 * Action sheet
 */

export const MessageSheetPreview = style({
  width: '100%',
  padding: `0 ${config.space.S400}`,
});

export const MessageSheetPreviewText = style({
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
});

export const MessageSheetReactions = style({
  padding: `${config.space.S100} ${config.space.S400} ${config.space.S300}`,
});

export const MessageSheetReaction = style([
  DefaultReset,
  FocusOutline,
  {
    width: toRem(48),
    height: toRem(48),
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: toRem(26),
    lineHeight: 1,
    borderRadius: config.radii.Pill,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    cursor: 'pointer',

    selectors: {
      '&:active': {
        backgroundColor: color.SurfaceVariant.ContainerActive,
      },
    },
  },
]);

// The sheet renders the items of the desktop menu, resized to touch targets
// and with their icon leading.
export const MessageSheetItems = style({
  padding: `0 ${config.space.S200} ${config.space.S200}`,
});

globalStyle(`${MessageSheetItems} button`, {
  width: '100%',
  minHeight: toRem(48),
  flexDirection: 'row-reverse',
  justifyContent: 'flex-end',
  gap: config.space.S400,
  padding: `0 ${config.space.S300}`,
});

globalStyle(`${MessageSheetItems} button > span`, {
  fontSize: toRem(16),
  lineHeight: toRem(24),
});

globalStyle(`${MessageSheetItems} button > svg`, {
  width: toRem(20),
  height: toRem(20),
  flexShrink: 0,
});

export const MessageEmojiSheet = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: `calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + ${config.space.S400})`,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
});

globalStyle(`${MessageEmojiSheet} > *`, {
  pointerEvents: 'auto',
});

export const ReactionsContainer = style({
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const ReactionsTooltipText = style({
  wordBreak: 'break-word',
});
