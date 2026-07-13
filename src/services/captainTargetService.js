// ─────────────────────────────────────────────────────────────────────────────
// Captain Target Service — API client for captain revenue targets and discount limits
// ─────────────────────────────────────────────────────────────────────────────
// Provides functions for managing captain performance targets:
//   - saveCaptainTarget(captainId, revenueTarget, discountLimit) — upsert target
//   - fetchCaptainTargets() — list all targets for the restaurant
//   - fetchCaptainTarget(captainId) — get a single captain's target
//
// Used by the admin TodaySpecials panel to set and view captain performance goals.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, getAuthHeaders } from './apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

/**
 * Save (upsert) a captain's revenue target and discount limit.
 * Used by TodaySpecials admin panel.
 */
export async function saveCaptainTarget(captainId, revenueTarget, discountLimit) {
  const res = await fetch(`${API_BASE}/api/captain-targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ restaurantId: getCurrentRestaurantId(), captainId, revenueTarget, discountLimit }),
  });
  if (!res.ok) throw new Error('Failed to save target');
  return res.json();
}

/**
 * Fetch a single captain's current target.
 * Returns null if no target has been assigned yet.
 * Used by CaptainApp to load assignment on login.
 */
export async function fetchCaptainTarget(captainId) {
  try {
    const res = await fetch(`${API_BASE}/api/captain-targets/${captainId}?restaurantId=${getCurrentRestaurantId()}`, {
      headers: getAuthHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch all captain targets for this restaurant.
 * Returns a map keyed by captainId: { captainId, revenueTarget, discountLimit, assignedAt }
 * Used by TodaySpecials to pre-populate assignment UI.
 */
export async function fetchAllCaptainTargets() {
  try {
    const res = await fetch(`${API_BASE}/api/captain-targets?restaurantId=${getCurrentRestaurantId()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return {};
    const list = await res.json();
    // Convert array to map keyed by captainId for easy lookup
    return Object.fromEntries(list.map(t => [t.captainId, t]));
  } catch {
    return {};
  }
}
