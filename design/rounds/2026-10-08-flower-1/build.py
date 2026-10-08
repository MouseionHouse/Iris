#!/usr/bin/env python3
"""Iris mark, round 2: the flower, varied in shape and in colour.

Six ways to draw an iris, each in five colourways, on Night and on Chalk. A cell is named by its
shape and its colourway, for example "S4 in C1".
Run: python3 build.py, then ../../capture.sh index.html
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("mark1", HERE.parent / "2026-10-07-mark-1" / "build.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
petal = m.petal

# A colourway names the flower's parts: std and back are the upright petals, fall and fall2 the
# drooping ones, beard the gold streak on a fall. Each part has a Night value and a Chalk value.
COLOURWAYS = [
    ("C1", "Purple", "The iris most people picture",
     dict(std=("#B79AD0", "#A57BBD"), back=("#8E7BC4", "#7F69B8"), fall=("#9A6BB8", "#84509E"), fall2=("#9A6BB8", "#84509E"),
          beard=("#D6B551", "#CAA419"), stem=("#93A862", "#82A947"))),
    ("C2", "Blue flag", "Indigo and woad blues with a yellow signal",
     dict(std=("#8FB3E0", "#6F9BD6"), back=("#7C93CF", "#5B80C8"), fall=("#5F7FCC", "#3F5FB5"), fall2=("#5F7FCC", "#3F5FB5"),
          beard=("#E6C65A", "#D4A91C"), stem=("#7FAF8F", "#5F9A74"))),
    ("C3", "Dyed rainbow", "A different natural dye on each petal",
     dict(std=("#A886BF", "#935DA8"), back=("#7C93CF", "#496CBD"), fall=("#D4735E", "#CD624C"), fall2=("#D9819C", "#C56384"),
          beard=("#D6B551", "#CAA419"), stem=("#93A862", "#82A947"))),
    ("C4", "Vivid rainbow", "The same idea at full saturation",
     dict(std=("#9B6BFF", "#8E5FE7"), back=("#4F84FF", "#4C77E6"), fall=("#FF4A5E", "#EB4052"), fall2=("#FF52D9", "#E03ABC"),
          beard=("#FFD21F", "#DBA200"), stem=("#5BDB3A", "#38C01F"))),
    ("C5", "Dawn", "Peach and rose, the colours of a pink iris",
     dict(std=("#F2B7A0", "#E39A80"), back=("#E8A2B8", "#D4809C"), fall=("#D9819C", "#C56384"), fall2=("#D9819C", "#C56384"),
          beard=("#E6C65A", "#D4A91C"), stem=("#93A862", "#82A947"))),
]


def at(x, y, angle, d, colour, extra=""):
    return f'<g transform="translate({x} {y}) rotate({angle})"><path d="{d}" fill="{colour}"/>{extra}</g>'


def line(d, colour, width):
    return f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="round"/>'


def mirror(s):
    return s + f'<g transform="translate(100 0) scale(-1 1)">{s}</g>'


def s1(c):
    beard = line("M0 -7 V-19", c["beard"], 3.4)
    fall = petal(37, 25, 1.08)
    return (line("M50 56 V94", c["stem"], 6) + at(50, 52, 122, fall, c["fall"], beard) + at(50, 52, -122, fall, c["fall2"], beard)
            + at(50, 52, 25, petal(40, 18, .8), c["back"]) + at(50, 52, -25, petal(40, 18, .8), c["back"])
            + at(50, 52, 0, petal(45, 20, .8), c["std"]))


def s2(c):
    side = "M53 62 C58 42 80 32 89 46 C95 56 88 68 78 65 C83 58 79 50 71 52 C63 54 60 62 58 70 Z"
    left = f'<g transform="translate(100 0) scale(-1 1)"><path d="{side}" fill="{c["fall2"]}"/></g>'
    tails = at(50, 72, 180, petal(22, 11, .8), c["back"]) + at(50, 72, 152, petal(17, 9, .8), c["back"]) + at(50, 72, -152, petal(17, 9, .8), c["back"])
    return (tails + f'<path d="{side}" fill="{c["fall"]}"/>' + left + at(50, 68, 0, petal(60, 23, .8), c["std"])
            + f'<rect x="37" y="63" width="26" height="7.5" rx="3.75" fill="{c["beard"]}"/>')


def s3(c):
    leaf = f'<path d="M50 97 C40 82 33 66 30 48 C41 60 47 78 50 97 Z" fill="{c["stem"]}"/>'
    beard = line("M0 -6 V-17", c["beard"], 3.2)
    fall = petal(33, 29, 1.1)
    return (mirror(leaf) + line("M50 58 V95", c["stem"], 5)
            + at(50, 48, 125, fall, c["fall"], beard) + at(50, 48, -125, fall, c["fall2"], beard)
            + at(50, 50, 32, petal(36, 22, .95), c["back"]) + at(50, 50, -32, petal(36, 22, .95), c["back"])
            + at(50, 52, 0, petal(42, 27, .95), c["std"]) + at(50, 50, 180, petal(22, 20, 1.1), c["fall"], line("M0 -5 V-12", c["beard"], 3)))


def s4(c):
    beard = line("M0 -9 V-25", c["beard"], 3.6)
    falls = "".join(at(50, 52, a, petal(44, 35, 1.1), c[k], beard) for a, k in ((0, "fall"), (120, "fall2"), (240, "back")))
    stds = "".join(at(50, 52, a, petal(29, 17, .85), c["std"]) for a in (60, 180, 300))
    return falls + stds + f'<circle cx="50" cy="52" r="5.5" fill="{c["beard"]}"/>'


def s5(c):
    return (f'<path d="M45 97 C31 78 28 56 34 34 C42 56 47 76 47 97 Z" fill="{c["stem"]}"/>' + line("M47 96 C47 82 49 70 53 60", c["stem"], 5)
            + at(54, 58, -118, petal(25, 19, 1.1), c["fall2"]) + at(54, 58, 22, petal(40, 19, .8), c["back"])
            + f'<path d="M54 58 C66 44 90 48 92 65 C93 76 85 84 77 80 C83 72 79 62 69 62 C63 62 58 62 54 58 Z" fill="{c["fall"]}"/>'
            + line("M61 56 Q71 52 79 57", c["beard"], 3.2) + at(54, 59, -8, petal(47, 25, .85), c["std"]))


def s6(c):
    lobe = "M11 54 A19.5 19.5 0 0 0 50 54 Z"
    return (line("M50 56 V94", c["stem"], 6) + f'<path d="{lobe}" fill="{c["fall"]}"/>'
            + f'<g transform="translate(100 0) scale(-1 1)"><path d="{lobe}" fill="{c["fall2"]}"/></g>'
            + at(50, 54, 38, petal(40, 25, .6), c["back"]) + at(50, 54, -38, petal(40, 25, .6), c["back"])
            + at(50, 54, 0, petal(47, 27, .6), c["std"]) + f'<circle cx="50" cy="54" r="5" fill="{c["beard"]}"/>')


SHAPES = [
    ("S1", "Sketch", s1, "Round 1's flower, kept for comparison"),
    ("S2", "Fleur", s2, "The heraldic iris: a tall petal, two curled falls and a band"),
    ("S3", "Bearded", s3, "A garden iris from the front, with its sword leaves"),
    ("S4", "From above", s4, "The bloom seen from above: three falls and three small standards"),
    ("S5", "In profile", s5, "One bloom from the side, with a single leaf"),
    ("S6", "Geometric", s6, "Built from almonds and half circles"),
]

CSS = """
@font-face{font-family:Marcellus;src:url("../../house/Marcellus-Regular.ttf")}
@font-face{font-family:Commissioner;font-weight:400;src:url("../../house/Commissioner-Regular.ttf")}
@font-face{font-family:Commissioner;font-weight:600;src:url("../../house/Commissioner-SemiBold.ttf")}
@font-face{font-family:"IBM Plex Mono";src:url("../../house/IBMPlexMono-Regular.ttf")}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#15161A;color:#F4F4F1;font:400 15px/22px Commissioner,system-ui,sans-serif;padding:32px 36px 40px}
.label{font:600 12px/16px Commissioner,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#A2A5AD}
h1{font:400 40px/44px Marcellus,serif;margin:8px 0 8px}
.brief{color:#A2A5AD;max-width:1000px;font-size:17px;line-height:25px;margin-bottom:24px}
.matrix{display:grid;grid-template-columns:150px repeat(5,1fr);gap:14px 14px;align-items:center}
.head h2,.side h2{font:600 17px/25px Commissioner,sans-serif}
.head p,.side p{color:#A2A5AD;font-size:13px;line-height:18px}
.head{align-self:end;padding-bottom:4px}
.id{font:400 13px/20px 'IBM Plex Mono',monospace;border:1px solid #32353C;border-radius:6px;padding:1px 8px;margin-right:8px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.tile{position:relative;height:150px;border-radius:12px;border:1px solid #32353C;display:flex;align-items:center;justify-content:center}
.tile .small{position:absolute;right:7px;bottom:6px;display:flex;align-items:flex-end;gap:5px}
.locks{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-top:30px}
.lock{border-radius:12px;border:1px solid #32353C;padding:16px;display:flex;flex-direction:column;gap:12px;background:#15161A}
.lock div{display:flex;align-items:center;gap:12px;font:400 34px/38px Marcellus,serif}
.lock .chalk{background:#F4F4F1;color:#15161A;border-radius:8px;padding:10px;margin:0 -6px -6px}
.lock .night{padding:4px}
"""


def main():
    (HERE / "options").mkdir(exist_ok=True)
    cells = ['<div></div>'] + [f'<div class="head"><h2><span class="id">{cid}</span>{name}</h2><p>{why}</p></div>' for cid, name, why, _ in COLOURWAYS]
    for sid, sname, draw, swhy in SHAPES:
        cells.append(f'<div class="side"><h2><span class="id">{sid}</span>{sname}</h2><p>{swhy}</p></div>')
        for cid, _, _, parts in COLOURWAYS:
            tiles = ""
            for i, g in enumerate(("dark", "light")):
                body = draw({k: v[i] for k, v in parts.items()})
                (HERE / "options" / f"{sid}-{cid}-on-{g}.svg").write_text(
                    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n{body}\n</svg>\n')
                tiles += (f'<div class="tile" style="background:{m.GROUND[g]}">{m.inline(body, 104)}'
                          f'<div class="small">{m.inline(body, 24)}{m.inline(body, 16)}</div></div>')
            cells.append(f'<div class="pair" id="{sid}-{cid}">{tiles}</div>')
    locks = ""
    for sid, sname, draw, _ in SHAPES:
        parts = COLOURWAYS[0][3]
        row = "".join(f'<div class="{cls}">{m.inline(draw({k: v[i] for k, v in parts.items()}), 44)}Iris</div>' for i, cls in enumerate(("night", "chalk")))
        locks += f'<div class="lock"><span class="label">{sid} beside the name</span>{row}</div>'
    (HERE / "index.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Iris · mark · round 2 · the flower</title>'
        '<meta name="board-status" content="open"><meta name="board-summary" content="Six ways to draw the iris, each in five colourways">'
        f'<style>{CSS}</style></head><body>'
        '<p class="label">Iris · mark · round 2 · the flower</p><h1>The flower, in six shapes and five colourways</h1>'
        '<p class="brief">Each row is a way to draw the iris and each column is a colourway, shown on Night and on Chalk with 24 and 16 px in the corner. '
        'Name a cell by its row and column, such as S4 in C1. The last strip sets each shape beside the name.</p>'
        f'<div class="matrix">{"".join(cells)}</div><div class="locks">{locks}</div>'
        '<script>document.fonts.ready.then(()=>{document.documentElement.dataset.h=Math.ceil(document.body.getBoundingClientRect().bottom)})</script>'
        '</body></html>\n')
    print("wrote index.html")


main()
