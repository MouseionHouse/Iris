# Mouseion Android — wrapper plan (2026-09-19)

Owner decision (2026-09-19): stop replicating Cinny in Compose. The Android app becomes a **Capacitor
wrapper** around the web UI built from this fork (`src/`). The web app is the product; native code
exists only for what a WebView cannot do. UI changes are made once, in `src/`, for both platforms.

Phase 0 decisions (owner, "LGTM"):
- Capacitor 8 (`@capacitor/core` + `@capacitor/android` 8.5.x), not a raw WebView, not a TWA.
- Web assets **bundled** in the APK; updates ship through the existing Forgejo → F-Droid pipeline.
- Push stays **UnifiedPush/ntfy**; the existing native push code is reused.
- Same repo, same application id `house.mouseion.chat` (F-Droid updates in place), wrapper replaces
  `mobile/`. `versionCode` keeps being the Forgejo run number.
- The Compose app is archived (tag `mobile-compose-final` at rc131's commit), never merged to `dev`.

**Versioning (added 2026-09-23, owner request):** no more manual `-rcN` tags. Every push to
`mobile/phase-2` touching a tracked path is a release: `.forgejo/workflows/mobile.yml` computes the
next clean semver from the latest `mobile-vX.Y.Z` tag and the pushed commits' messages (`feat:` →
minor, `BREAKING CHANGE:`/`type!:` → major, anything else, including this project's own `mobile: …`
style, → patch), then builds, signs and publishes it — no manual tag, no staging gate. The wrapper's
own line starts at `0.4.0`. The git tag it leaves afterward is a best-effort record, never what
triggers the release. This means: **every push to that branch that touches mobile-relevant files
becomes a real, signed, F-Droid-published version as soon as CI goes green.**

## Why

- Parity never closed: 131 rcs porting components one by one, none seen on a device.
- The design system becomes exact for free (folds CSS), instead of a hand-measured approximation.
- Cinny already has a phone layout (`ScreenSize.Mobile`, breakpoint 750); the fork's mobile fixes
  (sidebar sections, touch targets, safe areas) then serve desktop too.
- Media, PDF, text viewers and the composer work in the WebView; the native player/viewer plumbing
  goes away.

## Architecture

```
mobile/
  android/            Capacitor-generated Android project (Gradle), + our Kotlin:
    app/src/main/java/house/mouseion/chat/
      MainActivity.kt          BridgeActivity + matrix.to intent → web
      MouseionPushService.kt   UnifiedPush receiver (moved, Trixnity replaced by ktor/OkHttp)
      PushPlugin.kt            Capacitor plugin "MouseionPush" (the bridge below)
      PushSummary.kt           event → notification text (moved from shared, pure Kotlin)
  capacitor.config.ts appId house.mouseion.chat, webDir ../dist-mobile, androidScheme https
  WORKTRACK.md, WRAPPER-PLAN.md
build.config.ts / vite: a `mobile` mode → dist-mobile with its own config.json
```

Web build for mobile (`npm run build:mobile` = `vite build --mode mobile`):
- `config.json` (mobile variant): `defaultHomeserver` = mouseion.house only, `allowCustomHomeservers:
  false`, `featuredCommunities` empty, `hashRouter.enabled: true` (Capacitor serves `https://localhost/`
  from assets; hash routing avoids server-side rewrites and survives reloads).
- `base: './'` for the mobile build so assets resolve from the bundle.
- Service worker `src/sw.ts` (adds the access token to media `<img>` fetches) is kept: Android WebView
  runs service workers for https origins. Verified in Phase 1; if it fails, media falls back to
  authenticated fetch in `useMediaAuthentication` paths.
- `navigator.clipboard`, `localStorage`, IndexedDB (matrix-js-sdk store) all work on the
  `https://localhost` secure origin. No E2EE, so no crypto store.

### Bridge contract — Capacitor plugin `MouseionPush` (Kotlin ↔ TS)

Web → native:
- `getState()` → `{ distributors: [{id,label}], endpoint?: string, notificationsAllowed: boolean,
  error?: string }` (from UnifiedPush `getDistributors`, stored endpoint, POST_NOTIFICATIONS).
- `enable({ distributor })` → saves the choice, `UnifiedPush.register(...)`; requests POST_NOTIFICATIONS
  first (API 33+). The endpoint arrives later as an event.
- `disable()` → `UnifiedPush.unregister`, forgets the endpoint.
- `setSession({ baseUrl, userId, accessToken })` → stored in `EncryptedSharedPreferences`, so the push
  service can fetch events while the web app is dead. Called after login and on every app start
  (Cinny's `initMatrix`), `clearSession()` on logout. The web app must never rely on native for auth.
- `openNotificationSettings()`.

Native → web (plugin events):
- `endpoint` `{ pushkey }` — the web app registers/updates the pusher itself with matrix-js-sdk
  `setPusher` (kind `http`, app_id `house.mouseion.chat`, pushkey = endpoint, `data.url` = gateway at
  the endpoint's origin + `/_matrix/push/v1/notify` — the `pushGatewayAt` rule — `format`
  `event_id_only`). One source of truth: the pusher shows in Cinny's Notifications settings.
- `unregistered` — the web app removes the pusher (`kind: null`).
- `notificationTap` `{ roomId, eventId? }` — the web app navigates to the room. Delivered on launch too
  (the activity's intent extras are read when the bridge is ready).
- `deepLink` `{ url }` for matrix.to intents (Capacitor's `App.appUrlOpen` covers this; listed for
  completeness).

Native-only behaviour (unchanged from today): one MessagingStyle notification per room with history
in prefs, `unread == 0` clears it, `prio == "high"` + the sound setting decides sound, summary group.
The Notification Sound switch moves to the web Settings → Notifications page (a mobile-only tile,
stored via the plugin `setSoundEnabled`).

Other Capacitor plugins: `@capacitor/app` (back button → `history.back()`, resume/pause),
`@capacitor/keyboard` + `@capacitor/status-bar` (edge-to-edge, `adjustResize`), `@capacitor/share`,
`@capacitor/filesystem` (Download → `Directory.Documents`/Downloads via MediaStore), `@capacitor/browser`
for external links. File and camera pickers come from the WebView's `<input type=file>` (Capacitor
implements the file chooser, including `capture`).

Text share target (done 2026-09-23, see WORKTRACK): `MouseionShare` plugin (Java,
`mobile/android/app/src/main/java/house/mouseion/chat/`) + an `ACTION_SEND`/`text/*`
intent filter on MainActivity. The plugin's `handleOnNewIntent` (cold start and warm)
notifies `sharedContent` with `retainUntilConsumed`, so cold-start shares survive until
the web registers a listener. Web: `src/app/native/share.ts` holds the text in
`pendingSharedTextAtom`; `SharedContentConsumer` (ClientNonUIFeatures) puts it in the
composer of the room on screen or the last opened room (`src/app/state/lastOpenedRoom.ts`)
as a draft — never auto-sent.

## Phases

### Phase 1 — shell (`mobile-v0.4.0-rc1`)
1. Tag `mobile-compose-final` on the current `mobile/phase-2` HEAD. Remove `mobile/shared`,
   `mobile/androidApp`, `mobile/spike-jvm`, Gradle wrapper files; keep `mobile/tools/cinny-geom`,
   WORKTRACK, this plan. (Compose push code is moved in Phase 2, from the tag.)
2. Web: `--mode mobile` build with `config.mobile.json`, hash router, `base './'`; hide the server
   picker and Register/Reset links when custom homeservers are off (check what Cinny already hides).
3. `npm i @capacitor/core @capacitor/cli @capacitor/android`; `npx cap init`; `npx cap add android`
   into `mobile/android`; application id, minSdk 28, launcher icons and splash from the current app,
   `allowBackup=false`, `Theme` colours from folds Background; `androidScheme: 'https'`.
4. Back button, keyboard resize, status/navigation bar colours following the Cinny theme
   (`@capacitor/status-bar` set from the web side on theme change).
5. CI (`.forgejo/workflows/mobile.yml`): `npm ci` → `npm run typecheck` → `npm run build:mobile` →
   `npx cap sync android` → `./gradlew assembleRelease` in `mobile/android` with the same signing
   secrets; drop the Skiko/jvmTest steps. The android-build image has Node 22.20.
6. Exit: login persists across restarts, rooms/timeline/composer work, images and video play, back
   button behaves, edge-to-edge is right. Owner installs rc1 from F-Droid on the Fold.

### Phase 2 — OS bridges (`rc2`–`rcN`)
1. `MouseionPush` plugin + moved `MouseionPushService`/`PushSummary` on OkHttp/ktor with the stored
   token (`/rooms/{id}/event/{eid}`, room name from `/state/m.room.name`, member display name).
2. Web side: `src/app/native/` — plugin typings, `useNativePush()`, pusher registration on `endpoint`,
   `notificationTap` → navigate, session push on init/login/logout; Notifications settings page gets
   the mobile "Push notifications" (Enable/Allow/Disable, distributor picker) and "Notification Sound"
   tiles, shown only when `Capacitor.isNativePlatform()`.
3. Download/share/open-in-app for attachments (Cinny uses FileSaver → intercept with the Filesystem
   plugin on native), matrix.to deep links, external links in the system browser.
4. Exit: a push arrives with the app killed and tapping it opens the room; hands-on on the Fold
   (owner enters the ntfy password themselves).

### Phase 3 — mobile polish in the web code (both platforms)
- Whatever the Fold hands-on shows: safe-area insets, touch targets, the composer on a soft
  keyboard, the sidebar sections at phone width, long-press menus. Each fix is a `web:` commit.

### Phase 4 — retire the rest
- Delete leftovers, update WORKTRACK's exclusions (everything Cinny does is now included except
  E2EE/calls/spaces by owner choice), memory, and the F-Droid metadata if it names the old app.

## Testing

- Playwright at 412×892 against `vite preview` of the mobile build, signed in as spike
  (`mobile/tools/cinny-geom` already drives chat.example.org this way). The WebView is Chromium, so
  this is representative; the Compose ScreenTour is retired with the Compose app.
- `npm run typecheck` + `npm run lint` in CI.
- Push and device behaviour: owner hands-on on the Fold (emulator automation stays paused).
- Spike live checks: reuse the existing rules (spike room only, never write outside it).

## Risks / open points

- Service worker in the WebView: verify in Phase 1; fallback noted above.
- Cold-start time of matrix-js-sdk + IndexedDB on the phone: measure on rc1; if slow, consider
  `lazyLoadMembers`/sliding sync later — not a blocker.
- Push fetch needs the token natively: EncryptedSharedPreferences; the token is never logged.
- Capacitor's WebView on Samsung (Android System WebView updates via Play/F-Droid Bromite): if a
  WebView bug appears, note the WebView version in About.
- `versionCode` continues from the run number; the F-Droid index keeps ordering.
