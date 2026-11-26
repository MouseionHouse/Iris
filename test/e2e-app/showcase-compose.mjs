// The README's main picture: the desktop overview with the phone Home in front of it, made from the
// pictures ./showcase-capture.mjs took. Lays both out on an HTML page and screenshots it at a
// device scale factor of 2, once per theme, on a transparent background that suits GitHub's
// light (white) and dark (#0d1117) pages alike. See ./README.md.
//
//   node test/e2e-app/showcase-compose.mjs <playwright-core dir> <shots dir> <a|b|c|all> [--main]
//
// Reads <shots dir>/desktop-overview-<theme>.png and phone-home-<theme>.png, and writes
// <shots dir>/hero-<variant>-<theme>.png. With --main, the one variant is also written as
// hero-<theme>.png, the names the README uses. CHROME, if set, is the browser to run.
//
// The variants, where the phone stands:
//   a  in front of the desktop's lower-right corner, sticking out past its right and bottom edges
//   b  beside the desktop on the right, a narrow gap between them, tops level
//   c  as a, on a soft iris-coloured card that holds both, with the phone wholly on the card
// In each, the phone covers only the conversation's right-hand side (times, the composer's end):
// never the room list or the picnic picture.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const main = args.includes('--main');
const [pwDir, shots, which] = args.filter((a) => a !== '--main');
const VARIANTS = ['a', 'b', 'c'];
if (!pwDir || !shots || !(which === 'all' || VARIANTS.includes(which))) {
  console.error(
    'usage: node test/e2e-app/showcase-compose.mjs <playwright-core dir> <shots dir> <a|b|c|all> [--main]'
  );
  process.exit(2);
}
if (main && which === 'all') {
  console.error('--main takes one variant, not all');
  process.exit(2);
}
const { chromium } = await import(path.join(path.resolve(pwDir), 'index.mjs'));

// Sizes in CSS pixels; the picture is twice as many device pixels. The desktop picture is
// 1440×900, the phone 390×844.
const DESKTOP_RATIO = 900 / 1440;
const PHONE_RATIO = 844 / 390;
const BEZEL = 7;

/** Where each piece goes: the canvas, the desktop's box and the phone's screen box. */
const layout = (variant) => {
  const pad = 28; // room for the shadows
  if (variant === 'a') {
    const dw = 780;
    const dh = dw * DESKTOP_RATIO;
    const ph = 400;
    const pw = ph / PHONE_RATIO;
    const width = 900;
    const height = Math.round(pad + dh + 64 + pad);
    return {
      width,
      height,
      desktop: { left: pad, top: pad, width: dw },
      phone: { left: width - pad - pw - 2 * BEZEL, top: height - pad - ph - 2 * BEZEL, width: pw },
    };
  }
  if (variant === 'b') {
    const dw = 640;
    const dh = dw * DESKTOP_RATIO;
    const ph = dh - 2 * BEZEL;
    const pw = ph / PHONE_RATIO;
    const overlap = -16; // a gap: overlapping would cover the times at the timeline's right edge
    const width = Math.round(pad + dw - overlap + pw + 2 * BEZEL + pad);
    return {
      width,
      height: Math.round(pad + dh + pad),
      desktop: { left: pad, top: pad, width: dw },
      phone: { left: pad + dw - overlap, top: pad, width: pw },
    };
  }
  // c: a card behind both
  const card = 26;
  const dw = 740;
  const dh = dw * DESKTOP_RATIO;
  const ph = 420;
  const pw = ph / PHONE_RATIO;
  const width = 900;
  const height = Math.round(pad + card + dh + 70 + card + pad);
  return {
    width,
    height,
    card: { left: pad, top: pad, right: pad, bottom: pad },
    desktop: { left: pad + card, top: pad + card, width: dw },
    phone: {
      left: width - pad - card - pw - 2 * BEZEL,
      top: height - pad - card - ph - 2 * BEZEL,
      width: pw,
    },
  };
};

const STYLE = {
  light: {
    edge: 'rgba(15, 18, 26, 0.14)',
    shadow: '0 2px 6px rgba(15, 18, 26, 0.10), 0 14px 36px rgba(15, 18, 26, 0.16)',
    phoneBody: '#f2f1f5',
    phoneEdge: 'rgba(15, 18, 26, 0.22)',
    card: 'linear-gradient(135deg, #efe9fb 0%, #e6dcf8 55%, #f6e9f1 100%)',
    cardEdge: 'rgba(110, 72, 190, 0.16)',
  },
  dark: {
    edge: 'rgba(240, 242, 255, 0.16)',
    shadow: '0 2px 6px rgba(0, 0, 0, 0.45), 0 14px 36px rgba(0, 0, 0, 0.55)',
    phoneBody: '#2b2d35',
    phoneEdge: 'rgba(240, 242, 255, 0.20)',
    card: 'linear-gradient(135deg, #241d38 0%, #2c2147 55%, #2a1f33 100%)',
    cardEdge: 'rgba(180, 150, 255, 0.18)',
  },
};

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

const page = (variant, theme) => {
  const l = layout(variant);
  const s = STYLE[theme];
  const desktop = dataUrl(path.join(shots, `desktop-overview-${theme}.png`));
  const phone = dataUrl(path.join(shots, `phone-home-${theme}.png`));
  const card = l.card
    ? `<div style="position:absolute;left:${l.card.left}px;top:${l.card.top}px;right:${l.card.right}px;bottom:${l.card.bottom}px;border-radius:28px;background:${s.card};box-shadow:inset 0 0 0 1px ${s.cardEdge}"></div>`
    : '';
  return `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    #canvas { position: relative; width: ${l.width}px; height: ${l.height}px; }
    img { display: block; width: 100%; height: auto; }
    .desktop { position: absolute; border-radius: 12px; overflow: hidden;
      box-shadow: 0 0 0 1px ${s.edge}, ${s.shadow}; }
    .phone { position: absolute; padding: ${BEZEL}px; border-radius: 30px; background: ${
    s.phoneBody
  };
      box-shadow: 0 0 0 1px ${s.phoneEdge}, ${s.shadow}; }
    .phone .screen { border-radius: ${30 - BEZEL}px; overflow: hidden; box-shadow: 0 0 0 1px ${
    s.edge
  }; }
  </style></head><body><div id="canvas">
    ${card}
    <div class="desktop" style="left:${l.desktop.left}px;top:${l.desktop.top}px;width:${
    l.desktop.width
  }px"><img src="${desktop}"></div>
    <div class="phone" style="left:${l.phone.left}px;top:${l.phone.top}px;width:${
    l.phone.width
  }px"><div class="screen"><img src="${phone}"></div></div>
  </div></body></html>`;
};

const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {}
);
const tab = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } });
for (const variant of which === 'all' ? VARIANTS : [which]) {
  for (const theme of ['light', 'dark']) {
    await tab.setContent(page(variant, theme));
    await tab.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
    const files = [path.join(shots, `hero-${variant}-${theme}.png`)];
    if (main) files.push(path.join(shots, `hero-${theme}.png`));
    const png = await tab.locator('#canvas').screenshot({ omitBackground: true });
    for (const file of files) {
      fs.writeFileSync(file, png);
      console.log(`${file}  ${(png.length / 1024 / 1024).toFixed(2)} MB`);
    }
  }
}
await browser.close();
