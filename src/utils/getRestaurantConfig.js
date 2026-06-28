// ─────────────────────────────────────────────────────────────────────────────
// getRestaurantConfig — Reads restaurant configuration from localStorage
// ─────────────────────────────────────────────────────────────────────────────
// Returns the restaurant config stored at login time:
//   - Reads from 'ss_restaurant' in localStorage
//   - Merges with sensible defaults (safe to call before login)
//   - Config includes: gstCategory, gstRate, gstRegistered, pricesIncludeGst,
//     serviceChargePercent, restaurantName, slug, etc.
//
// Used by billing.js for GST calculations and UI components for display.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the restaurant config stored at login.
 * Safe to call anywhere — returns sensible defaults if not logged in.
 */
export function getRestaurantConfig() {
  try {
    const raw = localStorage.getItem('ss_restaurant');
    if (!raw) return getDefaultConfig();
    return { ...getDefaultConfig(), ...JSON.parse(raw) };
  } catch {
    return getDefaultConfig();
  }
}

function getDefaultConfig() {
  return {
    logoUrl: null,
    receiptHeader: null,
    receiptSubHeader: null,
    themePrimary: null,
    themeSecondary: null,
    printerConfig: null,
    barUnitMl: 30,
    fullBottleMl: 750,
    plan: 'starter',
    billingStatus: 'trialing',
    features: null,
    gstCategory: 'NON_AC',
    gstRate: null,
    gstRegistered: true,
    pricesIncludeGst: false,
  };
}

export function getRestaurantName() {
  try {
    const restaurant = JSON.parse(localStorage.getItem('ss_restaurant') || '{}');
    return restaurant?.name ?? null;
  } catch { return null; }
}
