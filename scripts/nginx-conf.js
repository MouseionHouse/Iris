// Renders docker-nginx.conf for the image (Dockerfile) from the hub settings the web build gets too
// (src/app/hub/hubBridge.ts): HUB_ORIGINS, a space-separated list of origins that may frame the
// client, and HUB_PREVIEW_PATTERN, one optional regular expression for the hub's pull-request
// previews. With neither, the client may be framed by itself only.
//
// Usage: HUB_ORIGINS=... HUB_PREVIEW_PATTERN=... node scripts/nginx-conf.js [template] [output]
import fs from 'fs';

const [from = 'docker-nginx.conf', to = 'nginx.conf'] = process.argv.slice(2);

const fail = (message) => {
  console.error(`${from}: ${message}`);
  process.exit(1);
};

const origins = (process.env.HUB_ORIGINS ?? '').split(/\s+/).filter((origin) => origin.length > 0);
const pattern = (process.env.HUB_PREVIEW_PATTERN ?? '').trim();

origins.forEach((origin) => {
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/.test(origin)) {
    fail(`HUB_ORIGINS: "${origin}" is not an origin (scheme and host, no path)`);
  }
});
if (pattern) {
  if (/[\s";]/.test(pattern)) fail('HUB_PREVIEW_PATTERN: no spaces, quotes or semicolons');
  try {
    RegExp(pattern);
  } catch (error) {
    fail(`HUB_PREVIEW_PATTERN: ${error.message}`);
  }
}

const ancestors = [...origins, ...(pattern ? ['$hub_preview_origin'] : [])];
const values = {
  HUB_FRAME_ANCESTORS: ancestors.map((source) => ` ${source}`).join(''),
  HUB_PREVIEW_MAP: pattern ? `"~^(?<origin>${pattern})(/|$)" $origin;` : '',
};

const template = fs.readFileSync(from, 'utf8');
const conf = template.replace(/@([A-Z_]+)@/g, (placeholder, name) => {
  if (!(name in values)) fail(`unknown placeholder ${placeholder}`);
  return values[name];
});
fs.writeFileSync(to, conf);
console.log(`${to}: frame-ancestors 'self'${values.HUB_FRAME_ANCESTORS}`);
