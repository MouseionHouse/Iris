import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const SafeAreaBottom = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';
const SafeAreaTop = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';

const slideIn = keyframes({
  from: {
    transform: 'translateY(100%)',
  },
  to: {
    transform: 'translateY(0)',
  },
});

const slideOut = keyframes({
  from: {
    transform: 'translateY(0)',
  },
  to: {
    transform: 'translateY(100%)',
  },
});

export const BottomSheet = style([
  DefaultReset,
  {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    margin: '0 auto',
    maxWidth: toRem(480),
    maxHeight: `calc(100% - ${SafeAreaTop} - ${config.space.S700})`,
    display: 'flex',
    flexDirection: 'column',

    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
    borderRadius: `${config.radii.R500} ${config.radii.R500} 0 0`,
    boxShadow: config.shadow.E400,
    // the overlay is rendered outside of the app shell, which is what pads the safe area
    paddingBottom: SafeAreaBottom,

    animation: `${slideIn} 200ms cubic-bezier(0, 0.8, 0.67, 0.97)`,
    willChange: 'transform',
  },
]);

export const BottomSheetClosing = style({
  animation: `${slideOut} 150ms ease-in forwards`,
});

export const BottomSheetSettle = style({
  transition: 'transform 150ms ease-out',
});

export const BottomSheetHandle = style([
  DefaultReset,
  {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: config.space.S200,
    padding: `${config.space.S300} 0 ${config.space.S200}`,
    // dragged to dismiss the sheet
    touchAction: 'none',
    cursor: 'grab',
  },
]);

export const BottomSheetHandleBar = style({
  width: toRem(36),
  height: toRem(4),
  borderRadius: config.radii.Pill,
  backgroundColor: color.Surface.ContainerLine,
});

export const BottomSheetContent = style([
  DefaultReset,
  {
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
]);
