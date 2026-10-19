import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import pkg from './package.json';

function commit(): string {
  const env = process.env.VERCEL_GIT_COMMIT_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim();
  } catch {
    return '';
  }
}


export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by hand in main.ts: pages are network-first, so a new worker
      // taking over never needs to reload a page that is already current.
      injectRegister: false,
      includeAssets: ['favicon.ico', 'icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Shores of Fortune',
        short_name: 'Fortune',
        description: 'Sail, explore and battle across a sun-drenched pirate archipelago.',
        theme_color: '#0b3a4a',
        background_color: '#0b2a3a',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/*-latin-ext-*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Never answer a page load from the precache first: that is what made a
        // plain refresh show an old build. Fetch the page fresh, and fall back to
        // the last copy (or the precached shell) only when offline or too slow.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 4 },
              precacheFallback: { fallbackURL: 'index.html' },
            },
          },
        ],
      },
    }),
  ],
});
