#!/usr/bin/env bash
# Captures one page of a round with headless Chrome, at its full height.
# Usage: design/capture.sh design/rounds/<round>/<page>.html [width] [out.png]
set -euo pipefail
page="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
width="${2:-1800}"
out="${3:-$(dirname "$page")/captures/$(basename "${page%.html}").png}"
chrome="${CHROME:-$HOME/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell}"
mkdir -p "$(dirname "$out")"
run() { timeout 90 "$chrome" --no-sandbox --allow-file-access-from-files --hide-scrollbars --virtual-time-budget=5000 "$@" 2>/dev/null; }
# Ask the page how tall it is, then capture exactly that much.
height="$(run --window-size="$width,600" --dump-dom "file://$page?measure" | grep -o 'data-h="[0-9]*"' | grep -o '[0-9]*' || true)"
run --window-size="$width,${height:-1400}" --force-device-scale-factor=1 --screenshot="$out" "file://$page" >/dev/null
echo "$out ${width}x${height:-1400}"
