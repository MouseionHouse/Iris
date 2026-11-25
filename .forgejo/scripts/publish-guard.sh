#!/usr/bin/env bash
# The publish guard (.forgejo/workflows/build.yml, job `guard`): checks the commits new in a run
# for anything that must not reach the public repo. It reports every finding, then exits 1 if
# there was one.
#
#   publish-guard.sh <base> <head>
#
# The commits checked are those reachable from <head> and not from <base>; an empty <base> means
# all of <head>'s history. Commits reachable from refs/cinny/ (Cinny's branches and tags, fetched
# by the workflow) are Cinny's: they skip the identity and signature checks, and get every other.
#
# Environment:
#   PUBLIC_EMAIL          the one author and committer email of an Iris commit
#   ALLOWED_SIGNERS_FILE  an ssh allowed-signers file: every Iris commit is signed by a key in it
#   PRIVATE_STRINGS_FILE  fixed strings, one per line, matched without case. A finding names the
#                         commit, the file and the line, never the text: these strings are secret
#   PATTERNS              extended regular expressions, one per line, matched without case. Public
#                         as patterns, so a finding names which one
#   GITLEAKS              the gitleaks binary
#
# What is checked for strings and patterns: every added line of every commit's diff (a merge's
# combined diff, so a line a merge adds itself is seen), every path a diff touches, every line of
# every commit message, and every author and committer name and email.
set -euo pipefail

base=${1?usage: publish-guard.sh <base> <head>}
head=${2?usage: publish-guard.sh <base> <head>}

for name in PUBLIC_EMAIL ALLOWED_SIGNERS_FILE PRIVATE_STRINGS_FILE PATTERNS GITLEAKS; do
  if [ -z "${!name:-}" ]; then
    echo "publish-guard: $name is not set" >&2
    exit 2
  fi
done
for tool in git awk grep sed ssh-keygen; do
  command -v "$tool" >/dev/null || { echo "publish-guard: $tool is not installed" >&2; exit 2; }
done
if ! git show-ref --quiet --verify refs/cinny/dev; then
  echo "publish-guard: refs/cinny/dev is missing: Cinny's history was not fetched" >&2
  exit 2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

range=("$head")
if [ -n "$base" ]; then range+=("^$base"); fi

# Blank lines would match everything, and a CR from a pasted list would match nothing.
tr -d '\r' <"$PRIVATE_STRINGS_FILE" | grep -v '^[[:space:]]*$' >"$work/strings" || true
if [ ! -s "$work/strings" ]; then
  echo "publish-guard: the private strings list has no strings" >&2
  exit 2
fi
if ! grep -q . "$ALLOWED_SIGNERS_FILE"; then
  echo "publish-guard: the allowed signers file is empty" >&2
  exit 2
fi

git rev-list "${range[@]}" >"$work/all"
git rev-list "${range[@]}" --not --glob='refs/cinny/*' >"$work/iris"
echo "checking $(wc -l <"$work/all") commits, $(wc -l <"$work/iris") of them Iris's (the rest are Cinny's)"
if [ ! -s "$work/all" ]; then
  # `git log --stdin` with no commits would read HEAD instead.
  echo "publish-guard: no new commits"
  exit 0
fi

findings=0
# finding <check> <commit> <where>. A location that itself holds a private string (a path, say)
# is withheld, so that nothing printed here can carry one.
finding() {
  local where=$3
  if grep -q -i -F -f "$work/strings" <<<"$where"; then
    where="(withheld: the location itself holds a private string)"
  fi
  echo "FAIL: $1: commit $2: $where"
  findings=$((findings + 1))
}

# --- Identity and signature, Iris's commits only --------------------------------------------
# The emails are never printed: a wrong one may be the private thing.
if [ -s "$work/iris" ]; then
  while IFS=$'\t' read -r sha ae ce sig; do
    [ "$ae" = "$PUBLIC_EMAIL" ] || finding identity "$sha" "the author email is not the public one"
    [ "$ce" = "$PUBLIC_EMAIL" ] || finding identity "$sha" "the committer email is not the public one"
    [ "$sig" = G ] || finding signature "$sha" "not signed by the allowed key (git says $sig)"
  done < <(git -c gpg.ssh.allowedSignersFile="$ALLOWED_SIGNERS_FILE" \
    log --no-walk=unsorted --stdin --format='%H%x09%ae%x09%ce%x09%G?' <"$work/iris")
fi

# --- What strings and patterns are matched against ------------------------------------------
# Two files, line for line: `where` (commit, file, line) and `text` (what is on it). Only `where`
# is ever printed.
: >"$work/where"
: >"$work/text"

# Added lines. -U0 keeps only the changed lines; --cc gives merges their combined diff.
git -c core.quotePath=false log --no-walk=unsorted --stdin -p --cc -U0 --no-color --no-ext-diff \
  --no-renames --no-textconv --format=$'\x01%H' <"$work/all" |
  LC_ALL=C awk -v where="$work/where" -v text="$work/text" '
    function emit(loc, s) { print commit "\t" loc >> where; print s >> text }
    substr($0, 1, 1) == "\001" { commit = substr($0, 2); hunk = 0; next }
    /^diff / { hunk = 0; file = ""; next }
    !hunk && /^\+\+\+ / { file = substr($0, 5); sub(/^b\//, "", file); next }
    /^@@/ {
      # "@@ -a,b +c,d @@" or, for a merge, "@@@ -a,b -c,d +e,f @@@": the columns of prefix are
      # one fewer than the @s, and the new side starts at the field after "+".
      match($0, /^@+/); cols = RLENGTH - 1
      n = split($0, f, " ")
      for (i = 2; i <= n; i++) if (substr(f[i], 1, 1) == "+") { split(substr(f[i], 2), s, ","); line = s[1] + 0; break }
      hunk = 1; next
    }
    hunk {
      if (substr($0, 1, 1) == "\\") next
      p = substr($0, 1, cols)
      if (index(p, "-")) next
      if (index(p, "+")) emit(file ":" line, substr($0, cols + 1))
      line++
    }
  '

# Paths: every path a commit adds, changes or removes, binary files' too.
git -c core.quotePath=false log --no-walk=unsorted --stdin --name-only --no-renames \
  --format=$'\x01%H' <"$work/all" |
  LC_ALL=C awk -v where="$work/where" -v text="$work/text" '
    substr($0, 1, 1) == "\001" { commit = substr($0, 2); next }
    NF { print commit "\t" $0 " (the path)" >> where; print >> text }
  '

# Messages and identities.
git log --no-walk=unsorted --stdin --format=$'\x01%H%n%B' <"$work/all" |
  LC_ALL=C awk -v where="$work/where" -v text="$work/text" '
    substr($0, 1, 1) == "\001" { commit = substr($0, 2); n = 0; next }
    { n++; print commit "\tthe message, line " n >> where; print >> text }
  '
git log --no-walk=unsorted --stdin --format='%H%x09%an%x09%ae%x09%cn%x09%ce' <"$work/all" |
  while IFS=$'\t' read -r sha an ae cn ce; do
    printf '%s\tthe author name\n%s\tthe author email\n%s\tthe committer name\n%s\tthe committer email\n' \
      "$sha" "$sha" "$sha" "$sha" >>"$work/where"
    printf '%s\n%s\n%s\n%s\n' "$an" "$ae" "$cn" "$ce" >>"$work/text"
  done

if [ "$(wc -l <"$work/where")" != "$(wc -l <"$work/text")" ]; then
  echo "publish-guard: internal error: the locations and the text are out of step" >&2
  exit 2
fi
echo "matching $(wc -l <"$work/text") lines (added lines, paths, messages, identities)"

# Prints the location of every line of `text` that grep matches, given grep's options and patterns.
locate() {
  { grep -n -i "$@" "$work/text" || true; } | cut -d: -f1 |
    awk -v where="$work/where" '
      { want[$1] = 1 }
      END { while ((getline l < where) > 0) { n++; if ((n in want) && !seen[l]++) print l } }
    '
}

# --- Private strings -------------------------------------------------------------------------
while IFS=$'\t' read -r sha loc; do
  finding "private string" "$sha" "$loc"
done < <(locate -F -f "$work/strings")

# --- Patterns --------------------------------------------------------------------------------
while IFS= read -r pattern; do
  [ -n "$pattern" ] || continue
  while IFS=$'\t' read -r sha loc; do
    finding "pattern $pattern" "$sha" "$loc"
  done < <(locate -E -e "$pattern")
done <<<"$PATTERNS"

# --- gitleaks --------------------------------------------------------------------------------
# Its report goes to a file, and only where each finding is comes out of it: the line around a
# secret could hold a private string.
log_opts="$head"
if [ -n "$base" ]; then log_opts="$base..$head"; fi
printf '%s\n' '{{ range . }}{{ .RuleID }}{{ "\t" }}{{ .Commit }}{{ "\t" }}{{ .File }}{{ "\t" }}{{ .StartLine }}' \
  '{{ end }}' >"$work/gitleaks.tmpl"
set +e
"$GITLEAKS" git --no-banner --redact=100 --log-level error --exit-code 3 --log-opts="$log_opts" \
  --report-format template --report-template "$work/gitleaks.tmpl" --report-path "$work/gitleaks.tsv" .
status=$?
set -e
case $status in
  0) ;;
  3)
    while IFS=$'\t' read -r rule sha file line; do
      [ -n "$rule" ] || continue
      finding "gitleaks $rule" "$sha" "$file:$line"
    done <"$work/gitleaks.tsv"
    ;;
  *)
    echo "publish-guard: gitleaks failed (exit $status)" >&2
    exit 2
    ;;
esac

if [ "$findings" -gt 0 ]; then
  echo "publish-guard: $findings finding(s): this must not be published"
  exit 1
fi
echo "publish-guard: nothing found"
