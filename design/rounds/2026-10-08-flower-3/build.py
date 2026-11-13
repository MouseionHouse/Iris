#!/usr/bin/env python3
"""Iris mark, round 3: the three flowers the household likes, set on a background shape.

The Sketch (S1, bare with shaded falls), From above (S4, shaded the same way) and In profile (S5 with
the compact near petal, R2), each inside a circle, a rounded square, an arch and a hexagon. Every
shape is shown filled deep and filled pale; both fills are mixed from the chosen colourway.
Run: python3 build.py, then ../../capture.sh index.html
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("flower", HERE.parent / "2026-10-08-flower-1" / "build.py")
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
m = f.m

# Each flower with the point its petals balance around, so it sits centred in a shape.
FLOWERS = [
    ("S1", "Sketch", lambda c: f.s1(c, "shade"), (50, 52)),
    ("S4", "From above", lambda c: f.s4(c, True), (50, 47)),
    ("S5", "In profile", lambda c: f.s5(c, "R2"), (54, 55)),
]
SHAPES = [
    ("G1", "Circle", '<circle cx="50" cy="50" r="48"/>', .70),
    ("G2", "Rounded square", '<rect x="3" y="3" width="94" height="94" rx="22"/>', .76),
    ("G3", "Arch", '<path d="M9 91 V46 A41 41 0 0 1 91 46 V91 A6 6 0 0 1 85 97 H15 A6 6 0 0 1 9 91 Z"/>', .70),
    ("G4", "Hexagon", '<path d="M50 3 L91 26 V74 L50 97 L9 74 V26 Z" stroke-linejoin="round"/>', .66),
]
# The two fills, mixed from the colourway so they change with the selector.
FILL = {"deep": "color-mix(in srgb, var(--fall) 26%, #121016)", "pale": "color-mix(in srgb, var(--std) 26%, #FFFFFF)"}


def icon(flower, shape, fill, size):
    _, _, draw, (cx, cy) = flower
    _, _, outline, scale = shape
    # A deep fill takes the flower's Night colours and a pale fill its Chalk colours.
    ground = "dark" if fill == "deep" else "light"
    inner = f'<g style="fill:{FILL[fill]}">{outline}</g><g transform="translate(50 50) scale({scale}) translate({-cx} {-cy})">{draw(f.LIVE)}</g>'
    return f'<span data-ground="{ground}" style="display:flex">{m.inline(inner, size)}</span>'


CSS = f.CSS + """
.matrix{display:grid;grid-template-columns:130px repeat(4,1fr);gap:16px 16px;align-items:center}
.head h2,.side h2{font:600 17px/25px Commissioner,sans-serif}
.cell{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.cell .tile{height:214px;flex-direction:row;justify-content:center;gap:12px;padding-bottom:30px}
.cell .tile .small{right:10px;bottom:8px;gap:6px}
"""


def main():
    cells = ["<div></div>"] + [f'<div class="head"><h2><span class="id">{gid}</span>{name}</h2></div>' for gid, name, _, _ in SHAPES]
    for flower in FLOWERS:
        cells.append(f'<div class="side"><h2><span class="id">{flower[0]}</span>{flower[1]}</h2></div>')
        for shape in SHAPES:
            tiles = "".join(
                f'<div class="tile" style="background:{m.GROUND[g]}">{icon(flower, shape, "deep", 84)}{icon(flower, shape, "pale", 84)}'
                f'<div class="small">{icon(flower, shape, "deep", 32)}{icon(flower, shape, "pale", 32)}{icon(flower, shape, "deep", 16)}{icon(flower, shape, "pale", 16)}</div></div>'
                for g in ("dark", "light"))
            cells.append(f'<div class="cell" id="{flower[0]}-{shape[0]}">{tiles}</div>')

    def group(title, ways):
        return f'<span class="label">{title}</span><div class="ways">' + "".join(
            f'<button type="button" data-id="{cid}"><i>{"".join(f"<b style=background:{parts[k][0]}></b>" for k in ("std", "fall", "beard", "stem"))}</i>'
            f'<code>{cid}</code>{name}</button>' for cid, name, _, parts in ways) + "</div>"
    script = (f.SCRIPT.replace("__WAYS__", json.dumps([dict(id=c, name=n, why=w, parts=p) for c, n, w, p in f.COLOURWAYS]))
              .replace("__PARTS__", json.dumps(f.PARTS)))
    (HERE / "index.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Iris · mark · round 3 · on a ground</title>'
        '<meta name="board-status" content="open"><meta name="board-summary" content="Three flowers inside a circle, a rounded square, an arch and a hexagon">'
        f'<style>{CSS}</style></head><body>'
        '<p class="label">Iris · mark · round 3 · on a ground</p><h1>The three flowers, set inside a shape</h1>'
        '<p class="brief">Each flower in four background shapes. Every cell shows the shape filled deep and filled pale, on Night and on Chalk, '
        'with 32 and 16 px in the corner. Both fills are mixed from the colourway chosen below. Name a pick like S4 in G1, deep.</p>'
        f'<div class="picker">{group("The purple range", f.PURPLES)}{group("Earlier", f.EARLIER)}<p class="now" id="now"></p></div>'
        f'<div class="matrix">{"".join(cells)}</div><script>{script}</script></body></html>\n')
    print("wrote index.html")


main()
