import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Profile = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S400,
  padding: `${config.space.S500} ${config.space.S500} ${config.space.S400}`,
});

export const ProfileAvatar = style({
  position: 'relative',
  flexShrink: 0,
  width: toRem(64),
  height: toRem(64),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: toRem(19),
});

export const ProfileNames = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const Rows = style({
  padding: `${config.space.S200} 0`,
});

export const RowAfter = style({
  flexShrink: 0,
  opacity: config.opacity.P300,
});

// The row of the device warning, in the colour the rail's shield has.
export const WarningRow = style({
  color: color.Warning.Main,
  selectors: {
    '&[data-critical=true]': {
      color: color.Critical.Main,
    },
  },
});

export const CriticalRow = style({
  color: color.Critical.Main,
});
