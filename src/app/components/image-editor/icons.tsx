import React from 'react';

// folds has no crop, rotate or undo icon. Drawn on its 24 px grid, 2 px lines.
const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function CropIcon() {
  return (
    <>
      <path {...line} d="M6 2V16a2 2 0 0 0 2 2H22" />
      <path {...line} d="M2 6H16a2 2 0 0 1 2 2V22" />
    </>
  );
}

export function RotateIcon() {
  return (
    <>
      <path {...line} d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path {...line} d="M20 3.5V8.5H15" />
    </>
  );
}

export function UndoIcon() {
  return (
    <>
      <path {...line} d="M9 14L4 9L9 4" />
      <path {...line} d="M4 9H14.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  );
}
