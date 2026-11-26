#!/usr/bin/env bash
# Iris's version scheme, in one place: the household's Android builds (.forgejo/workflows/build.yml,
# job `plan`) and the public release (.forgejo/workflows/release.yml) both ask this script, so a
# change to the scheme is a change to this file alone.
#
#   iris-version.sh last              the latest Iris version, X.Y.Z, or nothing before the first
#   iris-version.sh next [<rev>]      the next version for <rev> (default HEAD)
#   iris-version.sh check <X.Y.Z> [<rev>]
#                                     exits 0 when X.Y.Z may be released at <rev>; otherwise says
#                                     why on stderr and exits 1
#
# One line of versions for everything. Its tags, in the repo the script runs in:
#
#   mobile-vX.Y.Z   a household Android build (build.yml tags each one it publishes)
#   vX.Y.Z          a public release, an annotated tag whose message starts "Iris vX.Y.Z"
#                   (release.yml makes it). The forge also carries Cinny's own vX.Y.Z tags, which
#                   are lightweight, so the annotation is what tells an Iris release apart.
#
# `next` is the latest of those, bumped by the commit messages since it: a `BREAKING CHANGE:`
# footer or a `!` after the type (`feat!:`) bumps major, a `feat:` minor, anything else patch.
# With no tag at 0.4.0 or later it is 0.4.0, where the Capacitor app started (mobile/README.md,
# "Releases"). `check` takes a version typed by hand: X.Y.Z, above the latest. A public release
# run again after a failure finds its own tag at <rev> already, and `check` lets it through.
#
# The version code is not here: it is the forge's run number, shared by every workflow of the
# repo, so it only ever rises, whichever workflow built the APK.
set -euo pipefail

semver='^[0-9]+\.[0-9]+\.[0-9]+$'

# Plain bash and git from here on: the runners of the `plan` lane differ, and a host's own sort,
# cut or awk may not be the one this was written for.

# Every Iris version tag, one "X.Y.Z<TAB>tag" line each. `skip` names a tag to leave out.
versions() {
  local skip=${1-} name type subject v
  while IFS=$'\t' read -r name type subject; do
    [ "$name" != "$skip" ] || continue
    case $name in
      mobile-v*) v=${name#mobile-v} ;;
      v*)
        # Cinny's tags are lightweight; an Iris release is annotated, "Iris vX.Y.Z".
        [ "$type" = tag ] || continue
        case $subject in "Iris $name" | "Iris $name "*) ;; *) continue ;; esac
        v=${name#v}
        ;;
      *) continue ;;
    esac
    [[ $v =~ $semver ]] || continue
    printf '%s\t%s\n' "$v" "$name"
  done < <(git for-each-ref refs/tags --format='%(refname:strip=2)%09%(objecttype)%09%(contents:subject)')
}

# Is X.Y.Z $1 above X.Y.Z $2?
above() {
  local a b
  IFS=. read -r -a a <<<"$1"
  IFS=. read -r -a b <<<"$2"
  for i in 0 1 2; do
    if ((10#${a[i]} > 10#${b[i]})); then return 0; fi
    if ((10#${a[i]} < 10#${b[i]})); then return 1; fi
  done
  return 1
}

# The latest Iris version tag, "X.Y.Z<TAB>tag", or nothing.
latest() {
  local best='' line
  while IFS= read -r line; do
    if [ -z "$best" ] || above "${line%%$'\t'*}" "${best%%$'\t'*}"; then best=$line; fi
  done < <(versions "${1-}")
  if [ -n "$best" ]; then printf '%s\n' "$best"; fi
}

cmd=${1-}
case $cmd in
  last)
    line=$(latest)
    echo "${line%%$'\t'*}"
    ;;
  next)
    rev=${2:-HEAD}
    line=$(latest)
    last=${line%%$'\t'*}
    tag=${line#*$'\t'}
    if [ -z "$last" ] || ! above "$last" 0.3.999; then
      echo 0.4.0
      exit 0
    fi
    IFS=. read -r major minor patch <<<"$last"
    bump=patch
    breaking='^[Bb][Rr][Ee][Aa][Kk][Ii][Nn][Gg] [Cc][Hh][Aa][Nn][Gg][Ee]:'
    bang='^[a-zA-Z]+(\([^)]*\))?!:'
    feat='^feat(\([^)]*\))?:'
    while IFS= read -r msg; do
      if [[ $msg =~ $breaking || $msg =~ $bang ]]; then
        bump=major
        break
      elif [[ $msg =~ $feat ]]; then
        bump=minor
      fi
    done < <(git log --format=%B "$tag..$rev")
    case $bump in
      major) echo "$((major + 1)).0.0" ;;
      minor) echo "$major.$((minor + 1)).0" ;;
      patch) echo "$major.$minor.$((patch + 1))" ;;
    esac
    ;;
  check)
    want=${2?usage: iris-version.sh check <X.Y.Z> [<rev>]}
    rev=$(git rev-parse "${3:-HEAD}^{commit}")
    if ! [[ $want =~ $semver ]]; then
      echo "the version \"$want\" is not X.Y.Z" >&2
      exit 1
    fi
    tag="v$want"
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      at=$(git rev-parse "refs/tags/$tag^{commit}")
      own=''
      while IFS= read -r line; do
        if [ "${line#*$'\t'}" = "$tag" ]; then own=$line; fi
      done < <(versions)
      if [ -z "$own" ]; then
        echo "the tag $tag is already taken, and not by an Iris release (Cinny has tags of that form)" >&2
        exit 1
      fi
      if [ "$at" != "$rev" ]; then
        echo "Iris $want is already released, at $at" >&2
        exit 1
      fi
      # The same release, run again: compared with the versions before it.
    fi
    line=$(latest "$tag")
    last=${line%%$'\t'*}
    if [ -n "$last" ] && ! above "$want" "$last"; then
      echo "$want is not above the latest Iris version, $last" >&2
      exit 1
    fi
    ;;
  *)
    echo "usage: iris-version.sh last | next [<rev>] | check <X.Y.Z> [<rev>]" >&2
    exit 2
    ;;
esac
