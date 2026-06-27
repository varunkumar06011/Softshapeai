# SoftShape Apps

Desktop and mobile apps for the SoftShape POS system. All apps share the same React web build and work fully offline.

## Structure

```
apps/
  cashier-desktop/     — Cashier desktop app (Tauri, Windows .exe)
    src-tauri/         — Rust source + Tauri config
    package.json       — Tauri CLI scripts
  admin-desktop/       — Admin desktop app (Tauri, Windows .exe)
    src-tauri/         — Rust source + Tauri config
    package.json       — Tauri CLI scripts
  cashier-android/     — Cashier Android app (Capacitor, .apk)
    android/           — Android project (manifest, plugin, resources)
    package.json       — Capacitor scripts
  admin-android/       — Admin Android app (Capacitor, .apk)
    android/           — Android project (manifest, plugin, resources)
    package.json       — Capacitor scripts
```

## Platforms

| App | Platform | Format | Install Method |
|-----|----------|--------|----------------|
| Cashier Desktop | Windows | `.exe` / `.msi` | Download + run installer |
| Admin Desktop | Windows | `.exe` / `.msi` | Download + run installer |
| Cashier Android | Android | `.apk` | Sideload (Settings → Install unknown apps) |
| Admin Android | Android | `.apk` | Sideload (Settings → Install unknown apps) |
| Cashier iPad | iOS | PWA | Safari → Share → Add to Home Screen |
| Admin iPad | iOS | PWA | Safari → Share → Add to Home Screen |
| Print Agent | Windows | `.exe` | Download + run installer |

## Prerequisites

### Desktop (Tauri)
- [Rust](https://rustup.rs/) (1.70+)
- [Tauri CLI prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)
- Windows: WebView2 Runtime (bundled via `embedBootstrapper`)

### Android (Capacitor)
- [Android Studio](https://developer.android.com/studio) with SDK 33+
- [Node.js](https://nodejs.org/) 18+
- Java 17 JDK

## Build

### Desktop (Windows .exe / .msi)

From the project root (`Softshapeai/`):

```bash
# Build the web app first (shared by both desktop apps)
npm run build

# Build cashier desktop (.exe / .msi)
npm run build:cashier-desktop

# Build admin desktop (.exe / .msi)
npm run build:admin-desktop
```

Output: `apps/cashier-desktop/src-tauri/target/release/bundle/` and `apps/admin-desktop/src-tauri/target/release/bundle/`

### Android (.apk)

```bash
# Build web app + sync to Android project
npm run build:cashier-android

# Open in Android Studio to build APK
npm run open:cashier-android

# Or build APK from command line (requires Android SDK)
npm run apk:cashier-android
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

### iPad (PWA — no build needed)

The web app is already a PWA. Users install it directly from Safari:
1. Open the app URL in Safari
2. Tap the Share button (square with arrow)
3. Select "Add to Home Screen"
4. Tap "Add"

The app works offline immediately after first load (service worker caches all assets).

## Development

### Desktop

```bash
# Start web dev server + Tauri cashier in dev mode
npm run dev:cashier-desktop

# Start web dev server + Tauri admin in dev mode
npm run dev:admin-desktop
```

### Android

```bash
# Start web dev server
npm run dev

# In another terminal, sync to Android and open in Android Studio
npm run open:cashier-android
```

## Features

### All apps
- Offline-first: works without internet connection
- IndexedDB sync engine queues actions and syncs when online
- Conflict resolution with per-action-type policies
- PWA service worker caches all assets for instant load

### Desktop (Tauri)
- Native ESC/POS printing via `print_raw` Tauri command (Windows Win32 API)
- Network printer support via `print_network` (TCP/IP, port 9100)
- Printer enumeration via `list_printers`
- App version query via `get_app_version`
- No print dialog — silent direct printing

### Android (Capacitor)
- ESC/POS print plugin (`EscposPrint`) with `printRaw`, `printNetwork`, `listPrinters`
- Bluetooth printer support (permissions: `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`)
- USB printer support (permissions: `USB_PERMISSION`, device filter for Epson/Star/Bixolon/Xprinter)
- Network state detection for offline/online transitions
- Haptics + status bar plugins

## Configuration

### Environment Variables

Set these in `.env` or `.env.local` before building:

```env
# Backend API URL (required)
VITE_API_URL=https://api.softshape.ai

# Download URLs for Admin → Settings → Download Apps
VITE_CASHIER_DESKTOP_DOWNLOAD_URL=https://github.com/.../SoftShape-Cashier-Setup.exe
VITE_CASHIER_ANDROID_DOWNLOAD_URL=https://github.com/.../SoftShape-Cashier.apk
VITE_ADMIN_DESKTOP_DOWNLOAD_URL=https://github.com/.../SoftShape-Admin-Setup.exe
VITE_ADMIN_ANDROID_DOWNLOAD_URL=https://github.com/.../SoftShape-Admin.apk
VITE_PRINT_AGENT_DOWNLOAD_URL=https://github.com/.../SoftShape-Print-Agent-Setup.exe
```

If a URL is not set, the download page shows "Contact support to enable this download."

### Tauri Config

Edit `apps/cashier-desktop/src-tauri/tauri.conf.json` or `apps/admin-desktop/src-tauri/tauri.conf.json`:
- `package.productName` — App display name
- `tauri.windows[0].title` — Window title
- `tauri.windows[0].width` / `height` — Default window size
- `bundle.identifier` — Unique app ID (reverse domain notation)

### Capacitor Config

Edit `capacitor.config.ts` in the project root:
- `appId` — Android package name (e.g., `ai.softshape.cashier`)
- `appName` — App display name
- `webDir` — Build output directory (default: `dist`)

## CI/CD

GitHub Actions workflows build all apps on release. See `.github/workflows/build-apps.yml`.

## Testing

```bash
# Run all unit + integration tests
npm test

# Run specific test file
npx vitest run src/utils/__tests__/offlineDB.test.js
```

Test coverage:
- `offlineDB.test.js` — IndexedDB CRUD operations (19 tests)
- `conflictResolver.test.js` — Conflict resolution policies (21 tests)
- `syncEngine.test.js` — Sync orchestration + backoff (12 tests)
- `offlineFlows.test.js` — End-to-end offline flows (11 tests)
- `syncInvariants.test.js` — Data merge invariants (5 tests)
