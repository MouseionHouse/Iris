# Iris for macOS

A small native Swift shell around the Iris web app: one window with a `WKWebView` on the live web app
at `IRIS_URL` (never bundled assets), the Mac counterpart of the Linux Qt/KDE shell in `desktop/`.
The web app is the product; this holds only what a browser can't do on a Mac.

- One window and one instance. The data store is persistent (`~/Library/WebKit/house.mouseion.iris`),
  so login, IndexedDB and the service worker survive a relaunch. Closing the window keeps Iris
  running in the Dock, where it keeps syncing; clicking the Dock icon brings it back, and ⌘Q quits.
- Main-frame navigation stays on the Iris origin. Other sites, `target=_blank` and `window.open` go
  to the default browser, and only `http:`, `https:` and `mailto:` links are handed out.
- Camera, microphone and screen sharing are refused, so desktop calls stay off, as on Linux.
  Location gets nothing either: the app has no location usage description.
- An offline page with Retry, which also retries by itself every 15 s and when the network comes back.
- Downloads go to `~/Downloads`. The file picker, alerts and confirms are the system's own.
- The `window.irisDesktop` bridge, on the Iris origin only, with the same contract as Linux:
  [`desktop/BRIDGE.md`](../desktop/BRIDGE.md).
  - `setUnread`: the Dock badge shows the unread count, with none at 0.
  - `notify` / `closeNotifications`: notifications go through `UNUserNotificationCenter`, threaded per
    room, with a Reply field where `canReply`. A click opens the room (`openRoom`) and a reply is
    sent as `reply`. At most 5 per room stay up, the same `id` replaces one, and all are removed
    at quit.
  - `colorScheme` follows the system's light or dark appearance.
  - The page's notification permission reads granted, as the Linux shell grants it, so Iris's
    notification setting shows its switch.
  - `openLink`: `matrix:` links come in through `CFBundleURLTypes`, are parsed by the Linux rules
    and are held until the page listens.
- Web Inspector: Safari → Develop → _this Mac_ → Iris.

## Layout

- `Sources/IrisShellCore/` holds the bridge's checks and state, the `matrix:` parser, the navigation
  policy and the notification bookkeeping. It's Foundation only and ported from `desktop/src`, so its
  tests (`Tests/`) also run on Linux.
- `Sources/Iris/` is the app: `AppDelegate` (window, menu, links, Dock badge, appearance),
  `WebController` (the web view, its policies, downloads and the bridge's message handler),
  `Notifier` (`UNUserNotificationCenter`), `OfflineView`, and `Shell` (configuration and logging).
- `Resources/bridge-adapter.js` builds `window.irisDesktop` on the WebKit message handler. It's
  injected wrapped in an origin check, and the shell also checks each message's frame and origin.
- `Resources/AppIcon-1024.png` is the icon's master, cut by `make-icon.sh` from `branding/`.

## Build and test (on a Mac with Xcode)

```sh
cd desktop-macos
swift test                                             # the core's tests
IRIS_URL=https://iris.example.org ./build.sh           # Iris.app in ~/.cache/build/iris/desktop-macos/out
IRIS_URL=https://iris.example.org OUT_DIR=~/Applications ./build.sh   # straight into ~/Applications
ARCHS="arm64 x86_64" IRIS_URL=… ./build.sh             # universal (Apple Silicon and Intel)
```

`build.sh` wraps the SwiftPM binary in `Iris.app` (bundle id `house.mouseion.iris`, macOS 13 or
later), writes the `Info.plist` (`IrisURL`, the `matrix` URL scheme, version from `IRIS_VERSION`
and `IRIS_BUILD_NUMBER`), makes the icon and signs the app ad hoc. To sign it with a Developer ID and notarize it, see
[Signing](#signing). There is no updater yet. The core's tests also run on Linux:
`nix-shell -p swift swiftpm --run 'swift test'`.

End-to-end checks need a test build and a logged-in desktop session, because they open a window.
CI's runner user has no session, so these are run by hand:

```sh
TEST_HOOKS=1 IRIS_URL=https://iris.example.org OUT_DIR=~/Applications ./build.sh   # "Iris Test.app"
node tests/e2e/run.mjs ~/Applications/"Iris Test.app"
```

`tests/e2e/run.mjs` serves two local origins and runs the test build against them. It checks the
bridge on the allowed origin and its absence in a frame from the other, `setUnread` and the badge,
`notify` and `closeNotifications` with their refusals (including an icon that doesn't decode), and
`colorScheme`, and that the page's notification permission reads granted. It checks that links and `window.open` go to the opener and `file:` isn't opened,
that `matrix:` links arrive on a cold start and while running and a bad one is dropped, and that
there's one instance. It also checks that localStorage survives a relaunch and that the offline page
clears by itself. A test build has `IRIS_SHELL_TEST_HOOKS` and reads these environment variables:
`IRIS_SHELL_START_URL`, `IRIS_SHELL_ALLOWED_ORIGIN`, `IRIS_SHELL_OPEN_LOG` (URLs it would open go
to this file, so nothing is launched), `IRIS_SHELL_STATE_LOG` (`IRIS_STATE` lines),
`IRIS_SHELL_COLOR_SCHEME` and `IRIS_SHELL_RETRY_MS`. Never ship one.

The shell logs to the unified log under subsystem `house.mouseion.iris`. It logs states and counts
and never what a message says:

```sh
log show --last 10m --predicate 'subsystem == "house.mouseion.iris"'
```

## Signing

An ad-hoc signed app runs on the Mac that built it, but macOS warns about it anywhere else. To
give it to other people, sign it with an Apple Developer ID and notarize it.

`.forgejo/actions/macos-sign` does this on a Mac, and the maintainer's CI uses it after
`build.sh`. It is a composite action around `macos-sign.sh`, which you can also run by hand with
the same inputs as `MS_*` environment variables (see `action.yml`). It needs:

- `app`: the `Iris.app` to sign, and `entitlements`: `desktop-macos/Iris.entitlements`;
- a Developer ID Application certificate with its private key, exported as a `.p12` and
  base64-encoded, and the `.p12`'s password;
- for notarization, an App Store Connect API key: the `.p8` file base64-encoded, its key ID and
  its issuer ID;
- optionally, your Apple team ID, so a certificate from another team is refused.

It imports the certificate into a keychain that lasts only for the step, signs with the hardened
runtime, zips the app, notarizes and staples it, and checks the result. Without a certificate it
changes nothing and says so, and the app stays ad-hoc signed; without a notary key it signs but
does not notarize. Keep the certificate, its password and the key in your CI's secret store,
never in the repository.

## Install

1. Build `Iris.app` for your Iris's URL as in [Build and test](#build-and-test-on-a-mac-with-xcode),
   with `OUT_DIR=~/Applications`, or move it to `/Applications` or `~/Applications`
   afterwards. Notifications need the app in an Applications folder.
2. An app you built yourself opens without a warning on that Mac. An ad-hoc signed app copied
   from another Mac is refused the first time: open it once, then go to
   System Settings → Privacy & Security and click **Open Anyway**.
   From a terminal, `xattr -dr com.apple.quarantine /Applications/Iris.app` does the same.
3. Allow notifications when Iris asks.
