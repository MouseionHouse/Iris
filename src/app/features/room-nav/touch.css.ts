import { style } from '@vanilla-extract/css';
import { DefaultReset, FocusOutline, color, config, toRem } from 'folds';

/*
 * The conversation list on a phone: rows, headers and buttons sized for a thumb. Android asks for
 * touch targets of 48 px; where the visible shape is smaller, the button around it is not.
 */
const TOUCH_TARGET = toRem(48);

// A press on a touch screen leaves `:hover` stuck on the element, so hover is for pointers only.
const hover = (backgroundColor: string) => ({
  '@media': {
    '(hover: hover)': {
      selectors: {
        '&:hover': { backgroundColor },
      },
    },
  },
});

const Pressable = style([
  DefaultReset,
  FocusOutline,
  {
    backgroundColor: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background-color 120ms ease',
    selectors: {
      '&:active, &[aria-pressed=true]': {
        backgroundColor: color.Background.ContainerActive,
      },
    },
  },
  hover(color.Background.ContainerHover),
]);

export const TouchHeader = style({
  flexShrink: 0,
  height: toRem(56),
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${config.space.S100} 0 ${config.space.S400}`,
});

export const TouchHeaderTitle = style([
  Pressable,
  {
    minWidth: 0,
    minHeight: TOUCH_TARGET,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
    padding: `0 ${config.space.S200}`,
    marginLeft: `calc(-1 * ${config.space.S200})`,
    borderRadius: config.radii.R400,
  },
]);

export const TouchIconButton = style([
  Pressable,
  {
    position: 'relative',
    flexShrink: 0,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },
]);

export const FilterChips = style({
  flexShrink: 0,
  display: 'flex',
  gap: config.space.S200,
  padding: `0 ${config.space.S400}`,
  overflowX: 'auto',
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': {
      display: 'none',
    },
  },
});

// The pill is 36 px tall; the button around it is the 48 px target.
export const FilterChip = style([
  DefaultReset,
  {
    flexShrink: 0,
    height: TOUCH_TARGET,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    selectors: {
      '&:focus': {
        outline: 'none',
      },
    },
  },
]);

export const FilterChipPill = style({
  height: toRem(36),
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  padding: `0 ${config.space.S400}`,
  borderRadius: config.radii.Pill,
  border: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
  color: color.Background.OnContainer,
  fontWeight: config.fontWeight.W500,
  transition: 'background-color 160ms ease, color 160ms ease',
  selectors: {
    [`${FilterChip}[aria-pressed=true] &`]: {
      borderColor: 'transparent',
      backgroundColor: color.Primary.Container,
      color: color.Primary.OnContainer,
      fontWeight: config.fontWeight.W600,
    },
    [`${FilterChip}:focus-visible &`]: {
      outline: `${config.borderWidth.B600} solid ${color.Primary.Main}`,
      outlineOffset: config.borderWidth.B400,
    },
  },
});

export const FilterChipCount = style({
  opacity: config.opacity.P500,
  fontWeight: config.fontWeight.W600,
});

/** What the list and the + button over its corner sit in. */
export const TouchListArea = style({
  position: 'relative',
  minHeight: 0,
});

// room below the last row, so the + button never covers it
export const TouchListContent = style({
  minHeight: '100%',
  paddingBottom: toRem(88),
});

export const TouchListEmpty = style({
  display: 'flex',
  justifyContent: 'center',
  padding: config.space.S700,
});

// The app shell is already inside the safe area, so the corner is 16 px from the content edge.
export const Fab = style([
  DefaultReset,
  FocusOutline,
  {
    position: 'absolute',
    right: config.space.S400,
    bottom: config.space.S400,
    width: toRem(56),
    height: toRem(56),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: toRem(18),
    backgroundColor: color.Primary.Main,
    color: color.Primary.OnMain,
    boxShadow: config.shadow.E300,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background-color 120ms ease, transform 120ms ease',
    selectors: {
      '&:active': {
        backgroundColor: color.Primary.MainActive,
        transform: 'scale(0.96)',
      },
    },
  },
]);

export const TouchRow = style([
  Pressable,
  {
    width: '100%',
    minHeight: toRem(64),
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
    padding: `${config.space.S200} ${config.space.S400}`,
    // a long-press opens the row's sheet, not the browser's link menu or a text selection
    userSelect: 'none',
    WebkitTouchCallout: 'none',
    selectors: {
      '&:hover': {
        textDecoration: 'unset',
      },
      '&[aria-selected=true], &[data-pressed=true]': {
        backgroundColor: color.Background.ContainerActive,
      },
    },
  },
]);

export const TouchRowAvatar = style({
  // what folds' Avatar gives its image and fallback: a box to fill
  position: 'relative',
  flexShrink: 0,
  width: toRem(44),
  height: toRem(44),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: toRem(13),
});

export const TouchRowIconTile = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const TouchRowBody = style({
  minWidth: 0,
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const TouchRowLine = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
});

export const TouchRowGrow = style({
  minWidth: 0,
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
});

export const TouchRowName = style({
  fontWeight: config.fontWeight.W500,
  selectors: {
    [`${TouchRow}[data-highlight=true] &`]: {
      fontWeight: config.fontWeight.W600,
    },
  },
});

export const TouchRowTime = style({
  flexShrink: 0,
  selectors: {
    [`${TouchRow}[data-highlight=true] &`]: {
      color: color.Primary.Main,
    },
  },
});

export const TouchRowMuted = style({
  flexShrink: 0,
  opacity: config.opacity.P300,
});

export const TouchRowTyping = style({
  color: color.Primary.Main,
});

export const TouchRowDraft = style({
  color: color.Critical.Main,
  fontWeight: config.fontWeight.W500,
});

export const RoomDraftMark = style({
  display: 'flex',
  flexShrink: 0,
  opacity: config.opacity.P300,
});

export const TouchSectionHeader = style({
  minHeight: TOUCH_TARGET,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: config.space.S200,
});

export const TouchSectionButton = style([
  Pressable,
  {
    minWidth: 0,
    flexGrow: 1,
    minHeight: TOUCH_TARGET,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
    padding: `0 ${config.space.S200}`,
    borderRadius: config.radii.R400,
  },
]);

export const TouchSectionIcon = style({
  flexShrink: 0,
  opacity: config.opacity.P400,
});

/** A row of a bottom sheet that is a list of places or actions: an icon, then its name. */
export const SheetAction = style([
  DefaultReset,
  FocusOutline,
  {
    width: '100%',
    minHeight: toRem(56),
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S400,
    padding: `0 ${config.space.S500}`,
    backgroundColor: 'transparent',
    color: 'inherit',
    fontWeight: config.fontWeight.W500,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    selectors: {
      '&:active': {
        backgroundColor: color.Surface.ContainerActive,
      },
      '&[aria-current=true]': {
        color: color.Primary.Main,
      },
      '&[aria-disabled=true]': {
        opacity: config.opacity.P300,
        cursor: 'default',
      },
    },
  },
  {
    '@media': {
      '(hover: hover)': {
        selectors: {
          '&:hover': { backgroundColor: color.Surface.ContainerHover },
        },
      },
    },
  },
]);

export const SheetActionBefore = style({
  position: 'relative',
  flexShrink: 0,
  width: toRem(24),
  height: toRem(24),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: toRem(7),
});

export const SheetActionLabel = style({
  minWidth: 0,
  flexGrow: 1,
  textAlign: 'left',
});

export const SheetActions = style({
  paddingBottom: config.space.S200,
});

/** The name of what a sheet is about, in its handle. */
export const SheetTitle = style({
  width: '100%',
  padding: `0 ${config.space.S400}`,
});
