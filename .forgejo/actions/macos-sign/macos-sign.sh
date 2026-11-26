#!/bin/bash
# Signs one .app with a Developer ID and the hardened runtime, packages it (zip or dmg),
# notarizes and staples it, and checks the result, from the material in the environment.
# Called by action.yml; it runs by hand the same way on a Mac:
#
#   MS_APP=out/Iris.app MS_P12_BASE64="$(base64 -i id.p12)" MS_P12_PASSWORD=… \
#     actions/macos-sign/macos-sign.sh
#
# The certificate goes into a keychain of its own, in a private temp dir, for this run only.
# On every exit (success, failure, a signal) the keychain leaves the user's search list and is
# deleted, with every decoded file. A run killed outright (SIGKILL) leaves it behind: the next
# run sweeps it (drop_ours).
#
# With MS_RUN it signs nothing itself: it sets up the keychain (and a notarytool profile from the
# API key), runs that command for the caller's own signing, and cleans up. For apps that sign
# themselves, such as Chromium with its sign_chrome.py.
#
# Environment (README.md says more):
#   MS_APP                      the .app (required, unless MS_RUN)
#   MS_RUN                      a command (bash) to run while the keychain exists, in place of the
#                               signing here; it gets MACOS_SIGN_IDENTITY, MACOS_SIGN_IDENTITY_SHA1,
#                               MACOS_SIGN_KEYCHAIN and MACOS_NOTARY_PROFILE (empty without a key)
#   MS_ENTITLEMENTS             plist for the app's executables (optional)
#   MS_PACKAGE                  zip (default), dmg or none
#   MS_OUTPUT                   the package's path (default beside the app: <Name>.zip/.dmg)
#   MS_VOLUME_NAME              the dmg's volume name (default the app's name)
#   MS_IDENTITY                 the identity to sign with, a name or SHA-1 (default: the
#                               keychain's Developer ID Application, else its only identity)
#   MS_P12_BASE64, MS_P12_PASSWORD             the certificate with its key; unset = ad-hoc stays
#   MS_NOTARY_KEY_P8_BASE64, MS_NOTARY_KEY_ID, MS_NOTARY_ISSUER_ID
#                                              App Store Connect API key; unset = no notarization
#   MS_TEAM_ID                  if set, the identity must belong to this team
set -euo pipefail

log() { echo "macos-sign: $*"; }
die() {
	echo "macos-sign: $*" >&2
	exit 1
}
output() { if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "$1=$2" >>"$GITHUB_OUTPUT"; fi; }

here="$(cd "$(dirname "$0")" && pwd)"
[[ "$(uname -s)" == Darwin ]] || die "this runs on a Mac"

app="${MS_APP:-}"
entitlements="${MS_ENTITLEMENTS:-}"
package="${MS_PACKAGE:-zip}"
out="${MS_OUTPUT:-}"
p12_b64="${MS_P12_BASE64:-}"
p8_b64="${MS_NOTARY_KEY_P8_BASE64:-}"
key_id="${MS_NOTARY_KEY_ID:-}"
issuer="${MS_NOTARY_ISSUER_ID:-}"
team_id="${MS_TEAM_ID:-}"
run="${MS_RUN:-}"

if [[ -n "$run" ]]; then
	# the keychain only: what to sign, and how, is the command's
	[[ -z "$app" ]] || die "app and run go one or the other: run signs for itself"
else
	[[ -n "$app" ]] || die "no app given (MS_APP)"
	app="${app%/}"
	[[ -d "$app" && "$app" == *.app ]] || die "$app is not an .app bundle"
	case "$package" in zip | dmg | none) ;; *) die "package is \"$package\": zip, dmg or none" ;; esac
	if [[ -n "$entitlements" ]]; then
		[[ -f "$entitlements" ]] || die "no entitlements file at $entitlements"
		plutil -lint "$entitlements" >/dev/null || die "$entitlements is not a valid plist"
	fi
	name="$(basename "$app" .app)"
	if [[ -z "$out" && "$package" != none ]]; then out="$(dirname "$app")/$name.$package"; fi
fi

output signed false
output notarized false
output package ""

if [[ -z "$p12_b64" ]]; then
	if [[ -n "$run" ]]; then
		log "no Developer ID certificate (APPLE_DEVELOPER_ID_P12_BASE64 is not set): the command is not run, and nothing is signed"
	else
		log "no Developer ID certificate (APPLE_DEVELOPER_ID_P12_BASE64 is not set): $name.app stays ad-hoc signed"
	fi
	exit 0
fi
notarize=true
if [[ -z "$p8_b64$key_id$issuer" ]]; then
	notarize=false
elif [[ -z "$p8_b64" || -z "$key_id" || -z "$issuer" ]]; then
	die "the notary key is half set: APPLE_NOTARY_KEY_P8_BASE64, APPLE_NOTARY_KEY_ID and APPLE_NOTARY_ISSUER_ID go together"
fi

# --- the keychain ------------------------------------------------------------------------

# The user's keychain search list, one path per line.
# (Its readers use grep without -q: under pipefail, -q stopping early can kill the writer with
# SIGPIPE and turn a match into a miss.)
search_list() { security list-keychains -d user | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//'; }

ours() { [[ "$1" == */macos-sign.*/signing.keychain-db ]]; }
ours_re='/macos-sign\.[^/]*/signing\.keychain-db$'

# Takes every keychain of this action's off the search list (ours and any an earlier run left
# when it was killed outright) and deletes those still on disk. The list is set to the rest; a
# rest that is empty (the runner's own user has no keychains of its own) is set as no list, and
# if `security` keeps the old one for that, as the system keychain alone, which is what an
# empty list searches anyway.
drop_ours() {
	local rest=() k found=0
	while IFS= read -r k; do
		if [[ -z "$k" ]]; then continue; fi
		if ours "$k"; then
			found=1
			if [[ -e "$k" ]]; then security delete-keychain "$k" 2>/dev/null || rm -f "$k"; fi
		else
			rest+=("$k")
		fi
	done < <(search_list)
	if [[ $found == 0 ]]; then return 0; fi
	if [[ ${#rest[@]} -gt 0 ]]; then
		security list-keychains -d user -s "${rest[@]}"
	else
		security list-keychains -d user -s
		if search_list | grep "$ours_re" >/dev/null; then
			security list-keychains -d user -s /Library/Keychains/System.keychain
		fi
	fi
}

work=""
kc=""
cleanup() {
	local status=$?
	set +e
	if [[ -n "$kc" && -e "$kc" ]]; then security delete-keychain "$kc" || rm -f "$kc"; fi
	drop_ours
	if [[ -n "$work" ]]; then rm -rf "$work"; fi
	if [[ -n "$kc" ]]; then
		if [[ -e "$kc" ]] || search_list | grep -xF "$kc" >/dev/null; then
			echo "macos-sign: the keychain $kc is still there" >&2
			status=1
		else
			log "keychain deleted, decoded files removed"
		fi
	fi
	exit $status
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

if search_list | grep "$ours_re" >/dev/null; then
	log "removing keychains an earlier run left on the search list"
	drop_ours
fi
# The real path (/private/var/…, not /var/…): the search list holds that form, and delete-keychain
# takes the keychain off the list only when the two match.
work="$(cd "$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/macos-sign.XXXXXX")" && pwd -P)"
chmod 700 "$work"
kc="$work/signing.keychain-db"
kc_pw="$(openssl rand -hex 24)"

orig_list=()
while IFS= read -r k; do if [[ -n "$k" ]]; then orig_list+=("$k"); fi; done < <(search_list)
security create-keychain -p "$kc_pw" "$kc"
# Locks itself after 2 h, and not on sleep: no job here signs for longer.
security set-keychain-settings -u -t 7200 "$kc"
security unlock-keychain -p "$kc_pw" "$kc"
printf '%s' "$p12_b64" | tr -d ' \t\r\n' | base64 -D >"$work/id.p12"
[[ -s "$work/id.p12" ]] || die "APPLE_DEVELOPER_ID_P12_BASE64 decodes to nothing"
security import "$work/id.p12" -k "$kc" -f pkcs12 -P "${MS_P12_PASSWORD:-}" -T /usr/bin/codesign >/dev/null ||
	die "the certificate would not import: is APPLE_DEVELOPER_ID_P12_PASSWORD its password?"
rm -f "$work/id.p12"
# The intermediate a Developer ID Application certificate is issued under (Apple's, public).
# codesign needs the whole chain, but on macOS 27 it does not take the intermediate from this
# keychain: the Mac must have it in the System keychain (checked below; #77). Kept here for the
# Macs that still look in it. A .p12 can carry it already (the org's does: run 33441), and then
# `security` refuses it as "already exists in the keychain": that is fine, anything else is not.
if ! err="$(security import "$here/DeveloperIDG2CA.cer" -k "$kc" 2>&1 >/dev/null)"; then
	grep -F 'already exists' <<<"$err" >/dev/null || die "Apple's intermediate would not import: $err"
	log "Apple's Developer ID G2 intermediate is on the Mac already"
fi
# Lets codesign use the key without a dialog, which nobody would answer.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$kc_pw" "$kc" >/dev/null
# codesign finds identities, and builds their chains, through the search list.
security list-keychains -d user -s "$kc" ${orig_list[@]+"${orig_list[@]}"}
log "keychain created: $kc"

# --- the identity ------------------------------------------------------------------------

# "  1) <SHA-1> "<name>"" for each identity, valid or not (a self-signed test one is not).
identities="$(security find-identity -p codesigning "$kc" | sed -n '/Matching identities/,/identities found/p' |
	grep -E '^[[:space:]]+[0-9]+\) [0-9A-F]{40} "' || true)"
[[ -n "$identities" ]] || die "the certificate brings no code-signing identity"
pick() { awk '{ hash = $2; sub(/^[^"]*"/, ""); sub(/"[^"]*$/, ""); print hash "\t" $0 }'; }
if [[ -n "${MS_IDENTITY:-}" ]]; then
	chosen="$(pick <<<"$identities" | awk -F'\t' -v want="$MS_IDENTITY" '$1 == want || index($2, want) { print; exit }')"
	[[ -n "$chosen" ]] || die "no identity matches \"$MS_IDENTITY\" in the certificate"
else
	chosen="$(pick <<<"$identities" | awk -F'\t' 'index($2, "Developer ID Application: ") == 1 { print; exit }')"
	if [[ -z "$chosen" ]]; then
		[[ "$(wc -l <<<"$identities")" -eq 1 ]] || die "several identities and none a Developer ID Application: say which (identity)"
		chosen="$(pick <<<"$identities")"
	fi
fi
hash="${chosen%%$'\t'*}"
identity="${chosen#*$'\t'}"
developer_id=false
if [[ "$identity" == "Developer ID Application: "* ]]; then developer_id=true; fi
if [[ -n "$team_id" && "$identity" != *"($team_id)" ]]; then
	die "the identity \"$identity\" is not of the team $team_id (APPLE_TEAM_ID)"
fi
log "codesign identity: $identity ($hash)"
# A Developer ID whose chain does not build to Apple Root CA is not valid, and codesign stops at
# the first file with "unable to build chain to self-signed root" and errSecInternalComponent.
# Said here, with the cause: the Mac lacks Apple's intermediate in its System keychain (or the
# certificate has expired or been revoked).
if [[ $developer_id == true ]]; then
	if ! security find-identity -v -p codesigning "$kc" | grep -F "$hash" >/dev/null; then
		die "the identity's chain does not build to Apple Root CA, so codesign would fail (errSecInternalComponent): add Apple's Developer ID G2 intermediate to the Mac's System keychain (sudo security add-certificates -k /Library/Keychains/System.keychain $here/DeveloperIDG2CA.cer, once, as an admin), or check that the certificate has not expired or been revoked"
	fi
	log "the identity's chain builds to Apple Root CA"
fi
if [[ $developer_id == false ]]; then
	log "not a Developer ID Application identity: fine for a test, but Apple will not notarize it"
fi
output identity "$identity"

# --- or the caller's command, in the keychain's lifetime ---------------------------------

if [[ -n "$run" ]]; then
	profile=""
	if [[ $notarize == true ]]; then
		p8="$work/AuthKey_$key_id.p8"
		printf '%s' "$p8_b64" | tr -d ' \t\r\n' | base64 -D >"$p8"
		[[ -s "$p8" ]] || die "APPLE_NOTARY_KEY_P8_BASE64 decodes to nothing"
		# In the keychain, so it goes with it. store-credentials asks Apple whether the key works.
		profile=macos-sign
		xcrun notarytool store-credentials "$profile" --key "$p8" --key-id "$key_id" --issuer "$issuer" \
			--keychain "$kc" >/dev/null || die "notarytool would not store the API key (APPLE_NOTARY_KEY_*)"
		rm -f "$p8"
		log "notary profile \"$profile\" in the keychain"
	else
		log "no App Store Connect API key (APPLE_NOTARY_KEY_*): the command gets no notary profile"
	fi
	log "running the command with the keychain"
	status=0
	MACOS_SIGN_IDENTITY="$identity" MACOS_SIGN_IDENTITY_SHA1="$hash" MACOS_SIGN_KEYCHAIN="$kc" \
		MACOS_NOTARY_PROFILE="$profile" bash -c "$run" || status=$?
	[[ $status == 0 ]] || die "the command failed (exit $status)"
	output signed true
	if [[ -n "$profile" ]]; then output notarized true; fi
	log "the command finished"
	exit 0
fi

# A secure timestamp is what notarization asks for; Apple's server stamps Developer ID only.
if [[ $developer_id == true ]]; then timestamp=(--timestamp); else timestamp=(--timestamp=none); fi
sign() { codesign --force --sign "$hash" --keychain "$kc" "${timestamp[@]}" "$@"; }

# --- signing, inside out -----------------------------------------------------------------

# Finder metadata and resource forks make codesign refuse a bundle.
xattr -cr "$app"

is_macho() { file -b "$1" | grep 'Mach-O' >/dev/null; }
is_executable_macho() { file -b "$1" | grep 'Mach-O.*executable' >/dev/null; }

# Everything inside Contents that holds code: nested bundles and loose Mach-O files.
items=()
while IFS= read -r -d '' path; do
	items+=("$path")
done < <(find "$app/Contents" \( -type d \( -name '*.app' -o -name '*.framework' -o -name '*.xpc' -o -name '*.appex' -o -name '*.bundle' -o -name '*.plugin' \) \) -print0)
while IFS= read -r -d '' path; do
	if is_macho "$path"; then items+=("$path"); fi
done < <(find "$app/Contents" -type f -print0)

# Deepest first, so each bundle is sealed after what it holds.
count=0
if [[ ${#items[@]} -gt 0 ]]; then
	while IFS= read -r line; do
		path="${line#*$'\t'}"
		args=(--options runtime)
		case "$path" in
		*.app | *.xpc | *.appex) if [[ -n "$entitlements" ]]; then args+=(--entitlements "$entitlements"); fi ;;
		*.framework | *.bundle | *.plugin) ;;
		*) if is_executable_macho "$path" && [[ -n "$entitlements" ]]; then args+=(--entitlements "$entitlements"); fi ;;
		esac
		sign "${args[@]}" "$path"
		count=$((count + 1))
	done < <(for p in "${items[@]}"; do printf '%s\t%s\n' "$(tr -cd / <<<"$p" | wc -c | tr -d ' ')" "$p"; done | sort -t$'\t' -k1,1nr -k2,2r)
fi
args=(--options runtime)
if [[ -n "$entitlements" ]]; then args+=(--entitlements "$entitlements"); fi
sign "${args[@]}" "$app"
log "signed $name.app with the hardened runtime ($count nested items, then the bundle)"

# --- checks ------------------------------------------------------------------------------

codesign --verify --deep --strict --verbose=2 "$app"
log "codesign --verify --deep --strict passed"
details="$(codesign -dv --verbose=4 "$app" 2>&1)"
grep -E '^(Identifier|Format|CodeDirectory|Authority|TeamIdentifier|Timestamp|Runtime Version)' <<<"$details" || true
grep -qE '^CodeDirectory .*flags=0x[0-9a-f]*\(.*runtime' <<<"$details" || die "$name.app has no hardened runtime flag"
if [[ -n "$entitlements" ]]; then
	echo "entitlements:"
	codesign -d --entitlements - --xml "$app" 2>/dev/null | plutil -p - || true
fi

# --- the package -------------------------------------------------------------------------

make_package() {
	case "$package" in
	zip)
		rm -f "$out"
		ditto -c -k --keepParent "$app" "$out"
		;;
	dmg)
		local stage="$work/dmg"
		rm -rf "$stage" "$out"
		mkdir -p "$stage"
		ditto "$app" "$stage/$name.app"
		ln -s /Applications "$stage/Applications"
		hdiutil create -quiet -volname "${MS_VOLUME_NAME:-$name}" -srcfolder "$stage" -ov -format UDZO "$out"
		rm -rf "$stage"
		sign "$out"
		codesign --verify --strict --verbose=2 "$out"
		;;
	esac
}
if [[ "$package" != none ]]; then
	mkdir -p "$(dirname "$out")"
	make_package
	log "packaged: $out"
	output package "$out"
fi
output signed true

# --- notarization ------------------------------------------------------------------------

if [[ $notarize == false ]]; then
	log "notarization skipped: no App Store Connect API key (APPLE_NOTARY_KEY_*); signed, not notarized, so Gatekeeper on another Mac will refuse it"
	spctl -a -vv -t exec "$app" 2>&1 | sed 's/^/spctl (informational): /' || true
	exit 0
fi

p8="$work/AuthKey_$key_id.p8"
printf '%s' "$p8_b64" | tr -d ' \t\r\n' | base64 -D >"$p8"
[[ -s "$p8" ]] || die "APPLE_NOTARY_KEY_P8_BASE64 decodes to nothing"
notary=(--key "$p8" --key-id "$key_id" --issuer "$issuer")

case "$package" in
dmg) submission="$out" ;;
zip) submission="$out" ;;
none)
	submission="$work/$name.zip"
	ditto -c -k --keepParent "$app" "$submission"
	;;
esac
log "submitting $(basename "$submission") to Apple's notary service (waits for the verdict)"
xcrun notarytool submit "$submission" "${notary[@]}" --wait --timeout 2h --output-format json >"$work/notary.json" || true
status="$(plutil -extract status raw -o - "$work/notary.json" 2>/dev/null || echo unknown)"
sub_id="$(plutil -extract id raw -o - "$work/notary.json" 2>/dev/null || echo "")"
log "notarization: $status${sub_id:+ (submission $sub_id)}"
if [[ "$status" != Accepted ]]; then
	cat "$work/notary.json" >&2 || true
	if [[ -n "$sub_id" ]]; then xcrun notarytool log "$sub_id" "${notary[@]}" >&2 || true; fi
	die "Apple did not accept $(basename "$submission")"
fi

xcrun stapler staple "$app"
xcrun stapler validate "$app"
case "$package" in
zip) make_package ;; # a zip can't hold a ticket: zipped again with the stapled app inside
dmg)
	xcrun stapler staple "$out"
	xcrun stapler validate "$out"
	;;
esac
spctl -a -vv -t exec "$app"
if [[ "$package" == dmg ]]; then spctl -a -vv -t open --context context:primary-signature "$out"; fi
log "notarized and stapled: $name.app${out:+, $out}"
output notarized true
