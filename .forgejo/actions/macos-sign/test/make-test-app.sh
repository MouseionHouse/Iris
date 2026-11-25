#!/bin/bash
# Builds "Sign Test.app" for the action's test: a main program, a helper beside it in
# Contents/MacOS (as Atmos has its service), and a dylib in Contents/Frameworks that the main
# program links, all ad-hoc signed, as the house's build scripts leave their apps.
#
#   actions/macos-sign/test/make-test-app.sh <dir>     # makes <dir>/Sign Test.app
set -euo pipefail
dir="${1:?a directory to build in}"
src="$dir/src"
app="$dir/Sign Test.app"
rm -rf "$src" "$app"
mkdir -p "$src" "$app/Contents/MacOS" "$app/Contents/Frameworks" "$app/Contents/Resources"

cat >"$src/greet.c" <<'EOF'
const char *greet(void) { return "signed and loaded"; }
EOF
cat >"$src/main.c" <<'EOF'
#include <stdio.h>
const char *greet(void);
int main(void) { printf("sign-test: %s\n", greet()); return 0; }
EOF
cat >"$src/helper.c" <<'EOF'
#include <stdio.h>
int main(void) { printf("sign-test-helper: ran\n"); return 0; }
EOF

clang -dynamiclib -install_name @rpath/libgreet.dylib -o "$app/Contents/Frameworks/libgreet.dylib" "$src/greet.c"
clang -o "$app/Contents/MacOS/sign-test" "$src/main.c" -L"$app/Contents/Frameworks" -lgreet \
	-Wl,-rpath,@executable_path/../Frameworks
clang -o "$app/Contents/MacOS/sign-test-helper" "$src/helper.c"
echo "a resource" >"$app/Contents/Resources/note.txt"

cat >"$app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>sign-test</string>
	<key>CFBundleIdentifier</key>
	<string>house.mouseion.sign-test</string>
	<key>CFBundleName</key>
	<string>Sign Test</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
</dict>
</plist>
EOF
rm -rf "$src"

codesign --force --sign - "$app/Contents/Frameworks/libgreet.dylib"
codesign --force --sign - "$app/Contents/MacOS/sign-test-helper"
codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"
echo "built $app (ad-hoc)"
