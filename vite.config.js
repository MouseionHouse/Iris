import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import topLevelAwait from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import buildConfig from './build.config';

// `vite build --mode mobile` (npm run build:mobile) produces the bundle the Capacitor Android
// wrapper embeds: config.mobile.json instead of config.json (mouseion.house only, hash router
// on — the wrapper serves the app from https://localhost/ with no server-side rewrites), and its
// own dist-mobile/ so a desktop build in dist/ is never clobbered. See mobile/WRAPPER-PLAN.md.
function copyFilesFor(mode) {
  return {
    targets: [
      {
        src: 'node_modules/@element-hq/element-call-embedded/dist/*',
        dest: 'public/element-call',
      },
      {
        src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
        dest: '',
        rename: 'pdf.worker.min.js',
      },
      {
        src: 'netlify.toml',
        dest: '',
      },
      {
        src: mode === 'mobile' ? 'config.mobile.json' : 'config.json',
        dest: '',
        rename: 'config.json',
      },
      {
        src: 'public/manifest.json',
        dest: '',
      },
      {
        src: 'public/res/android',
        dest: 'public/',
      },
      {
        src: 'public/locales',
        dest: 'public/',
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

export default defineConfig(({ mode }) => ({
  appType: 'spa',
  publicDir: false,
  // Capacitor serves the bundle from a fixed origin (https://localhost/), so its assets are
  // always at the root regardless of where the APK's WebView thinks the "page" is.
  base: mode === 'mobile' ? './' : buildConfig.base,
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
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`,
    }),
    viteStaticCopy(copyFilesFor(mode)),
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
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        // Enable esbuild polyfill plugins
        NodeGlobalsPolyfillPlugin({
          process: false,
          buffer: true,
        }),
      ],
    },
  },
  build: {
    outDir: mode === 'mobile' ? 'dist-mobile' : 'dist',
    sourcemap: true,
    copyPublicDir: false,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
    },
  },
}));
