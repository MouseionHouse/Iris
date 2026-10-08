#!/usr/bin/env python3
"""Iris mark, round 1: which picture stands for Iris.

A quick sketch sheet, shown before any full board is built. Every option is a picture a stranger can
name at a glance: a rainbow, a speech bubble, a wing, a flower, an eye, a smile. Colours are the
house's nine Muse colours and are provisional: this round chooses the picture.
Run: python3 build.py, then capture sheet.html.
"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The house's values, copied from ~/design/tokens.json so the sheet stands alone.
GROUND = {"dark": "#15161A", "light": "#F4F4F1"}
INK = {"dark": "#F4F4F1", "light": "#15161A"}
MUSE = {
    "dark": dict(calliope="#FE9EAD", terpsichore="#F9A779", clio="#DABA61", thalia="#A5CD7C", euterpe="#67D6B2",
                 polyhymnia="#50D2E6", urania="#83C3FF", melpomene="#BCB1FF", erato="#E8A2E1"),
    "light": dict(calliope="#C05B6E", terpsichore="#BC662F", clio="#9E7B00", thalia="#668F33", euterpe="#009874",
                  polyhymnia="#0094AB", urania="#3A84CA", melpomene="#8071C8", erato="#AB61A5"),
}
WHEEL = ["calliope", "terpsichore", "clio", "thalia", "euterpe", "polyhymnia", "urania", "melpomene", "erato"]
BOW5 = ["calliope", "clio", "euterpe", "urania", "melpomene"]  # outermost band first
BOW3 = ["calliope", "clio", "urania"]


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n{body}\n</svg>\n'


def bow(g, cx, cy, r_out, w, names, lower=False, caps="butt"):
    """A rainbow: half-ring bands about (cx, cy), outermost first. lower=True hangs it below, as a smile."""
    out, r = [], r_out - w / 2
    for i, name in enumerate(names):
        # Each band is a little wider than its slot so no ground shows through between neighbours.
        extra = 0 if i == 0 else 0.5
        out.append(f'<path d="M{cx - r:.2f} {cy} A{r:.2f} {r:.2f} 0 0 {0 if lower else 1} {cx + r:.2f} {cy}" fill="none" '
                   f'stroke="{MUSE[g][name]}" stroke-width="{w + extra}" stroke-linecap="{caps}"/>')
        r -= w
    return "".join(out)


def rings(g, cx, cy, edges, names):
    """Filled discs about (cx, cy), widest first: edges are the outer radius of each colour."""
    return "".join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{MUSE[g][n]}"/>' for r, n in zip(edges, names))


def r1(g):
    return svg(bow(g, 50, 70, 42, 6.6, BOW5))


def r2(g):
    dots = "".join(f'<circle cx="{x}" cy="77" r="5.6" fill="{INK[g]}"/>' for x in (30, 50, 70))
    return svg(bow(g, 50, 60, 42, 8, BOW3) + dots)


def b1(g):
    return svg('<defs><clipPath id="c"><circle cx="50" cy="45" r="38"/><path d="M20 58 L15 93 L50 80 Z"/></clipPath></defs>'
               f'<g clip-path="url(#c)">{rings(g, 50, 83, (120, 61, 46, 31, 16), BOW5)}</g>')


def b2(g):
    return svg('<defs><clipPath id="c"><rect x="8" y="12" width="84" height="60" rx="24"/><path d="M20 58 L16 92 L50 70 Z"/></clipPath></defs>'
               f'<g clip-path="url(#c)">{rings(g, 16, 92, (140, 84, 65, 46, 27), BOW5)}</g>')


def b3(g):
    m = MUSE[g]
    stops = "".join(f'<stop offset="{o}" stop-color="{m[n]}"/>' for o, n in
                    ((0, "urania"), (.3, "melpomene"), (.55, "erato"), (.78, "calliope"), (1, "terpsichore")))
    shape = '<circle cx="50" cy="45" r="38"/><path d="M20 58 L15 93 L50 80 Z"/>'
    return svg(f'<defs><linearGradient id="s" gradientUnits="userSpaceOnUse" x1="14" y1="10" x2="86" y2="88">{stops}</linearGradient>'
               f'<mask id="m"><rect width="100" height="100" fill="#000"/><g fill="#fff">{shape}</g>'
               '<circle cx="50" cy="45" r="29" fill="#000"/></mask></defs>'
               f'<g fill="url(#s)" opacity=".18">{shape}</g><rect width="100" height="100" fill="url(#s)" mask="url(#m)"/>'
               '<path d="M31 41 A20 20 0 0 1 45 26" fill="none" stroke="url(#s)" stroke-width="5" stroke-linecap="round"/>')


def w1(g):
    feathers = [("M26 78 Q40 67 48 71", "melpomene"), ("M22 71 Q40 54 58 59", "urania"), ("M19 64 Q40 40 69 46", "euterpe"),
                ("M17 57 Q38 26 80 32", "clio"), ("M16 50 Q36 12 90 18", "calliope")]
    return svg("".join(f'<path d="{d}" fill="none" stroke="{MUSE[g][n]}" stroke-width="10.5" stroke-linecap="round"/>'
                       for d, n in feathers))


def w2(g):
    right = [("M57 57 Q70 47 79 50", "urania"), ("M57 48 Q72 33 88 37", "clio"), ("M57 39 Q74 17 96 21", "calliope")]
    wings = ""
    for d, n in right:
        p = f'<path d="{d}" fill="none" stroke="{MUSE[g][n]}" stroke-width="8" stroke-linecap="round"/>'
        wings += p + f'<g transform="translate(100 0) scale(-1 1)">{p}</g>'
    # A capital I with bracketed serifs, drawn after Marcellus's.
    letter = (f'<path fill="{INK[g]}" d="M38.5 20 H61.5 V22.2 C57 22.6 54.4 24.5 54.2 29 V75 C54.4 79.5 57 81.4 61.5 81.8 V84 H38.5 '
              'V81.8 C43 81.4 45.6 79.5 45.8 75 V29 C45.6 24.5 43 22.6 38.5 22.2 Z"/>')
    return svg(wings + letter)


def petal(length, width, tip):
    """A petal standing on (0, 0) and pointing up. tip < 1 is pointed, tip > 1 is round."""
    h, far = width / 2 * 1.15, length * tip
    return f"M0 0 C{-h:.1f} {-length * .35:.1f} {-h:.1f} {-far:.1f} 0 {-length} C{h:.1f} {-far:.1f} {h:.1f} {-length * .35:.1f} 0 0 Z"


def f1(g):
    m = MUSE[g]

    def at(angle, d, colour, extra=""):
        return f'<g transform="translate(50 52) rotate({angle})"><path d="{d}" fill="{colour}"/>{extra}</g>'
    beard = f'<path d="M0 -7 V-19" stroke="{m["clio"]}" stroke-width="3.4" stroke-linecap="round"/>'
    fall, back = petal(37, 25, 1.08), petal(40, 18, .8)
    return svg(f'<path d="M50 56 V94" stroke="{m["thalia"]}" stroke-width="6" stroke-linecap="round"/>'
               + at(122, fall, m["erato"], beard) + at(-122, fall, m["erato"], beard)
               + at(25, back, m["urania"]) + at(-25, back, m["urania"]) + at(0, petal(45, 20, .8), m["melpomene"]))


def e1(g):
    def pt(r, deg):
        a = math.radians(deg - 90)
        return f"{50 + r * math.cos(a):.2f} {50 + r * math.sin(a):.2f}"
    segs = ""
    for i, name in enumerate(WHEEL):
        a, b = i * 40 - 18, i * 40 + 18
        segs += (f'<path d="M{pt(42, a)} A42 42 0 0 1 {pt(42, b)} L{pt(18, b)} A18 18 0 0 0 {pt(18, a)} Z" fill="{MUSE[g][name]}"/>')
    return svg(segs + '<circle cx="50" cy="50" r="15" fill="#0C0D10"/><circle cx="56" cy="44" r="4.2" fill="#FFFFFF"/>')


def s1(g):
    eyes = "".join(f'<circle cx="{x}" cy="25" r="6.4" fill="{INK[g]}"/>' for x in (33, 67))
    return svg(bow(g, 50, 45, 37, 8, BOW3, lower=True, caps="round") + eyes)


OPTIONS = [
    ("R1", "Rainbow", r1, "The rainbow and nothing else"),
    ("R2", "Typing", r2, "A rainbow over the three dots of someone typing"),
    ("B1", "Rainbow bubble", b1, "A speech bubble with a rainbow rising in it"),
    ("B2", "Spoken", b2, "A speech bubble whose rainbow spreads from the speaker"),
    ("B3", "Soap bubble", b3, "A speech bubble with a soap bubble's sheen"),
    ("W1", "Wing", w1, "A wing whose feathers are the rainbow's bands"),
    ("W2", "Winged I", w2, "The letter I with a pair of wings"),
    ("F1", "Flower", f1, "An iris, the flower"),
    ("E1", "Eye", e1, "The iris of an eye, in the house's nine colours"),
    ("S1", "Smile", s1, "A face whose smile is the rainbow"),
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
.brief{color:#A2A5AD;max-width:1000px;font-size:17px;line-height:25px;margin-bottom:28px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:26px 20px}
h2{font:600 17px/25px Commissioner,sans-serif}
.id{font:400 13px/20px 'IBM Plex Mono',monospace;border:1px solid #32353C;border-radius:6px;padding:1px 8px;margin-right:10px}
.why{color:#A2A5AD;font-size:13px;line-height:18px;margin:2px 0 10px;min-height:36px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tile{position:relative;height:236px;border-radius:12px;border:1px solid #32353C;display:flex;flex-direction:column;align-items:center}
.tile .big{width:124px;height:124px;margin-top:18px}
.tile .lockup{display:flex;align-items:center;gap:10px;font:400 30px/34px Marcellus,serif;margin-top:14px}
.tile .lockup img{width:34px;height:34px}
.tile .small{position:absolute;right:10px;bottom:8px;display:flex;align-items:flex-end;gap:8px}
.tile .small+.px{position:absolute;left:10px;bottom:8px;font:400 11px/16px 'IBM Plex Mono',monospace;opacity:.55}
"""


def main():
    (HERE / "options").mkdir(exist_ok=True)
    cells = []
    for oid, name, draw, why in OPTIONS:
        tiles = ""
        for g in ("dark", "light"):
            src = f"options/{oid}-on-{g}.svg"
            (HERE / src).write_text(draw(g))
            small = "".join(f'<img src="{src}" width="{s}" height="{s}" alt="">' for s in (32, 16))
            tiles += (f'<div class="tile" style="background:{GROUND[g]};color:{INK[g]}"><img class="big" src="{src}" alt="{oid} on {g}">'
                      f'<div class="lockup"><img src="{src}" alt="">Iris</div><div class="small">{small}</div><span class="px">32 · 16</span></div>')
        cells.append(f'<div id="{oid}"><h2><span class="id">{oid}</span>{name}</h2><p class="why">{why}</p><div class="pair">{tiles}</div></div>')
    (HERE / "sheet.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Iris · mark · round 1 sketches</title>'
        '<meta name="board-status" content="open"><meta name="board-summary" content="Ten quick sketches of what could stand for Iris">'
        f'<style>{CSS}</style></head><body>'
        '<p class="label">Iris · mark · round 1 sketches</p><h1>Which picture stands for Iris</h1>'
        '<p class="brief">Ten quick sketches, each a picture anyone can name at a glance. Every one is shown on Night and on Chalk, '
        'beside the name, and at 32 and 16 px. The colours are the house&#39;s nine and are provisional: this round chooses the picture.</p>'
        f'<div class="grid">{"".join(cells)}</div>'
        # capture.sh reads the page's height from here.
        '<script>document.fonts.ready.then(()=>{document.documentElement.dataset.h=Math.ceil(document.body.getBoundingClientRect().bottom)})</script>'
        '</body></html>\n')
    print("wrote", len(OPTIONS) * 2, "SVG files and sheet.html")


main()
