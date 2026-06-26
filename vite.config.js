import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const PRINT_AGENT_DOWNLOAD_URL = process.env.VITE_PRINT_AGENT_DOWNLOAD_URL;
if (!PRINT_AGENT_DOWNLOAD_URL) {
  throw new Error(
    'VITE_PRINT_AGENT_DOWNLOAD_URL is required. Set it to the URL of the SoftShape Print Agent installer (e.g., a GitHub release asset URL).'
  );
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    // Rolldown's minifier (Vite 8 default) has a known bug with framer-motion v12
    // ESM circular references — it produces incorrect initialization order, causing
    // "Cannot access 'X' before initialization" (TDZ) at runtime.
    // Using esbuild as the minifier is the stable workaround.
    minify: 'esbuild',
  },
})
