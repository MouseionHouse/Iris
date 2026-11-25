import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import buildConfig from './build.config.ts';

// There is one build. The Capacitor Android wrapper embeds the same bundle with
// config.mobile.json in place of config.json (scripts/mobile-bundle.js, npm run build:mobile),
// so nothing here depends on the target. See mobile/README.md, "What it is".
// vite-plugin-static-copy keeps each file's path from the project root; `stripBase` drops that
// many leading directories (`true`: all of them) so the files land where the app looks for them.
function copyFiles() {
  return {
    targets: [
      {
        src: 'node_modules/@element-hq/element-call-embedded/dist/**/*',
        dest: 'public/element-call',
        rename: { stripBase: 4 },
      },
      {
        src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
        dest: '',
        rename: { stripBase: true, name: 'pdf.worker.min.js' },
      },
      {
        src: 'config.json',
        dest: '',
      },
      {
        src: 'public/manifest.json',
        dest: '',
        rename: { stripBase: true },
      },
      {
        src: 'public/res/android/**/*',
        dest: 'public/android',
        rename: { stripBase: 3 },
      },
      {
        src: 'public/locales/**/*',
        dest: 'public/locales',
        rename: { stripBase: 2 },
      },
    ],
  };
}

function serverMatrixSdkCryptoWasm(wasmFilePath) {
  return {
    name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === wasmFilePath) {
          const resolvedPath = path.join(
            path.resolve(),
            '/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm'
          );

          if (fs.existsSync(resolvedPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');

            const fileStream = fs.createReadStream(resolvedPath);
            fileStream.pipe(res);
          } else {
            res.writeHead(404);
            res.end('File not found');
          }
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  appType: 'spa',
  publicDir: false,
  // The Android wrapper serves the bundle from the root of https://localhost/ as well, so the
  // same base holds there.
  base: buildConfig.base,
  server: {
    port: 8080,
    host: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  plugins: [
    serverMatrixSdkCryptoWasm('/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm'),
    viteStaticCopy(copyFiles()),
    vanillaExtractPlugin(),
    wasm(),
    react(),
    VitePWA({
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  // matrix-js-sdk and its dependencies use Node's Buffer, and some read `global`. Rolldown supplies
  // both: in the dev server's dependency bundle and in the build.
  optimizeDeps: {
    rolldownOptions: {
      transform: {
        define: {
          global: 'globalThis',
        },
        inject: {
          Buffer: ['buffer', 'Buffer'],
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    copyPublicDir: false,
    // Top-level await (pdfjs, the crypto wasm) needs no transform: Vite's default target,
    // 'baseline-widely-available' (Chrome 111, Firefox 114, Safari 16.4), supports it.
    rolldownOptions: {
      transform: {
        inject: {
          Buffer: ['buffer', 'Buffer'],
        },
      },
    },
  },
});
