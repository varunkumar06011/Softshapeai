// ─────────────────────────────────────────────────────────────────────────────
// generate-assets.mjs — Generate iOS app icon + launch screen images
// ─────────────────────────────────────────────────────────────────────────────
// Produces the images consumed by the generated Xcode project:
//   - ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
//       1024x1024 opaque app icon (App Store rejects icons with alpha channels,
//       so the source logo is flattened onto the brand red)
//   - ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732{,-1,-2}.png
//       2732x2732 launch image — brand background with centered logo tile.
//       The LaunchScreen storyboard draws this image full-bleed
//       (scaleAspectFill), so the canvas itself is the launch screen.
//
// Source: ../../public/logo-square.png (1080x1080 full-bleed brand tile).
// Run from the app dir:  node scripts/generate-assets.mjs   (requires sharp)
// ─────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoPath = path.resolve(appDir, '../../public/logo-square.png');

const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;
const SPLASH_LOGO_WIDTH = 820; // centered logo tile width on the launch image
const BRAND_RED = '#E53935';
const LAUNCH_BG = '#FFF5F5';

const iconOut = path.join(appDir, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const splashOut = path.join(appDir, 'ios/App/App/Assets.xcassets/Splash.imageset');
await mkdir(iconOut, { recursive: true });
await mkdir(splashOut, { recursive: true });

// ── App icon: flatten onto brand red (opaque), resize to 1024 ────────────────
await sharp(logoPath)
  .flatten({ background: BRAND_RED })
  .resize(ICON_SIZE, ICON_SIZE)
  .png()
  .toFile(path.join(iconOut, 'AppIcon-512@2x.png'));
console.log('wrote', path.join(iconOut, 'AppIcon-512@2x.png'));

// ── Launch image: brand background, centered logo tile ───────────────────────
const logo = await sharp(logoPath)
  .flatten({ background: BRAND_RED })
  .resize(SPLASH_LOGO_WIDTH, SPLASH_LOGO_WIDTH)
  .png()
  .toBuffer();

const centered = {
  input: logo,
  left: Math.round((SPLASH_SIZE - SPLASH_LOGO_WIDTH) / 2),
  top: Math.round((SPLASH_SIZE - SPLASH_LOGO_WIDTH) / 2),
};

const splash = await sharp({
  create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 3, background: LAUNCH_BG },
})
  .composite([centered])
  .png()
  .toBuffer();

for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const dest = path.join(splashOut, name);
  await sharp(splash).toFile(dest);
  console.log('wrote', dest);
}

console.log('Done — iOS assets generated.');
