import { getCurrentRestaurantId } from './getCurrentRestaurantId';
import { getBarId } from '../services/barApiConfig';
import { getVenueId } from '../services/venueApiConfig';

// Legacy, un-scoped cache keys that must be purged so they no longer leak
// data across restaurants.
export const LEGACY_UNSCOPED_KEYS = [
  'softshape_tables_cache_v5',
  'softshape_tables_cache_v6',
  'softshape_bar_tables_cache_v1',
  'softshape_bar_tables_cache_v2',
  'softshape_bar_tables_cache_v3',
  'softshape_bar_tables_cache_v4',
  'softshape_venue_tables_cache_v1',
  'softshape_bar_menu_cache_v3',
  'softshape_venue_menu_cache_v1',
  'softshape_menu',
  'softshape_unified_menu',
  'cashier_recently_terminated',
];

// Base keys that must always be scoped by a tenant ID before use.
export const BASE_TABLES_CACHE_KEY = 'softshape_tables_cache';
export const BASE_BAR_TABLES_CACHE_KEY = 'softshape_bar_tables_cache';
export const BASE_VENUE_TABLES_CACHE_KEY = 'softshape_venue_tables_cache';
export const BASE_BAR_MENU_CACHE_KEY = 'softshape_bar_menu_cache';
export const BASE_VENUE_MENU_CACHE_KEY = 'softshape_venue_menu_cache';
export const BASE_RECENTLY_TERMINATED_KEY = 'cashier_recently_terminated';

/**
 * Returns a tenant-scoped localStorage key.
 * Falls back to `${baseKey}:unknown` if no tenant id is available.
 */
export function getScopedCacheKey(baseKey, tenantId = getCurrentRestaurantId()) {
  if (!tenantId) return `${baseKey}:unknown`;
  return `${baseKey}:${tenantId}`;
}

export function getTablesCacheKey(restaurantId) {
  return getScopedCacheKey(BASE_TABLES_CACHE_KEY, restaurantId);
}

export function getBarTablesCacheKey(barId) {
  return getScopedCacheKey(BASE_BAR_TABLES_CACHE_KEY, barId ?? getBarId());
}

export function getVenueTablesCacheKey(venueId) {
  return getScopedCacheKey(BASE_VENUE_TABLES_CACHE_KEY, venueId ?? getVenueId());
}

export function getBarMenuCacheKey(barId) {
  return getScopedCacheKey(BASE_BAR_MENU_CACHE_KEY, barId ?? getBarId());
}

export function getVenueMenuCacheKey(venueId) {
  return getScopedCacheKey(BASE_VENUE_MENU_CACHE_KEY, venueId ?? getVenueId());
}

export function getRecentlyTerminatedKey(restaurantId) {
  return getScopedCacheKey(BASE_RECENTLY_TERMINATED_KEY, restaurantId);
}

/**
 * Removes all legacy un-scoped cache keys. Should be called once on app startup
 * and after every successful login/onboarding so old data never leaks across
 * restaurants.
 */
export function purgeLegacyCaches() {
  LEGACY_UNSCOPED_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore storage failures */
    }
  });
}

/**
 * Clears all tenant-scoped caches for a given restaurant id. Useful on logout
 * or when switching restaurants.
 */
export function clearTenantCaches(tenantId = getCurrentRestaurantId()) {
  if (!tenantId) return;
  const keys = [
    getTablesCacheKey(tenantId),
    getBarTablesCacheKey(tenantId),
    getVenueTablesCacheKey(tenantId),
    getBarMenuCacheKey(tenantId),
    getVenueMenuCacheKey(tenantId),
    getRecentlyTerminatedKey(tenantId),
  ];
  keys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore storage failures */
    }
  });
}
