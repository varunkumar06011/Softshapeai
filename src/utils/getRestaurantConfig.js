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

import { safeGetJSON } from './safeParseJSON';

/**
 * Returns the restaurant config stored at login.
 * Safe to call anywhere — returns sensible defaults if not logged in.
 */
export function getRestaurantConfig() {
  const config = safeGetJSON('ss_restaurant', null);
  if (!config) return getDefaultConfig();
  return { ...getDefaultConfig(), ...config };
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
  const restaurant = safeGetJSON('ss_restaurant', {});
  return restaurant?.name ?? null;
}
