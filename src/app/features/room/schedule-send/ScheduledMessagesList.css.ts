// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const ScheduledMessages = style({
  padding: `0 0 ${config.space.S200}`,
});

export const ScheduledPanel = style({
  marginTop: config.space.S200,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  borderRadius: config.radii.R400,
  maxHeight: toRem(260),
  overflowY: 'auto',
});

export const ScheduledRow = style({
  padding: `${config.space.S200} ${config.space.S300}`,
  selectors: {
    '& + &': {
      borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    },
  },
});

export const RowText = style([
  DefaultReset,
  {
    display: 'block',
    width: '100%',
    minWidth: 0,
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    selectors: {
      '&[aria-expanded=true]': {
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
      '&:focus-visible': {
        outline: `${config.borderWidth.B600} solid ${color.Primary.Main}`,
        borderRadius: config.radii.R300,
      },
    },
  },
]);

export const Wrap = style({
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

export const TimeBarButton = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
    minWidth: 0,
    padding: `${config.space.S100} ${config.space.S200}`,
    border: 'none',
    borderRadius: config.radii.R300,
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
    selectors: {
      '&:hover, &:focus-visible': {
        backgroundColor: color.SurfaceVariant.ContainerHover,
      },
    },
  },
]);
