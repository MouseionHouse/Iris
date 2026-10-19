import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const SafeArea = (side: 'top' | 'right' | 'bottom' | 'left') =>
  `var(--safe-area-inset-${side}, env(safe-area-inset-${side}, 0px))`;

/** near-black in both themes, so the photo shows its real colours */
export const STAGE_COLOR = '#0B0C0E';

export const ImageEditor = style([
  DefaultReset,
  {
    height: '100%',
    minHeight: 0,
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
  },
]);

/** the phone layout covers the screen, inside the safe-area insets */
export const ImageEditorFullScreen = style({
  position: 'fixed',
  inset: 0,
  paddingTop: SafeArea('top'),
  paddingRight: SafeArea('right'),
  paddingBottom: SafeArea('bottom'),
  paddingLeft: SafeArea('left'),
  backgroundColor: color.Surface.Container,
});

export const ImageEditorModal = style({
  height: '90vh',
  display: 'flex',
  flexDirection: 'column',
});

export const ImageEditorHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S200,
    paddingRight: config.space.S300,
    borderBottomWidth: config.borderWidth.B300,
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const Stage = style({
  position: 'relative',
  flexGrow: 1,
  minHeight: 0,
  overflow: 'hidden',
  backgroundColor: STAGE_COLOR,
  touchAction: 'none',
  userSelect: 'none',
});

export const StageMessage = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#C9CBD1',
  padding: config.space.S400,
  textAlign: 'center',
});

export const Canvas = style({
  position: 'absolute',
  display: 'block',
  touchAction: 'none',
});

export const CanvasDraw = style({
  cursor: 'crosshair',
});

export const CropFrame = style({
  position: 'absolute',
  touchAction: 'none',
  cursor: 'move',
  outline: 'none',
  border: `${toRem(1)} solid rgba(255, 255, 255, 0.9)`,
  selectors: {
    '&:focus-visible': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 ${toRem(2)} ${color.Primary.Main}`,
    },
  },
});

/** dims everything outside the crop; round for the avatar mask */
export const CropShade = style({
  position: 'absolute',
  inset: toRem(-1),
  pointerEvents: 'none',
  boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.6)',
});

export const CropShadeRound = style({
  borderRadius: '50%',
});

export const CropThird = style({
  position: 'absolute',
  pointerEvents: 'none',
  backgroundColor: 'rgba(255, 255, 255, 0.45)',
});

const HANDLE_HIT = 36;
const HANDLE_ARM = 18;
const HANDLE_THICK = 4;

export const CropHandle = style({
  position: 'absolute',
  width: toRem(HANDLE_HIT),
  height: toRem(HANDLE_HIT),
  marginLeft: toRem(-HANDLE_HIT / 2),
  marginTop: toRem(-HANDLE_HIT / 2),
  touchAction: 'none',
  '::after': {
    content: '""',
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderColor: '#FFFFFF',
    borderStyle: 'solid',
    borderWidth: 0,
    filter: 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.6))',
  },
});

const corner = (
  x: 'left' | 'right',
  y: 'top' | 'bottom',
  cursor: string
): Parameters<typeof style>[0] => ({
  cursor,
  '::after': {
    width: toRem(HANDLE_ARM),
    height: toRem(HANDLE_ARM),
    marginLeft: toRem(x === 'left' ? -HANDLE_THICK / 2 : -HANDLE_ARM + HANDLE_THICK / 2),
    marginTop: toRem(y === 'top' ? -HANDLE_THICK / 2 : -HANDLE_ARM + HANDLE_THICK / 2),
    [`border${x === 'left' ? 'Left' : 'Right'}Width`]: toRem(HANDLE_THICK),
    [`border${y === 'top' ? 'Top' : 'Bottom'}Width`]: toRem(HANDLE_THICK),
  },
});

const edge = (axis: 'x' | 'y', cursor: string): Parameters<typeof style>[0] => ({
  cursor,
  '::after':
    axis === 'x'
      ? {
          width: toRem(HANDLE_ARM),
          height: toRem(HANDLE_THICK),
          marginLeft: toRem(-HANDLE_ARM / 2),
          marginTop: toRem(-HANDLE_THICK / 2),
          backgroundColor: '#FFFFFF',
        }
      : {
          width: toRem(HANDLE_THICK),
          height: toRem(HANDLE_ARM),
          marginLeft: toRem(-HANDLE_THICK / 2),
          marginTop: toRem(-HANDLE_ARM / 2),
          backgroundColor: '#FFFFFF',
        },
});

export const CropHandles = {
  nw: style(corner('left', 'top', 'nwse-resize')),
  ne: style(corner('right', 'top', 'nesw-resize')),
  sw: style(corner('left', 'bottom', 'nesw-resize')),
  se: style(corner('right', 'bottom', 'nwse-resize')),
  n: style(edge('x', 'ns-resize')),
  s: style(edge('x', 'ns-resize')),
  e: style(edge('y', 'ew-resize')),
  w: style(edge('y', 'ew-resize')),
};

export const Toolbar = style({
  flexShrink: 0,
  padding: config.space.S300,
  gap: config.space.S300,
  borderTopWidth: config.borderWidth.B300,
  borderTopStyle: 'solid',
  borderTopColor: color.Surface.ContainerLine,
});

export const ToolRow = style({
  minHeight: toRem(36),
  gap: config.space.S200,
  flexWrap: 'wrap',
});

export const Segmented = style({
  display: 'inline-flex',
  padding: toRem(3),
  gap: toRem(2),
  borderRadius: config.radii.Pill,
  backgroundColor: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

export const SegmentedButton = style([
  DefaultReset,
  {
    display: 'inline-flex',
    alignItems: 'center',
    gap: config.space.S100,
    minHeight: toRem(32),
    padding: `0 ${config.space.S400}`,
    borderRadius: config.radii.Pill,
    border: 'none',
    background: 'none',
    color: color.SurfaceVariant.OnContainer,
    cursor: 'pointer',
    selectors: {
      '&[aria-pressed=true]': {
        backgroundColor: color.Primary.Container,
        color: color.Primary.OnContainer,
      },
      '&:focus-visible': {
        outline: `${toRem(2)} solid ${color.Primary.Main}`,
        outlineOffset: toRem(1),
      },
    },
  },
]);

export const ToolDivider = style({
  width: config.borderWidth.B300,
  alignSelf: 'stretch',
  backgroundColor: color.Surface.ContainerLine,
});

export const Swatch = style([
  DefaultReset,
  {
    width: toRem(30),
    height: toRem(30),
    borderRadius: '50%',
    cursor: 'pointer',
    border: `${toRem(2)} solid ${color.Surface.ContainerLine}`,
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.25)',
    selectors: {
      '&[aria-pressed=true]': {
        borderColor: color.Surface.Container,
        outline: `${toRem(2)} solid ${color.Primary.Main}`,
      },
      '&:focus-visible': {
        outline: `${toRem(2)} solid ${color.Primary.Main}`,
        outlineOffset: toRem(2),
      },
    },
  },
]);

export const SizeButton = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: config.radii.R300,
    border: 'none',
    background: 'none',
    color: color.Surface.OnContainer,
    cursor: 'pointer',
    selectors: {
      '&:hover': { backgroundColor: color.Surface.ContainerHover },
      '&[aria-pressed=true]': {
        backgroundColor: color.Primary.Container,
        color: color.Primary.OnContainer,
      },
      '&:focus-visible': {
        outline: `${toRem(2)} solid ${color.Primary.Main}`,
      },
    },
  },
]);

export const SizeDot = style({
  display: 'block',
  borderRadius: '50%',
  backgroundColor: 'currentColor',
});
