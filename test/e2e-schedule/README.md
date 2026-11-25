# Scheduled messages, end to end

Checks scheduled messages against a real Synapse with MSC4140 switched on. Two users, alice and bob, each a matrix-js-sdk client with rust crypto, drive the same functions Iris uses (`src/app/utils/delayedEvents.ts`). It is not run in CI.

Docker and Node 24 are all it needs:

```sh
test/e2e-schedule/synapse.sh up     # Synapse 1.165.0 on http://localhost:8448, max_event_delay_duration: 7d
node test/e2e-schedule/run.mjs      # about a minute
test/e2e-schedule/synapse.sh down   # stops it and deletes its data
```

`synapse.sh` keeps its data in `~/.cache/build/iris/e2e-schedule-synapse` (set `DATA` to move it) and registers `alice` and `bob` with the passwords `alice-password` and `bob-password`.

What `run.mjs` checks:

- Unencrypted room: a message scheduled 10 s out reaches bob after 10 s and not before. Cancel stops one. Send now sends one at once. The list gives its send time.
- Encrypted room: the server holds only ciphertext (the list's content has no `body`). The preview decrypts on the sending device, twice. The message reaches bob as `m.room.encrypted` after 10 s and decrypts to the original text. The sending device still decrypts the delivered event after the preview. A device without the room key gets no preview.
- A delay over the limit fails with `ORG.MATRIX.MSC4140_DELAY_TOO_LARGE`, and the maximum is read from the error text.

It prints `PASS` or `FAIL` for each check, then a JSON summary with the measured delays. It exits 1 if any check failed.

## The app itself

`app.mjs` drives Iris in a browser as alice, against the same Synapse, while bob listens with matrix-js-sdk. It needs a production build served by `vite preview` (the dev server inside a nested worktree loads two copies of react-query), and any install of `playwright-core`:

```sh
npx vite build --outDir /tmp/iris-dist
npx vite preview --outDir /tmp/iris-dist --port 5188 &
node test/e2e-schedule/app.mjs <playwright-core dir> <screenshot dir> http://localhost:5188
```

It schedules a message in an encrypted room through the composer (chevron, Schedule message, the picker's first preset, Enter), checks the server holds only ciphertext, that the list in the app previews it decrypted in the browser, that Send now in the list delivers it to bob, and that alice's browser decrypts the delivered message after the preview.
