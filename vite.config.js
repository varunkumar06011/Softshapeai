// ─────────────────────────────────────────────────────────────────────────────
// Vite Config — Frontend build configuration for the Softshape POS web app
// ─────────────────────────────────────────────────────────────────────────────
// Configures the Vite dev server and production build:
//   - React plugin with SWC for fast HMR
//   - TailwindCSS v4 via @tailwindcss/vite plugin
//   - PWA support via vite-plugin-pwa (service worker, offline caching)
//   - Multiple entry points: main (web), captain (Android bundle)
//   - Environment variable validation (VITE_PRINT_AGENT_DOWNLOAD_URL warning)
//   - Manual chunk splitting for vendor libraries (React, Framer Motion, etc.)
//   - Sourcemap generation for production debugging
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

const PRINT_AGENT_DOWNLOAD_URL = process.env.VITE_PRINT_AGENT_DOWNLOAD_URL;
if (!PRINT_AGENT_DOWNLOAD_URL) {
  console.warn(
    'VITE_PRINT_AGENT_DOWNLOAD_URL is not set. The print agent download link will be hidden until it is configured.'
  );
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // We handle registration manually in registerSW.js
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
      },
      manifest: {
        name: 'Softshape AI — POS',
        short_name: 'Softshape',
        description: 'Restaurant POS, Captain, and Admin dashboard (Offline-ready)',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFF5F5',
        theme_color: '#E53935',
        orientation: 'any',
        icons: [
          {
            src: '/favicon.ico',
            sizes: '192x192 512x512',
            type: 'image/x-icon',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: 'index.html',
        captain: 'captain.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/framer-motion')) return 'framer-motion';
        },
      },
    },
    // Rolldown's minifier (Vite 8 default) has a known bug with framer-motion v12
    // ESM circular references — it produces incorrect initialization order, causing
    // "Cannot access 'X' before initialization" (TDZ) at runtime.
    // Using esbuild as the minifier is the stable workaround.
    // Additionally, manualChunks isolates framer-motion into its own chunk so
    // its internal circular references cannot cause TDZ in the main bundle.
    minify: 'esbuild',
  },
})
