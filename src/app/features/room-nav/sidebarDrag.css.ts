import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const DragTile = style({
  position: 'relative',
});
export const Dragging = style({
  opacity: config.opacity.P300,
});
// A room over a section lights the section's header and rows.
export const Highlight = style({
  backgroundColor: color.Primary.Container,
  borderRadius: config.radii.R400,
});

const line = {
  content: '""',
  position: 'absolute',
  left: 0,
  right: 0,
  height: 2,
  backgroundColor: color.Primary.Main,
  pointerEvents: 'none',
  zIndex: 1,
} as const;
// A section drop: a line between two sections' edges.
export const LineBefore = style({
  selectors: { '&::before': { ...line, top: -1 } },
});
export const LineAfter = style({
  selectors: { '&::after': { ...line, bottom: -1 } },
});
