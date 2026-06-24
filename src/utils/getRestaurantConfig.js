/**
 * Returns the restaurant config stored at login.
 * Safe to call anywhere — returns sensible defaults if not logged in.
 */
export function getRestaurantConfig() {
  try {
    const raw = localStorage.getItem('tenant_restaurant_config');
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
    printerConfig: null,
    barUnitMl: 30,
    fullBottleMl: 750,
    plan: 'starter',
    billingStatus: 'trialing',
    features: null,
  };
}

export function getRestaurantName() {
  try {
    const user = JSON.parse(localStorage.getItem('tenant_user') || '{}');
    return user?.restaurantName ?? null;
  } catch { return null; }
}
