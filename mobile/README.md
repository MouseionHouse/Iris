# The Android app

Iris on Android is a [Capacitor](https://capacitorjs.com) app: a WebView that runs the same web build as the browser, plus a little Java for what a WebView cannot do on its own. Every screen comes from `src/`, so a change to the web app changes the Android app too.

## What it is

- **One web build.** `npm run build:mobile` runs `vite build` and then [`scripts/mobile-bundle.js`](../scripts/mobile-bundle.js), which copies `dist/` to `dist-mobile/` and puts [`config.mobile.json`](../config.mobile.json) in it as `config.json`. Nothing in [`vite.config.js`](../vite.config.js) depends on the target.
- **Bundled assets.** [`capacitor.config.ts`](../capacitor.config.ts) sets `webDir: 'dist-mobile'`. `npx cap sync android` copies that bundle into the APK, so the app works without loading anything from a web server.
- **A secure origin.** `androidScheme: 'https'` serves the bundle from `https://localhost/`, so IndexedDB, `localStorage`, the service worker and the clipboard behave as on the web.
- **The hash router.** `config.mobile.json` turns on `hashRouter` (basename `/`), since nothing serves `index.html` for unknown paths inside the app.
- **The Android project** is [`android/`](android), with the app ID `house.mouseion.iris`, `minSdk` 28 and `targetSdk` 36 ([`variables.gradle`](android/variables.gradle)). The Java is in [`android/app/src/main/java/house/mouseion/iris/`](android/app/src/main/java/house/mouseion/iris): `MainActivity` registers the two plugins below. The rest supports push and sharing.

## Build and run

You need Node and npm, the Android SDK (platform 36) and JDK 21, which `@capacitor/android` 8 needs.

```sh
npm ci
npm run build:mobile          # dist-mobile/: the web build with the mobile config.json
npx cap sync android          # copy it and Capacitor's plugins into mobile/android
cd mobile/android
./gradlew assembleDebug       # app/build/outputs/apk/debug/
./gradlew installDebug        # or install it on a device connected over adb
```

Point Gradle at the SDK with `ANDROID_HOME` or a `local.properties` holding `sdk.dir=…`. Run `npm run build:mobile` and `npx cap sync android` again after every change to `src/`: the APK holds a copy of the bundle. `./gradlew testDebugUnitTest` runs the Java unit tests (`PushSummaryTest`, `PushHistoryTest`).

The settings come from `config.mobile.json`, as in [README.md's settings table](../README.md#configure-it). The copy in the repo offers the public homeservers. A deployment writes its own over it before the build, as CI does (see [Releases](#releases)).

## Bridge contract

The web app talks to native code through two plugins of its own and two from Capacitor. In the browser the web app makes none of these calls: it checks `Capacitor.isNativePlatform()` first. Events marked "Retained" are kept by the native side until the web app's first listener takes them, so an event that starts the app is not lost.

### `MouseionPush`

[`MouseionPushPlugin.java`](android/app/src/main/java/house/mouseion/iris/MouseionPushPlugin.java), typed in [`src/app/native/pushBridge.ts`](../src/app/native/pushBridge.ts).

| Method                                         | What it does                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`                                   | Resolves `{ distributors: [{ id, label }], distributor?, endpoint?, notificationsAllowed, error?, deviceName }`: the UnifiedPush apps installed, the one in use, the endpoint, whether Android lets Iris notify, the last registration error and `Build.MODEL`. |
| `enable({ distributor })`                      | Asks for the notification permission on Android 13 and later, saves the distributor and registers with it. The endpoint arrives later as `endpoint`.                                                                                                            |
| `refresh()`                                    | Registers again with the distributor already acknowledged, which delivers the endpoint again. Resolves `{ registered }`.                                                                                                                                        |
| `disable()`                                    | Unregisters and forgets the endpoint. Resolves `{ pushkey? }`, the endpoint that was in use, so the web app can remove its pusher.                                                                                                                              |
| `setSession({ baseUrl, userId, accessToken })` | Stores the Matrix session the push service fetches events with. The token is encrypted with an Android Keystore key.                                                                                                                                            |
| `clearSession()`                               | Forgets the session and clears every notification and its history. Called on sign out.                                                                                                                                                                          |
| `setUnreadRooms({ roomIds })`                  | The rooms still unread. The notifications of every other room are cleared.                                                                                                                                                                                      |
| `setSoundEnabled({ enabled })`                 | Whether notifications may play a sound (the Notification Sound setting).                                                                                                                                                                                        |
| `openNotificationSettings()`                   | Opens Android's notification settings for Iris.                                                                                                                                                                                                                 |

| Event             | Data          | What the web app does                                              |
| ----------------- | ------------- | ------------------------------------------------------------------ |
| `endpoint`        | `{ pushkey }` | Registers the pusher for it. Retained.                             |
| `unregistered`    | `{ pushkey }` | Removes that pusher. Retained.                                     |
| `notificationTap` | `{ roomId }`  | Opens the room. Retained.                                          |
| `stateChanged`    | `{}`          | Reads `getState()` again, for example after a registration failed. |

### `MouseionShare`

[`MouseionSharePlugin.java`](android/app/src/main/java/house/mouseion/iris/MouseionSharePlugin.java), typed in [`src/app/native/share.ts`](../src/app/native/share.ts).

| Method                         | What it does                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setShareTargets({ targets })` | Replaces the per-chat share targets. Each target is `{ roomId, label, avatar? }`, with `avatar` a base64 PNG; without one the native side draws the chat's initial. Most relevant first. An empty list removes them all. |

| Event           | Data                | Sent when                                                                                    |
| --------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `sharedContent` | `{ text, roomId? }` | Text is shared to Iris. `roomId` is set when a chat was picked in the share sheet. Retained. |
| `openRoom`      | `{ roomId }`        | A chat shortcut is tapped from the launcher icon's long-press menu. Retained.                |

### Capacitor's plugins

- `App` (`@capacitor/app`): the `backButton` event and `minimizeApp()`, in [`src/app/native/backButton.ts`](../src/app/native/backButton.ts).
- `SystemBars` (`@capacitor/core`): the safe-area insets as CSS variables, configured in `capacitor.config.ts`, and `setStyle()` for the status bar icons, in [`src/app/native/systemChrome.ts`](../src/app/native/systemChrome.ts).

The manifest also lists Iris for `matrix.to` links. Capacitor reports such a link as `App`'s `appUrlOpen` event, which the web app does not listen to yet.

## Push notifications

A WebView does not run while the app is closed, so messages reach the phone through [UnifiedPush](https://unifiedpush.org): a push app on the phone, the distributor, such as [ntfy](https://ntfy.sh), holds the connection and wakes Iris for each message.

- **The web app owns the pusher.** [`src/app/native/push.ts`](../src/app/native/push.ts) hands the session to native code with `setSession`. It registers the Matrix pusher with `setPusher` whenever an `endpoint` event arrives and at every start, then calls `refresh()`. The pusher's pushkey is the endpoint, its gateway is `/_matrix/push/v1/notify` at the endpoint's origin, and its format is `event_id_only`. Registering also removes this device's pushers for older endpoints. Signing out calls `clearSession()`.
- **Turning it on** is in Settings → Notifications ([`SystemNotification.tsx`](../src/app/features/settings/notifications/SystemNotification.tsx)), and a bar at the top of the client ([`PushPrompt.tsx`](../src/app/pages/client/PushPrompt.tsx)) offers it while it is off, or while Android blocks the notifications.
- **While the app is closed**, [`MouseionPushService`](android/app/src/main/java/house/mouseion/iris/MouseionPushService.java) receives each push and [`PushNotifier`](android/app/src/main/java/house/mouseion/iris/PushNotifier.java) fetches the event with the stored session. It retries after 2, 5, 10 and 20 seconds while the network wakes up, and falls back to "New message". Each room gets one conversation notification of up to eight lines, grouped under a summary. A notification makes a sound only for a high-priority push with sounds turned on. A push with no unread messages left clears every notification.
- **While the app is on screen**, pushes show nothing, since the app's own unread badges show the message. Once a sync completes on screen, the web app sends `setUnreadRooms`, which clears the notifications of rooms read here or on another device.
- **Tapping a notification** opens the app and sends `notificationTap`, and the web app opens the room.

## Sharing into Iris

Iris takes text, in two ways:

- **The app** is in the share sheet for `text/*` (the `ACTION_SEND` filter in [`AndroidManifest.xml`](android/app/src/main/AndroidManifest.xml)). A "Send to…" picker asks which chat it goes to.
- **Per-chat targets** (Direct Share): [`SharedContentConsumer.tsx`](../src/app/pages/client/SharedContentConsumer.tsx) publishes the eight most recently active chats with `setShareTargets`, again whenever the app goes to the background, and removes them on sign out. Picking one skips the picker. The same shortcuts appear on a long-press of the launcher icon.

Either way the text lands in the chat's composer as a draft. Iris does not send it until you press send.

## Back button and gesture

[`src/app/native/backButton.ts`](../src/app/native/backButton.ts) handles back in this order:

1. If anything is open in `#portalContainer` (a menu, a dialog, a sheet, the emoji board), back sends it Escape, which closes the top one. Every overlay there sits behind a focus trap that closes on Escape, so a new one needs no code here.
2. Otherwise, or if nothing took the Escape, it goes back in the history.
3. At the start of the history it puts the app in the background, as the home button would, so the session and the sync keep running.

## Edge-to-edge and the theme

Android 15 and later always draw the app under the status and navigation bars. The `SystemBars` plugin, with `insetsHandling: 'css'` and `viewport-fit=cover` in `index.html`, passes the bars' sizes to the page as `--safe-area-inset-*` variables, which the app shell pads by ([`src/index.css`](../src/index.css)). `env(safe-area-inset-*)` covers the same in a browser.

Whenever the theme changes, [`applyThemeChrome`](../src/app/native/systemChrome.ts), called from [`ThemeManager.tsx`](../src/app/pages/ThemeManager.tsx), paints the page background and `theme-color` in the theme's background colour and sets the status bar icons light on a dark theme and dark on a light one. The keyboard resizes the WebView (`adjustResize`).

## Releases

CI ([`.forgejo/workflows/build.yml`](../.forgejo/workflows/build.yml)) builds the app from the same `vite build` as the web image:

- The `bundle` job builds the Dockerfile's `android` stage, which runs `scripts/mobile-bundle.js` and `npx cap sync android` and exports the synced project files and Capacitor's Android libraries. Before the build it writes the deployment's mobile config over `config.mobile.json`, from a repository variable.
- The `apk` job unpacks those over a checkout and runs Gradle with no Node step: the unit tests, then `assembleRelease`.
- On a push to another branch, or in the merge queue, this runs only when something native changed (`mobile/android/`, `capacitor.config.ts`, the npm packages, `scripts/mobile-bundle.js` or the workflow). The APK is unsigned and not minified, versioned `0.0.0-<short commit>`, and kept as an artifact of the run.
- On a push to `dev`, a change to anything the app ships, or to the workflow, is a release. The APK is minified with R8, signed with a keystore from the repository's secrets (passed to Gradle as `MOUSEION_KEYSTORE_PATH`, `MOUSEION_KEYSTORE_PASSWORD`, `MOUSEION_KEY_ALIAS` and `MOUSEION_KEY_PASSWORD`), uploaded with its R8 mapping as artifacts and published to an F-Droid repository.

**Versions.** The version name is the next semantic version after the latest `mobile-vX.Y.Z` tag, from the commit messages since it: `feat:` bumps the minor version, `BREAKING CHANGE:` or `type!:` the major, anything else the patch. With no tag at 0.4.0 or later, the release is 0.4.0. After the release CI tags the commit `mobile-v<version>`, best-effort: the tag records a release and never starts one. The version code is the CI run number, which only grows, as F-Droid requires for an update. A local build is 0.1.0 with version code 1 unless Gradle is given `-PmouseionVersionName` and `-PversionCode`.
