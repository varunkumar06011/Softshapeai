const ANDROID_LOCAL_POS_FLAG = 'true';

/**
 * Android Local POS is opt-in at build time. Desktop, web, and the existing
 * Android Captain build remain on their current runtime unless the Cashier
 * Android build explicitly enables this flag.
 */
export function isAndroidLocalPosEnabled({ env = import.meta.env, capacitor = globalThis.Capacitor } = {}) {
  return Boolean(
    capacitor?.isNativePlatform?.() &&
    (env?.VITE_ANDROID_LOCAL_POS === ANDROID_LOCAL_POS_FLAG || env?.MODE === 'cashier-android'),
  );
}

export function isAndroidLocalCaptainEnabled({ env = import.meta.env, capacitor = globalThis.Capacitor } = {}) {
  if (!(capacitor?.isNativePlatform?.() && env?.MODE === 'captain-android')) return false;
  try {
    return localStorage.getItem('softshape_captain_connection_mode') !== 'edge';
  } catch {
    return true;
  }
}

export function getAndroidLocalPosConfig({ env = import.meta.env } = {}) {
  return {
    enabled: env?.VITE_ANDROID_LOCAL_POS === ANDROID_LOCAL_POS_FLAG || env?.MODE === 'cashier-android',
    hubPort: Number(env?.VITE_ANDROID_LOCAL_POS_PORT || 3101),
    cloudSyncEnabled: env?.VITE_ANDROID_LOCAL_POS_SYNC !== 'false',
  };
}
