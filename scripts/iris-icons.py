#!/usr/bin/env python3
"""Cuts every icon the app ships from the Iris artwork in branding/.

The mark is an iris flower that stands alone and fills its square from top to bottom, so the sizes
below that sit it on a ground are fractions of the flower's own height; the deep rounded square (branding/iris-app-icon.svg)
is only for places that need a shape behind it, such as a phone's home screen. The artwork was
decided on 2026-10-08 (mouseion/iris#12) and is drawn on the design/iris branch.

Needs Pillow and a Chromium (set CHROME, or it uses Playwright's headless shell). Run from the repo
root after changing anything in branding/:  python3 scripts/iris-icons.py
"""
import io
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "branding"
RES = ROOT / "mobile/android/app/src/main/res"
DESKTOP = ROOT / "desktop/icons/hicolor"
CHROME = os.environ.get("CHROME") or str(
    Path.home() / ".cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell")
DEEP = (0x30, 0x22, 0x46, 255)   # the app icon's ground
NIGHT = (0x15, 0x16, 0x1A, 255)  # the app's dark ground, behind the splash
MASTER = 1024


def render(svg_text):
    """One SVG as a square RGBA image, MASTER pixels on a side, on a clear ground."""
    with tempfile.TemporaryDirectory() as tmp:
        page, shot = Path(tmp) / "p.html", Path(tmp) / "p.png"
        sized = svg_text.replace("<svg ", f'<svg width="{MASTER}" height="{MASTER}" ', 1)
        page.write_text(f'<body style="margin:0;background:transparent">{sized}</body>')
        subprocess.run([CHROME, "--no-sandbox", "--hide-scrollbars", "--default-background-color=00000000",
                        f"--window-size={MASTER},{MASTER}", f"--screenshot={shot}", f"file://{page}"],
                       check=True, capture_output=True, timeout=120)
        return Image.open(io.BytesIO(shot.read_bytes())).convert("RGBA")


def fit(img, size):
    return img.resize((size, size), Image.LANCZOS)


def on(ground, mark, size, scale, shape="square"):
    """The mark centred on a filled square, rounded square or circle."""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(out)
    if shape == "circle":
        draw.ellipse((0, 0, size - 1, size - 1), fill=ground)
    elif shape == "rounded":
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * .23), fill=ground)
    else:
        draw.rectangle((0, 0, size, size), fill=ground)
    m = fit(mark, round(size * scale))
    out.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return out


def badge(img, colour):
    """A dot in the upper right corner: green for unread, red for a highlight."""
    out, s = img.copy(), img.width
    draw = ImageDraw.Draw(out)
    r, cx, cy = s * .15, s * .79, s * .21
    draw.ellipse((cx - r * 1.3, cy - r * 1.3, cx + r * 1.3, cy + r * 1.3), fill=(255, 255, 255, 255))
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)
    return out


def main():
    dark = render((BRAND / "iris-mark-on-dark.svg").read_text())
    light = render((BRAND / "iris-mark-on-light.svg").read_text())
    icon = render((BRAND / "iris-app-icon.svg").read_text())
    # One flat shape, for Android's status bar and themed icons: every part white, the shading dropped.
    flat = re.sub(r'<path fill="#000" opacity[^>]*/>', "", (BRAND / "iris-mark-on-dark.svg").read_text())
    flat = re.sub(r'(fill|stroke)="#[0-9A-Fa-f]{6}"', r'\1="#FFFFFF"', flat)
    white = render(flat)

    # The web client. The lone mark uses the light-ground colours, which hold on a dark tab strip too.
    pub = ROOT / "public"
    # The lockup (the mark beside the name) shows the artwork itself, one per ground.
    for name in ("iris-mark-on-dark.svg", "iris-mark-on-light.svg"):
        shutil.copy(BRAND / name, pub / "res/svg" / name)
    logo = fit(light, 192)
    logo.save(pub / "res/iris-logo.png")
    badge(logo, (0, 166, 99, 255)).save(pub / "res/iris-logo-unread.png")
    badge(logo, (200, 16, 16, 255)).save(pub / "res/iris-logo-highlight.png")
    fit(light, 64).save(pub / "favicon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)])
    # The PWA icon is the lone mark, not over the tile: the night colours on a clear ground. The
    # tile stays with the native app icon (ic_launcher) and the apple touch icons.
    for f in sorted((pub / "res/android").glob("android-chrome-*.png")):
        fit(dark, int(re.search(r"(\d+)x", f.name).group(1))).save(f)
    for f in sorted((pub / "res/apple").glob("apple-touch-icon-*.png")):
        size = int(re.search(r"(\d+)x", f.name).group(1))
        on(DEEP, dark, size, .684).convert("RGB").save(f)  # iOS rounds the corners itself and wants no clear pixels

    # The Linux desktop shell (desktop/) matches the PWA: the lone mark in its night colours on a
    # clear ground, at the sizes of the hicolor theme. The scalable one is
    # branding/iris-mark-on-dark.svg itself, which the package installs as it is.
    for size in (16, 22, 24, 32, 48, 64, 128, 256, 512):
        out = DESKTOP / f"{size}x{size}/apps"
        out.mkdir(parents=True, exist_ok=True)
        fit(dark, size).save(out / "house.mouseion.iris.png", optimize=True)
    # A mention in the tray is no icon of ours: Plasma marks the item itself (desktop/src/tray.cpp).

    # Android. An adaptive icon's layers are 108 dp with the picture inside the middle 66 dp.
    for name, dp in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
        mip = RES / f"mipmap-{name}"
        fit(icon, round(48 * dp)).save(mip / "ic_launcher.png")
        on(DEEP, dark, round(48 * dp), .63, "circle").save(mip / "ic_launcher_round.png")
        on((0, 0, 0, 0), dark, round(108 * dp), .486).save(mip / "ic_launcher_foreground.png")
        on((0, 0, 0, 0), white, round(108 * dp), .486).save(mip / "ic_launcher_monochrome.png")
        note = RES / f"drawable-{name}"
        note.mkdir(exist_ok=True)
        fit(white, round(24 * dp)).save(note / "ic_notification.png")
    for f in sorted(RES.glob("drawable*/splash.png")):
        w, h = Image.open(f).size
        splash = Image.new("RGBA", (w, h), NIGHT)
        m = fit(dark, round(min(w, h) * .27))
        splash.alpha_composite(m, ((w - m.width) // 2, (h - m.height) // 2))
        splash.convert("RGB").save(f)
    print("icons cut from", BRAND.relative_to(ROOT))


main()
