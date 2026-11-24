#!/usr/bin/env bash
# Cuts Resources/AppIcon-1024.png, the master of the macOS app icon, from branding/iris-app-icon.svg
# (the mark on its deep rounded square). macOS draws no shape of its own behind an icon, so the square
# sits on Apple's icon grid: 824 px of a 1024 px canvas, centred. build.sh makes the .icns from it.
# Rerun after changing the artwork. Needs rsvg-convert and ImageMagick, e.g.
#   nix-shell -p librsvg imagemagick --run desktop-macos/make-icon.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
rsvg-convert -w 824 -h 824 "$here/../branding/iris-app-icon.svg" -o "$tmp/square.png"
magick -size 1024x1024 xc:none "$tmp/square.png" -geometry +100+100 -composite -strip "PNG32:$here/Resources/AppIcon-1024.png"
echo "wrote $here/Resources/AppIcon-1024.png"
