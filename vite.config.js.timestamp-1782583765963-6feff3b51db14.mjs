// vite.config.js
import { defineConfig } from "file:///C:/Users/akhil/Desktop/softshape%20ai/Softshapeai/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/akhil/Desktop/softshape%20ai/Softshapeai/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/akhil/Desktop/softshape%20ai/Softshapeai/node_modules/@tailwindcss/vite/dist/index.mjs";
import { VitePWA } from "file:///C:/Users/akhil/Desktop/softshape%20ai/Softshapeai/node_modules/vite-plugin-pwa/dist/index.js";

// package.json
var package_default = {
  name: "softshape-demo",
  private: true,
  version: "0.0.0",
  type: "module",
  scripts: {
    dev: "vite",
    build: "vite build",
    lint: "eslint .",
    preview: "vite preview",
    test: "vitest run",
    "build:cashier-desktop": "cd apps/cashier-desktop && npm run tauri:build",
    "dev:cashier-desktop": "cd apps/cashier-desktop && npm run tauri:dev",
    "build:admin-desktop": "cd apps/admin-desktop && npm run tauri:build",
    "dev:admin-desktop": "cd apps/admin-desktop && npm run tauri:dev",
    "build:cashier-android": "npx vite build && cd apps/cashier-android && npx cap sync android",
    "open:cashier-android": "cd apps/cashier-android && npx cap open android",
    "apk:cashier-android": "npx vite build && cd apps/cashier-android && npx cap sync android && npx cap build android --apk",
    "build:admin-android": "npx vite build && cd apps/admin-android && npx cap sync android",
    "open:admin-android": "cd apps/admin-android && npx cap open android",
    "apk:admin-android": "npx vite build && cd apps/admin-android && npx cap sync android && npx cap build android --apk",
    "build:captain-android": "npx vite build && cd apps/captain-android && npx cap sync android",
    "open:captain-android": "cd apps/captain-android && npx cap open android",
    "apk:captain-android": "npx vite build && cd apps/captain-android && npx cap sync android && npx cap build android --apk"
  },
  dependencies: {
    "@capacitor-firebase/authentication": "^8.3.0",
    "@capacitor/android": "^8.4.1",
    "@capacitor/app": "^8.1.0",
    "@capacitor/cli": "^8.4.1",
    "@capacitor/core": "^8.4.1",
    "@capacitor/haptics": "^8.0.2",
    "@capacitor/keyboard": "^8.0.5",
    "@capacitor/status-bar": "^8.0.2",
    "@sentry/react": "^10.61.0",
    "@tanstack/react-query": "^5.100.11",
    "file-saver": "^2.0.5",
    firebase: "^12.15.0",
    "framer-motion": "^12.40.0",
    jspdf: "^2.5.2",
    "jspdf-autotable": "^3.8.3",
    "lucide-react": "^1.14.0",
    papaparse: "^5.4.1",
    "qrcode.react": "^4.2.0",
    "qz-tray": "^2.2.6",
    react: "^19.2.5",
    "react-dom": "^19.2.5",
    "react-router-dom": "^7.15.0",
    recharts: "^3.8.1",
    "socket.io-client": "^4.8.3",
    typescript: "^6.0.3",
    xlsx: "^0.18.5"
  },
  devDependencies: {
    "@eslint/js": "^10.0.1",
    "@tailwindcss/vite": "^4.2.4",
    "@tauri-apps/cli": "^2.11.3",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    esbuild: "^0.28.0",
    eslint: "^10.2.1",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "fake-indexeddb": "^6.2.5",
    globals: "^17.5.0",
    tailwindcss: "^4.2.4",
    vite: "^8.0.10",
    "vite-plugin-pwa": "^1.3.0",
    vitest: "^2.1.0"
  }
};

// vite.config.js
var PRINT_AGENT_DOWNLOAD_URL = process.env.VITE_PRINT_AGENT_DOWNLOAD_URL;
if (!PRINT_AGENT_DOWNLOAD_URL) {
  console.warn(
    "VITE_PRINT_AGENT_DOWNLOAD_URL is not set. The print agent download link will be hidden until it is configured."
  );
}
var vite_config_default = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(package_default.version)
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      // We handle registration manually in registerSW.js
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
        // 5MB
      },
      manifest: {
        name: "Softshape AI \u2014 POS",
        short_name: "Softshape",
        description: "Restaurant POS, Captain, and Admin dashboard (Offline-ready)",
        start_url: "/",
        display: "standalone",
        background_color: "#FFF5F5",
        theme_color: "#E53935",
        orientation: "any",
        icons: [
          {
            src: "/favicon.ico",
            sizes: "192x192 512x512",
            type: "image/x-icon",
            purpose: "any maskable"
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: "module"
      }
    })
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 3e3,
    rollupOptions: {
      input: {
        main: "index.html",
        captain: "captain.html"
      }
    },
    // Rolldown's minifier (Vite 8 default) has a known bug with framer-motion v12
    // ESM circular references — it produces incorrect initialization order, causing
    // "Cannot access 'X' before initialization" (TDZ) at runtime.
    // Using esbuild as the minifier is the stable workaround.
    minify: "esbuild"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiLCAicGFja2FnZS5qc29uIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcYWtoaWxcXFxcRGVza3RvcFxcXFxzb2Z0c2hhcGUgYWlcXFxcU29mdHNoYXBlYWlcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGFraGlsXFxcXERlc2t0b3BcXFxcc29mdHNoYXBlIGFpXFxcXFNvZnRzaGFwZWFpXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9ha2hpbC9EZXNrdG9wL3NvZnRzaGFwZSUyMGFpL1NvZnRzaGFwZWFpL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xyXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnXHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnXHJcbmltcG9ydCBwa2cgZnJvbSAnLi9wYWNrYWdlLmpzb24nIHdpdGggeyB0eXBlOiAnanNvbicgfVxyXG5cclxuY29uc3QgUFJJTlRfQUdFTlRfRE9XTkxPQURfVVJMID0gcHJvY2Vzcy5lbnYuVklURV9QUklOVF9BR0VOVF9ET1dOTE9BRF9VUkw7XHJcbmlmICghUFJJTlRfQUdFTlRfRE9XTkxPQURfVVJMKSB7XHJcbiAgY29uc29sZS53YXJuKFxyXG4gICAgJ1ZJVEVfUFJJTlRfQUdFTlRfRE9XTkxPQURfVVJMIGlzIG5vdCBzZXQuIFRoZSBwcmludCBhZ2VudCBkb3dubG9hZCBsaW5rIHdpbGwgYmUgaGlkZGVuIHVudGlsIGl0IGlzIGNvbmZpZ3VyZWQuJ1xyXG4gICk7XHJcbn1cclxuXHJcbi8vIGh0dHBzOi8vdml0ZS5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIGRlZmluZToge1xyXG4gICAgX19BUFBfVkVSU0lPTl9fOiBKU09OLnN0cmluZ2lmeShwa2cudmVyc2lvbiksXHJcbiAgfSxcclxuICBwbHVnaW5zOiBbXHJcbiAgICByZWFjdCgpLFxyXG4gICAgdGFpbHdpbmRjc3MoKSxcclxuICAgIFZpdGVQV0Eoe1xyXG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcclxuICAgICAgaW5qZWN0UmVnaXN0ZXI6IGZhbHNlLCAvLyBXZSBoYW5kbGUgcmVnaXN0cmF0aW9uIG1hbnVhbGx5IGluIHJlZ2lzdGVyU1cuanNcclxuICAgICAgc3RyYXRlZ2llczogJ2luamVjdE1hbmlmZXN0JyxcclxuICAgICAgc3JjRGlyOiAnc3JjJyxcclxuICAgICAgZmlsZW5hbWU6ICdzdy5qcycsXHJcbiAgICAgIGluamVjdE1hbmlmZXN0OiB7XHJcbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYyfSddLFxyXG4gICAgICAgIG1heGltdW1GaWxlU2l6ZVRvQ2FjaGVJbkJ5dGVzOiA1ICogMTAyNCAqIDEwMjQsIC8vIDVNQlxyXG4gICAgICB9LFxyXG4gICAgICBtYW5pZmVzdDoge1xyXG4gICAgICAgIG5hbWU6ICdTb2Z0c2hhcGUgQUkgXHUyMDE0IFBPUycsXHJcbiAgICAgICAgc2hvcnRfbmFtZTogJ1NvZnRzaGFwZScsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdSZXN0YXVyYW50IFBPUywgQ2FwdGFpbiwgYW5kIEFkbWluIGRhc2hib2FyZCAoT2ZmbGluZS1yZWFkeSknLFxyXG4gICAgICAgIHN0YXJ0X3VybDogJy8nLFxyXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcclxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnI0ZGRjVGNScsXHJcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjRTUzOTM1JyxcclxuICAgICAgICBvcmllbnRhdGlvbjogJ2FueScsXHJcbiAgICAgICAgaWNvbnM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiAnL2Zhdmljb24uaWNvJyxcclxuICAgICAgICAgICAgc2l6ZXM6ICcxOTJ4MTkyIDUxMng1MTInLFxyXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UveC1pY29uJyxcclxuICAgICAgICAgICAgcHVycG9zZTogJ2FueSBtYXNrYWJsZScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICAgIGRldk9wdGlvbnM6IHtcclxuICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgIHR5cGU6ICdtb2R1bGUnLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgXSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHByb3h5OiB7XHJcbiAgICAgICcvYXBpJzoge1xyXG4gICAgICAgIHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXHJcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICAgIHNlY3VyZTogZmFsc2VcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogMzAwMCxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgaW5wdXQ6IHtcclxuICAgICAgICBtYWluOiAnaW5kZXguaHRtbCcsXHJcbiAgICAgICAgY2FwdGFpbjogJ2NhcHRhaW4uaHRtbCcsXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgLy8gUm9sbGRvd24ncyBtaW5pZmllciAoVml0ZSA4IGRlZmF1bHQpIGhhcyBhIGtub3duIGJ1ZyB3aXRoIGZyYW1lci1tb3Rpb24gdjEyXHJcbiAgICAvLyBFU00gY2lyY3VsYXIgcmVmZXJlbmNlcyBcdTIwMTQgaXQgcHJvZHVjZXMgaW5jb3JyZWN0IGluaXRpYWxpemF0aW9uIG9yZGVyLCBjYXVzaW5nXHJcbiAgICAvLyBcIkNhbm5vdCBhY2Nlc3MgJ1gnIGJlZm9yZSBpbml0aWFsaXphdGlvblwiIChURFopIGF0IHJ1bnRpbWUuXHJcbiAgICAvLyBVc2luZyBlc2J1aWxkIGFzIHRoZSBtaW5pZmllciBpcyB0aGUgc3RhYmxlIHdvcmthcm91bmQuXHJcbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcclxuICB9LFxyXG59KVxyXG4iLCAie1xyXG4gIFwibmFtZVwiOiBcInNvZnRzaGFwZS1kZW1vXCIsXHJcbiAgXCJwcml2YXRlXCI6IHRydWUsXHJcbiAgXCJ2ZXJzaW9uXCI6IFwiMC4wLjBcIixcclxuICBcInR5cGVcIjogXCJtb2R1bGVcIixcclxuICBcInNjcmlwdHNcIjoge1xyXG4gICAgXCJkZXZcIjogXCJ2aXRlXCIsXHJcbiAgICBcImJ1aWxkXCI6IFwidml0ZSBidWlsZFwiLFxyXG4gICAgXCJsaW50XCI6IFwiZXNsaW50IC5cIixcclxuICAgIFwicHJldmlld1wiOiBcInZpdGUgcHJldmlld1wiLFxyXG4gICAgXCJ0ZXN0XCI6IFwidml0ZXN0IHJ1blwiLFxyXG4gICAgXCJidWlsZDpjYXNoaWVyLWRlc2t0b3BcIjogXCJjZCBhcHBzL2Nhc2hpZXItZGVza3RvcCAmJiBucG0gcnVuIHRhdXJpOmJ1aWxkXCIsXHJcbiAgICBcImRldjpjYXNoaWVyLWRlc2t0b3BcIjogXCJjZCBhcHBzL2Nhc2hpZXItZGVza3RvcCAmJiBucG0gcnVuIHRhdXJpOmRldlwiLFxyXG4gICAgXCJidWlsZDphZG1pbi1kZXNrdG9wXCI6IFwiY2QgYXBwcy9hZG1pbi1kZXNrdG9wICYmIG5wbSBydW4gdGF1cmk6YnVpbGRcIixcclxuICAgIFwiZGV2OmFkbWluLWRlc2t0b3BcIjogXCJjZCBhcHBzL2FkbWluLWRlc2t0b3AgJiYgbnBtIHJ1biB0YXVyaTpkZXZcIixcclxuICAgIFwiYnVpbGQ6Y2FzaGllci1hbmRyb2lkXCI6IFwibnB4IHZpdGUgYnVpbGQgJiYgY2QgYXBwcy9jYXNoaWVyLWFuZHJvaWQgJiYgbnB4IGNhcCBzeW5jIGFuZHJvaWRcIixcclxuICAgIFwib3BlbjpjYXNoaWVyLWFuZHJvaWRcIjogXCJjZCBhcHBzL2Nhc2hpZXItYW5kcm9pZCAmJiBucHggY2FwIG9wZW4gYW5kcm9pZFwiLFxyXG4gICAgXCJhcGs6Y2FzaGllci1hbmRyb2lkXCI6IFwibnB4IHZpdGUgYnVpbGQgJiYgY2QgYXBwcy9jYXNoaWVyLWFuZHJvaWQgJiYgbnB4IGNhcCBzeW5jIGFuZHJvaWQgJiYgbnB4IGNhcCBidWlsZCBhbmRyb2lkIC0tYXBrXCIsXHJcbiAgICBcImJ1aWxkOmFkbWluLWFuZHJvaWRcIjogXCJucHggdml0ZSBidWlsZCAmJiBjZCBhcHBzL2FkbWluLWFuZHJvaWQgJiYgbnB4IGNhcCBzeW5jIGFuZHJvaWRcIixcclxuICAgIFwib3BlbjphZG1pbi1hbmRyb2lkXCI6IFwiY2QgYXBwcy9hZG1pbi1hbmRyb2lkICYmIG5weCBjYXAgb3BlbiBhbmRyb2lkXCIsXHJcbiAgICBcImFwazphZG1pbi1hbmRyb2lkXCI6IFwibnB4IHZpdGUgYnVpbGQgJiYgY2QgYXBwcy9hZG1pbi1hbmRyb2lkICYmIG5weCBjYXAgc3luYyBhbmRyb2lkICYmIG5weCBjYXAgYnVpbGQgYW5kcm9pZCAtLWFwa1wiLFxyXG4gICAgXCJidWlsZDpjYXB0YWluLWFuZHJvaWRcIjogXCJucHggdml0ZSBidWlsZCAmJiBjZCBhcHBzL2NhcHRhaW4tYW5kcm9pZCAmJiBucHggY2FwIHN5bmMgYW5kcm9pZFwiLFxyXG4gICAgXCJvcGVuOmNhcHRhaW4tYW5kcm9pZFwiOiBcImNkIGFwcHMvY2FwdGFpbi1hbmRyb2lkICYmIG5weCBjYXAgb3BlbiBhbmRyb2lkXCIsXHJcbiAgICBcImFwazpjYXB0YWluLWFuZHJvaWRcIjogXCJucHggdml0ZSBidWlsZCAmJiBjZCBhcHBzL2NhcHRhaW4tYW5kcm9pZCAmJiBucHggY2FwIHN5bmMgYW5kcm9pZCAmJiBucHggY2FwIGJ1aWxkIGFuZHJvaWQgLS1hcGtcIlxyXG4gIH0sXHJcbiAgXCJkZXBlbmRlbmNpZXNcIjoge1xyXG4gICAgXCJAY2FwYWNpdG9yLWZpcmViYXNlL2F1dGhlbnRpY2F0aW9uXCI6IFwiXjguMy4wXCIsXHJcbiAgICBcIkBjYXBhY2l0b3IvYW5kcm9pZFwiOiBcIl44LjQuMVwiLFxyXG4gICAgXCJAY2FwYWNpdG9yL2FwcFwiOiBcIl44LjEuMFwiLFxyXG4gICAgXCJAY2FwYWNpdG9yL2NsaVwiOiBcIl44LjQuMVwiLFxyXG4gICAgXCJAY2FwYWNpdG9yL2NvcmVcIjogXCJeOC40LjFcIixcclxuICAgIFwiQGNhcGFjaXRvci9oYXB0aWNzXCI6IFwiXjguMC4yXCIsXHJcbiAgICBcIkBjYXBhY2l0b3Iva2V5Ym9hcmRcIjogXCJeOC4wLjVcIixcclxuICAgIFwiQGNhcGFjaXRvci9zdGF0dXMtYmFyXCI6IFwiXjguMC4yXCIsXHJcbiAgICBcIkBzZW50cnkvcmVhY3RcIjogXCJeMTAuNjEuMFwiLFxyXG4gICAgXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIjogXCJeNS4xMDAuMTFcIixcclxuICAgIFwiZmlsZS1zYXZlclwiOiBcIl4yLjAuNVwiLFxyXG4gICAgXCJmaXJlYmFzZVwiOiBcIl4xMi4xNS4wXCIsXHJcbiAgICBcImZyYW1lci1tb3Rpb25cIjogXCJeMTIuNDAuMFwiLFxyXG4gICAgXCJqc3BkZlwiOiBcIl4yLjUuMlwiLFxyXG4gICAgXCJqc3BkZi1hdXRvdGFibGVcIjogXCJeMy44LjNcIixcclxuICAgIFwibHVjaWRlLXJlYWN0XCI6IFwiXjEuMTQuMFwiLFxyXG4gICAgXCJwYXBhcGFyc2VcIjogXCJeNS40LjFcIixcclxuICAgIFwicXJjb2RlLnJlYWN0XCI6IFwiXjQuMi4wXCIsXHJcbiAgICBcInF6LXRyYXlcIjogXCJeMi4yLjZcIixcclxuICAgIFwicmVhY3RcIjogXCJeMTkuMi41XCIsXHJcbiAgICBcInJlYWN0LWRvbVwiOiBcIl4xOS4yLjVcIixcclxuICAgIFwicmVhY3Qtcm91dGVyLWRvbVwiOiBcIl43LjE1LjBcIixcclxuICAgIFwicmVjaGFydHNcIjogXCJeMy44LjFcIixcclxuICAgIFwic29ja2V0LmlvLWNsaWVudFwiOiBcIl40LjguM1wiLFxyXG4gICAgXCJ0eXBlc2NyaXB0XCI6IFwiXjYuMC4zXCIsXHJcbiAgICBcInhsc3hcIjogXCJeMC4xOC41XCJcclxuICB9LFxyXG4gIFwiZGV2RGVwZW5kZW5jaWVzXCI6IHtcclxuICAgIFwiQGVzbGludC9qc1wiOiBcIl4xMC4wLjFcIixcclxuICAgIFwiQHRhaWx3aW5kY3NzL3ZpdGVcIjogXCJeNC4yLjRcIixcclxuICAgIFwiQHRhdXJpLWFwcHMvY2xpXCI6IFwiXjIuMTEuM1wiLFxyXG4gICAgXCJAdHlwZXMvcmVhY3RcIjogXCJeMTkuMi4xNFwiLFxyXG4gICAgXCJAdHlwZXMvcmVhY3QtZG9tXCI6IFwiXjE5LjIuM1wiLFxyXG4gICAgXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiOiBcIl42LjAuMVwiLFxyXG4gICAgXCJlc2J1aWxkXCI6IFwiXjAuMjguMFwiLFxyXG4gICAgXCJlc2xpbnRcIjogXCJeMTAuMi4xXCIsXHJcbiAgICBcImVzbGludC1wbHVnaW4tcmVhY3QtaG9va3NcIjogXCJeNy4xLjFcIixcclxuICAgIFwiZXNsaW50LXBsdWdpbi1yZWFjdC1yZWZyZXNoXCI6IFwiXjAuNS4yXCIsXHJcbiAgICBcImZha2UtaW5kZXhlZGRiXCI6IFwiXjYuMi41XCIsXHJcbiAgICBcImdsb2JhbHNcIjogXCJeMTcuNS4wXCIsXHJcbiAgICBcInRhaWx3aW5kY3NzXCI6IFwiXjQuMi40XCIsXHJcbiAgICBcInZpdGVcIjogXCJeOC4wLjEwXCIsXHJcbiAgICBcInZpdGUtcGx1Z2luLXB3YVwiOiBcIl4xLjMuMFwiLFxyXG4gICAgXCJ2aXRlc3RcIjogXCJeMi4xLjBcIlxyXG4gIH1cclxufVxyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTZVLFNBQVMs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
