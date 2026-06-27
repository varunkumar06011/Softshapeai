import { Capacitor } from '@capacitor/core';

let CapacitorHaptics = null;
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

function webVibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
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
