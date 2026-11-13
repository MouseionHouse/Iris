// The bundle the Android wrapper embeds (capacitor.config.ts webDir): the web build as it is,
// with config.mobile.json as its config.json (hash router on, since the wrapper serves the app
// from https://localhost/ with no server-side rewrites). The file in the repo is the public one,
// with the web's homeserver list; the household's CI writes its own over it before the build
// (the IRIS_CONFIG_MOBILE_JSON variable, .forgejo/workflows/build.yml).
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
const config = fs.readFileSync('config.mobile.json', 'utf8');
try {
  JSON.parse(config);
} catch (error) {
  console.error(`config.mobile.json is not JSON: ${error.message}`);
  process.exit(1);
}
fs.writeFileSync(path.join(to, 'config.json'), config);
console.log(`${to}: ${from} with config.mobile.json`);
