import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Version shown on the home screen: build number (GitHub Actions run number), commit and build time.
function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'local';
  }
}
const APP_VERSION = {
  build: process.env.GITHUB_RUN_NUMBER ?? 'dev',
  sha: (process.env.GITHUB_SHA ?? gitSha()).slice(0, 7),
  date: new Date().toISOString(),
};

// base './' keeps the app working under any path (e.g. GitHub Pages /MattoSkritter/,
// and PR previews under /MattoSkritter/pr-preview/pr-N/).
// PR previews are built with `--mode pr-preview` and get no service worker, so they never
// cache themselves or interfere with the installed app.
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'pr-preview',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MattoSkritter',
        short_name: 'MattoSkritter',
        description: 'Learn to write Mandarin characters',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111318',
        theme_color: '#111318',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['data/**'],
        // pr-preview/: let PR previews load from the network instead of the live app's shell
        navigateFallbackDenylist: [/\/data\//, /\/pr-preview\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/') && !url.pathname.includes('/pr-preview/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mattoskritter-data',
              expiration: { maxEntries: 12000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
}));
