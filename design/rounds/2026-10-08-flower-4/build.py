#!/usr/bin/env python3
"""Iris mark, round 4: the Sketch, standing alone.

John and Andromache like the Sketch (S1, bare with shaded falls) best, and want the mark to stand alone:
a background shape is only for places that need one, such as a phone's app icon. This board shows
it alone at every size and beside the name, then as an app icon. It opens in Amethyst's purples
with the teal greens of Iris and sea (P11).

It also keeps the three shapes they liked as files, in design/assets/kept/, in case of a change of mind.
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

WAYS = [w for w in f.COLOURWAYS if w[0] in ("P11", "P12", "P7", "P5")]
WAYS.sort(key=lambda w: ("P11", "P12", "P7", "P5").index(w[0]))
KEPT = [("sketch", "S1 with L7", lambda c: f.s1(c, "shade")), ("from-above", "S4 with L7", lambda c: f.s4(c, True)),
        ("in-profile", "S5 with R2", lambda c: f.s5(c, "R2"))]
DEEP = "color-mix(in srgb, var(--fall) 26%, #121016)"


def sketch(size, cls=""):
    return m.inline(f.s1(f.LIVE, "shade"), size, cls)


def app_icon(size):
    inner = (f'<rect width="100" height="100" rx="23" style="fill:{DEEP}"/>'
             f'<g transform="translate(50 50) scale(.76) translate(-50 -52)">{f.s1(f.LIVE, "shade")}</g>')
    return f'<span data-ground="dark" style="display:flex">{m.inline(inner, size)}</span>'


CSS = f.CSS + """
.pair{gap:14px}
.panel{border-radius:14px;border:1px solid #32353C;padding:30px 34px;display:grid;grid-template-columns:auto 1fr;gap:34px;align-items:center}
.panel .right{display:flex;flex-direction:column;gap:26px}
.lock{display:flex;align-items:center;gap:18px;font:400 64px/72px Marcellus,serif}
.sizes{display:flex;align-items:flex-end;gap:26px}
.sizes figure{display:flex;flex-direction:column;align-items:center;gap:8px}
.sizes figcaption{font:400 12px/16px 'IBM Plex Mono',monospace;opacity:.6}
h3{font:600 12px/16px Commissioner,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#A2A5AD;margin:34px 0 12px}
.phone{border-radius:14px;border:1px solid #32353C;padding:26px 30px;display:flex;gap:34px;align-items:flex-start}
.phone figure{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:13px;line-height:18px}
.phone .ph{width:60px;height:60px;border-radius:23%;display:flex;align-items:center;justify-content:center;font:600 22px/1 Commissioner,sans-serif;color:rgba(255,255,255,.9)}
.note{display:flex;align-items:center;gap:12px;border-radius:14px;padding:12px 16px;min-width:300px;font-size:14px;line-height:20px}
.note small{display:block;font-size:12px;line-height:16px;opacity:.65}
.note b{font-weight:600;display:block}
"""


def main():
    kept = HERE.parents[1] / "assets" / "kept"
    kept.mkdir(parents=True, exist_ok=True)
    p11 = next(w for w in f.COLOURWAYS if w[0] == "P11")[3]
    for slug, _, draw in KEPT:
        for i, g in enumerate(("dark", "light")):
            (kept / f"iris-{slug}-on-{g}.svg").write_text(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n{draw({k: v[i] for k, v in p11.items()})}\n</svg>\n')
    (kept / "README.md").write_text(
        "# Kept\n\nThe three flowers John and Andromache liked on 2026-10-08, kept in case of a change of mind. The Sketch is the one going forward.\n\n"
        + "".join(f"- `iris-{slug}-on-dark.svg`, `iris-{slug}-on-light.svg`: {what}\n" for slug, what, _ in KEPT)
        + "\nAll are in P11, Amethyst and sea. Each is drawn by `rounds/2026-10-08-flower-1/build.py`, which can redraw it in any colourway.\n")

    panels = ""
    for g in ("dark", "light"):
        sizes = "".join(f'<figure>{sketch(s)}<figcaption>{s}</figcaption></figure>' for s in (64, 48, 32, 24, 16))
        panels += (f'<div class="panel" data-ground="{g}" style="background:{m.GROUND[g]};color:{m.INK[g]}">{sketch(300)}'
                   f'<div class="right"><div class="lock">{sketch(84)}Iris</div><div class="sizes">{sizes}</div></div></div>')
    others = "".join(f'<figure><div class="ph" style="background:{c}">{t}</div>{n}</figure>' for c, t, n in
                     (("#2c5a8c", "M", "Maps"), ("#a8741a", "P", "Photos")))
    phones = ""
    for g, wall in (("dark", "linear-gradient(160deg,#2a2440,#121018)"), ("light", "linear-gradient(160deg,#e9e4f2,#f6f3ee)")):
        phones += (f'<div class="phone" style="background:{wall};color:{m.INK[g]}">{others}<figure>{app_icon(60)}Iris</figure>'
                   f'<div class="note" style="background:{"#1F2126" if g == "dark" else "#FFFFFF"};border:1px solid {"#32353C" if g == "dark" else "#DCDBD5"}">'
                   f'{app_icon(38)}<div><small>Iris · now</small><b>Andromache</b>Dinner at 7?</div></div>'
                   f'<figure>{app_icon(120)}<span style="opacity:.6">Large</span></figure></div>')
    ways = "".join(
        f'<button type="button" data-id="{cid}"><i>{"".join(f"<b style=background:{parts[k][0]}></b>" for k in ("std", "fall", "stem"))}</i>'
        f'<code>{cid}</code>{name}</button>' for cid, name, _, parts in WAYS)
    script = (f.SCRIPT.replace("__WAYS__", json.dumps([dict(id=c, name=n, why=w, parts=p) for c, n, w, p in WAYS]))
              .replace("__PARTS__", json.dumps(f.PARTS)))
    (HERE / "index.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Iris · mark · round 4 · standing alone</title>'
        '<meta name="board-status" content="open"><meta name="board-summary" content="The Sketch alone, in Amethyst with sea greens, and as an app icon">'
        f'<style>{CSS}</style></head><body>'
        '<p class="label">Iris · mark · round 4 · standing alone</p><h1>The Sketch, standing alone</h1>'
        '<p class="brief">The mark with nothing behind it: large, beside the name, and from 64 down to 16 px, on Night and on Chalk. '
        'Below it, the one place it sits in a shape, a phone&#39;s app icon. It opens in Amethyst&#39;s purples with the teal greens of Iris and sea.</p>'
        f'<div class="picker"><div class="ways">{ways}</div><p class="now" id="now"></p></div>'
        f'<div class="pair">{panels}</div><h3>Only where a shape is needed: the app icon, deep</h3><div class="pair">{phones}</div>'
        f'<script>{script}</script></body></html>\n')
    print("wrote index.html and", len(KEPT) * 2, "kept files")


main()
