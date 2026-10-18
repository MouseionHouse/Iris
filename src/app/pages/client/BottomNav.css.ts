import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const SafeAreaBottom = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';

/*
 * The bar along the bottom of a phone, in place of the rail. The app shell is padded by the safe
 * area already (index.css), so the bar ends where the gesture area starts and adds no inset of
 * its own. The strip below it would show the page behind the shell, so the bar paints that strip
 * too: a pseudo-element of its own colour hangs under it, as tall as the inset.
 */
export const BottomNav = style({
  position: 'relative',
  flexShrink: 0,
  height: toRem(64),
  display: 'flex',
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  borderTop: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  selectors: {
    '&::after': {
      content: '',
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      height: SafeAreaBottom,
      backgroundColor: 'inherit',
    },
  },
});

// Each tab is a fifth of the bar and all of its height, whatever its label.
export const BottomNavItem = style([
  DefaultReset,
  {
    flex: '1 1 0',
    minWidth: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: toRem(4),
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

export const BottomNavPill = style({
  position: 'relative',
  width: toRem(56),
  height: toRem(30),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: toRem(15),
  transition: 'background-color 160ms ease, color 160ms ease',
  selectors: {
    [`${BottomNavItem}[aria-current=page] &`]: {
      backgroundColor: color.Primary.Container,
      color: color.Primary.OnContainer,
    },
    [`${BottomNavItem}:active &`]: {
      backgroundColor: color.Surface.ContainerActive,
    },
    [`${BottomNavItem}[aria-current=page]:active &`]: {
      backgroundColor: color.Primary.ContainerActive,
    },
    [`${BottomNavItem}:focus-visible &`]: {
      outline: `${config.borderWidth.B600} solid ${color.Primary.Main}`,
      outlineOffset: config.borderWidth.B400,
    },
  },
});

export const BottomNavLabel = style({
  maxWidth: '100%',
  padding: `0 ${config.space.S100}`,
  selectors: {
    [`${BottomNavItem}[aria-current=page] &`]: {
      fontWeight: config.fontWeight.W600,
    },
  },
});

// over the corner of the icon, clear of it
export const BottomNavBadge = style({
  position: 'absolute',
  top: toRem(-5),
  left: `calc(50% + ${toRem(6)})`,
  display: 'flex',
});

// a dot says there is something to see without a number to read
export const BottomNavDot = style({
  position: 'absolute',
  top: toRem(1),
  left: `calc(50% + ${toRem(9)})`,
  width: toRem(10),
  height: toRem(10),
  borderRadius: '50%',
  backgroundColor: color.Warning.Main,
  border: `${config.borderWidth.B600} solid ${color.Surface.Container}`,
  selectors: {
    '&[data-critical=true]': {
      backgroundColor: color.Critical.Main,
    },
  },
});

export const BottomNavAvatar = style({
  position: 'relative',
  width: toRem(24),
  height: toRem(24),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: toRem(8),
});
