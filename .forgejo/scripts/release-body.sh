#!/usr/bin/env bash
# Writes what a release sends to GitHub besides its files (.forgejo/workflows/release.yml).
#
#   release-body.sh <X.Y.Z> <files dir> <out dir>
#
#   <files dir>/SHA256SUMS  the sums of every other file there, as `sha256sum -c` reads them
#   <out dir>/body.md       the release's body: docs/releases/X.Y.Z.md, then the files
#   <out dir>/release.json  the request that makes the release, a draft, on GITHUB_SHA
#
# Run from the repo's top. Needs node, for the JSON.
set -euo pipefail

version=${1?usage: release-body.sh <X.Y.Z> <files dir> <out dir>}
files=${2?usage: release-body.sh <X.Y.Z> <files dir> <out dir>}
out=${3?usage: release-body.sh <X.Y.Z> <files dir> <out dir>}
notes="docs/releases/$version.md"
: "${GITHUB_SHA:?GITHUB_SHA is not set}"
mkdir -p "$out"

# What each file is, for someone choosing which to download.
describe() {
  case $1 in
    iris-web-*.tar.gz) echo 'The web app, for a web server that sends unknown paths to `index.html`' ;;
    iris-android-*.apk) echo 'The Android app, for Android 9 and later' ;;
    iris-macos-*.zip) echo 'The macOS app, for macOS 13 and later' ;;
    SHA256SUMS) echo 'The SHA-256 sums of the other files' ;;
    *) echo '' ;;
  esac
}
size() { awk -v b="$1" 'BEGIN { if (b >= 1048576) printf "%.1f MB", b / 1048576; else if (b >= 1024) printf "%.0f KB", b / 1024; else printf "%d bytes", b }'; }

rm -f "$files/SHA256SUMS"
(cd "$files" && sha256sum -- * > SHA256SUMS.tmp && mv SHA256SUMS.tmp SHA256SUMS)

{
  if [ -s "$notes" ]; then
    cat "$notes"
  else
    echo "(No notes yet: $notes.)"
  fi
  echo
  echo '## Downloads'
  echo
  echo '| File | What it is | Size |'
  echo '| --- | --- | --- |'
  # The files, then their sums.
  for f in "$files"/*; do
    name=$(basename "$f")
    [ "$name" != SHA256SUMS ] || continue
    echo "| \`$name\` | $(describe "$name") | $(size "$(stat -c %s "$f")") |"
  done
  echo "| \`SHA256SUMS\` | $(describe SHA256SUMS) | $(size "$(stat -c %s "$files/SHA256SUMS")") |"
  echo
  echo 'SHA-256:'
  echo
  echo '```'
  cat "$files/SHA256SUMS"
  echo '```'
} > "$out/body.md"

VERSION=$version node -e '
  const fs = require("fs");
  const v = process.env.VERSION;
  process.stdout.write(JSON.stringify({
    tag_name: `v${v}`,
    target_commitish: process.env.GITHUB_SHA,
    name: `Iris ${v}`,
    body: fs.readFileSync(process.argv[1], "utf8"),
    draft: true,
    prerelease: false,
    make_latest: "true",
  }, null, 2));
' "$out/body.md" > "$out/release.json"
