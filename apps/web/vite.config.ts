import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo name>/, and the path is case-sensitive.
const base = '/Tenfold/';

// Shown on the home screen so players can check everyone has the same version.
// Read through globalThis so this file needs no Node types (the app's config leaves them out).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const version = `${new Date().toISOString().slice(0, 10)} ${(env?.GITHUB_SHA ?? 'local').slice(0, 7)}`;

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      // The app decides when to reload: right away on the home screen, never mid-game.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tenfold',
        short_name: 'Tenfold',
        description: 'A ten-level rummy card game for family and friends.',
        theme_color: '#0c3a26',
        background_color: '#0c3a26',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell works offline (games against the computer need nothing else).
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
