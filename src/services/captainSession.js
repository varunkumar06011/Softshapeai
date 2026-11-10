// ─────────────────────────────────────────────────────────────────────────────
// captainSession — a saved captain login is only trusted after the outlet's
// billing PC confirms it
// ─────────────────────────────────────────────────────────────────────────────
// The captain app keeps the login on the phone. After a reinstall, a restore, a
// phone that was used at another restaurant, or a captain who was removed, that
// saved login would open the app as someone else, with another restaurant's name.
// On every cold start the app now asks the PC of the outlet the login belongs to
// whether that captain still exists there. Anything else goes back to the login
// screen, which lists only the captains of the outlet the phone is really at.
// ─────────────────────────────────────────────────────────────────────────────

import { discoverEdgeOnLAN, isCurrentEdgeForOutlet } from './edgeHealth';
import { authService } from './authService';

const VERIFIED_AT_KEY = 'captain_session_verified_at';

/** A login confirmed by the PC this recently is not asked about again. */
export const SESSION_TRUST_MS = 30 * 60 * 1000;

export function markCaptainSessionVerified(now = Date.now()) {
  try { localStorage.setItem(VERIFIED_AT_KEY, String(now)); } catch { /* ignore */ }
}

export function forgetCaptainSessionVerified() {
  try { localStorage.removeItem(VERIFIED_AT_KEY); } catch { /* ignore */ }
}

export function isCaptainSessionRecentlyVerified(now = Date.now()) {
  try {
    const at = Number(localStorage.getItem(VERIFIED_AT_KEY));
    return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < SESSION_TRUST_MS;
  } catch {
    return false;
  }
}

const defaultDeps = {
  discoverEdgeOnLAN,
  isCurrentEdgeForOutlet,
  fetchStaffFromEdge: (url) => authService.fetchStaffFromEdge(url),
};

/**
 * 'valid'    — the outlet's PC is on this WiFi and lists this person as active staff.
 * 'invalid'  — the PC answered and this person is not there, or the login has no outlet.
 * 'unreachable' — the outlet's PC was not found (wrong WiFi, PC off): nothing is confirmed.
 */
export async function verifyCaptainSession({ user, restaurant }, deps = defaultDeps, timeoutMs = 15000) {
  const outletId = restaurant?.id;
  if (!user?.id || !outletId) return 'invalid';

  // A slow search of the WiFi must not leave the captain on a waiting screen.
  let timer;
  const giveUp = new Promise((resolve) => { timer = setTimeout(() => resolve('unreachable'), timeoutMs); });
  try {
    return await Promise.race([confirmWithPc(user, outletId, deps), giveUp]);
  } finally {
    clearTimeout(timer);
  }
}

async function confirmWithPc(user, outletId, deps) {
  let url = null;
  try {
    url = await deps.discoverEdgeOnLAN({ expectedRestaurantId: outletId, forCaptain: true, force: true });
    if (!url || !(await deps.isCurrentEdgeForOutlet(outletId))) return 'unreachable';
  } catch {
    return 'unreachable';
  }

  try {
    const staff = await deps.fetchStaffFromEdge(url);
    return staff.some((s) => String(s.id) === String(user.id)) ? 'valid' : 'invalid';
  } catch {
    return 'unreachable';
  }
}
