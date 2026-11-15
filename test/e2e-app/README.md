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
