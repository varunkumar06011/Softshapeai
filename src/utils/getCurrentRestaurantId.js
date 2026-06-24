/**
 * Reads the current restaurantId from localStorage.
 * Prefers the dedicated tenant_restaurantId key, then falls back
 * to parsing the stored user object (tenant_user).
 */
export function getCurrentRestaurantId() {
  // 1. Dedicated key (set at login time)
  const dedicated = localStorage.getItem('tenant_restaurantId');
  if (dedicated) return dedicated;

  // 2. Unified auth context user object
  const tenantUserRaw = localStorage.getItem('tenant_user');
  if (tenantUserRaw) {
    try {
      const user = JSON.parse(tenantUserRaw);
      if (user?.restaurantId) return user.restaurantId;
    } catch {
      /* ignore parse error */
    }
  }

  return null;
}
