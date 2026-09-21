# Softshapeai — agent notes

## Verify changes

- `npm run build` — vite production build (also builds `dist/sw.js` + `captain.html`)
- `npm test` — vitest suite (offlineDB, conflictResolver, syncEngine, …)
- `npx eslint <file>` — lint; repo has pre-existing lint debt, don't fix unrelated errors

## Apps (see `apps/README.md`)

- `apps/admin-ios` — Capacitor 8 iOS app (SPM, no CocoaPods). `cap add ios`/`cap sync ios`
  work on Windows; `cap open ios`/archive require macOS. Xcode project is committed —
  regenerate web assets with `npx cap sync ios`, icons/splash with
  `npm run assets` (scripts/generate-assets.mjs, needs `sharp` devDep).
- `apps/*-android`, `apps/*-desktop` — same pattern (Capacitor / Tauri).

## Platform gating

- `Capacitor.getPlatform() === 'android'` is the check for Android-only native paths
  (OTA swap in `otaService.js`, APK update banner in `appUpdateService.js`,
  native Firebase phone auth in `lib/phoneAuth.js`, EscposPrint in `printOffline.js`).
- On iOS: phone OTP uses the web SDK (reCAPTCHA works in WKWebView), printing uses
  the Share sheet (`@capacitor/filesystem` + `@capacitor/share`), SW is skipped.
- `PortalSelectionWrapper` routes by bundle id: `ai.softshape.admin` → `/admin`.

## CI

- `.github/workflows/build-apps.yml` — `build-admin-ios` (macos-latest) produces
  signed `admin-ios.ipa`. Needs `IOS_DISTRIBUTION_CERT_P12`, `IOS_P12_PASSWORD`,
  `IOS_PROVISIONING_PROFILE` secrets; optional `APP_STORE_CONNECT_*` for upload.
