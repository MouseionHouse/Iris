#!/usr/bin/env python3
"""Iris colour, round 1: natural dyes beside full saturation.

The same five sketches from mark round 1, drawn in three palettes: the house's nine as they are,
nine taken from natural dyes, and nine at full saturation. Each palette has a Night and a Chalk
set, and every colour is checked against its ground (the Chalk sets are lighter than the house's 3:1 floor, at John's ask).
Run: python3 build.py, then ../../capture.sh index.html
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("mark1", HERE.parent / "2026-10-07-mark-1" / "build.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Each entry: the Muse's slot, what the colour is called here, its value on Night, its value on Chalk.
PALETTES = [
    ("P1", "The house's nine", "The colours the sketches have used so far: soft on Night, and lightened on Chalk", [
        (n, n.capitalize(), m.MUSE["dark"][n], m.MUSE["light"][n]) for n in m.WHEEL]),
    ("P2", "Natural dyes", "Nine colours a dyer could get from plants, insects and shellfish: earthier, and closer to each other", [
        ("calliope", "Madder", "#D4735E", "#CD624C"),
        ("terpsichore", "Henna", "#D98F52", "#D47E38"),
        ("clio", "Weld", "#D6B551", "#CAA419"),
        ("thalia", "Weld on indigo", "#93A862", "#82A947"),
        ("euterpe", "Indigo on weld", "#6FAF9B", "#4CA88F"),
        ("polyhymnia", "Woad", "#7FAFC2", "#5B9EB8"),
        ("urania", "Indigo", "#7C93CF", "#496CBD"),
        ("melpomene", "Tyrian purple", "#A886BF", "#935DA8"),
        ("erato", "Cochineal", "#D9819C", "#C56384"),
    ]),
    ("P3", "Full saturation", "Nine colours as vivid as a screen can make them", [
        ("calliope", "Red", "#FF4A5E", "#EB4052"),
        ("terpsichore", "Orange", "#FF8A1F", "#FF7708"),
        ("clio", "Yellow", "#FFD21F", "#DBA200"),
        ("thalia", "Green", "#5BDB3A", "#38C01F"),
        ("euterpe", "Teal", "#00D4AE", "#00C2A0"),
        ("polyhymnia", "Cyan", "#12C2FF", "#00A5F2"),
        ("urania", "Blue", "#4F84FF", "#4C77E6"),
        ("melpomene", "Violet", "#9B6BFF", "#8E5FE7"),
        ("erato", "Magenta", "#FF52D9", "#E03ABC"),
    ]),
]
MARKS = [("R1", m.r1), ("B1", m.b1), ("W1", m.w1), ("F1", m.f1), ("E1", m.e1)]


def contrast(a, b):
    def lum(h):
        c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        r, g, bl = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
        return .2126 * r + .7152 * g + .0722 * bl
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + .05) / (lo + .05)


CSS = """
@font-face{font-family:Marcellus;src:url("../../house/Marcellus-Regular.ttf")}
@font-face{font-family:Commissioner;font-weight:400;src:url("../../house/Commissioner-Regular.ttf")}
@font-face{font-family:Commissioner;font-weight:600;src:url("../../house/Commissioner-SemiBold.ttf")}
@font-face{font-family:"IBM Plex Mono";src:url("../../house/IBMPlexMono-Regular.ttf")}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#15161A;color:#F4F4F1;font:400 15px/22px Commissioner,system-ui,sans-serif;padding:32px 36px 40px}
.label{font:600 12px/16px Commissioner,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#A2A5AD}
h1{font:400 40px/44px Marcellus,serif;margin:8px 0 8px}
.brief{color:#A2A5AD;max-width:1000px;font-size:17px;line-height:25px;margin-bottom:8px}
.option{margin-top:24px;background:#1F2126;border:1px solid #32353C;border-radius:14px;padding:20px 22px}
h2{font:600 20px/28px Commissioner,sans-serif}
.id{font:400 13px/20px 'IBM Plex Mono',monospace;border:1px solid #32353C;border-radius:6px;padding:1px 8px;margin-right:10px}
.why{color:#A2A5AD;margin:4px 0 14px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.half{border-radius:12px;border:1px solid #32353C;padding:18px 20px}
.marks{display:flex;justify-content:space-between;align-items:center}
.lockup{display:flex;align-items:center;gap:12px;font:400 40px/44px Marcellus,serif}
.sw{display:grid;grid-template-columns:repeat(9,1fr);gap:6px;margin-top:16px}
.sw div{display:flex;flex-direction:column;gap:5px;font-size:11px;line-height:14px}
.sw i{display:block;height:26px;border-radius:6px}
.sw code{font:400 10.5px/14px 'IBM Plex Mono',monospace;opacity:.6}
"""


def main():
    sections = []
    for pid, name, why, colours in PALETTES:
        halves = ""
        for g, col in (("dark", 2), ("light", 3)):
            (HERE / "options").mkdir(exist_ok=True)
            palette = {c[0]: c[col] for c in colours} | {"ink": m.INK[g]}
            low = [f"{c[1]} {contrast(c[col], m.GROUND[g]):.1f}" for c in colours if contrast(c[col], m.GROUND[g]) < 3]
            if low:
                print(pid, g, "under 3:1:", ", ".join(low))
            marks = ""
            for oid, draw in MARKS:
                body = draw(palette)
                (HERE / "options" / f"{pid}-{oid}-on-{g}.svg").write_text(
                    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n{body}\n</svg>\n')
                marks += m.inline(body, 104)
            lockup = f'<div class="lockup">{m.inline(m.w1(palette), 46)}Iris</div>'
            sw = "".join(f'<div><i style="background:{c[col]}"></i>{c[1]}<code>{c[col]}</code></div>' for c in colours)
            halves += (f'<div class="half" style="background:{m.GROUND[g]};color:{m.INK[g]}"><div class="marks">{marks}{lockup}</div>'
                       f'<div class="sw">{sw}</div></div>')
        sections.append(f'<article class="option" id="{pid}"><h2><span class="id">{pid}</span>{name}</h2><p class="why">{why}</p>'
                        f'<div class="pair">{halves}</div></article>')
    (HERE / "index.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Iris · colour · round 1</title>'
        '<meta name="board-status" content="open"><meta name="board-summary" content="Natural dyes beside full saturation">'
        f'<style>{CSS}</style></head><body>'
        '<p class="label">Iris · colour · round 1</p><h1>Natural dyes beside full saturation</h1>'
        '<p class="brief">The same five sketches in three palettes, each on Night and on Chalk, with the nine colours named underneath. '
        'The pictures are still sketches: this round is about the colour.</p>'
        f'{"".join(sections)}'
        '<script>document.fonts.ready.then(()=>{document.documentElement.dataset.h=Math.ceil(document.body.getBoundingClientRect().bottom)})</script>'
        '</body></html>\n')
    print("wrote index.html")


main()
