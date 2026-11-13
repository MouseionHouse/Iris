// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const SchedulePicker = style({
  width: toRem(400),
  maxWidth: '100%',
});

export const SchedulePresets = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
});

export const SchedulePreset = style({
  height: 'auto',
  minWidth: 0,
  justifyContent: 'flex-start',
  padding: `${config.space.S200} ${config.space.S300}`,
  textAlign: 'start',
});

export const ScheduleConfirm = style({
  height: 'auto',
  minHeight: toRem(40),
  padding: `${config.space.S200} ${config.space.S400}`,
  whiteSpace: 'normal',
  textAlign: 'center',
});

export const SplitSend = style({
  display: 'flex',
  alignItems: 'center',
});

export const SplitSendMain = style({
  borderRadius: `${config.radii.R300} 0 0 ${config.radii.R300}`,
});

export const SplitSendChevron = style({
  borderRadius: `0 ${config.radii.R300} ${config.radii.R300} 0`,
  width: toRem(20),
  minWidth: toRem(20),
  paddingInline: 0,
});
