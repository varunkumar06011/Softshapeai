import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(nativeDir, '../android/app/src/main/java/ai/softshape/cashier');
const manifestPath = resolve(nativeDir, '../android/app/src/main/AndroidManifest.xml');
const xmlDir = resolve(nativeDir, '../android/app/src/main/res/xml');

mkdirSync(appDir, { recursive: true });
mkdirSync(xmlDir, { recursive: true });
for (const file of ['EscposPrintPlugin.java', 'LocalPosDatabasePlugin.java', 'LocalPosLanServerPlugin.java', 'MainActivity.java']) {
  cpSync(resolve(nativeDir, file), resolve(appDir, file));
}
cpSync(resolve(nativeDir, 'AndroidManifest.xml'), manifestPath);
for (const file of ['network_security_config.xml', 'device_filter.xml']) {
  cpSync(resolve(nativeDir, file), resolve(xmlDir, file));
}

console.log('[cap-sync-native] Copied Cashier Android native sources, manifest, and printer resources');
