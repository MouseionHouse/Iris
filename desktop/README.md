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

## Build and run (NixOS)

```sh
nix-shell desktop/shell.nix --run '
  B=~/.cache/build/iris/a    # any directory outside the worktree
  cmake -S desktop -B $B -G Ninja && cmake --build $B && $B/iris'
```

Tests (Qt Test, no display needed):

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
`count-visible` false at 0, and a resend after a reload; and that `colorScheme` is delivered. `IRIS_SHELL_TEST_HOOKS` (environment overrides for the URL, origin, opener and starting colour scheme) is a test
option and must stay off in release builds.

## Layout

- `src/shellconfig.h` — URL, origin, app ID, icon and desktop file name; nothing else hardcodes them.
- `src/navigationpolicy.*` — which URLs the view may show; what is handed to the browser.
- `src/irisbridge.*` — `IrisBridge` (the `irisDesktop` object) and `BridgeHost` (publishes it only on the allowed origin).
- `src/bridge-adapter.js` — builds `window.irisDesktop` (promise methods, `on(event, handler)`); injected with `qwebchannel.js`, guarded by an origin check.
- `src/qml/Main.qml`, `OfflinePage.qml` — window, view, permissions, offline page.
- `src/windowstate.*` — size/position in `~/.config/irisrc`.
- Profile: `~/.local/share/iris/webengine`; downloads: `~/Downloads`.

## Nix package

`nix/package.nix` is `callPackage`-style, no flake. It builds the shell with `IRIS_SHELL_TEST_HOOKS`
off, runs the Qt Test suites in `checkPhase` (offscreen; the e2e script is not part of it), and
installs the binary (Qt-wrapped), `house.mouseion.iris.desktop`, `house.mouseion.iris.notifyrc`
(`share/knotifications6`, one event, `message`; KNotification's component name must be
`house.mouseion.iris`) and the icons (hicolor PNGs from 16 to 512 plus the scalable SVG). The PNGs
in `icons/` are cut by `scripts/iris-icons.py` from `branding/`; rerun it after changing the artwork.
`nix/deps.nix` lists the inputs; `shell.nix` uses it too, so the shell and the package cannot drift.

```sh
nix-build -E 'with import <nixpkgs> { }; callPackage ./desktop/nix/package.nix { }'
nix-build -E 'with import ./desktop/nix/nixpkgs.nix { }; callPackage ./desktop/nix/package.nix { }'  # Builder's pinned nixpkgs
```

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
`scripts/iris-icons.py` or the workflow change, and builds the package against the nixpkgs revision
pinned in `nix/nixpkgs.nix` (copy of nix-config's `flake.lock`; bump it when that moves).
