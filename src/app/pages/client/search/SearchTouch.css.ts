import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const SearchFieldForm = style({
  flexShrink: 0,
  padding: `${config.space.S200} ${config.space.S300}`,
});

// A 48 px pill: the whole of it is the target that focuses the input.
export const SearchField = style({
  height: toRem(48),
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  paddingLeft: config.space.S400,
  borderRadius: config.radii.Pill,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  cursor: 'text',
  selectors: {
    '&:focus-within': {
      outline: `${config.borderWidth.B600} solid ${color.Primary.Main}`,
    },
  },
});

export const SearchFieldInput = style([
  DefaultReset,
  {
    minWidth: 0,
    flexGrow: 1,
    height: '100%',
    // the pill around it is what looks like the field, and what shows the focus
    appearance: 'none',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    // 16 px keeps a phone's browser from zooming in on focus
    fontSize: toRem(16),
    fontFamily: 'inherit',
    selectors: {
      '&::placeholder': {
        color: 'inherit',
        opacity: config.opacity.P300,
      },
      '&:focus, &:focus-visible': {
        outline: 'none',
      },
      // the field has a clear button of its own
      '&::-webkit-search-cancel-button': {
        display: 'none',
      },
    },
  },
]);

export const SearchFieldEnd = style({
  flexShrink: 0,
  width: toRem(48),
});

export const ListLabel = style({
  minHeight: toRem(40),
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${config.space.S400}`,
});

export const ListNote = style({
  padding: `${config.space.S300} ${config.space.S400}`,
});

// laid out as a conversation row, so the two kinds of result line up
export const MessageSearchLabel = style({
  minWidth: 0,
  flexGrow: 1,
  textAlign: 'left',
});

export const MessageSearchTile = style({
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
});
