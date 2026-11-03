# Iris desktop

A Qt 6 WebEngine + KDE Frameworks 6 shell around `https://iris.example.org`. The web app is the
product; this holds only what a browser cannot do on Plasma. Design: mouseion/iris#63.

This skeleton (#64) opens Iris in a locked-down view: one instance, a persistent profile, other
origins open in the default browser, camera/microphone/screen/location refused, an offline page with
Retry, and the `window.irisDesktop` bridge (offered on the Iris origin only).

The bridge so far (#66): `version()`, `setUnread({ total, highlight })` and the `colorScheme { dark }` event.
`setUnread` validates its arguments (whole numbers, `0 <= highlight <= total <= 1000000`; rejects otherwise)
and `src/badge.*` broadcasts the `com.canonical.Unity.LauncherEntry.Update` signal for
`application://house.mouseion.iris.desktop` (`count`, `count-visible` false at 0), which Plasma draws on the
taskbar icon; it is sent again when a page loads. `highlight` is kept on the bridge for the tray. `colorScheme`
comes from `src/colorscheme.*` (Qt's colour scheme hint, else the window background's lightness) and is replayed
to handlers added late. Web side: `src/app/native/desktop.ts`, `useDesktopBridge.ts`.

Notifications (#68): `notify({ id, roomId, eventId?, title, body, icon?, canReply? })` and
`closeNotifications({ roomId })` go in; `openRoom { roomId, eventId? }` and `reply { roomId, eventId?, text }` come
out (one-shot events, not replayed to late handlers). `src/notifier.*` makes a `KNotification` of the
`message` event of component `house.mouseion.iris` (so System Settings → Notifications lists Iris and Do Not
Disturb applies), with a default action (click: raise the window, emit `openRoom`) and a
`KNotificationReplyAction` ("Reply to <room>") that is left out where the server has no inline reply. It
keeps the notifications per room (same `id` replaces, at most 5 stay up per room, `closeNotifications` closes the
room's). `IrisBridge::notify` checks every field: only the listed keys; Matrix-shaped `roomId` (`!…`) and
`eventId` (`$…`) up to 255; `title` 1–200 and `body` ≤ 2000 UTF-16 units without control characters (newline and
tab allowed in the body); `canReply` a boolean; `icon` only a PNG or JPEG data URL, ≤ 256 KiB decoded and
≤ 1024 px a side (the shell never fetches a URL). The body is HTML-escaped because Plasma reads a subset of
HTML. A reply is cut at 16000 units. The web side is `src/app/native/desktop.ts` (wrapper),
`desktopReply.ts` (what a reply sends), `useDesktopNotifications.tsx` (`useDesktopOpenRoom`, which `matrix:`
links will reuse, plus the click/reply/read-rule handlers) and the delivery switch in
`src/app/pages/client/ClientNonUIFeatures.tsx`.

The tray (#67): `src/tray.*` is a `KStatusNotifierItem` (click toggles the window; menu Show Iris / Quit; tooltip
"Iris: N unread"; the icon becomes `house.mouseion.iris-highlight`, the app icon with a red dot cut by
`scripts/iris-icons.py`, while `highlight > 0`). `src/closetotray.*` turns a close into a hide, so Iris keeps syncing;
only Quit (tray menu or Ctrl+Q), SIGTERM/SIGINT or the end of the session really close it. The first hide shows
"Iris is still running in the tray" once, through `KStatusNotifierItem::showMessage` (a plain freedesktop
notification; `Notifier` is per room, with a click and a reply, which this is not), remembered in `~/.config/irisrc`
(`[Tray] StillRunningNoticeShown`). `--hidden` starts without showing the window (a plain flag; it can sit beside a
URI). `src/globalshortcut.*` registers the KGlobalAccel action "Show or hide Iris" with no default key; set it in System
Settings -> Shortcuts -> Iris. The tray needs a `QApplication` (its menu is a `QMenu`).

`matrix:` links (#69): `house.mouseion.iris.desktop` declares `MimeType=x-scheme-handler/matrix;` and
`Exec=iris %u`, so `xdg-open 'matrix:r/<alias>'` starts Iris or, if it runs, hands the link to it
(`KDBusService::activateRequested`). `src/matrixuri.*` parses the Matrix spec's `matrix:` URI scheme and
nothing else: `roomid/<id>`, `r/<alias>`, `u/<user>`, `/e/<event>` after a room, `?via=` (repeatable, at most 10)
and `action=join|chat`; it is ASCII only, percent-decoded strictly (valid UTF-8, no control, format or
separator characters), and refuses authorities, fragments, empty or extra segments, unknown kinds and URIs over
2048 characters. A link that does not parse is logged ("Dropped matrix: link …") and dropped; the page never
sees raw text. The event is `openLink { kind: 'room'|'alias'|'user', id, eventId?, via?, action? }` (ids with
their sigil), a one-shot event like `openRoom`, held by the shell until the page's adapter is up and by the
adapter until the app listens (so a link on a cold start waits for sign-in), then delivered once. The web side
(`src/app/native/desktop.ts` `parseDesktopLink` checks it again, `desktopLink.ts` routes, `useDesktopOpenLink`
navigates) sends a known room through `useDesktopOpenRoom`, a room Iris is not in to the same join page a
`matrix.to` link clicked in Iris opens, and a user to the direct-message page (the existing DM, or the offer to
start one). A link shows and raises the window, also when the shell was started hidden.

**Limit:** `matrix.to` links clicked in a browser stay in the browser. Linux gives an app no way to claim
`https:` links, so only `matrix:` links reach Iris from outside; `matrix.to` links clicked inside Iris already
open in Iris.

## Build and run (NixOS)

```sh
nix-shell desktop/shell.nix --run '
  B=~/.cache/build/iris/a    # any directory outside the worktree
  cmake -S desktop -B $B -G Ninja && cmake --build $B && $B/iris'
```

Tests (Qt Test, no display needed; `tst_notifier` starts a private session bus with
`dbus-run-session`, so no notification ever reaches the desktop you are on):

```sh
nix-shell desktop/shell.nix --run '
  cmake -S desktop -B $B -G Ninja -DIRIS_SHELL_TEST_HOOKS=ON && cmake --build $B &&
  QT_QPA_PLATFORM=offscreen ctest --test-dir $B --output-on-failure &&
  desktop/tests/e2e/run.sh $B'
```

`tests/e2e/run.sh` runs the app offscreen on a private session bus with a throwaway profile against
two local servers and drives it over the Chrome DevTools Protocol (Node 22+). It checks: the bridge
answers on the allowed origin and is absent elsewhere, external links / `target=_blank` /
`window.open` / redirects go to the opener (stubbed, nothing is launched), the offline page appears
and clears by itself, a second launch is handed to the first, and localStorage and cookies survive a
restart; that `setUnread` produces the right LauncherEntry signal on the private bus (`dbus-monitor`), including
`count-visible` false at 0, and a resend after a reload; and that `colorScheme` is delivered. `tests/e2e/links.mjs` (also run by `run.sh`) does the same for `matrix:` links: a link on a cold start waits for the page and arrives once, a second launch hands its link over, an invalid link is dropped. `tests/e2e/notifications.mjs` (also run by `run.sh`) does the same for notifications against
`tests/fakenotifyd`, a stand-in for `org.freedesktop.Notifications` on the private bus that records `Notify`
and `CloseNotification` calls and can emit `ActionInvoked`, `NotificationReplied` and `NotificationClosed`
(`--no-inline-reply` leaves the capability out). With a stand-in StatusNotifierWatcher (`tests/fakewatcher.cpp`, Plasma's tray on the private bus) it also checks `--hidden`, the tray item's registration, tooltip and icon following `setUnread`, `Activate` and the menu's Show Iris / Quit, close-to-tray (SIGUSR1 in a test build closes the window), the one-time notice and the KGlobalAccel registration. `IRIS_SHELL_TEST_HOOKS` (environment overrides for the URL, origin, opener and starting colour scheme) is a test
option and must stay off in release builds.

## Layout

- `src/shellconfig.h` — URL, origin, app ID, icon and desktop file name; nothing else hardcodes them.
- `src/navigationpolicy.*` — which URLs the view may show; what is handed to the browser.
- `src/irisbridge.*` — `IrisBridge` (the `irisDesktop` object) and `BridgeHost` (publishes it only on the allowed origin).
- `src/matrixuri.*` — the `matrix:` URI parser (pure; `tests/tst_matrixuri.cpp`).
- `src/bridge-adapter.js` — builds `window.irisDesktop` (promise methods, `on(event, handler)`); injected with `qwebchannel.js`, guarded by an origin check.
- `src/qml/Main.qml`, `OfflinePage.qml` — window, view, permissions, offline page.
- `src/windowstate.*` — size/position in `~/.config/irisrc`.
- Profile: `~/.local/share/iris/webengine`; downloads: `~/Downloads`.

## Nix package

`nix/package.nix` is `callPackage`-style, no flake. It builds the shell with `IRIS_SHELL_TEST_HOOKS`
off, runs the Qt Test suites in `checkPhase` (offscreen; the e2e script is not part of it), and
installs the binary (Qt-wrapped), `house.mouseion.iris.desktop`, `house.mouseion.iris.notifyrc`
(`share/knotifications6`, one event, `message`; KNotification's component name must be
`house.mouseion.iris`) and the icons (hicolor PNGs from 16 to 512 plus the scalable SVG,
`branding/iris-mark-on-dark.svg`: the lone mark on a clear ground, as the PWA uses). The PNGs
in `icons/` are cut by `scripts/iris-icons.py` from `branding/`; rerun it after changing the artwork.
`nix/deps.nix` lists the inputs; `shell.nix` uses it too, so the shell and the package cannot drift.

```sh
nix-build -E 'with import <nixpkgs> { }; callPackage ./desktop/nix/package.nix { }'
nix-build desktop/nix/ci.nix -A package --arg lock /path/to/nix-config/flake.lock  # what CI builds
```

Local builds and `shell.nix` use `<nixpkgs>`, whatever your machine has. CI builds through
`nix/ci.nix` against nix-config `main`'s nixpkgs (below); the second command does the same with a
nix-config checkout's lock.

### For nix-config (household/nix-config#159)

```nix
# flake.nix inputs
iris = {
  url = "git+ssh://git@forgejo.example.org:2222/mouseion/iris?ref=dev";
  flake = false;
};

# in a module: no arguments; `source` defaults to the input (desktop/ and branding/)
pkgs.callPackage (inputs.iris + "/desktop/nix/package.nix") { }
```

Put the result in `environment.systemPackages` or `home.packages`; the desktop file, icons and
notifyrc land under `share/`, which Plasma reads from the profile.

### CI

`.forgejo/workflows/build.yml` has a `desktop` job (check only, nothing published) on the
`builder-nix` runner label, the lane with the host's Nix. It runs when `desktop/`, `branding/`,
`scripts/iris-icons.py`, `.forgejo/known_hosts` or the workflow change. Iris's CI owns the build and
the packaging; nix-config only installs the result.

It builds the package and its tests against the nixpkgs household/nix-config's `main` locks:
each run fetches `main`'s `flake.lock` and `nix/ci.nix` follows `root` → `inputs.nixpkgs` to its node
(found by that link, never by name: it is `nixpkgs_2` today) and fetches that node's `locked`
source with `builtins.fetchTree`, verified by its narHash. There is no copy of the pin here to bump;
the check follows `main`, not what Builder last switched to. If Builder runs an older nixpkgs, Builder
needs to switch. The log names nix-config's commit and the nixpkgs rev and narHash it used.

nix-config is private: the job reads it with the repo secret `NIX_CONFIG_READ_KEY`, the private half
of a read-only deploy key on nix-config (deploy key 7), kept in `/dev/shm` for the job and removed
at its end, over ssh that trusts only the host key in `.forgejo/known_hosts`. Without the secret the
job fails and says so.
