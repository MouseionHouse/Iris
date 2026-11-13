#!/usr/bin/env bash
# publish.sh — Publish a signed APK into a self-hosted F-Droid repo.
#
# The body of the fdroid-publish action (action.yml beside it), which is how
# CI calls it. Copied from mouseion/common at 47adab7 (fdroid-publish-v1.0.1).
#
# Drops the APK file into ${APPDATA}/<base-name>/repo/ and re-runs
# `fdroid update` to regenerate the signed index. Idempotent: publishing an
# APK identical to one already in the repo drops the copy and leaves the
# index as it was.
#
# --base-name selects which repo under $APPDATA to publish into (default
# `fdroid`).
#
# When --mark-current is passed, after the index update the script also
# updates metadata/<app-id>.yml's CurrentVersion / CurrentVersionCode to
# the version identified by --version-code/--version-name (required
# together with --mark-current) so F-Droid clients recommend that build
# over any higher-versionCode nightlies that may exist. Use this on tagged
# stable releases, passing the exact versionCode/versionName of the APK
# just published, not inferred from the index: nightly versionCodes may be
# set above stable's, so "highest in the index" is often the wrong build.
#
# Usage:
#   ./publish.sh --apk <path> --app-id <pkg> [--base-name <name>] \
#       [--mark-current --version-code <N> --version-name <name>]
#
# Required env:
#   APPDATA  the directory that holds the repos
set -euo pipefail

# fdroid-server:local is host-local (no registry). Build it from the
# Dockerfile beside this script when a fresh host lacks it.
if ! docker image inspect fdroid-server:local >/dev/null 2>&1; then
  echo "[fdroid-publish] fdroid-server:local missing; building it"
  docker build -t fdroid-server:local "$(dirname "${BASH_SOURCE[0]}")/fdroid-server"
fi

apk=
app_id=
base_name=fdroid
mark_current=false
version_code=
version_name=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk)            apk="$2";           shift 2 ;;
    --app-id)         app_id="$2";        shift 2 ;;
    --base-name)      base_name="$2";     shift 2 ;;
    --mark-current)   mark_current=true;  shift ;;
    --version-code)   version_code="$2";  shift 2 ;;
    --version-name)   version_name="$2";  shift 2 ;;
    *) echo "[fdroid-publish] unknown arg: $1" >&2; exit 64 ;;
  esac
done

if [[ -z "$apk" || -z "$app_id" ]]; then
  echo "usage: $(basename "$0") --apk <path> --app-id <pkg> [--base-name <name>] [--mark-current --version-code <N> --version-name <name>]" >&2
  exit 64
fi
if [[ "$mark_current" == "true" && ( -z "$version_code" || -z "$version_name" ) ]]; then
  echo "[fdroid-publish] --mark-current requires --version-code and --version-name" >&2
  exit 64
fi
[[ -f "$apk" ]] || { echo "[fdroid-publish] APK not found: $apk" >&2; exit 66; }

appdata="${APPDATA:?APPDATA is required}"
base="$appdata/$base_name"
[[ -d "$base/repo" ]] || { echo "[fdroid-publish] repo not initialized at $base; create it with \`fdroid init\` first" >&2; exit 70; }

# One publish per repo at a time: two `fdroid update`s on the same repo would
# race on its index and apkcache. A second publish waits here; the lock goes
# with this process, so a cancelled job releases it.
mkdir -p "$base/tmp"
exec 9>"$base/tmp/publish.lock"
if ! flock -n 9; then
  echo "[fdroid-publish] another publish to $base_name is running; waiting"
  flock 9
fi

# Copy with the original filename. The container below renames it to
# <appId>_<versionCode>.apk from the manifest (as `fdroid update
# --rename-apks` would), so old versions accumulate side-by-side rather than
# overwriting each other.
# --mark-current pins the CALLER-SUPPLIED version (the one just built and
# published in THIS invocation) as CurrentVersion/CurrentVersionCode in
# metadata — NOT inferred by scanning the index for "highest versionCode",
# which nightly builds (deliberately inflated above stable's range) will
# always win. F-Droid clients recommend the version matching
# CurrentVersionCode even if higher-versionCode nightlies are also indexed.
pin_current() {
  echo "[fdroid-publish] pinning $app_id as CurrentVersion(Code)=$version_name/$version_code"
  docker run --rm --user "$(id -u):$(id -g)" \
    --entrypoint /bin/bash \
    -v "$base":/repo \
    -w /repo \
    fdroid-server:local \
    -c '
      set -euo pipefail
      python3 - "$0" "$1" "$2" <<PY
import pathlib, sys, re
app_id, vname, vcode = sys.argv[1], sys.argv[2], int(sys.argv[3])
metadata = pathlib.Path(f"/repo/metadata/{app_id}.yml")
text = metadata.read_text() if metadata.exists() else ""
def upsert(field, value):
    global text
    pattern = rf"^{re.escape(field)}:.*$"
    if re.search(pattern, text, flags=re.M):
        text = re.sub(pattern, f"{field}: {value}", text, flags=re.M)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += f"{field}: {value}\n"
upsert("CurrentVersion", vname)
upsert("CurrentVersionCode", vcode)
metadata.write_text(text)
print(f"[mark-current] pinned {app_id} CurrentVersion={vname} CurrentVersionCode={vcode}")
PY
    ' "$app_id" "$version_name" "$version_code"
}

# The sanity check: the pinned version is in repo/'s index (not archived).
check_current() {
  docker run --rm --user "$(id -u):$(id -g)" \
    --entrypoint /bin/bash \
    -v "$base":/repo \
    -w /repo \
    fdroid-server:local \
    -c '
      set -euo pipefail
      python3 - "$0" "$1" <<PY
import json, pathlib, sys
app_id, vcode = sys.argv[1], int(sys.argv[2])
index = json.loads(pathlib.Path("/repo/repo/index-v2.json").read_text())
versions = index.get("packages", {}).get(app_id, {}).get("versions", {})
if not any(v["manifest"]["versionCode"] == vcode for v in versions.values()):
    print(f"[mark-current] versionCode {vcode} not found in index for {app_id} after update", file=sys.stderr)
    sys.exit(2)
PY
    ' "$app_id" "$version_code"
}

# Pin before `fdroid update` when the app already has metadata. archive_older
# keeps the CurrentVersionCode build and then the highest versionCodes, and a
# stable build sits below the nightlies: pinned only afterwards, it was
# archived by the very update that indexed it. A new app
# has no metadata until `--create-metadata` writes it, so it pins after.
metadata="$base/metadata/$app_id.yml"
pinned_early=false
if [[ "$mark_current" == "true" && -f "$metadata" ]]; then
  cp -p "$metadata" "$base/tmp/$app_id.yml.before-pin"
  pin_current
  pinned_early=true
fi

cp "$apk" "$base/repo/"
echo "[fdroid-publish] copied $(basename "$apk") into $base/repo/"

docker run --rm --user "$(id -u):$(id -g)" \
  --entrypoint /bin/bash \
  -e HOME=/tmp/fdroid-home \
  -v "$base":/repo \
  -w /repo \
  fdroid-server:local \
  -c '
    set -euo pipefail
    mkdir -p "$HOME"
    git config --global --add safe.directory "*"

    # Drop a raster launcher icon into the localized graphics dir before
    # update. fdroidserver cannot rasterize vector adaptive icons
    # (mipmap-anydpi-v26 wins for the main resource ref), so without this
    # the package publishes with no icon in the index.
    status=0
    python3 - "$1" "$2" <<PY || status=$?
import sys, zipfile, pathlib
from androguard.core.apk import APK
apk_path, app_id = sys.argv[1], sys.argv[2]
apk = APK(apk_path)
icon = apk.get_app_icon(max_dpi=640)
if icon and icon.endswith(".png"):
    out_dir = pathlib.Path(f"/repo/metadata/{app_id}/en-US")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "icon.png"
    with zipfile.ZipFile(apk_path) as z:
        out_path.write_bytes(z.read(icon))
    print(f"[extract-icon] {icon} -> {out_path}")
else:
    print(f"[extract-icon] no PNG icon in APK (got {icon!r}); skipping", file=sys.stderr)

# Name the APK <appId>_<versionCode>.apk here instead of passing
# --rename-apks to fdroid update: that option forces a clean run, which
# ignores tmp/apkcache.json and re-reads and re-hashes every APK in the repo
# (minutes, and growing with every publish) instead of only the new one.
import hashlib, os
def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
target = f"/repo/repo/{apk.get_package()}_{apk.get_androidversion_code()}.apk"
if os.path.abspath(apk_path) == target:
    print(f"[rename] already named {target}")
elif not os.path.exists(target):
    os.rename(apk_path, target)
    print(f"[rename] -> {target}")
elif sha256(target) == sha256(apk_path):
    os.remove(apk_path)
    print(f"[rename] {target} is already published, byte for byte; dropped the copy")
else:
    # A different APK with the same versionCode: leave it to fdroid, which
    # names it with a signer suffix or moves it to duplicates/.
    print(f"[rename] {target} exists with other contents; using --rename-apks", file=sys.stderr)
    sys.exit(3)
PY

    case "$status" in
      0) fdroid update --quiet --create-metadata ;;
      3) fdroid update --quiet --rename-apks --create-metadata ;;
      *) exit "$status" ;;
    esac
  ' _ "/repo/repo/$(basename "$apk")" "$app_id" || {
  status=$?
  if [[ "$pinned_early" == "true" ]]; then
    cp -p "$base/tmp/$app_id.yml.before-pin" "$metadata"
    echo "[fdroid-publish] update failed; put $app_id's metadata back as it was" >&2
  fi
  exit "$status"
}

if [[ "$mark_current" == "true" ]]; then
  if [[ "$pinned_early" != "true" ]]; then
    pin_current
    # Re-index so the change to metadata is reflected in the signed index.
    docker run --rm --user "$(id -u):$(id -g)" \
      --entrypoint /bin/bash \
      -e HOME=/tmp/fdroid-home \
      -v "$base":/repo \
      -w /repo \
      fdroid-server:local \
      -c '
        set -euo pipefail
        mkdir -p "$HOME"
        git config --global --add safe.directory "*"
        fdroid update --quiet
      '
  fi
  check_current
fi

echo "[fdroid-publish] $app_id published to $base_name"
echo "[fdroid-publish] index: $base/repo/index-v2.json"
