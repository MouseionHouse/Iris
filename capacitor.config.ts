import type { CapacitorConfig } from '@capacitor/cli';

// The Android wrapper (mobile/WRAPPER-PLAN.md): a Capacitor shell around the mobile build of this
// fork's web UI. webDir is the mobile bundle (npm run build:mobile: the web build with the mobile
// config.json, scripts/mobile-bundle.js), not dist/, so `npx cap sync` never ships the web config.
const config: CapacitorConfig = {
  appId: 'house.mouseion.chat',
  appName: 'Mouseion Chat',
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
    // Android 15+ (targetSdk 36) forces edge-to-edge: the status/navigation bars always
    // overlay the WebView, so the legacy `overlaysWebView` flag below is a no-op on
    // Android. The SystemBars plugin owns the safe-area insets: with `viewport-fit=cover`
    // in index.html it makes the WebView edge-to-edge and injects `--safe-area-inset-*`
    // CSS variables that the app shell consumes (src/index.css). `initialViewportFitValueHint`
    // matches the meta tag to avoid a first-frame layout jump before it is parsed.
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    StatusBar: {
      // Kept for the web `@capacitor/status-bar` API and any non-Android target; inert on
      // Android 15+ (see above).
      overlaysWebView: false,
    },
  },
};

export default config;
