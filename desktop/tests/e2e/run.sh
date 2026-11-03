#!/usr/bin/env bash
# End-to-end checks against a build made with -DIRIS_SHELL_TEST_HOOKS=ON, offscreen, with a throwaway
# profile, driven over the Chrome DevTools Protocol. Touches nothing on the desktop.
#   desktop/tests/e2e/run.sh <build dir>     (needs Node 22+ for fetch and WebSocket)
# Each script gets a private session bus; notifications.mjs also runs tests/fakenotifyd on it.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export IRIS_BIN="$1/iris"
status=0
for script in e2e.mjs notifications.mjs; do
  dbus-run-session -- node "$here/$script" || status=1
done
exit $status
