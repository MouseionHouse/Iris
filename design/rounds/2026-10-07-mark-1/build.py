#!/usr/bin/env python3
"""Iris mark, round 1: which picture stands for Iris.

A quick sketch sheet, shown before any full board is built. Every option is a picture a stranger can
name at a glance: a rainbow, a speech bubble, a wing, a flower, an eye, a smile. Colours are the
house's nine Muse colours and are provisional: this round chooses the picture.

Each mark is written twice: as a file per ground in options/, with its colours fixed, and into
sheet.html with its colours as CSS variables, so the sheet's sliders can retune them live.
Run: python3 build.py, then ../../capture.sh sheet.html
"""
import json
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The house's values, copied from ~/design/tokens.json so the sheet stands alone.
GROUND = {"dark": "#15161A", "light": "#F4F4F1"}
INK = {"dark": "#F4F4F1", "light": "#15161A"}
MUSE = {
    "dark": dict(calliope="#FE9EAD", terpsichore="#F9A779", clio="#DABA61", thalia="#A5CD7C", euterpe="#67D6B2",
                 polyhymnia="#50D2E6", urania="#83C3FF", melpomene="#BCB1FF", erato="#E8A2E1"),
    # On Chalk these are Iris's own, lighter than the house's Chalk set, which John found too dark (2026-10-08).
    "light": dict(calliope="#D5929F", terpsichore="#D78F60", clio="#DDB43C", thalia="#8DC04E", euterpe="#4FC9A8",
                  polyhymnia="#45BFD6", urania="#76AADA", melpomene="#B1A8DD", erato="#C693C1"),
}
WHEEL = ["calliope", "terpsichore", "clio", "thalia", "euterpe", "polyhymnia", "urania", "melpomene", "erato"]
BOW5 = ["calliope", "clio", "euterpe", "urania", "melpomene"]  # outermost band first
BOW3 = ["calliope", "clio", "urania"]

# A palette maps each Muse's name, and "ink", to a colour: fixed values for a file, variables for the sheet.
LIVE = {name: f"var(--{name})" for name in WHEEL + ["ink"]}


def fixed(g):
    return dict(MUSE[g], ink=INK[g])


def bow(p, cx, cy, r_out, w, names, lower=False, caps="butt"):
    """A rainbow: half-ring bands about (cx, cy), outermost first. lower=True hangs it below, as a smile."""
    out, r = [], r_out - w / 2
    for i, name in enumerate(names):
        # Each band is a little wider than its slot so no ground shows through between neighbours.
        extra = 0 if i == 0 else 0.5
        out.append(f'<path d="M{cx - r:.2f} {cy} A{r:.2f} {r:.2f} 0 0 {0 if lower else 1} {cx + r:.2f} {cy}" fill="none" '
                   f'stroke="{p[name]}" stroke-width="{w + extra}" stroke-linecap="{caps}"/>')
        r -= w
    return "".join(out)


def rings(p, cx, cy, edges, names):
    """Filled discs about (cx, cy), widest first: edges are the outer radius of each colour."""
    return "".join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{p[n]}"/>' for r, n in zip(edges, names))


def r1(p):
    return bow(p, 50, 70, 42, 6.6, BOW5)


def r2(p):
    dots = "".join(f'<circle cx="{x}" cy="77" r="5.6" fill="{p["ink"]}"/>' for x in (30, 50, 70))
    return bow(p, 50, 60, 42, 8, BOW3) + dots


def b1(p):
    return ('<defs><clipPath id="c"><circle cx="50" cy="45" r="38"/><path d="M20 58 L15 93 L50 80 Z"/></clipPath></defs>'
            f'<g clip-path="url(#c)">{rings(p, 50, 83, (120, 61, 46, 31, 16), BOW5)}</g>')


def b2(p):
    return ('<defs><clipPath id="c"><rect x="8" y="12" width="84" height="60" rx="24"/><path d="M20 58 L16 92 L50 70 Z"/></clipPath></defs>'
            f'<g clip-path="url(#c)">{rings(p, 16, 92, (140, 84, 65, 46, 27), BOW5)}</g>')


def b3(p):
    stops = "".join(f'<stop offset="{o}" stop-color="{p[n]}"/>' for o, n in
                    ((0, "urania"), (.3, "melpomene"), (.55, "erato"), (.78, "calliope"), (1, "terpsichore")))
    shape = '<circle cx="50" cy="45" r="38"/><path d="M20 58 L15 93 L50 80 Z"/>'
    return (f'<defs><linearGradient id="s" gradientUnits="userSpaceOnUse" x1="14" y1="10" x2="86" y2="88">{stops}</linearGradient>'
            f'<mask id="m"><rect width="100" height="100" fill="#000"/><g fill="#fff">{shape}</g>'
            '<circle cx="50" cy="45" r="29" fill="#000"/></mask></defs>'
            f'<g fill="url(#s)" opacity=".18">{shape}</g><rect width="100" height="100" fill="url(#s)" mask="url(#m)"/>'
            '<path d="M31 41 A20 20 0 0 1 45 26" fill="none" stroke="url(#s)" stroke-width="5" stroke-linecap="round"/>')


def w1(p):
    feathers = [("M26 78 Q40 67 48 71", "melpomene"), ("M22 71 Q40 54 58 59", "urania"), ("M19 64 Q40 40 69 46", "euterpe"),
                ("M17 57 Q38 26 80 32", "clio"), ("M16 50 Q36 12 90 18", "calliope")]
    return "".join(f'<path d="{d}" fill="none" stroke="{p[n]}" stroke-width="10.5" stroke-linecap="round"/>' for d, n in feathers)


def w2(p):
    right = [("M57 57 Q70 47 79 50", "urania"), ("M57 48 Q72 33 88 37", "clio"), ("M57 39 Q74 17 96 21", "calliope")]
    wings = ""
    for d, n in right:
        feather = f'<path d="{d}" fill="none" stroke="{p[n]}" stroke-width="8" stroke-linecap="round"/>'
        wings += feather + f'<g transform="translate(100 0) scale(-1 1)">{feather}</g>'
    # A capital I with bracketed serifs, drawn after Marcellus's.
    letter = (f'<path fill="{p["ink"]}" d="M38.5 20 H61.5 V22.2 C57 22.6 54.4 24.5 54.2 29 V75 C54.4 79.5 57 81.4 61.5 81.8 V84 H38.5 '
              'V81.8 C43 81.4 45.6 79.5 45.8 75 V29 C45.6 24.5 43 22.6 38.5 22.2 Z"/>')
    return wings + letter


def petal(length, width, tip):
    """A petal standing on (0, 0) and pointing up. tip < 1 is pointed, tip > 1 is round."""
    h, far = width / 2 * 1.15, length * tip
    return f"M0 0 C{-h:.1f} {-length * .35:.1f} {-h:.1f} {-far:.1f} 0 {-length} C{h:.1f} {-far:.1f} {h:.1f} {-length * .35:.1f} 0 0 Z"


def f1(p):
    def at(angle, d, colour, extra=""):
        return f'<g transform="translate(50 52) rotate({angle})"><path d="{d}" fill="{colour}"/>{extra}</g>'
    beard = f'<path d="M0 -7 V-19" fill="none" stroke="{p["clio"]}" stroke-width="3.4" stroke-linecap="round"/>'
    fall, back = petal(37, 25, 1.08), petal(40, 18, .8)
    return (f'<path d="M50 56 V94" fill="none" stroke="{p["thalia"]}" stroke-width="6" stroke-linecap="round"/>'
            + at(122, fall, p["erato"], beard) + at(-122, fall, p["erato"], beard)
            + at(25, back, p["urania"]) + at(-25, back, p["urania"]) + at(0, petal(45, 20, .8), p["melpomene"]))


def e1(p):
    def pt(r, deg):
        a = math.radians(deg - 90)
        return f"{50 + r * math.cos(a):.2f} {50 + r * math.sin(a):.2f}"
    segs = ""
    for i, name in enumerate(WHEEL):
        a, b = i * 40 - 18, i * 40 + 18
        segs += f'<path d="M{pt(42, a)} A42 42 0 0 1 {pt(42, b)} L{pt(18, b)} A18 18 0 0 0 {pt(18, a)} Z" fill="{p[name]}"/>'
    return segs + '<circle cx="50" cy="50" r="15" fill="#0C0D10"/><circle cx="56" cy="44" r="4.2" fill="#FFFFFF"/>'


def s1(p):
    eyes = "".join(f'<circle cx="{x}" cy="25" r="6.4" fill="{p["ink"]}"/>' for x in (33, 67))
    return bow(p, 50, 45, 37, 8, BOW3, lower=True, caps="round") + eyes


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

_uid = 0


def inline(body, size, cls=""):
    """A mark set into the page. Its colours go into style, where var() is sure to resolve, and its ids are made unique."""
    global _uid
    _uid += 1
    body = re.sub(r'(fill|stroke|stop-color)="(var\(--[a-z]+\))"', r'style="\1:\2"', body)
    body = re.sub(r'id="(\w+)"', rf'id="\g<1>{_uid}"', body)
    body = re.sub(r'url\(#(\w+)\)', rf'url(#\g<1>{_uid})', body)
    return f'<svg{f" class={cls!r}" if cls else ""} viewBox="0 0 100 100" width="{size}" height="{size}" aria-hidden="true">{body}</svg>'


def variables(g):
    return "".join(f"--{name}:{colour};" for name, colour in fixed(g).items())


CSS = f"""
@font-face{{font-family:Marcellus;src:url("../../house/Marcellus-Regular.ttf")}}
@font-face{{font-family:Commissioner;font-weight:400;src:url("../../house/Commissioner-Regular.ttf")}}
@font-face{{font-family:Commissioner;font-weight:600;src:url("../../house/Commissioner-SemiBold.ttf")}}
@font-face{{font-family:"IBM Plex Mono";src:url("../../house/IBMPlexMono-Regular.ttf")}}
[data-ground=dark]{{{variables("dark")}}}
[data-ground=light]{{{variables("light")}}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#15161A;color:#F4F4F1;font:400 15px/22px Commissioner,system-ui,sans-serif;padding:32px 36px 40px}}
.label{{font:600 12px/16px Commissioner,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#A2A5AD}}
h1{{font:400 40px/44px Marcellus,serif;margin:8px 0 8px}}
.brief{{color:#A2A5AD;max-width:1000px;font-size:17px;line-height:25px;margin-bottom:20px}}
.grid{{display:grid;grid-template-columns:repeat(5,1fr);gap:26px 20px}}
h2{{font:600 17px/25px Commissioner,sans-serif}}
.id{{font:400 13px/20px 'IBM Plex Mono',monospace;border:1px solid #32353C;border-radius:6px;padding:1px 8px;margin-right:10px}}
.why{{color:#A2A5AD;font-size:13px;line-height:18px;margin:2px 0 10px;min-height:36px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}
.tile{{position:relative;height:236px;border-radius:12px;border:1px solid #32353C;display:flex;flex-direction:column;align-items:center}}
.tile .big{{margin-top:18px}}
.tile .lockup{{display:flex;align-items:center;gap:10px;font:400 30px/34px Marcellus,serif;margin-top:14px}}
.tile .small{{position:absolute;right:10px;bottom:8px;display:flex;align-items:flex-end;gap:8px}}
.tile .px{{position:absolute;left:10px;bottom:8px;font:400 11px/16px 'IBM Plex Mono',monospace;opacity:.55}}

/* The sliders: one row per ground, since each ground has its own nine colours. */
.tweaks{{position:sticky;top:12px;z-index:2;background:#1F2126;border:1px solid #32353C;border-radius:14px;padding:12px 16px;margin-bottom:24px;display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 28px rgba(0,0,0,.45)}}
.tweaks .row{{display:grid;grid-template-columns:112px auto 1fr 1fr 1fr auto;gap:20px;align-items:center}}
.tweaks .which{{display:flex;flex-direction:column}}
.tweaks .which b{{font-weight:600}}
.tweaks .which span{{color:#A2A5AD;font-size:12px;line-height:16px}}
.tweaks .sw{{display:flex;gap:7px;align-items:center;padding:6px 10px;border-radius:17px;border:1px solid #32353C}}
.tweaks .sw button{{width:22px;height:22px;border-radius:50%;border:0;cursor:pointer;background:var(--c);padding:0}}
.tweaks .sw button.all{{width:auto;border-radius:11px;padding:0 10px;font:600 12px/22px Commissioner,sans-serif;background:transparent;color:inherit;border:1px solid currentColor}}
.tweaks .sw button[aria-pressed=true]{{outline:2px solid currentColor;outline-offset:2px}}
.tweaks .sw button[data-low]{{box-shadow:inset 0 0 0 2px var(--ground),inset 0 0 0 3.5px currentColor}}
.tweaks label{{display:flex;align-items:center;gap:10px;font-size:13px;line-height:18px;white-space:nowrap}}
.tweaks input[type=range]{{flex:1;min-width:110px;accent-color:#F4F4F1}}
.tweaks output{{font:400 13px/18px 'IBM Plex Mono',monospace;min-width:5ch;text-align:right}}
.tweaks button.plain{{font:600 13px/18px Commissioner,sans-serif;color:#F4F4F1;background:#15161A;border:1px solid #A2A5AD;border-radius:8px;padding:6px 14px;cursor:pointer;white-space:nowrap}}
.tweaks .values{{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;border-top:1px solid #32353C;padding-top:10px}}
.tweaks .values code{{display:block;font:400 12px/18px 'IBM Plex Mono',monospace;color:#A2A5AD;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
"""

# Turns the sliders into colours. Each ground keeps a shift for all nine (hue, saturation, lightness)
# and, for any colour tuned on its own, that colour's own hue, saturation and lightness.
SCRIPT = r"""
const NAMES = __NAMES__, BASE = __BASE__, GROUND = __GROUND__;
const TITLE = { dark: "Night", light: "Chalk" };
const fresh = () => ({ all: [0, 100, 0], own: {} });
const state = { dark: fresh(), light: fresh() };
const target = { dark: "all", light: "all" };

const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const rgbHex = (rgb) => "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
function rgbHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l * 100];
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [mod(h * 60, 360), (d / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
}
function hslRgb([h, s, l]) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
const luminance = (rgb) => { const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };

// A colour before the shift for all nine: its own tuned value, or the house's.
const own = (g, name) => state[g].own[name] || rgbHsl(hexRgb(BASE[g][name]));
// The colour as shown: its own value with the ground's shift applied.
function shown(g, name) {
  const [h, s, l] = own(g, name), [dh, ks, dl] = state[g].all;
  return [mod(h + dh, 360), clamp((s * ks) / 100, 0, 100), clamp(l + dl, 0, 100)];
}
// Tuning one colour sets what is shown, so its own value is that with the shift taken back out.
function setShown(g, name, [h, s, l]) {
  const [dh, ks, dl] = state[g].all;
  // Kept to one decimal so the address stays short.
  state[g].own[name] = [mod(h - dh, 360), ks > 0 ? (s * 100) / ks : s, l - dl].map((v) => Math.round(v * 10) / 10);
}

const live = document.head.appendChild(document.createElement("style"));
const rows = {};

function draw() {
  let css = "";
  const lines = [];
  for (const g of ["dark", "light"]) {
    const ground = hexRgb(GROUND[g]);
    const hexes = NAMES.map((name) => {
      const rgb = hslRgb(shown(g, name)), hex = rgbHex(rgb), ratio = contrast(rgb, ground);
      const dot = rows[g].dots[name];
      dot.style.setProperty("--c", hex);
      dot.title = `${cap(name)} ${hex}, ${ratio.toFixed(1)}:1 on ${TITLE[g]}` + (ratio < 3 ? " (under 3:1)" : "");
      dot.toggleAttribute("data-low", ratio < 3);
      return hex;
    });
    css += `[data-ground=${g}]{${NAMES.map((name, i) => `--${name}:${hexes[i]}`).join(";")}}`;
    rows[g].values.textContent = `${TITLE[g].padEnd(5)} ` + NAMES.map((name, i) => `${name} ${hexes[i]}`).join("  ");
    lines.push(`${TITLE[g].toLowerCase()}: ` + NAMES.map((name, i) => `${name} ${hexes[i]}`).join(", "));
  }
  live.textContent = css;
  document.getElementById("copy").dataset.text = lines.join("\n");
  const changed = ["dark", "light"].some((g) => state[g].all.join() !== "0,100,0" || Object.keys(state[g].own).length);
  history.replaceState(null, "", changed ? "#" + encodeURIComponent(JSON.stringify(state)) : location.pathname + location.search);
}

// Sets a row's sliders for what it is tuning: a shift for all nine, or one colour's own values.
function aim(g) {
  const row = rows[g], all = target[g] === "all";
  const ranges = all ? [[-180, 180], [0, 200], [-40, 40]] : [[0, 360], [0, 100], [0, 100]];
  const values = all ? state[g].all : shown(g, target[g]).map(Math.round);
  row.sliders.forEach((slider, k) => { [slider.min, slider.max] = ranges[k]; slider.value = values[k]; });
  row.name.textContent = all ? "All nine" : cap(target[g]);
  for (const [name, dot] of Object.entries(row.dots)) dot.setAttribute("aria-pressed", name === target[g]);
  row.allDot.setAttribute("aria-pressed", all);
  read(g);
}

function read(g) {
  const all = target[g] === "all", signed = (v) => (v > 0 ? "+" : "") + v;
  rows[g].sliders.forEach((slider, k) => {
    const v = Number(slider.value);
    slider.nextElementSibling.textContent = all ? [signed(v) + "°", v + "%", signed(v)][k] : [v + "°", v + "%", v + "%"][k];
  });
}

for (const g of ["dark", "light"]) {
  const el = document.querySelector(`.tweaks .row[data-ground=${g}]`);
  const row = (rows[g] = { sliders: [...el.querySelectorAll("input")], name: el.querySelector(".which span"), dots: {},
    allDot: el.querySelector(".all"), values: document.getElementById("values-" + g) });
  el.querySelectorAll(".sw button[data-name]").forEach((dot) => { row.dots[dot.dataset.name] = dot; dot.onclick = () => { target[g] = dot.dataset.name; aim(g); }; });
  row.allDot.onclick = () => { target[g] = "all"; aim(g); };
  row.sliders.forEach((slider, k) => {
    slider.oninput = () => {
      const v = Number(slider.value);
      if (target[g] === "all") state[g].all[k] = v;
      else { const hsl = shown(g, target[g]); hsl[k] = v; setShown(g, target[g], hsl); }
      read(g); draw();
    };
  });
  el.querySelector(".reset").onclick = () => { state[g] = fresh(); target[g] = "all"; aim(g); draw(); };
}

document.getElementById("copy").onclick = async (event) => {
  const button = event.currentTarget, text = button.dataset.text;
  try { await navigator.clipboard.writeText(text); }
  catch { // The clipboard API needs https; a plain http page copies through a selection instead.
    const area = document.body.appendChild(Object.assign(document.createElement("textarea"), { value: text }));
    area.select(); document.execCommand("copy"); area.remove();
  }
  button.textContent = "Copied"; setTimeout(() => (button.textContent = "Copy values"), 1400);
};

// A tuned set travels in the address, so a reload keeps it and the link can be sent back.
try {
  const saved = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  for (const g of ["dark", "light"]) if (saved[g]) state[g] = { all: saved[g].all, own: saved[g].own || {} };
} catch {}
aim("dark"); aim("light"); draw();
// capture.sh reads the page's height from here.
document.fonts.ready.then(() => { document.documentElement.dataset.h = Math.ceil(document.body.getBoundingClientRect().bottom); });
"""


def tweak_row(g, title):
    dots = "".join(f'<button type="button" data-name="{name}" aria-label="{name.capitalize()}" style="--c:{MUSE[g][name]}"></button>' for name in WHEEL)
    sliders = "".join(f'<label>{name}<input type="range" step="1" aria-label="{name} on {title}"><output></output></label>'
                      for name in ("Hue", "Saturation", "Lightness"))
    return (f'<div class="row" data-ground="{g}"><div class="which"><b>On {title}</b><span>All nine</span></div>'
            f'<div class="sw" style="background:{GROUND[g]};color:{INK[g]};--ground:{GROUND[g]}"><button type="button" class="all">All</button>{dots}</div>'
            f'{sliders}<button type="button" class="plain reset">Reset</button></div>')


def main():
    (HERE / "options").mkdir(exist_ok=True)
    cells = []
    for oid, name, draw, why in OPTIONS:
        tiles = ""
        for g in ("dark", "light"):
            (HERE / "options" / f"{oid}-on-{g}.svg").write_text(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n{draw(fixed(g))}\n</svg>\n')
            body = draw(LIVE)
            tiles += (f'<div class="tile" data-ground="{g}" style="background:{GROUND[g]};color:{INK[g]}">{inline(body, 124, "big")}'
                      f'<div class="lockup">{inline(body, 34)}Iris</div><div class="small">{inline(body, 32)}{inline(body, 16)}</div>'
                      '<span class="px">32 · 16</span></div>')
        cells.append(f'<div id="{oid}"><h2><span class="id">{oid}</span>{name}</h2><p class="why">{why}</p><div class="pair">{tiles}</div></div>')
    script = (SCRIPT.replace("__NAMES__", json.dumps(WHEEL)).replace("__BASE__", json.dumps(MUSE))
              .replace("__GROUND__", json.dumps(GROUND)))
    (HERE / "sheet.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Iris · mark · round 1 sketches</title>'
        '<meta name="board-status" content="open"><meta name="board-summary" content="Ten quick sketches of what could stand for Iris">'
        f'<style>{CSS}</style></head><body>'
        '<p class="label">Iris · mark · round 1 sketches</p><h1>Which picture stands for Iris</h1>'
        '<p class="brief">Ten quick sketches, each a picture anyone can name at a glance. Every one is shown on Night and on Chalk, '
        'beside the name, and at 32 and 16 px. The colours are the house&#39;s nine and are provisional: the sliders retune them, '
        'all nine at once or one at a time after choosing its dot.</p>'
        f'<div class="tweaks">{tweak_row("dark", "Night")}{tweak_row("light", "Chalk")}'
        '<div class="values"><div><code id="values-dark"></code><code id="values-light"></code></div>'
        '<button type="button" class="plain" id="copy">Copy values</button></div></div>'
        f'<div class="grid">{"".join(cells)}</div><script>{script}</script></body></html>\n')
    print("wrote", len(OPTIONS) * 2, "SVG files and sheet.html")


if __name__ == "__main__":
    main()
