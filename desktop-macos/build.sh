#!/bin/bash
# Builds Iris.app, ad-hoc signed. Run on a Mac with Xcode.
#
#   IRIS_URL=https://iris.example.org desktop-macos/build.sh
#
# Environment:
#   IRIS_URL           required: the Iris web app the shell opens and the one origin it trusts,
#                      https://host[:port] (the Linux shell's IRIS_URL)
#   IRIS_VERSION       CFBundleShortVersionString, what irisDesktop.version() answers (default 0.0.0-dev)
#   IRIS_BUILD_NUMBER  CFBundleVersion (default 1)
#   ARCHS              "arm64" (default), "x86_64", or "arm64 x86_64" for a universal app
#   BUILD_DIR          SwiftPM's scratch directory (default ~/.cache/build/iris/desktop-macos)
#   OUT_DIR            where Iris.app goes (default $BUILD_DIR/out)
#   SWIFT_JOBS         at most this many parallel compile jobs (default: SwiftPM's, one per core)
#   TEST_HOOKS=1       a test build: "Iris Test.app", bundle id house.mouseion.iris.test, with the
#                      IRIS_SHELL_* environment overrides (README). Never ship one.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

url="${IRIS_URL:-}"
if [[ -z "$url" ]]; then
	echo "IRIS_URL is not set: pass the Iris web app the shell opens, e.g. IRIS_URL=https://iris.example.org" >&2
	exit 1
fi
if [[ ! "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]]; then
	echo "IRIS_URL is \"$url\": it must be https://host or https://host:port, with no path" >&2
	exit 1
fi
version="${IRIS_VERSION:-0.0.0-dev}"
build_number="${IRIS_BUILD_NUMBER:-1}"
archs="${ARCHS:-arm64}"
scratch="${BUILD_DIR:-$HOME/.cache/build/iris/desktop-macos}"
out="${OUT_DIR:-$scratch/out}"

name="Iris"
bundle_id="house.mouseion.iris"
swift_flags=(-c release)
for arch in $archs; do swift_flags+=(--arch "$arch"); done
if [[ -n "${SWIFT_JOBS:-}" ]]; then swift_flags+=(--jobs "$SWIFT_JOBS"); fi
if [[ "${TEST_HOOKS:-}" == 1 ]]; then
	name="Iris Test"
	bundle_id="house.mouseion.iris.test"
	scratch="$scratch-test"
	swift_flags+=(-Xswiftc -DIRIS_SHELL_TEST_HOOKS)
fi

cd "$here"
swift build "${swift_flags[@]}" --scratch-path "$scratch" --product Iris
bin="$(swift build "${swift_flags[@]}" --scratch-path "$scratch" --show-bin-path)/Iris"

app="$out/$name.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/Iris"
cp Resources/bridge-adapter.js "$app/Contents/Resources/"

# The icon, from the 1024 px master (make-icon.sh).
iconset="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
	sips -z "$size" "$size" Resources/AppIcon-1024.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
	double=$((size * 2))
	sips -z "$double" "$double" Resources/AppIcon-1024.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"
rm -rf "$(dirname "$iconset")"

cat >"$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleExecutable</key>
	<string>Iris</string>
	<key>CFBundleIdentifier</key>
	<string>$bundle_id</string>
	<key>CFBundleName</key>
	<string>$name</string>
	<key>CFBundleDisplayName</key>
	<string>$name</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$version</string>
	<key>CFBundleVersion</key>
	<string>$build_number</string>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>Matrix link</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>matrix</string>
			</array>
		</dict>
	</array>
	<key>IrisURL</key>
	<string>$url</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.social-networking</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
	<key>NSSupportsAutomaticTermination</key>
	<false/>
	<key>NSSupportsSuddenTermination</key>
	<false/>
</dict>
</plist>
EOF
plutil -lint "$app/Contents/Info.plist" >/dev/null

codesign --force --sign - --timestamp=none "$app"
codesign --verify --strict --verbose=1 "$app"
echo "built $app ($version, $archs, $url)"
