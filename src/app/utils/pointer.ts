// Tracks whether the latest user input came from a finger, so touch-only behaviour (the
// message action sheet) and pointer/keyboard-only behaviour (the hover toolbar) can tell
// which one they are serving. Screen size is the wrong signal: a tablet is wide and touch,
// a narrow desktop window is not.
let touchInput = false;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (evt) => {
      touchInput = evt.pointerType === 'touch';
    },
    { capture: true, passive: true }
  );
  window.addEventListener(
    'keydown',
    () => {
      touchInput = false;
    },
    { capture: true, passive: true }
  );
}

export const isTouchInput = (): boolean => touchInput;
