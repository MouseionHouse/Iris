#!/usr/bin/env bash
# The release scan (.forgejo/workflows/release.yml, job `release`): unpacks every file a release
# would send and checks what is inside with the same lists as the publish guard
# (publish-guard.sh): the private strings, the patterns and gitleaks. It reports every finding,
# then exits 1 if there was one.
#
#   release-scan.sh <dir>
#
# <dir> holds the release files. Each is unpacked into a work tree, by its name: .tar.gz and .tgz
# with tar, .zip, .apk, .aab, .jar and .aar as zip files, a lone .gz with gzip; then the archives
# found inside them, three levels deep. Anything else is read as it is.
#
# Environment:
#   PRIVATE_STRINGS_FILE  fixed strings, one per line, matched without case. A finding names the
#                         file and the line, never the text: these strings are secret
#   PATTERNS              extended regular expressions, one per line, matched without case. Public
#                         as patterns, so a finding names which one
#   GITLEAKS              the gitleaks binary
#   EXTRA_STRINGS_FILE    optional: more fixed strings, matched like the private ones (the
#                         workflow passes the runner's own paths and host name)
#
# What is matched: every line of every file, and every path. Binary files are read as text with
# their NUL bytes removed, so that a string stored as UTF-16 (as Android's binary XML stores its
# strings) reads as the plain string. Removing NULs moves no newline, so line numbers hold.
set -euo pipefail

dir=${1?usage: release-scan.sh <dir>}
for name in PRIVATE_STRINGS_FILE PATTERNS GITLEAKS; do
  if [ -z "${!name:-}" ]; then
    echo "release-scan: $name is not set" >&2
    exit 2
  fi
done
for tool in tar gzip grep sed find; do
  command -v "$tool" >/dev/null || { echo "release-scan: $tool is not installed" >&2; exit 2; }
done
# Zip files: unzip, or Python's zipfile where there is no unzip.
if command -v unzip >/dev/null; then
  unzip_to() { unzip -qq -o "$1" -d "$2"; }
elif command -v python3 >/dev/null; then
  unzip_to() { python3 -I -m zipfile -e "$1" "$2"; }
else
  echo "release-scan: neither unzip nor python3 is installed" >&2
  exit 2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
tree=$work/tree # the files, unpacked
view=$work/view # the same files with NULs removed: what is matched

tr -d '\r' <"$PRIVATE_STRINGS_FILE" | grep -v '^[[:space:]]*$' >"$work/strings" || true
if [ ! -s "$work/strings" ]; then
  echo "release-scan: the private strings list has no strings" >&2
  exit 2
fi
if [ -n "${EXTRA_STRINGS_FILE:-}" ]; then
  tr -d '\r' <"$EXTRA_STRINGS_FILE" | grep -v '^[[:space:]]*$' >>"$work/strings" || true
fi

# unpack <archive> <into>: 0 when <archive> was one and is now unpacked.
unpack() {
  local f=$1 into=$2
  case $f in
    *.tar.gz | *.tgz) mkdir -p "$into" && tar -xzf "$f" -C "$into" ;;
    *.zip | *.apk | *.aab | *.jar | *.aar) mkdir -p "$into" && unzip_to "$f" "$into" ;;
    *.gz) mkdir -p "$into" && gzip -dc "$f" >"$into/$(basename "${f%.gz}")" ;;
    *) return 1 ;;
  esac
}

mkdir -p "$tree"
files=0
for f in "$dir"/*; do
  [ -f "$f" ] || continue
  files=$((files + 1))
  name=$(basename "$f")
  if ! unpack "$f" "$tree/$name"; then
    mkdir -p "$tree/$name"
    cp "$f" "$tree/$name/$name"
  fi
done
if [ "$files" = 0 ]; then
  echo "release-scan: no files in $dir" >&2
  exit 2
fi
# Archives inside archives (a library's .jar, a precompressed asset), each beside itself as
# <name>.unpacked/, three levels deep.
for _ in 1 2 3; do
  found=0
  while IFS= read -r -d '' f; do
    [ -e "$f.unpacked" ] && continue
    if unpack "$f" "$f.unpacked"; then found=1; fi
  done < <(find "$tree" -type f \( -name '*.tar.gz' -o -name '*.tgz' -o -name '*.zip' -o -name '*.apk' \
    -o -name '*.aab' -o -name '*.jar' -o -name '*.aar' -o -name '*.gz' \) -print0)
  [ "$found" = 1 ] || break
done

(cd "$tree" && find . -type f -print0) | while IFS= read -r -d '' rel; do
  mkdir -p "$view/$(dirname "$rel")"
  tr -d '\000' <"$tree/$rel" >"$view/$rel"
done
echo "scanning $files release files: $(cd "$tree" && find . -type f | wc -l) files unpacked, $(du -sb "$tree" | cut -f1) bytes"

findings=0
# finding <check> <where>. A location that itself holds a private string is withheld.
finding() {
  local where=$2
  if grep -q -i -F -f "$work/strings" <<<"$where"; then
    where="(withheld: the location itself holds a private string)"
  fi
  echo "FAIL: $1: $where"
  findings=$((findings + 1))
}

# locate <grep options and patterns...>: "file:line" of every matching line, then each matching path.
locate() {
  (cd "$view" && { grep -r -a -i -l -Z "$@" . || true; }) |
    while IFS= read -r -d '' rel; do
      { grep -a -i -n "$@" "$view/$rel" || true; } | cut -d: -f1 | sed "s|^|${rel#./}:|"
    done
  (cd "$tree" && find . -mindepth 1 | sed 's|^\./||') | { grep -i "$@" || true; } | sed 's/$/ (the path)/'
}

while IFS= read -r loc; do
  finding "private string" "$loc"
done < <(locate -F -f "$work/strings")

while IFS= read -r pattern; do
  [ -n "$pattern" ] || continue
  while IFS= read -r loc; do
    finding "pattern $pattern" "$loc"
  done < <(locate -E -e "$pattern")
done <<<"$PATTERNS"

# gitleaks, on the unpacked files. Only where each finding is comes out of its report.
printf '%s\n' '{{ range . }}{{ .RuleID }}{{ "\t" }}{{ .File }}{{ "\t" }}{{ .StartLine }}' '{{ end }}' >"$work/gitleaks.tmpl"
set +e
"$GITLEAKS" dir --no-banner --redact=100 --log-level error --exit-code 3 \
  --report-format template --report-template "$work/gitleaks.tmpl" --report-path "$work/gitleaks.tsv" "$tree"
status=$?
set -e
case $status in
  0) ;;
  3)
    while IFS=$'\t' read -r rule file line; do
      [ -n "$rule" ] || continue
      finding "gitleaks $rule" "${file#"$tree"/}:$line"
    done <"$work/gitleaks.tsv"
    ;;
  *)
    echo "release-scan: gitleaks failed (exit $status)" >&2
    exit 2
    ;;
esac

if [ "$findings" -gt 0 ]; then
  echo "release-scan: $findings finding(s): this must not be released"
  exit 1
fi
echo "release-scan: nothing found"
