import { getTenantScopedKey } from '../../utils/cacheKeys.js';

function getStateKey(userId, restaurantId, tourId, version) {
  const base = `ss_tour_state:${userId || 'anon'}:${tourId}:v${version}`;
  return getTenantScopedKey(base, restaurantId);
}

function getDeviceKey(restaurantId, tourId, version) {
  const base = `ss_tour_device:${tourId}:v${version}`;
  return getTenantScopedKey(base, restaurantId);
}

function readState(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeState(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* storage may be unavailable */
  }
}

export function getTourProgress(userId, restaurantId, tourId, version) {
  const key = getStateKey(userId, restaurantId, tourId, version);
  const state = readState(key);
  if (!state) return { completed: false, dismissed: false, currentStep: 0, lastSeen: null };
  return {
    completed: !!state.completed,
    dismissed: !!state.dismissed,
    currentStep: state.currentStep || 0,
    lastSeen: state.lastSeen || null,
  };
}

export function setTourCompleted(userId, restaurantId, tourId, version) {
  const key = getStateKey(userId, restaurantId, tourId, version);
  const state = readState(key) || {};
  state.completed = true;
  state.dismissed = false;
  state.lastSeen = Date.now();
  writeState(key, state);
}

export function setTourDismissed(userId, restaurantId, tourId, version) {
  const key = getStateKey(userId, restaurantId, tourId, version);
  const state = readState(key) || {};
  state.dismissed = true;
  state.lastSeen = Date.now();
  writeState(key, state);
}

export function saveTourStep(userId, restaurantId, tourId, version, stepIndex) {
  const key = getStateKey(userId, restaurantId, tourId, version);
  const state = readState(key) || {};
  state.currentStep = stepIndex;
  state.lastSeen = Date.now();
  writeState(key, state);
}

export function clearTourProgress(userId, restaurantId, tourId, version) {
  const key = getStateKey(userId, restaurantId, tourId, version);
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function isTourCompleted(userId, restaurantId, tourId, version) {
  return getTourProgress(userId, restaurantId, tourId, version).completed;
}

export function isTourDismissed(userId, restaurantId, tourId, version) {
  return getTourProgress(userId, restaurantId, tourId, version).dismissed;
}

export function shouldAutoShowTour(userId, restaurantId, tourId, version) {
  const progress = getTourProgress(userId, restaurantId, tourId, version);
  if (progress.completed || progress.dismissed) return false;
  const deviceKey = getDeviceKey(restaurantId, tourId, version);
  const deviceState = readState(deviceKey);
  if (deviceState && deviceState.autoShown) return false;
  return true;
}

export function markAutoShown(restaurantId, tourId, version) {
  const deviceKey = getDeviceKey(restaurantId, tourId, version);
  writeState(deviceKey, { autoShown: true, ts: Date.now() });
}

export function getAllTourProgress(userId, restaurantId) {
  const results = {};
  try {
    const prefix = `ss_tour_state:${userId || 'anon'}:`;
    const scopedPrefix = getTenantScopedKey(prefix, restaurantId);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(scopedPrefix)) {
        const state = readState(key);
        if (state) {
          const suffix = key.substring(scopedPrefix.length);
          results[suffix] = state;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return results;
}

export function resetDeviceTourState(restaurantId, tourId, version) {
  const deviceKey = getDeviceKey(restaurantId, tourId, version);
  try { localStorage.removeItem(deviceKey); } catch { /* ignore */ }
}
