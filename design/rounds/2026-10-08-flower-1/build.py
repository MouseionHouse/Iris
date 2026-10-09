#!/usr/bin/env python3
"""Iris mark, round 2: the flower, varied in shape and in colour.

Six ways to draw an iris, on Night and on Chalk. The colourway is chosen with the selector at the top
of the board: the marks are set into the page with their parts as CSS variables. The gold streak on
a fall is drawn as a blade that follows the petal's curve and narrows as the petal turns away.
Run: python3 build.py, then ../../capture.sh index.html
"""
import importlib.util
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("mark1", HERE.parent / "2026-10-07-mark-1" / "build.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
petal = m.petal

# A colourway names the flower's parts: std and back are the upright petals, fall and other the
# drooping ones, beard the gold streak on a fall. Each part has a Night value and a Chalk value.
PARTS = ["std", "back", "fall", "other", "beard", "stem"]


def way(cid, name, why, std, back, fall, other, beard, stem):
    return cid, name, why, dict(std=std, back=back, fall=fall, other=other, beard=beard, stem=stem)


GREEN, WELD = ("#93A862", "#82A947"), ("#D6B551", "#CAA419")
COLOURWAYS = [
    way("C1", "Purple", "The iris most people picture", ("#B79AD0", "#A57BBD"), ("#8E7BC4", "#7F69B8"), ("#9A6BB8", "#84509E"), ("#9A6BB8", "#84509E"), WELD, GREEN),
    way("C2", "Blue flag", "Indigo and woad blues with a yellow signal", ("#8FB3E0", "#6F9BD6"), ("#7C93CF", "#5B80C8"), ("#5F7FCC", "#3F5FB5"), ("#5F7FCC", "#3F5FB5"), ("#E6C65A", "#D4A91C"), ("#7FAF8F", "#5F9A74")),
    way("C3", "Dyed rainbow", "A different natural dye on each petal", ("#A886BF", "#935DA8"), ("#7C93CF", "#496CBD"), ("#D4735E", "#CD624C"), ("#D9819C", "#C56384"), WELD, GREEN),
    way("C4", "Vivid rainbow", "The same idea at full saturation", ("#9B6BFF", "#8E5FE7"), ("#4F84FF", "#4C77E6"), ("#FF4A5E", "#EB4052"), ("#FF52D9", "#E03ABC"), ("#FFD21F", "#DBA200"), ("#5BDB3A", "#38C01F")),
    way("C5", "Dawn", "Peach and rose, the colours of a pink iris", ("#F2B7A0", "#E39A80"), ("#E8A2B8", "#D4809C"), ("#D9819C", "#C56384"), ("#D9819C", "#C56384"), ("#E6C65A", "#D4A91C"), GREEN),
    way("C6", "Moonlight", "A white iris, barely tinted", ("#EFEAF6", "#C4BAD3"), ("#D9D0EA", "#AEA2C4"), ("#C9BDE0", "#9A8CB8"), ("#C9BDE0", "#9A8CB8"), ("#E6C65A", "#D4A91C"), ("#9DB58A", "#84A56C")),
    way("C7", "Yellow flag", "The wild yellow iris, with a brown signal", ("#EBCF6A", "#DDB733"), ("#D9B84F", "#C9A227"), ("#E0A93F", "#CF941F"), ("#E0A93F", "#CF941F"), ("#B5703A", "#8F4E1D"), GREEN),
    way("C8", "Midnight", "The near-black iris", ("#7A68A3", "#4F4073"), ("#63528C", "#3E315E"), ("#544479", "#2D2247"), ("#544479", "#2D2247"), ("#E6C65A", "#D4A91C"), ("#7F9A6A", "#5F7F4A")),
    way("C9", "Copper", "Rust standards over madder falls", ("#E0A06A", "#D4853F"), ("#D98F52", "#C87533"), ("#C45A48", "#A8432F"), ("#C45A48", "#A8432F"), WELD, GREEN),
    way("C10", "Wine and white", "Pale standards over deep purple falls", ("#EDE3F2", "#CDBFDB"), ("#D6C6E3", "#B6A4CA"), ("#9455B5", "#70398F"), ("#9455B5", "#70398F"), ("#E6C65A", "#D4A91C"), GREEN),
    way("C11", "Rose gold", "Odyssey's metal, as a flower", ("#F3C3B4", "#E3A897"), ("#E6ABA0", "#D4928A"), ("#D9938F", "#C47B77"), ("#D9938F", "#C47B77"), ("#FFF3EA", "#F7E3D5"), ("#B7A68F", "#9E8B72")),
    way("C12", "Sea", "Teal and woad, with a pale signal", ("#8FD0C0", "#5FB5A2"), ("#7FAFC2", "#5B9EB8"), ("#4C9FA8", "#2F8590"), ("#4C9FA8", "#2F8590"), ("#F0E3A8", "#E8D27A"), ("#7FAF8F", "#5F9A74")),
    way("C13", "One colour", "Every part in ink, to test the shape alone", ("#F4F4F1", "#15161A"), ("#C9CAC9", "#3A3C42"), ("#DEDEDC", "#26282D"), ("#DEDEDC", "#26282D"), ("#15161A", "#F4F4F1"), ("#A2A5AD", "#5B5E66")),
]
# The purples John and Andromache asked for on 2026-10-08, balanced the way Copper, Rose gold and Sea are:
# neighbouring hues, pale standards over deeper falls, a soft signal, and a stem toned to match.
PURPLES = [
    way("P1", "Wisteria", "Blue-leaning lilacs with a pale lilac signal and a slate stem", ("#C9B8E8", "#B39DDB"), ("#B3A0DC", "#9C86CF"), ("#8E7CC8", "#7663B8"), ("#8E7CC8", "#7663B8"), ("#F0E3F5", "#E3D2EE"), ("#9FA8B8", "#8591A6")),
    way("P2", "Tyrian", "The red-leaning purple of the old shellfish dye", ("#C792B8", "#B5769F"), ("#B57DA8", "#A0638F"), ("#8F4C82", "#7A3A6E"), ("#8F4C82", "#7A3A6E"), ("#F2D9C4", "#E8C4A8"), ("#A89A8F", "#8F7F73")),
    way("P3", "Lilac and copper", "Lilac petals with Copper's signal", ("#C4A6DE", "#AC8ACB"), ("#B193D2", "#9A78BF"), ("#8D67B8", "#7650A3"), ("#8D67B8", "#7650A3"), ("#E0A06A", "#D4853F"), ("#A8957F", "#8F7A62")),
    way("P4", "Plum and rose gold", "Rose gold standards over plum falls", ("#F3C3B4", "#E3A897"), ("#DDA6B8", "#CC8CA2"), ("#8E5A96", "#774480"), ("#8E5A96", "#774480"), ("#FFF3EA", "#F7E3D5"), ("#B7A68F", "#9E8B72")),
    way("P5", "Iris and sea", "Violet petals with Sea's teal as the signal", ("#B5A8E0", "#9F8FD1"), ("#A093D4", "#8878C2"), ("#7A5FB0", "#64499B"), ("#7A5FB0", "#64499B"), ("#8FD0C0", "#5FB5A2"), ("#7FAF9F", "#5F9A88")),
    way("P6", "Heather", "Greyed mauves, the quietest of the set", ("#CDB3CC", "#B898B7"), ("#BBA0BE", "#A585A8"), ("#96739F", "#7F5C88"), ("#96739F", "#7F5C88"), ("#EAD9A8", "#DEC67E"), ("#A3AD94", "#8A967A")),
    way("P7", "Amethyst", "The same balance with the colour turned up", ("#C7A3F0", "#B088E3"), ("#B08CE6", "#9871D6"), ("#8556CF", "#6E40BA"), ("#8556CF", "#6E40BA"), ("#F5DFA0", "#EBCB6E"), ("#9AA9C4", "#8093B3")),
    way("P8", "Orchid", "Pink-leaning purples with a cream signal", ("#E3B3DC", "#D496CB"), ("#D29CD0", "#C17FBE"), ("#A55FA8", "#8E4892"), ("#A55FA8", "#8E4892"), ("#FBE9D8", "#F2D5BA"), ("#B0A398", "#978779")),
    way("P9", "Violet dusk", "Deeper violets with a rose gold signal", ("#A08FD0", "#8573BD"), ("#8A78C0", "#7160AD"), ("#5F4C9E", "#4B3987"), ("#5F4C9E", "#4B3987"), ("#E6C3B4", "#D9A897"), ("#8F93A8", "#75798F")),
    way("P10", "Mulberry", "Dusty pink standards over wine falls", ("#D3A0BE", "#C283A6"), ("#C088AC", "#AD6E94"), ("#8A3F74", "#742D60"), ("#8A3F74", "#742D60"), ("#F0C9A0", "#E5B07C"), ("#A39A80", "#8A8066")),
    way("P11", "Amethyst and sea", "Amethyst's purples with the teal greens of Iris and sea", ("#C7A3F0", "#B088E3"), ("#B08CE6", "#9871D6"), ("#8556CF", "#6E40BA"), ("#8556CF", "#6E40BA"), ("#8FD0C0", "#5FB5A2"), ("#7FAF9F", "#5F9A88")),
    way("P12", "Amethyst and deep sea", "The same with a deeper teal stem", ("#C7A3F0", "#B088E3"), ("#B08CE6", "#9871D6"), ("#8556CF", "#6E40BA"), ("#8556CF", "#6E40BA"), ("#8FD0C0", "#5FB5A2"), ("#4C9FA8", "#2F8590")),
]
EARLIER = COLOURWAYS
COLOURWAYS = PURPLES + EARLIER
LIVE = {k: f"var(--{k})" for k in PARTS}


def at(x, y, angle, d, colour, extra=""):
    return f'<g transform="translate({x} {y}) rotate({angle})"><path d="{d}" fill="{colour}"/>{extra}</g>'


def line(d, colour, width):
    return f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="round"/>'


def mirror(s):
    return s + f'<g transform="translate(100 0) scale(-1 1)">{s}</g>'


def blade(p0, p1, p2, p3, w0, w1, colour, opacity=1):
    """A line with body: it follows the cubic curve p0..p3 and narrows from w0 wide to w1, round at its wide end."""
    def pt(t):
        u = 1 - t
        return tuple(u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3))
    left, right, n = [], [], 16
    for i in range(n + 1):
        t = i / n
        (x, y), (xa, ya), (xb, yb) = pt(t), pt(max(0, t - .01)), pt(min(1, t + .01))
        dx, dy = xb - xa, yb - ya
        k = (w0 + (w1 - w0) * t) / 2 / (math.hypot(dx, dy) or 1)
        left.append(f"{x - dy * k:.2f} {y + dx * k:.2f}")
        right.append(f"{x + dy * k:.2f} {y - dx * k:.2f}")
    op = f' opacity="{opacity}"' if opacity != 1 else ""
    return (f'<g fill="{colour}"{op}><path d="M{" L".join(left + right[::-1])} Z"/>'
            f'<circle cx="{p0[0]:.2f}" cy="{p0[1]:.2f}" r="{w0 / 2:.2f}"/></g>')


def beard(c, length, bend=0, wide=4.6, reach=.66, veins=.2):
    """The signal on a fall that stands on (0, 0) and points up. bend curves it the way the petal droops;
    a petal turned toward the viewer takes a short, wide beard, one seen side-on a long, thin one."""
    end = -length * reach
    out = blade((0, -4), (bend * .15, end * .4), (bend * .7, end * .75), (bend, end), wide, .5, c["beard"])
    for side in (-1, 1):
        spread = side * length * veins
        out += blade((side * 1.6, -5), (side * 2.5 + bend * .15, end * .4), (spread * .8 + bend * .7, end * .7),
                     (spread + bend, end * .92), wide * .36, .25, c["beard"], .55)
    return out


def signal(c, kind, length, bend):
    """Ways to mark a side fall of the Sketch (round L): the fall stands on (0, 0), points up and droops toward bend."""
    # The midrib as the viewer sees it: the fall arches up and out before it droops, so the line bows
    # toward the petal's upper edge through the middle and comes back to the petal's centre near its tip.
    end, bow = -length * .8, -bend * .95
    curve = ((0, -4), (bow * .7, end * .3), (bow, end * .72), (bend * .25, end))
    if kind == "line":  # round 1's straight stroke
        return line("M0 -7 V-19", c["beard"], 3.4)
    if kind == "blade":  # one tapered stroke along the droop, no veins
        return blade(*curve, 4.2, .5, c["beard"])
    if kind == "patch":  # a soft blotch at the throat, as on a real fall
        return f'<g transform="rotate({bend * 1.6})"><path d="{petal(length * .5, 9.5, 1.05)}" fill="{c["beard"]}" transform="translate(0 -2)"/></g>'
    if kind == "veins":  # hairlines fanning from the throat
        return "".join(blade((k * .8, -4), (k * 2 + bow * .7, end * .3), (k * 5 + bow, end * .7), (k * 8 + bend * .25, end * .95), 1.5, .2, c["beard"])
                       for k in (-1, -.5, 0, .5, 1))
    if kind == "dots":  # a row of dots that shrink along the droop
        out = ""
        for i in range(5):
            t = i / 4
            u = 1 - t
            x = 3 * u * u * t * curve[1][0] + 3 * u * t * t * curve[2][0] + t ** 3 * curve[3][0]
            y = u ** 3 * -5 + 3 * u * u * t * curve[1][1] + 3 * u * t * t * curve[2][1] + t ** 3 * curve[3][1]
            out += f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{2.3 - 1.5 * t:.2f}" fill="{c["beard"]}"/>'
        return out
    if kind.startswith("shade"):  # bare, with the half of the fall nearest the viewer a little darker
        side, strength = (1 if bend > 0 else -1), (.2 if kind == "shade2" else .11)
        name = "r" if bend > 0 else "l"
        return (f'<defs><clipPath id="f{name}"><path d="{petal(length, 25, 1.08)}"/></clipPath></defs>'
                f'<path clip-path="url(#f{name})" fill="#000" opacity="{strength}" d="M0 0 C{bow * .7:.2f} {-length * .3:.2f} {bow:.2f} {-length * .7:.2f} 0 {-length} '
                f'H{side * 40} V0 Z"/>')
    return ""  # "none"


def s1(c, kind="shade"):
    fall = petal(37, 25, 1.08)
    return (line("M50 56 V94", c["stem"], 6) + at(50, 52, 122, fall, c["fall"], signal(c, kind, 37, 5)) + at(50, 52, -122, fall, c["other"], signal(c, kind, 37, -5))
            + at(50, 52, 25, petal(40, 18, .8), c["back"]) + at(50, 52, -25, petal(40, 18, .8), c["back"])
            + at(50, 52, 0, petal(45, 20, .8), c["std"]))


SIGNALS = [
    ("L1", "Straight line", "line", "Round 1's plain stroke"),
    ("L2", "One blade", "blade", "A single tapered stroke along the fall's midrib"),
    ("L3", "Patch", "patch", "A soft blotch at the throat, as on a real fall"),
    ("L4", "Veins", "veins", "Five hairlines fanning from the throat"),
    ("L5", "Dots", "dots", "A row of dots that shrink along the droop"),
    ("L6", "None", "none", "Bare petals"),
    ("L7", "Shaded", "shade", "Bare, with the near half of each fall a little darker, now in the grid above"),
    ("L8", "Shaded more", "shade2", "The same with a stronger shadow"),
]


def s2(c):
    side = "M53 62 C58 42 80 32 89 46 C95 56 88 68 78 65 C83 58 79 50 71 52 C63 54 60 62 58 70 Z"
    left = f'<g transform="translate(100 0) scale(-1 1)"><path d="{side}" fill="{c["other"]}"/></g>'
    tails = at(50, 72, 180, petal(22, 11, .8), c["back"]) + at(50, 72, 152, petal(17, 9, .8), c["back"]) + at(50, 72, -152, petal(17, 9, .8), c["back"])
    return (tails + f'<path d="{side}" fill="{c["fall"]}"/>' + left + at(50, 68, 0, petal(60, 23, .8), c["std"])
            + f'<rect x="37" y="63" width="26" height="7.5" rx="3.75" fill="{c["beard"]}"/>')


def s3(c):
    leaf = f'<path d="M50 97 C40 82 33 66 30 48 C41 60 47 78 50 97 Z" fill="{c["stem"]}"/>'
    fall = petal(33, 29, 1.1)
    return (mirror(leaf) + line("M50 58 V95", c["stem"], 5)
            + at(50, 48, 125, fall, c["fall"], beard(c, 33, 5, 4.2)) + at(50, 48, -125, fall, c["other"], beard(c, 33, -5, 4.2))
            + at(50, 50, 32, petal(36, 22, .95), c["back"]) + at(50, 50, -32, petal(36, 22, .95), c["back"])
            + at(50, 52, 0, petal(42, 27, .95), c["std"])
            # The front fall comes straight at the viewer, so its beard is short and wide.
            + at(50, 50, 180, petal(22, 20, 1.1), c["fall"], beard(c, 22, 0, 5.4, .62, .26)))


def s4(c, shaded=False):
    def mark(i):
        if not shaded:
            return beard(c, 44, 0, 5, .64, .24)
        return (f'<defs><clipPath id="a{i}"><path d="{petal(44, 35, 1.1)}"/></clipPath></defs>'
                f'<path clip-path="url(#a{i})" fill="#000" opacity=".11" d="M0 0 V-44 H30 V0 Z"/>')
    falls = "".join(at(50, 52, a, petal(44, 35, 1.1), c[k], mark(i)) for i, (a, k) in enumerate(((0, "fall"), (120, "other"), (240, "back"))))
    stds = "".join(at(50, 52, a, petal(29, 17, .85), c["std"]) for a in (60, 180, 300))
    return falls + stds + f'<circle cx="50" cy="52" r="5.5" fill="{c["beard"]}"/>'


# The near fall of the profile, six ways (round R): its outline, and the curve its midrib line follows.
NEAR = {
    "R1": ("M54 58 C66 44 90 48 92 65 C93 76 85 84 77 80 C83 72 79 62 69 62 C63 62 58 62 54 58 Z", ((58, 57.5), (66, 52), (80, 52), (86.5, 63))),
    "R2": ("M54 58 C62 48 78 48 81 60 C83 69 77 76 70 73 C74 67 72 62 66 62 C61 62 58 61 54 58 Z", ((58, 57), (63, 53), (72, 53), (76.5, 60))),
    "R3": ("M54 58 C68 46 88 50 95 66 C97 74 94 84 89 90 C89 78 82 66 70 63 C64 61.5 59 61 54 58 Z", ((58, 57.5), (68, 52.5), (84, 56), (90, 72))),
    "R4": ("M54 58 C62 40 92 42 94 62 C95 78 82 88 70 84 C78 78 78 68 70 64 C64 61 59 61 54 58 Z", ((58, 56.5), (66, 48), (82, 50), (86, 66))),
    "R5": ("M54 58 C66 49 84 51 86 64 C87 73 81 79 75 76 C80 71 78 63 70 60.5 C64 59 59 59.5 54 58 Z", ((58, 57.5), (66, 54), (77, 54.5), (82, 63))),
    "R6": ("M54 58 C64 52 76 58 77 72 C78 82 73 91 67 92 C70 84 69 74 64 68 C61 64 57 61 54 58 Z", ((57, 59), (63, 58), (71, 63), (72, 76))),
}
NEARS = [
    ("R1", "As it was", "The long curl from the first version"),
    ("R2", "Compact", "Shorter and rounder, tucked closer to the bloom"),
    ("R3", "Long sweep", "Reaches further and ends in a point that hangs down"),
    ("R4", "Broad", "A big, full lobe, the heaviest of the six"),
    ("R5", "Slim", "A narrow petal with a light curl"),
    ("R6", "Hanging", "Droops steeply, close to the stem"),
]


def s5(c, near="R1"):
    # Seen side-on, the near fall's line runs long and thin along its arch; the far fall's is a short sliver.
    outline, rib = NEAR[near]
    far = at(54, 58, -118, petal(25, 19, 1.1), c["other"], blade((0, -5), (-1, -9), (-2.5, -12), (-3, -15), 2.6, .3, c["beard"], .8))
    return (f'<path d="M45 97 C31 78 28 56 34 34 C42 56 47 76 47 97 Z" fill="{c["stem"]}"/>' + line("M47 96 C47 82 49 70 53 60", c["stem"], 5)
            + far + at(54, 58, 22, petal(40, 19, .8), c["back"]) + f'<path d="{outline}" fill="{c["fall"]}"/>'
            + blade(*rib, 4.2, .5, c["beard"]) + at(54, 59, -8, petal(47, 25, .85), c["std"]))


def s6(c):
    lobe = "M11 54 A19.5 19.5 0 0 0 50 54 Z"
    return (line("M50 56 V94", c["stem"], 6) + f'<path d="{lobe}" fill="{c["fall"]}"/>'
            + f'<g transform="translate(100 0) scale(-1 1)"><path d="{lobe}" fill="{c["other"]}"/></g>'
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


def variables(i):
    return "".join(f"--{k}:{v[i]};" for k, v in COLOURWAYS[0][3].items())


CSS = f"""
@font-face{{font-family:Marcellus;src:url("../../house/Marcellus-Regular.ttf")}}
@font-face{{font-family:Commissioner;font-weight:400;src:url("../../house/Commissioner-Regular.ttf")}}
@font-face{{font-family:Commissioner;font-weight:600;src:url("../../house/Commissioner-SemiBold.ttf")}}
@font-face{{font-family:"IBM Plex Mono";src:url("../../house/IBMPlexMono-Regular.ttf")}}
[data-ground=dark]{{{variables(0)}}}
[data-ground=light]{{{variables(1)}}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#15161A;color:#F4F4F1;font:400 15px/22px Commissioner,system-ui,sans-serif;padding:32px 36px 40px}}
.label{{font:600 12px/16px Commissioner,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#A2A5AD}}
h1{{font:400 40px/44px Marcellus,serif;margin:8px 0 8px}}
.brief{{color:#A2A5AD;max-width:1000px;font-size:17px;line-height:25px;margin-bottom:20px}}
.id{{font:400 13px/20px 'IBM Plex Mono',monospace;border:1px solid #32353C;border-radius:6px;padding:1px 8px;margin-right:8px}}
.picker{{position:sticky;top:12px;z-index:2;background:#1F2126;border:1px solid #32353C;border-radius:14px;padding:12px 14px;margin-bottom:26px;box-shadow:0 10px 28px rgba(0,0,0,.45)}}
.picker .ways{{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}}
.picker button{{display:flex;align-items:center;gap:8px;font:600 13px/18px Commissioner,sans-serif;color:#F4F4F1;background:#15161A;border:1px solid #32353C;border-radius:10px;padding:7px 11px;cursor:pointer}}
.picker button code{{font:400 12px/18px 'IBM Plex Mono',monospace;color:#A2A5AD}}
.picker button i{{display:flex}}
.picker button i b{{width:12px;height:16px}}
.picker button i b:first-child{{border-radius:4px 0 0 4px}}
.picker button i b:last-child{{border-radius:0 4px 4px 0}}
.picker button[aria-pressed=true]{{border-color:#F4F4F1;background:#32353C}}
.picker .now{{color:#A2A5AD;font-size:13px;line-height:18px}}
.picker .now b{{color:#F4F4F1;font-weight:600}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:28px 22px}}
h2{{font:600 17px/25px Commissioner,sans-serif}}
.why{{color:#A2A5AD;font-size:13px;line-height:18px;margin:2px 0 10px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}
.tile{{position:relative;height:330px;border-radius:12px;border:1px solid #32353C;display:flex;flex-direction:column;align-items:center}}
.tile .big{{margin-top:20px}}
.grid.six{{grid-template-columns:repeat(4,1fr);gap:24px 20px}}
.tile.mini{{height:230px;justify-content:center;padding-bottom:22px}}
.grid.six .why{{min-height:36px}}
.tile .lockup{{display:flex;align-items:center;gap:12px;font:400 36px/40px Marcellus,serif;margin-top:16px}}
.tile .small{{position:absolute;right:12px;bottom:10px;display:flex;align-items:flex-end;gap:9px}}
.tile .px{{position:absolute;left:12px;bottom:10px;font:400 11px/16px 'IBM Plex Mono',monospace;opacity:.55}}
"""

SCRIPT = r"""
const WAYS = __WAYS__, PARTS = __PARTS__;
const live = document.head.appendChild(document.createElement("style"));
const buttons = [...document.querySelectorAll(".picker button")];
function choose(id) {
  const way = WAYS.find((w) => w.id === id) || WAYS[0];
  live.textContent = ["dark", "light"].map((g, i) => `[data-ground=${g}]{${PARTS.map((k) => `--${k}:${way.parts[k][i]}`).join(";")}}`).join("");
  buttons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === way.id));
  document.getElementById("now").innerHTML = `<b>${way.id} ${way.name}</b> · ${way.why}`;
  // The choice travels in the address, so a reload keeps it and the link can be sent back.
  history.replaceState(null, "", "#" + way.id);
}
buttons.forEach((b) => (b.onclick = () => choose(b.dataset.id)));
choose(location.hash.slice(1));
// capture.sh reads the page's height from here.
document.fonts.ready.then(() => { document.documentElement.dataset.h = Math.ceil(document.body.getBoundingClientRect().bottom); });
"""


def main():
    (HERE / "options").mkdir(exist_ok=True)
    for old in (HERE / "options").glob("*.svg"):
        old.unlink()
    cells = []
    for sid, sname, draw, swhy in SHAPES:
        for cid, _, _, parts in COLOURWAYS:
            for i, g in enumerate(("dark", "light")):
                (HERE / "options" / f"{sid}-{cid}-on-{g}.svg").write_text(
                    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n{draw({k: v[i] for k, v in parts.items()})}\n</svg>\n')
        body, tiles = draw(LIVE), ""
        for g in ("dark", "light"):
            tiles += (f'<div class="tile" data-ground="{g}" style="background:{m.GROUND[g]};color:{m.INK[g]}">{m.inline(body, 190, "big")}'
                      f'<div class="lockup">{m.inline(body, 44)}Iris</div><div class="small">{m.inline(body, 32)}{m.inline(body, 24)}{m.inline(body, 16)}</div>'
                      '<span class="px">32 · 24 · 16</span></div>')
        cells.append(f'<div id="{sid}"><h2><span class="id">{sid}</span>{sname}</h2><p class="why">{swhy}</p><div class="pair">{tiles}</div></div>')
    lines = ""
    for lid, lname, kind, lwhy in SIGNALS:
        body = s1(LIVE, kind)
        tiles = "".join(f'<div class="tile mini" data-ground="{g}" style="background:{m.GROUND[g]}">{m.inline(body, 176)}'
                        f'<div class="small">{m.inline(body, 32)}{m.inline(body, 16)}</div></div>' for g in ("dark", "light"))
        lines += f'<div id="{lid}"><h2><span class="id">{lid}</span>{lname}</h2><p class="why">{lwhy}</p><div class="pair">{tiles}</div></div>'

    nears = ""
    for rid, rname, rwhy in NEARS:
        body = s5(LIVE, rid)
        tiles = "".join(f'<div class="tile mini" data-ground="{g}" style="background:{m.GROUND[g]}">{m.inline(body, 176)}'
                        f'<div class="small">{m.inline(body, 32)}{m.inline(body, 16)}</div></div>' for g in ("dark", "light"))
        nears += f'<div id="{rid}"><h2><span class="id">{rid}</span>{rname}</h2><p class="why">{rwhy}</p><div class="pair">{tiles}</div></div>'

    def group(title, ways):
        return f'<span class="label">{title}</span><div class="ways">' + "".join(
            f'<button type="button" data-id="{cid}"><i>{"".join(f"<b style=background:{parts[k][0]}></b>" for k in ("std", "fall", "beard", "stem"))}</i>'
            f'<code>{cid}</code>{name}</button>' for cid, name, _, parts in ways) + "</div>"
    ways = group("New: the purple range", PURPLES) + group("Earlier", EARLIER)
    script = (SCRIPT.replace("__WAYS__", json.dumps([dict(id=c, name=n, why=w, parts=p) for c, n, w, p in COLOURWAYS]))
              .replace("__PARTS__", json.dumps(PARTS)))
    (HERE / "index.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Iris · mark · round 2 · the flower</title>'
        f'<meta name="board-status" content="open"><meta name="board-summary" content="Six ways to draw the iris, in {len(COLOURWAYS)} colourways">'
        f'<style>{CSS}</style></head><body>'
        '<p class="label">Iris · mark · round 2 · the flower</p><h1>The flower, in six shapes</h1>'
        f'<p class="brief">Six ways to draw the iris, each on Night and on Chalk, beside the name, and at 32, 24 and 16 px. '
        f'Choose a colourway below and every flower takes it. Name a pick by shape and colourway, such as S4 in P2.</p>'
        f'<div class="picker">{ways}<p class="now" id="now"></p></div>'
        f'<div class="grid">{"".join(cells)}</div>'
        '<h1 style="margin-top:44px">The lines on the Sketch\'s petals, eight ways</h1>'
        '<p class="brief">The three-line version is gone. These follow the colourway chosen above.</p>'
        f'<div class="grid six">{lines}</div>'
        '<h1 style="margin-top:44px">In profile: the large petal on the right, six ways</h1>'
        '<p class="brief">Only the near petal changes. These follow the colourway chosen above.</p>'
        f'<div class="grid six" style="grid-template-columns:repeat(3,1fr)">{nears}</div><script>{script}</script></body></html>\n')
    print("wrote index.html and", len(SHAPES) * len(COLOURWAYS) * 2, "SVG files")


if __name__ == "__main__":
    main()
