import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const TILE_SIZE = 72;

export const UploadStrip = style([
  DefaultReset,
  {
    display: 'flex',
    gap: config.space.S200,
    padding: `${config.space.S200} ${config.space.S200} 0`,
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'thin',
    overscrollBehaviorX: 'contain',
    '@media': {
      '(pointer: coarse)': {
        scrollbarWidth: 'none',
        selectors: {
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      },
    },
  },
]);

export const UploadTile = style([
  DefaultReset,
  {
    position: 'relative',
    flexShrink: 0,
    width: toRem(TILE_SIZE),
    height: toRem(TILE_SIZE),
  },
]);

export const UploadTileFace = style([
  DefaultReset,
  {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: config.radii.R300,
    overflow: 'hidden',
    cursor: 'pointer',
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
    outline: 'none',
    selectors: {
      // the edge sits over the thumbnail
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.Surface.ContainerLine}`,
        pointerEvents: 'none',
      },
      '&:focus-visible': {
        boxShadow: `0 0 0 ${toRem(2)} ${color.Primary.Main}`,
      },
    },
  },
]);

export const UploadTileFailed = style({
  selectors: {
    '&::after': {
      boxShadow: `inset 0 0 0 ${toRem(2)} ${color.Critical.Main}`,
    },
  },
});

export const UploadTileMedia = style([
  DefaultReset,
  {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
  },
]);

export const UploadTileSpoiler = style({
  filter: 'blur(10px)',
  // keeps the blurred edge inside the tile
  transform: 'scale(1.25)',
});

export const UploadTileFile = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: config.space.S100,
    padding: `0 ${config.space.S100}`,
  },
]);

export const UploadTileFileName = style({
  maxWidth: '100%',
});

/** dims the thumbnail under the progress ring or the failure mark */
export const UploadTileScrim = style([
  DefaultReset,
  {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    color: '#FFFFFF',
    pointerEvents: 'none',
  },
]);

export const UploadTileFailedMark = style({
  color: color.Critical.Main,
  backgroundColor: '#FFFFFF',
  borderRadius: config.radii.Pill,
});

export const UploadTilePlay = style([
  DefaultReset,
  {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: toRem(24),
    height: toRem(24),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: config.radii.Pill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#FFFFFF',
    pointerEvents: 'none',
  },
]);

export const UploadTileBadges = style([
  DefaultReset,
  {
    position: 'absolute',
    left: toRem(4),
    bottom: toRem(4),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: toRem(2),
    pointerEvents: 'none',
  },
]);

export const UploadTileBadge = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    height: toRem(16),
    padding: `0 ${toRem(6)}`,
    borderRadius: config.radii.Pill,
    fontSize: toRem(10),
    fontWeight: config.fontWeight.W500,
    lineHeight: toRem(16),
    whiteSpace: 'nowrap',
  },
]);

export const UploadTileBadgeEdited = style({
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
});

export const UploadTileBadgeSpoiler = style({
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: '#FFFFFF',
});

/** the ✕: a 22 px circle in a 32 px hit area, in the tile's top-right corner */
export const UploadTileRemove = style([
  DefaultReset,
  {
    position: 'absolute',
    top: 0,
    right: 0,
    width: toRem(32),
    height: toRem(32),
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: toRem(4),
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#FFFFFF',
  },
]);

export const UploadTileRemoveCircle = style([
  DefaultReset,
  {
    width: toRem(22),
    height: toRem(22),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: config.radii.Pill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    selectors: {
      [`${UploadTileRemove}:hover &, ${UploadTileRemove}:focus-visible &`]: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
      },
    },
  },
]);

export const UploadMenuHeader = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: toRem(2),
    padding: `${config.space.S200} ${config.space.S300}`,
    maxWidth: toRem(260),
  },
]);

export const UploadMenuSheetHeader = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: toRem(2),
    padding: `0 ${config.space.S400}`,
    maxWidth: '100%',
    textAlign: 'center',
  },
]);

export const UploadMenuError = style({
  color: color.Critical.Main,
});

export const ProgressRingTrack = style({
  stroke: 'currentColor',
  opacity: 0.3,
});

export const ProgressRingValue = style({
  stroke: 'currentColor',
  transition: 'stroke-dashoffset 200ms linear',
});
