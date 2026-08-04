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
import { isEdgeAvailable, edgeFetch } from '../services/edgeHealth';

/**
 * Returns the restaurant config stored at login.
 * Safe to call anywhere — returns sensible defaults if not logged in.
 */
export function getRestaurantConfig() {
  const config = safeGetJSON('ss_restaurant', null);
  if (!config) return getDefaultConfig();
  return { ...getDefaultConfig(), ...config };
}

let _edgeRefreshInProgress = false;
let _lastEdgeRefresh = 0;
const EDGE_REFRESH_INTERVAL_MS = 60_000;

/**
 * Fetches fresh outlet settings from the edge server and updates localStorage.
 * Called periodically by the cashier dashboard to ensure billing.js always
 * uses current GST rates, printer config, etc. — even when admin changes
 * settings on another device.
 *
 * Silent no-op if edge is unavailable or refresh is already in progress.
 */
export async function refreshOutletConfigFromEdge() {
  if (_edgeRefreshInProgress) return;
  if (Date.now() - _lastEdgeRefresh < EDGE_REFRESH_INTERVAL_MS) return;

  _edgeRefreshInProgress = true;
  try {
    const available = await isEdgeAvailable();
    if (!available) return;

    const edgeOutlet = await edgeFetch('/api/edge/outlet');
    if (!edgeOutlet || !edgeOutlet.id) return;

    const existing = safeGetJSON('ss_restaurant', {});
    const merged = {
      ...existing,
      id: edgeOutlet.id,
      name: edgeOutlet.name ?? existing.name,
      slug: edgeOutlet.slug ?? existing.slug,
      restaurantCode: edgeOutlet.restaurant_code ?? edgeOutlet.restaurantCode ?? existing.restaurantCode,
      gstCategory: edgeOutlet.gst_category ?? edgeOutlet.gstCategory ?? existing.gstCategory,
      gstRate: edgeOutlet.gst_rate ?? edgeOutlet.gstRate ?? existing.gstRate,
      gstRegistered: edgeOutlet.gst_registered ?? edgeOutlet.gstRegistered ?? existing.gstRegistered,
      pricesIncludeGst: edgeOutlet.prices_include_gst ?? edgeOutlet.pricesIncludeGst ?? existing.pricesIncludeGst,
      serviceChargePercent: edgeOutlet.service_charge_percent ?? edgeOutlet.serviceChargePercent ?? existing.serviceChargePercent,
      receiptHeader: edgeOutlet.receipt_header ?? edgeOutlet.receiptHeader ?? existing.receiptHeader,
      receiptSubHeader: edgeOutlet.receipt_sub_header ?? edgeOutlet.receiptSubHeader ?? existing.receiptSubHeader,
      logoUrl: edgeOutlet.logo_url ?? edgeOutlet.logoUrl ?? existing.logoUrl,
      themePrimary: edgeOutlet.theme_primary ?? edgeOutlet.themePrimary ?? existing.themePrimary,
      themeSecondary: edgeOutlet.theme_secondary ?? edgeOutlet.themeSecondary ?? existing.themeSecondary,
      printerConfig: edgeOutlet.printer_config ?? edgeOutlet.printerConfig ?? existing.printerConfig,
      barUnitMl: edgeOutlet.bar_unit_ml ?? edgeOutlet.barUnitMl ?? existing.barUnitMl,
      fullBottleMl: edgeOutlet.full_bottle_ml ?? edgeOutlet.fullBottleMl ?? existing.fullBottleMl,
      fssai: edgeOutlet.fssai ?? existing.fssai,
      gstin: edgeOutlet.gstin ?? existing.gstin,
      address: edgeOutlet.address ?? existing.address,
      phone: edgeOutlet.phone ?? existing.phone,
      email: edgeOutlet.email ?? existing.email,
    };

    localStorage.setItem('ss_restaurant', JSON.stringify(merged));
    _lastEdgeRefresh = Date.now();

    // Notify same-device listeners that config changed
    window.dispatchEvent(new CustomEvent('ss_restaurant_config_changed', { detail: { source: 'edge' } }));
  } catch (err) {
    // Silent fail — edge may be temporarily unavailable
  } finally {
    _edgeRefreshInProgress = false;
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
    serviceChargePercent: 0,
  };
}

export function getRestaurantName() {
  const restaurant = safeGetJSON('ss_restaurant', {});
  return restaurant?.name ?? null;
}
