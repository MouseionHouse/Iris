import type { CapacitorConfig } from '@capacitor/cli';

// The Android wrapper (mobile/WRAPPER-PLAN.md): a Capacitor shell around the mobile build of this
// fork's web UI. webDir points at the mobile build's output (npm run build:mobile), not the
// desktop dist/, so `npx cap sync` never picks up a stray desktop build by accident.
const config: CapacitorConfig = {
  appId: 'house.mouseion.chat',
  appName: 'Mouseion',
  webDir: 'dist-mobile',
  android: {
    path: 'mobile/android',
  },
  server: {
    // https://localhost/ (not the default http://) so IndexedDB, localStorage, the service
    // worker and navigator.clipboard all run on a secure-origin WebView, matching the desktop
    // deployment closely enough that Cinny's own origin checks do not need special-casing.
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      // The status bar reserves its own space rather than overlaying the WebView. Cinny's CSS
      // does not account for a transparent status bar yet (no safe-area insets); true edge-to-edge
      // is Phase 3 (mobile/WRAPPER-PLAN.md) once that is done properly.
      overlaysWebView: false,
    },
  },
};

export default config;
