import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps the app working under any path (e.g. GitHub Pages /MattoSkritter/,
// and PR previews under /MattoSkritter/pr-preview/pr-N/).
// PR previews are built with `--mode pr-preview` and get no service worker, so they never
// cache themselves or interfere with the installed app.
export default defineConfig(({ mode }) => ({
  base: './',
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
