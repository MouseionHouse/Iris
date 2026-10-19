import { style } from '@vanilla-extract/css';
import { toRem, color, config, DefaultReset, FocusOutline } from 'folds';

/**
 * Layout
 */

export const Base = style({
  maxWidth: toRem(432),
  width: `calc(100vw - 2 * ${config.space.S400})`,
  height: toRem(450),
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderRadius: config.radii.R400,
  boxShadow: config.shadow.E200,
  overflow: 'hidden',
});

export const Header = style({
  padding: config.space.S300,
  paddingBottom: 0,
});

/**
 * Sidebar
 */

export const Sidebar = style({
  width: toRem(54),
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  position: 'relative',
});

export const SidebarContent = style({
  padding: `${config.space.S200} 0`,
});

export const SidebarStack = style({
  width: '100%',
  backgroundColor: color.Surface.Container,
});

export const SidebarDivider = style({
  width: toRem(18),
});

export const SidebarBtnImg = style({
  width: toRem(24),
  height: toRem(24),
  objectFit: 'contain',
});

/**
 * Preview
 */

export const Preview = style({
  padding: config.space.S200,
  margin: config.space.S300,
  marginTop: 0,
  minHeight: toRem(40),

  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const PreviewEmoji = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    fontSize: toRem(32),
    lineHeight: toRem(32),
  },
]);
export const PreviewImg = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    objectFit: 'contain',
  },
]);

/**
 * Group
 */

export const EmojiGroup = style({
  position: 'relative',
  padding: `${config.space.S300} 0`,
});

export const EmojiGroupLabel = style({
  position: 'sticky',
  top: config.space.S200,
  zIndex: 1,

  margin: 'auto',
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: config.radii.Pill,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const EmojiGroupContent = style([
  DefaultReset,
  {
    padding: `0 ${config.space.S200}`,
  },
]);

/**
 * Item
 */

export const EmojiItem = style([
  DefaultReset,
  FocusOutline,
  {
    width: toRem(48),
    height: toRem(48),
    fontSize: toRem(32),
    lineHeight: toRem(32),
    borderRadius: config.radii.R400,
    cursor: 'pointer',

    ':hover': {
      backgroundColor: color.Surface.ContainerHover,
    },
  },
]);

export const StickerItem = style([
  EmojiItem,
  {
    width: toRem(112),
    height: toRem(112),
    // a long-press opens the sticker menu, not the browser's image callout
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  },
]);

export const CustomEmojiImg = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    objectFit: 'contain',
  },
]);

export const StickerImg = style([
  DefaultReset,
  {
    width: toRem(96),
    height: toRem(96),
    objectFit: 'contain',
  },
]);

/**
 * Sticker management
 */

export const BoardRoot = style({
  position: 'relative',
});

export const EmojiGroupHeader = style({
  position: 'sticky',
  top: config.space.S200,
  zIndex: 1,
  padding: `0 ${config.space.S200}`,
});

export const EmojiGroupHeaderLabel = style({
  minWidth: 0,
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: config.radii.Pill,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const EmojiGroupDimmed = style({
  opacity: 0.55,
});

export const StickerEditItem = style({
  position: 'relative',
});

export const StickerDeleteBadge = style([
  DefaultReset,
  FocusOutline,
  {
    position: 'absolute',
    top: config.space.S100,
    right: config.space.S100,
    width: toRem(24),
    height: toRem(24),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: config.radii.Pill,
    backgroundColor: color.Critical.Main,
    color: color.Critical.OnMain,
    boxShadow: config.shadow.E100,
    cursor: 'pointer',
  },
]);

export const BoardBar = style({
  padding: config.space.S200,
  margin: `${config.space.S200} ${config.space.S300} 0`,
  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const BoardBarImg = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    objectFit: 'contain',
  },
]);

export const BoardMenuBackdrop = style({
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  backgroundColor: 'rgba(0, 0, 0, 0.2)',
});

export const BoardMenu = style({
  position: 'absolute',
  zIndex: 3,
  width: toRem(240),
  maxWidth: `calc(100% - 2 * ${config.space.S200})`,
  maxHeight: `calc(100% - 2 * ${config.space.S200})`,
  overflowY: 'auto',
  padding: config.space.S100,
});
