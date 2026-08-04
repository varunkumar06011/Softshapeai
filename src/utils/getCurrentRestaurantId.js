// ─────────────────────────────────────────────────────────────────────────────
// getCurrentRestaurantId — Reads the active restaurant ID from localStorage
// ─────────────────────────────────────────────────────────────────────────────
// Returns the current restaurant's ID for multi-tenant scoping:
//   - Reads from 'ss_user' in localStorage
//   - Returns activeRestaurantId (for multi-outlet) or restaurantId (single outlet)
//   - Returns null if not logged in or parse error
//
// Used by all cache keys, API calls, and socket events for tenant isolation.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the current restaurantId from localStorage.
 */
export function getCurrentRestaurantId() {
  const userRaw = localStorage.getItem('ss_user');
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      return user.activeRestaurantId ?? user.restaurantId;
    } catch {
      /* ignore parse error */
    }
  }

  return null;
}
