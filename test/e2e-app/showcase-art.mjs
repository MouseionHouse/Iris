// The pictures of the showcase account (./showcase-seed.mjs), drawn here in code so that nothing
// in them is a photo or someone else's art: six stickers, a picnic "photo", and an avatar per
// person. Each is a PNG made with no dependencies (signed distances, 4×4 samples per pixel, zlib).
//
//   import { stickers, picnicPhoto, avatar } from './showcase-art.mjs';
//   stickers() -> [{ shortcode, body, png }]   picnicPhoto() -> png   avatar(hue, mark) -> png
import zlib from 'node:zlib';

// ---- PNG --------------------------------------------------------------------------------------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const encodePng = ({ w, h, px }) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    for (let i = 0; i < w * 4; i += 1) {
      raw[y * (w * 4 + 1) + 1 + i] = Math.round(Math.min(1, Math.max(0, px[y * w * 4 + i])) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ---- drawing ----------------------------------------------------------------------------------
// A canvas holds premultiplied RGBA floats. `fill` paints where a shape's signed distance (in
// pixels, negative inside) is below zero, with a colour that may vary over the canvas.
const canvas = (w, h) => ({ w, h, px: new Float32Array(w * h * 4) });
const SS = 4;
const fill = (cv, sdf, color, bounds = [0, 0, cv.w, cv.h]) => {
  const paint = typeof color === 'function' ? color : () => color;
  const [x0, y0, x1, y1] = bounds.map((v, i) =>
    Math.max(0, Math.min(i % 2 ? cv.h : cv.w, Math.round(v)))
  );
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const d0 = sdf(cx, cy);
      if (d0 > 1.5) continue;
      let cover = 1;
      if (d0 > -1.5) {
        let n = 0;
        for (let j = 0; j < SS; j += 1) {
          for (let i = 0; i < SS; i += 1) {
            if (sdf(x + (i + 0.5) / SS, y + (j + 0.5) / SS) <= 0) n += 1;
          }
        }
        cover = n / (SS * SS);
      }
      if (cover === 0) continue;
      const [r, g, b, a = 1] = paint(cx, cy);
      const alpha = a * cover;
      const k = (y * cv.w + x) * 4;
      const keep = 1 - alpha;
      cv.px[k] = r * alpha + cv.px[k] * keep;
      cv.px[k + 1] = g * alpha + cv.px[k + 1] * keep;
      cv.px[k + 2] = b * alpha + cv.px[k + 2] * keep;
      cv.px[k + 3] = alpha + cv.px[k + 3] * keep;
    }
  }
};
const toPng = (cv) => {
  // un-premultiply for PNG
  const px = new Float32Array(cv.px.length);
  for (let k = 0; k < px.length; k += 4) {
    const a = cv.px[k + 3];
    px[k] = a ? cv.px[k] / a : 0;
    px[k + 1] = a ? cv.px[k + 1] / a : 0;
    px[k + 2] = a ? cv.px[k + 2] / a : 0;
    px[k + 3] = a;
  }
  return encodePng({ w: cv.w, h: cv.h, px });
};

const hex = (s, a = 1) => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
  a,
];
const mix = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * Math.min(1, Math.max(0, t)));

// shapes: each returns (x, y) => signed distance in pixels
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ellipse = (cx, cy, rx, ry, rot = 0) => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (x, y) => {
    const dx = (x - cx) * c + (y - cy) * s;
    const dy = -(x - cx) * s + (y - cy) * c;
    const k = Math.hypot(dx / rx, dy / ry);
    return (k - 1) * Math.min(rx, ry);
  };
};
const box =
  (cx, cy, hw, hh, r = 0) =>
  (x, y) => {
    const qx = Math.abs(x - cx) - hw + r;
    const qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
const segment = (ax, ay, bx, by, r) => (x, y) => {
  const px = x - ax;
  const py = y - ay;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * t, py - dy * t) - r;
};
const polygon = (pts) => (x, y) => {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const ex = xj - xi;
    const ey = yj - yi;
    const t = Math.max(0, Math.min(1, ((x - xi) * ex + (y - yi) * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(x - xi - ex * t, y - yi - ey * t));
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
};
const union =
  (...fs) =>
  (x, y) =>
    Math.min(...fs.map((f) => f(x, y)));
const subtract = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
const intersect = (a, b) => (x, y) => Math.max(a(x, y), b(x, y));
const grow = (f, r) => (x, y) => f(x, y) - r;
const ring = (f, r) => (x, y) => Math.abs(f(x, y)) - r;
const heart = (cx, cy, s) =>
  union(
    circle(cx - s * 0.5, cy - s * 0.25, s * 0.55),
    circle(cx + s * 0.5, cy - s * 0.25, s * 0.55),
    polygon([
      [cx - s * 1.02, cy - s * 0.05],
      [cx + s * 1.02, cy - s * 0.05],
      [cx, cy + s * 1.15],
    ])
  );
const star = (cx, cy, r1, r2, n = 5, rot = -Math.PI / 2) =>
  polygon(
    Array.from({ length: n * 2 }, (_, i) => {
      const r = i % 2 ? r2 : r1;
      const a = rot + (i * Math.PI) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    })
  );

// A sticker: the shape's outline in white with a soft shade, then the drawing on it.
const INK = hex('#3b2f4a');
const sticker = (draw, outline) => {
  const cv = canvas(256, 256);
  fill(cv, (x, y) => grow(outline, 14)(x - 3, y - 5), [0, 0, 0, 0.18]);
  fill(cv, grow(outline, 12), hex('#ffffff'));
  draw(cv);
  return toPng(cv);
};
const smile = (cv, cx, cy, s) => {
  fill(cv, circle(cx - s * 0.38, cy - s * 0.1, s * 0.09), INK);
  fill(cv, circle(cx + s * 0.38, cy - s * 0.1, s * 0.09), INK);
  fill(
    cv,
    intersect(
      ring(circle(cx, cy + s * 0.02, s * 0.32), s * 0.05),
      box(cx, cy + s * 0.3, s, s * 0.22)
    ),
    INK
  );
  fill(cv, circle(cx - s * 0.6, cy + s * 0.15, s * 0.11), hex('#ff7a8a', 0.55));
  fill(cv, circle(cx + s * 0.6, cy + s * 0.15, s * 0.11), hex('#ff7a8a', 0.55));
};

const sun = () => {
  const rays = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5;
    return segment(
      128 + 78 * Math.cos(a),
      128 + 78 * Math.sin(a),
      128 + 104 * Math.cos(a),
      128 + 104 * Math.sin(a),
      9
    );
  });
  const shape = union(circle(128, 128, 62), ...rays);
  return sticker((cv) => {
    rays.forEach((r) => fill(cv, r, hex('#ffb627')));
    fill(cv, circle(128, 128, 62), (x, y) => mix(hex('#ffe066'), hex('#ffb627'), (y - 70) / 120));
    smile(cv, 128, 128, 62);
  }, shape);
};
const love = () => {
  const shape = heart(128, 118, 84);
  return sticker((cv) => {
    fill(cv, shape, (x, y) => mix(hex('#ff6f91'), hex('#e63462'), (y - 40) / 180));
    fill(cv, ellipse(92, 82, 16, 9, -0.6), hex('#ffffff', 0.6));
  }, shape);
};
const coffee = () => {
  const cup = box(116, 150, 58, 56, 22);
  const handle = ring(circle(178, 146, 24), 8);
  const steam = [88, 116, 144].map((sx) => (x, y) => {
    if (y < 30 || y > 84) return 99;
    return Math.abs(x - (sx + 7 * Math.sin((y - 30) / 9))) - 5;
  });
  const shape = union(cup, handle, box(116, 210, 82, 10, 10), ...steam.map((s) => grow(s, 2)));
  return sticker((cv) => {
    steam.forEach((s) => fill(cv, s, hex('#c9b8d8')));
    fill(cv, handle, hex('#8f5bd7'));
    fill(cv, cup, hex('#a678f0'));
    fill(cv, box(116, 210, 82, 10, 10), hex('#8f5bd7'));
    fill(cv, box(116, 104, 50, 8, 8), hex('#6b3e26'));
    smile(cv, 116, 158, 46);
  }, shape);
};
const sparkle = () => {
  const shape = star(128, 132, 104, 46);
  return sticker((cv) => {
    fill(cv, shape, (x, y) => mix(hex('#ffd84d'), hex('#ff9f1c'), (y - 40) / 190));
    smile(cv, 128, 140, 40);
  }, shape);
};
const sprout = () => {
  const pot = polygon([
    [70, 140],
    [186, 140],
    [168, 226],
    [88, 226],
  ]);
  const rim = box(128, 142, 66, 14, 8);
  const leafL = ellipse(94, 84, 40, 20, -0.6);
  const leafR = ellipse(164, 70, 44, 22, 0.55);
  const stem = segment(128, 132, 128, 70, 6);
  const shape = union(pot, rim, leafL, leafR, stem);
  return sticker((cv) => {
    fill(cv, stem, hex('#2f9e5b'));
    fill(cv, leafL, hex('#4cc77a'));
    fill(cv, leafR, hex('#3fb36c'));
    fill(cv, pot, hex('#e27d4f'));
    fill(cv, rim, hex('#c9653a'));
    smile(cv, 128, 184, 34);
  }, shape);
};
const melon = () => {
  const slice = intersect(circle(128, 92, 110), box(128, 150, 120, 58));
  const flesh = intersect(circle(128, 92, 92), box(128, 150, 120, 58));
  return sticker((cv) => {
    fill(cv, slice, hex('#3fae5a'));
    fill(cv, intersect(circle(128, 92, 100), box(128, 150, 120, 58)), hex('#e8f5c8'));
    fill(cv, flesh, hex('#ff5d73'));
    [
      [86, 120],
      [128, 128],
      [170, 120],
      [106, 158],
      [150, 158],
    ].forEach(([sx, sy]) => fill(cv, ellipse(sx, sy, 5, 9), INK));
  }, slice);
};

/** The sticker pack: six stickers, each a 256×256 PNG. */
export const stickers = () => [
  { shortcode: 'sunny', body: 'Sunny', png: sun() },
  { shortcode: 'love', body: 'Love', png: love() },
  { shortcode: 'coffee', body: 'Coffee', png: coffee() },
  { shortcode: 'star', body: 'Gold star', png: sparkle() },
  { shortcode: 'sprout', body: 'Sprout', png: sprout() },
  { shortcode: 'melon', body: 'Melon', png: melon() },
];

// a little deterministic grain, so the "photo" does not look flat
const grain = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.035;
};
const shade = (c, x, y) => {
  const g = grain(x, y);
  return [c[0] + g, c[1] + g, c[2] + g, c[3] ?? 1];
};

/** A picnic on a hill at golden hour, 1200×800. */
export const picnicPhoto = () => {
  const W = 1200;
  const H = 800;
  const cv = canvas(W, H);
  const sky = [hex('#5d7fc7'), hex('#f6a77a'), hex('#ffd9a0')];
  fill(
    cv,
    () => -1,
    (x, y) => {
      const t = y / 520;
      return shade(
        t < 0.6 ? mix(sky[0], sky[1], t / 0.6) : mix(sky[1], sky[2], (t - 0.6) / 0.4),
        x,
        y
      );
    }
  );
  fill(cv, circle(840, 360, 150), (x, y) => [1, 0.93, 0.7, 0.18]);
  fill(cv, circle(840, 360, 72), hex('#fff1c1'));
  const hill = (base, amp, freq, phase) => (x, y) =>
    base +
    amp * Math.sin(x / freq + phase) +
    amp * 0.4 * Math.sin(x / (freq * 0.37) + phase * 2) -
    y;
  fill(cv, hill(430, 26, 160, 1), (x, y) => shade(hex('#8e7fb8'), x, y));
  fill(cv, hill(500, 34, 210, 2.4), (x, y) => shade(hex('#6f9a6b'), x, y));
  fill(cv, hill(590, 40, 260, 4.1), (x, y) =>
    shade(mix(hex('#8cc06a'), hex('#5f9a4c'), (y - 560) / 240), x, y)
  );
  // a tree on the far left
  fill(cv, box(190, 520, 12, 70, 6), hex('#5b4032'));
  fill(cv, union(circle(190, 420, 70), circle(140, 460, 52), circle(240, 462, 54)), (x, y) =>
    shade(mix(hex('#4f8f4a'), hex('#386b3a'), (y - 360) / 160), x, y)
  );
  // the blanket, checked red and white
  const blanket = polygon([
    [430, 660],
    [860, 640],
    [960, 770],
    [380, 790],
  ]);
  fill(cv, blanket, (x, y) => {
    const u = Math.floor((x + (y - 640) * 0.35) / 46);
    const v = Math.floor((y - 630) / 30);
    return shade((u + v) % 2 ? hex('#e8505b') : hex('#fbeaea'), x, y);
  });
  // a basket and two cups
  fill(cv, box(560, 676, 70, 42, 12), hex('#c48a4a'));
  fill(cv, ring(ellipse(560, 640, 62, 46), 7), hex('#9a6430'));
  for (let i = 0; i < 6; i += 1) fill(cv, box(510 + i * 20, 676, 3, 36), hex('#a8743c'));
  fill(cv, box(740, 700, 20, 26, 6), hex('#ffffff'));
  fill(cv, box(800, 708, 20, 26, 6), hex('#a678f0'));
  // birds
  for (const [bx, by] of [
    [420, 200],
    [470, 170],
    [520, 215],
  ]) {
    fill(cv, segment(bx - 14, by - 6, bx, by, 2.4), hex('#3b2f4a', 0.8));
    fill(cv, segment(bx, by, bx + 14, by - 6, 2.4), hex('#3b2f4a', 0.8));
  }
  return toPng(cv);
};

/** An avatar, 256×256: a soft gradient of one hue with a light mark (one of avatarMarks) on it. */
export const avatar = (hue, mark) => {
  const cv = canvas(256, 256);
  const hsl = (h, s, l) => {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4), 1];
  };
  fill(
    cv,
    () => -1,
    (x, y) => mix(hsl(hue, 0.65, 0.68), hsl(hue + 25, 0.6, 0.48), (x + y) / 512)
  );
  avatarMarks[mark]((sdf) => fill(cv, sdf, [1, 1, 1, 0.92]));
  return toPng(cv);
};

// Simple marks for the avatars, one per person: no faces, just a shape each.
export const avatarMarks = {
  star: (paint) => paint(star(128, 134, 76, 34)),
  wave: (paint) =>
    paint(
      (x, y) =>
        Math.abs(y - (128 + 22 * Math.sin((x - 40) / 22))) - 10 + (Math.abs(x - 128) > 82 ? 99 : 0)
    ),
  rose: (paint) =>
    paint(
      union(circle(128, 112, 46), segment(128, 150, 128, 210, 7), ellipse(150, 182, 22, 10, -0.5))
    ),
  owl: (paint) =>
    paint(
      subtract(
        union(
          circle(128, 140, 60),
          polygon([
            [78, 104],
            [104, 70],
            [118, 100],
          ]),
          polygon([
            [178, 104],
            [152, 70],
            [138, 100],
          ])
        ),
        union(circle(106, 130, 16), circle(150, 130, 16))
      )
    ),
  crown: (paint) =>
    paint(
      polygon([
        [62, 176],
        [62, 92],
        [96, 128],
        [128, 80],
        [160, 128],
        [194, 92],
        [194, 176],
      ])
    ),
  ship: (paint) =>
    paint(
      union(
        polygon([
          [56, 160],
          [200, 160],
          [176, 196],
          [80, 196],
        ]),
        polygon([
          [132, 60],
          [132, 150],
          [186, 150],
        ]),
        polygon([
          [122, 76],
          [122, 150],
          [78, 150],
        ])
      )
    ),
  sun: (paint) =>
    paint(
      union(
        circle(128, 128, 40),
        ...Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          const [c, n] = [Math.cos(a), Math.sin(a)];
          return segment(128 + 58 * c, 128 + 58 * n, 128 + 80 * c, 128 + 80 * n, 8);
        })
      )
    ),
  book: (paint) =>
    paint(
      union(
        polygon([
          [52, 84],
          [122, 96],
          [122, 184],
          [52, 172],
        ]),
        polygon([
          [204, 84],
          [134, 96],
          [134, 184],
          [204, 172],
        ])
      )
    ),
  bolt: (paint) =>
    paint(
      polygon([
        [142, 44],
        [76, 140],
        [124, 140],
        [110, 212],
        [180, 110],
        [132, 110],
      ])
    ),
  leaf: (paint) => paint(subtract(ellipse(128, 120, 50, 78, 0.6), segment(96, 170, 160, 70, 4))),
  note: (paint) =>
    paint(
      union(
        ellipse(98, 178, 30, 22, -0.4),
        segment(124, 172, 124, 64, 8),
        polygon([
          [120, 56],
          [184, 76],
          [184, 104],
          [120, 86],
        ])
      )
    ),
  shield: (paint) => paint(subtract(circle(128, 128, 70), ring(circle(128, 128, 38), 6))),
};
