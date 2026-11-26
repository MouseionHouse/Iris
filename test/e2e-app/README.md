# The app, end to end

Drives a production build of Iris in Chrome, as alice, against a local Synapse, on a wide screen (1400×900) and a phone (390×844, touch). It is the check to run after a dependency upgrade, a router change, or anything else the unit tests cannot see. It is not run in CI.

It uses the Synapse of `test/e2e-schedule` (Docker, Synapse on `http://localhost:8448`, users `alice` and `bob`), and any install of `playwright-core` with a Chrome:

```sh
test/e2e-schedule/synapse.sh up
node test/e2e-app/seed.mjs            # once; a second run sees #testspace and stops
npx vite build --outDir /tmp/iris-dist
npx vite preview --outDir /tmp/iris-dist --port 5189 &
CHROME=$(which google-chrome) node test/e2e-app/run.mjs <playwright-core dir> /tmp/iris-e2e-shots http://localhost:5189
test/e2e-schedule/synapse.sh down     # stops it and deletes its data
```

`CHROME` is optional: without it Playwright starts its own Chromium, if one is installed. It takes about two minutes.

`seed.mjs` makes a public space `#testspace` with two rooms, `#general` and `#random`, a DM between alice and bob, and messages in `#general` of each kind the timeline draws differently: forty plain ones, formatted text with a link, a code block, a reply, a reaction, an edit and a mention of alice.

What `run.mjs` checks:

- **Routes.** Fourteen paths, signed out and signed in, on both screens: the URL each ends on (the sign-in page, the redirects of `/`, `/inbox/`, `/explore/`, a space's index, and the phone-only Search and You tabs), and that the page renders.
- **Walk.** Signed in: Home lists the DM; a space link opens the space; a room opens from the list; the timeline loads older messages; a message sends and the composer empties; emoji autocomplete; a message's menu; a sender's profile opens from the avatar and Escape closes it; switching rooms; browser back and forward; the space's tab reopens its last room (wide screen); the lobby; a DM; the inbox lists the mention; Explore; settings.

A step fails on a wrong URL or a missing element, and also on any page error or `console.error` but the known ones listed at the top of `run.mjs` (network errors from asking matrix.org about itself, and `AsyncCallbackHook: Request replaced!`). A render crash fails the walk even where the page still shows something.

It prints `PASS` or `FAIL` per step, keeps a screenshot of each walk step in the screenshot directory, and exits 1 if any step failed. Each run sends one message to `#general`; nothing else changes between runs.

## The README pictures

`showcase-seed.mjs` and `showcase-capture.mjs` take the pictures of Iris for the README from the real app: a production build, signed in as Hector on the same local Synapse, with a made-up account worth photographing. They are not a test and are not run in CI.

```sh
test/e2e-schedule/synapse.sh down     # start from nothing: the seed's times need a fresh server
test/e2e-schedule/synapse.sh up
node test/e2e-app/showcase-seed.mjs   # once; a second run sees #showcase-picnic and stops
npx vite build --outDir ~/.cache/build/iris/a/dist
npx vite preview --outDir ~/.cache/build/iris/a/dist --port 5191 &
CHROME=$(which google-chrome) node test/e2e-app/showcase-capture.mjs <playwright-core dir> ~/.cache/build/iris/a/shots http://localhost:5191
```

Use your own slot in place of `a`. The capture takes under a minute and writes sixteen PNGs, each picture in Iris light and Iris dark (`<picture>-light.png`, `<picture>-dark.png`), at a device scale factor of 2: `desktop-overview`, `desktop-scheduled`, `desktop-stickers`, `desktop-image-editor`, `desktop-draft` (1440×900), and `phone-home`, `phone-conversation`, `phone-scheduled` (390×844, touch). `ONLY=desktop-draft,phone-home` takes just those. It prints each file with what it shows, and exits 1 if any picture failed (keeping a `.failed.png` of where it stopped). On a wide screen it closes each room's members panel with its Close button, so the conversation has the width; phone Home is scrolled to the end of its list, so the round + button sits below the last row and covers no text.

The README's main picture puts the desktop overview and phone Home together, made from those captures:

```sh
CHROME=$(which google-chrome) node test/e2e-app/showcase-compose.mjs <playwright-core dir> ~/.cache/build/iris/a/shots all
CHROME=$(which google-chrome) node test/e2e-app/showcase-compose.mjs <playwright-core dir> ~/.cache/build/iris/a/shots b --main
```

The first writes `hero-<a|b|c>-<light|dark>.png`, three placements of the phone (described at the top of the script); the second makes one of them again and also writes it as `hero-light.png` and `hero-dark.png`. The background is transparent, so each suits GitHub's light or dark page.

What is in the account is all in `showcase.mjs`: Hector and six friends from the Iliad, ten rooms and direct chats with their conversations, Home's sections (Starred, 📚 Clubs, 🌱 Neighbours), what Hector has read (so three rooms show unread counts, one with a mention), a draft, three scheduled messages and a sticker pack. The avatars, stickers and the picnic picture are drawn in code by `showcase-art.mjs`. Change the words there and run the sequence again.

Time stands still in the pictures. The browser's clock is fixed at Friday 16 May 2031, 10:30 UTC, and the seed sends every message with its own timestamp through an application service `synapse.sh` registers (`?user_id=…&ts=…`), so the same run gives the same pictures. The date is in the future because the rooms' creation events carry the real time, and the messages must come after them. Scheduled messages wait on the server's real clock from when the seed ran, so the capture answers the app's list of them with each delay counted from the fixed clock instead.
