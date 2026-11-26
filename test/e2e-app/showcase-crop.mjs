// The README's small feature pictures: each desktop picture cropped to the part of the window that
// shows its feature, so the feature's own text can still be read at the size the README shows it.
// Cuts the pictures ./showcase-capture.mjs took, light and dark with the same box, at their full
// device scale factor of 2. See ./README.md.
//
//   node test/e2e-app/showcase-crop.mjs <playwright-core dir> <shots dir>
//
// Reads <shots dir>/<picture>-<theme>.png and writes <shots dir>/<picture>-crop-<theme>.png.
// CHROME, if set, is the browser to run.
import fs from 'node:fs';
import path from 'node:path';

const [pwDir, shots] = process.argv.slice(2);
if (!pwDir || !shots) {
  console.error('usage: node test/e2e-app/showcase-crop.mjs <playwright-core dir> <shots dir>');
  process.exit(2);
}
const { chromium } = await import(path.join(path.resolve(pwDir), 'index.mjs'));

// Boxes in CSS pixels of the 1440×900 window (the picture has twice as many device pixels).
const BOXES = {
  // The three scheduled messages open above the composer, with the composer.
  'desktop-scheduled': { x: 330, y: 598, width: 480, height: 282 },
  // The composer holding the draft, under the last messages of the chat with Patroclus.
  'desktop-draft': { x: 330, y: 598, width: 480, height: 282 },
  // The image editor, edge to edge.
  'desktop-image-editor': { x: 108, y: 45, width: 1224, height: 810 },
  // The sticker board with its pack, and the composer below it with the button that opened it.
  // The right edge stops at the board's, short of the cut-off times behind it.
  'desktop-stickers': { x: 896, y: 352, width: 508, height: 526 },
};

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {}
);
const tab = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } });
for (const [picture, box] of Object.entries(BOXES)) {
  for (const theme of ['light', 'dark']) {
    const src = path.join(shots, `${picture}-${theme}.png`);
    await tab.setContent(
      `<!doctype html><html><head><style>html, body { margin: 0; } img { display: block; width: 1440px; height: 900px; }</style></head><body><img src="${dataUrl(
        src
      )}"></body></html>`
    );
    await tab.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
    const png = await tab.screenshot({ clip: box });
    const file = path.join(shots, `${picture}-crop-${theme}.png`);
    fs.writeFileSync(file, png);
    console.log(`${file}  ${box.width}×${box.height} at ${box.x},${box.y}`);
  }
}
await browser.close();
