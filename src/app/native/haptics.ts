/**
 * A short tick confirming that a touch gesture (e.g. a long-press) was recognised.
 *
 * Uses the Vibration API: available in the Android wrapper's WebView (needs the `VIBRATE`
 * permission in the manifest) and in Android browsers. iOS has no Vibration API, so this is
 * a no-op there, as it is on desktop.
 */
export const hapticTick = (): void => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Best-effort: feedback only.
  }
};
