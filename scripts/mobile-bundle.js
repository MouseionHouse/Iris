// The bundle the Android wrapper embeds (capacitor.config.ts webDir): the web build as it is,
// with config.mobile.json as its config.json (mouseion.house only, hash router on, since the
// wrapper serves the app from https://localhost/ with no server-side rewrites).
//
// Usage: node scripts/mobile-bundle.js [web bundle = dist] [mobile bundle = dist-mobile]
import fs from 'fs';
import path from 'path';

const [from = 'dist', to = 'dist-mobile'] = process.argv.slice(2);

if (!fs.existsSync(path.join(from, 'index.html'))) {
  console.error(`No web bundle in ${from}: run "npm run build" first.`);
  process.exit(1);
}

fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
fs.copyFileSync('config.mobile.json', path.join(to, 'config.json'));
console.log(`${to}: ${from} with config.mobile.json`);
