# The `irisDesktop` bridge

The contract between the Iris web app and the desktop shells around it: the Linux Qt/KDE shell
(`desktop/`) and the macOS Swift shell (`desktop-macos/`).
Both follow this page; a change to the bridge changes this page, both shells and their tests together.
The web side is `src/app/native/desktop.ts` (the typed wrapper; outside a shell every call does
nothing) and the hooks beside it.

Written from the Linux shell as it is (`desktop/src/irisbridge.*`, `notifier.*`, `matrixuri.*`,
`bridge-adapter.js`); the macOS shell ports it (`desktop-macos/Sources/IrisShellCore`).

## Where it exists

- `window.irisDesktop` exists only in the top frame of a page on the **Iris origin**, the one origin
  the shell was built for (`IRIS_URL`, `https://host[:port]`): same scheme, host and port. Not a
  subdomain, not `http:`, not a URL with a userinfo. Anywhere else the page gets nothing, and calls
  that reach the shell anyway are refused.
- The object is frozen and not configurable. Outside a shell it is `undefined`
  (`isDesktopShell()` in `desktop.ts`).
- The shell checks every argument itself: the page is not trusted to have checked.

## Methods (web → shell)

Every method returns a promise.

| Method                       | Argument                  | Resolves                                                    | Rejects           |
| ---------------------------- | ------------------------- | ----------------------------------------------------------- | ----------------- |
| `version()`                  | none                      | the shell's version, a string                               | never             |
| `setUnread(counts)`          | `{ total, highlight }`    | the counts were taken                                       | they were refused |
| `notify(notification)`       | see below                 | the notification was taken                                  | it was refused    |
| `closeNotifications(target)` | `{ roomId }`              | the room's notifications close                              | it was refused    |
| `on(event, handler)`         | an event name, a function | returns a function that removes the handler (not a promise) |                   |

### `setUnread({ total, highlight })`

- Exactly the two keys. Both whole numbers (JSON numbers; `9.0` is 9), `0 <= highlight <= total <= 1000000`.
  A string, boolean, `null`, fraction, NaN, infinity or anything out of range refuses the call, and
  nothing changes. Nothing is clamped.
- `total` is the badge: Linux sends the Unity LauncherEntry signal for the taskbar icon (hidden at 0)
  and puts it in the tray tooltip; macOS sets the Dock tile's badge (none at 0).
- `highlight` (mentions) marks the Linux tray item as needing attention. macOS shows nothing for it.
- The same counts again are not news. When a page on the Iris origin finishes loading, the shell
  says the last counts again (Linux resends the signal; macOS's badge simply stays), so the page
  clears the badge when signed out (`useDesktopSignedOut`).

### `notify({ id, roomId, eventId?, title, body, icon?, canReply? })`

Only these keys; any other key refuses the call. Lengths are in UTF-16 units (JavaScript's `length`).

| Key        | Rule                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | string, 1–255, no control characters. The same `id` as a notification still up replaces it.                                                                                                                                   |
| `roomId`   | a Matrix room ID: `!` then `[A-Za-z0-9._~+=/-]{1,200}`, optionally `:server` (`[A-Za-z0-9.-]{1,200}`) and `:port` (1–5 digits); 255 at most                                                                                   |
| `eventId`  | optional; the same shape with `$`                                                                                                                                                                                             |
| `title`    | string, 1–200, no control characters (no newline)                                                                                                                                                                             |
| `body`     | string, 0–2000, no control characters except newline and tab. Plain text: Linux HTML-escapes it, as Plasma reads a subset of HTML.                                                                                            |
| `icon`     | optional; a `data:image/png;base64,…` or `data:image/jpeg;base64,…` URL, at most 256 KiB decoded and 1024 px a side, whose bytes are the declared format and decode. The shell never fetches a URL. Without it, the app icon. |
| `canReply` | optional boolean, default `true`. `false` (an invitation) offers no inline reply.                                                                                                                                             |

"No control characters" means no code point of category Cc and no non-character; a string with a
lone surrogate is refused too.

- At most **5** notifications per room stay up: the oldest goes for the next.
- A click (the default action) brings the window forward and emits `openRoom`.
- Where `canReply`, the notification carries an inline reply ("Reply", "Send"); text typed there is
  emitted as `reply`. Linux leaves the action out where the notification server has no inline
  reply; macOS always has it.
- Linux: a `KNotification` of event `message` of component `house.mouseion.iris`
  (`house.mouseion.iris.notifyrc`). macOS: a `UNUserNotificationCenter` notification of the app
  `house.mouseion.iris`, threaded per room. On both, the system's notification settings and Do Not
  Disturb / Focus apply.
- Notifications do not outlive the shell: macOS removes its notifications at quit.

### `closeNotifications({ roomId })`

Exactly that key, a room ID as above. Closes every notification of the room (it was read, here or
on another device).

## Events (shell → web)

`on(event, handler)` adds a handler; payloads are objects (the shell sends JSON, the adapter parses
it). The page checks every payload again (`desktop.ts`).

| Event         | Payload                                                              | Kind                                                         |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `colorScheme` | `{ dark: boolean }`                                                  | state: the current value is replayed to a handler added late |
| `openRoom`    | `{ roomId, eventId? }`                                               | one-shot: a notification was clicked                         |
| `reply`       | `{ roomId, eventId?, text }`                                         | one-shot: text typed into a notification, cut at 16000 units |
| `openLink`    | `{ kind: 'room' \| 'alias' \| 'user', id, eventId?, via?, action? }` | one-shot, held until delivered once                          |

- **State** events are remembered by the shell (`latestEvents`) and the adapter, and a handler
  added after the event still gets the current value.
- **One-shot** events go to the handlers there at the time, once, and are not replayed.
- **`openLink`** must not be lost: the shell queues links (at most 8, the oldest go) until the page's
  adapter is up and asks for them; the adapter holds them (at most 8) until the first `openLink`
  handler is added, then delivers each once. So a link on a cold start waits for sign-in. A page
  that starts loading (a reload) has no adapter until it asks again.
- `colorScheme`: Linux follows Qt's colour scheme hint, else the window background's lightness;
  macOS follows the app's effective appearance (light or dark).

## `matrix:` links

How a link reaches the shell: Linux declares `x-scheme-handler/matrix` in
`house.mouseion.iris.desktop` (a second launch hands its link to the first); macOS declares the
`matrix` URL scheme in `CFBundleURLTypes`. The shell parses the link strictly and the page never
sees raw text; a link that does not parse is logged and dropped. A link shows and raises the window.

The grammar (Matrix spec, "Matrix URI scheme"), and nothing else:

```
matrix:roomid/<id>[/e/<event>][?via=<server>&…][&action=join|chat]
matrix:r/<alias>[/e/<event>][?…]
matrix:u/<user>[?action=chat]
```

- Scheme in any case; kind (`roomid`, `r`, `u`) and `e` in lower case. At most 2048 characters.
- ASCII only. Percent-decoding is strict: every `%` has two hex digits, and the result is valid
  UTF-8 with no control, format (bidi overrides, zero-width characters), separator, private-use or
  non-characters.
- No authority (`matrix://`), no absolute path, no fragment, no empty or extra path segments.
- The ID is given without its sigil; the payload carries it: `!room`, `#alias`, `@user`, `$event`.
  Room and event IDs follow the room ID rule above. Aliases and users are `local:server`, at most
  255 bytes; a user's local part is `[A-Za-z0-9._=/+-]`, an alias's any printable text without
  whitespace or `#@!$:`.
- A server (`via`, and an alias's or user's) is a DNS name (`[A-Za-z0-9][A-Za-z0-9.-]*`) or a
  bracketed IPv6 literal, with an optional port up to 65535.
- `via` may repeat (kept once, in order; at most 10 different). `action` is `join` or `chat`, at
  most once. A user link takes only `action=chat`. Other query keys are ignored and never passed on;
  a bad `via` or `action` refuses the whole link.
- At most 4 links per launch are looked at.

## What else both shells do

Not part of the bridge, but the same on both:

- One window on the live web app at `IRIS_URL` (never bundled assets), one instance, a persistent
  profile (login, IndexedDB, the service worker survive restarts).
- Main-frame navigation stays on the Iris origin. Anything else, `target=_blank` and `window.open`
  go to the default browser, and only `http:`, `https:` and `mailto:` links are handed out.
- Camera, microphone, screen sharing and location are refused (desktop calls stay off).
- The page's own notification permission reads `granted` (the shell shows the notifications), so
  Settings → Notifications offers its switch. Linux grants the web permission; macOS reports it
  from the adapter, since WKWebView offers an app no way to grant it.
- An offline page ("Iris can't reach the server", Retry) that also retries by itself, every 15 s and
  when the network comes back.
- Downloads go to `~/Downloads`.
- Closing the window keeps Iris running (Linux: in the tray; macOS: in the Dock); Quit ends it.
