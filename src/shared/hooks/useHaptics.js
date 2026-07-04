// ─────────────────────────────────────────────────────────────────────────────
// useHaptics — Cross-platform haptic feedback (vibration) hook
// ─────────────────────────────────────────────────────────────────────────────
// Provides haptic feedback functions that work on both web and native (Android):
//   - hapticLight(): subtle vibration for button presses
//   - hapticMedium(): medium vibration for confirmations
//   - hapticSuccess(): success pattern vibration (two pulses)
//   - hapticError(): error pattern vibration (long pulse)
//
// On native (Android): uses Capacitor Haptics plugin (dynamically imported).
// On web: uses navigator.vibrate() API (if supported).
// Falls back to no-op if neither is available.
// ─────────────────────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core';

// Cached Capacitor Haptics module (dynamically imported on native platforms)
let CapacitorHaptics = null;
// Whether running on a native platform (Android)
let isNative = false;

try {
  isNative = Capacitor?.isNativePlatform?.() ?? false;
} catch {
  isNative = false;
}

async function loadCapacitorHaptics() {
  if (!isNative || CapacitorHaptics) return CapacitorHaptics;
  try {
    CapacitorHaptics = await import('@capacitor/haptics');
  } catch {
    CapacitorHaptics = null;
  }
  return CapacitorHaptics;
}

let userInteracted = false;
if (typeof window !== 'undefined') {
  const markInteracted = () => { userInteracted = true; };
  window.addEventListener('pointerdown', markInteracted, { once: true });
  window.addEventListener('keydown', markInteracted, { once: true });
}

function webVibrate(pattern) {
  try {
    if (userInteracted && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {}
}

export async function hapticLight() {
  const haptics = await loadCapacitorHaptics();
  if (haptics?.ImpactFeedbackStyle) {
    haptics.impact({ style: haptics.ImpactFeedbackStyle.Light }).catch(() => {});
  } else {
    webVibrate(10);
  }
}

export async function hapticMedium() {
  const haptics = await loadCapacitorHaptics();
  if (haptics?.ImpactFeedbackStyle) {
    haptics.impact({ style: haptics.ImpactFeedbackStyle.Medium }).catch(() => {});
  } else {
    webVibrate(20);
  }
}

export async function hapticHeavy() {
  const haptics = await loadCapacitorHaptics();
  if (haptics?.ImpactFeedbackStyle) {
    haptics.impact({ style: haptics.ImpactFeedbackStyle.Heavy }).catch(() => {});
  } else {
    webVibrate(30);
  }
}

export async function hapticSuccess() {
  const haptics = await loadCapacitorHaptics();
  if (haptics?.NotificationFeedbackType) {
    haptics.notification({ type: haptics.NotificationFeedbackType.Success }).catch(() => {});
  } else {
    webVibrate([10, 30, 10]);
  }
}

export async function hapticError() {
  const haptics = await loadCapacitorHaptics();
  if (haptics?.NotificationFeedbackType) {
    haptics.notification({ type: haptics.NotificationFeedbackType.Error }).catch(() => {});
  } else {
    webVibrate([30, 50, 30]);
  }
}

export async function hapticWarning() {
  const haptics = await loadCapacitorHaptics();
  if (haptics?.NotificationFeedbackType) {
    haptics.notification({ type: haptics.NotificationFeedbackType.Warning }).catch(() => {});
  } else {
    webVibrate([20, 40]);
  }
}

export function useHaptics() {
  return { hapticLight, hapticMedium, hapticHeavy, hapticSuccess, hapticError, hapticWarning };
}
