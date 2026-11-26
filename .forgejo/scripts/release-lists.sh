#!/usr/bin/env bash
# Writes the lists the release scan (release-scan.sh) reads, into <dir>, which should be a private
# directory under /dev/shm. Nothing it writes is printed: only how many lines each list has.
#
#   release-lists.sh <dir>
#
#   <dir>/strings  the private strings, from PRIVATE_STRINGS (the secret IRIS_PRIVATE_STRINGS)
#   <dir>/extra    what the household's own build sets and a release must not carry, and where the
#                  runner builds:
#                  - the host of each origin in HUB_ORIGINS (IRIS_HUB_ORIGINS)
#                  - the host of DESKTOP_URL (IRIS_DESKTOP_URL)
#                  - every string in CONFIG_MOBILE_JSON (IRIS_CONFIG_MOBILE_JSON) that neither of
#                    the repo's own config.json and config.mobile.json has
#                  - the runner's workspace path (GITHUB_WORKSPACE)
#                  Strings shorter than 6 characters are left out (they would match by chance), and
#                  so is the bare house domain, which may be public.
#
# PRIVATE_STRINGS must be set. The household's settings may be empty; each one missing is said.
# Needs node, for the JSON.
set -euo pipefail

dir=${1?usage: release-lists.sh <dir>}
if [ -z "${PRIVATE_STRINGS:-}" ]; then
  echo "the secret IRIS_PRIVATE_STRINGS is not set: the release files cannot be checked" >&2
  exit 1
fi
(
  umask 077
  printf '%s\n' "$PRIVATE_STRINGS" >"$dir/strings"
  : >"$dir/raw"
)

host() { sed -E 's#^[a-z]+://##; s#[/:].*$##' <<<"$1"; }

if [ -n "${HUB_ORIGINS:-}" ]; then
  for origin in $HUB_ORIGINS; do host "$origin" >>"$dir/raw"; done
else
  echo "IRIS_HUB_ORIGINS is not set: no hub hosts to look for"
fi
if [ -n "${DESKTOP_URL:-}" ]; then
  host "$DESKTOP_URL" >>"$dir/raw"
else
  echo "IRIS_DESKTOP_URL is not set: no desktop host to look for"
fi
if [ -n "${CONFIG_MOBILE_JSON:-}" ]; then
  CONFIG_MOBILE_JSON=$CONFIG_MOBILE_JSON node -e '
    const fs = require("fs");
    const leaves = (v, out) => {
      if (typeof v === "string") out.add(v);
      else if (v && typeof v === "object") for (const k of Object.keys(v)) { out.add(k); leaves(v[k], out); }
      return out;
    };
    const pub = new Set();
    for (const f of ["config.json", "config.mobile.json"]) leaves(JSON.parse(fs.readFileSync(f, "utf8")), pub);
    for (const s of leaves(JSON.parse(process.env.CONFIG_MOBILE_JSON), new Set())) if (!pub.has(s)) console.log(s);
  ' >>"$dir/raw"
else
  echo "IRIS_CONFIG_MOBILE_JSON is not set: no household config to look for"
fi
if [ -n "${GITHUB_WORKSPACE:-}" ]; then echo "$GITHUB_WORKSPACE" >>"$dir/raw"; fi

# One string a line, no blanks or short ones, not the bare domain.
(
  umask 077
  tr -d '\r' <"$dir/raw" | awk 'length($0) >= 6 && tolower($0) != "mouseion.house"' | sort -u >"$dir/extra"
)
rm -f "$dir/raw"
echo "lists: $(grep -c . "$dir/strings" || true) private strings, $(wc -l <"$dir/extra") of the household's settings and the runner's paths"
