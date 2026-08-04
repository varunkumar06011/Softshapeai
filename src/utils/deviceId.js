const STORAGE_KEY = 'softshape_device_id';

/**
 * Returns a stable, locally-persisted device identifier.
 * Used to attribute offline actions and audit logs to a specific tablet/phone
 * so the backend can detect cross-device conflicts during sync.
 */
export function getDeviceId() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'server';
  }

  try {
    let deviceId = localStorage.getItem(STORAGE_KEY);
    if (!deviceId) {
      deviceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'unknown';
  }
}

/**
 * Resets the device id. Useful for debugging or when the app is reinstalled.
 */
export function resetDeviceId() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
