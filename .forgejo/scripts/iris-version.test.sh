#!/usr/bin/env bash
# Tests for iris-version.sh, in a throwaway repository: bash .forgejo/scripts/iris-version.test.sh
# Run by build.yml's `plan` on every push.
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd)/iris-version.sh
repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT
cd "$repo"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git init -q
git config user.name test
git config user.email test@example.org
git config commit.gpgsign false
git config tag.gpgsign false

fails=0
# The script's stderr, shown under a failure.
errors=$(mktemp)
trap 'rm -rf "$repo" "$errors"' EXIT
expect() { # expect <what> <want> <got>
  if [ "$2" = "$3" ]; then
    echo "ok: $1"
  else
    echo "FAIL: $1: wanted \"$2\", got \"$3\""
    while IFS= read -r line; do echo "  $line"; done <"$errors"
    fails=$((fails + 1))
  fi
  : >"$errors"
}
commit() { git commit -q --allow-empty -m "$1"; }
v() { bash "$script" "$@" 2>>"$errors"; }
allowed() { if bash "$script" check "$@" 2>>"$errors"; then echo yes; else echo no; fi; }

commit 'initial commit'
expect 'no tags: last is empty' '' "$(v last)"
expect 'no tags: next is 0.4.0' 0.4.0 "$(v next)"

git tag mobile-v0.3.0 # an old native app's tag: below the floor
commit 'fix: something'
expect 'below 0.4.0: next is 0.4.0' 0.4.0 "$(v next)"

git tag -a mobile-v0.9.3 -m 'mobile-v0.9.3 (auto-released by run 323)'
commit 'web: a fix'
expect 'patch' 0.9.4 "$(v next)"
commit 'feat(mobile): a feature'
expect 'feat is minor' 0.10.0 "$(v next)"
commit $'fix: x\n\nBREAKING CHANGE: y'
expect 'BREAKING CHANGE is major' 1.0.0 "$(v next)"
git reset -q --hard HEAD~1
commit 'feat!: z'
expect 'type! is major' 1.0.0 "$(v next)"
git reset -q --hard HEAD~1

# Cinny's tags, lightweight, are not Iris's, whatever their numbers.
git tag v4.12.6
git tag -a v1.0.0 -m 'chore: Release v1.0.0'
expect 'Cinny tags ignored by last' 0.9.3 "$(v last)"
expect 'Cinny tags ignored by next' 0.10.0 "$(v next)"
expect 'a Cinny tag name is refused' no "$(allowed 4.12.6)"
expect 'an annotated non-Iris tag name is refused' no "$(allowed 1.0.0)"

# #101: once a build tags its version, the next one is higher.
git tag -a mobile-v0.10.0 -m 'mobile-v0.10.0 (auto-released by run 445)'
commit 'web: another fix'
expect 'after the 0.10.0 tag: next is 0.10.1' 0.10.1 "$(v next)"

# A public release joins the same line.
expect 'check: not X.Y.Z' no "$(allowed 0.11)"
expect 'check: equal to the latest' no "$(allowed 0.10.0)"
expect 'check: below the latest' no "$(allowed 0.9.9)"
expect 'check: above the latest' yes "$(allowed 0.11.0)"
git tag -a v0.11.0 -m 'Iris v0.11.0'
expect 'a release tag counts for last' 0.11.0 "$(v last)"
expect 'check: the same release run again at its own commit' yes "$(allowed 0.11.0)"
commit 'web: after the release'
expect 'check: the same version at another commit' no "$(allowed 0.11.0)"
expect 'next after a release' 0.11.1 "$(v next)"
expect 'check: the next one' yes "$(allowed 0.11.1)"
expect 'check: 0.12.0 is fine too' yes "$(allowed 0.12.0)"

if [ "$fails" -gt 0 ]; then
  echo "iris-version: $fails failed"
  exit 1
fi
echo "iris-version: all passed"
