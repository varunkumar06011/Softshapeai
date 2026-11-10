// ─────────────────────────────────────────────────────────────────────────────
// expenditureApprovers — names for the expenditure/voucher "Approved by" dropdown
// ─────────────────────────────────────────────────────────────────────────────
// Each outlet sets its own list in Admin → Settings → Expenditure Approvers.
// If none is set, the server returns the outlet's OWNER/ADMIN user names.
//
// Lookup order: billing PC (edge) → cloud → last list seen on this device.
// ─────────────────────────────────────────────────────────────────────────────

import { apiFetch } from '../../services/apiConfig';
import { isEdgeLocalAuth, edgeFetch } from '../../services/edgeHealth';
import { getRestaurantConfig } from '../../utils/getRestaurantConfig';

// Vgrand Lounge + Vgrand Family Restaurant used these hardcoded names before the
// per-outlet setting existed. Their cloud rows are pre-filled by migration; this
// only covers a billing PC that hasn't been updated yet while offline.
const LEGACY_APPROVERS_BY_OUTLET = {
  cmqy60ci200027dscyj9ubg8h: ['Vinod sir', 'Chandra sir', 'BVL Srinu sir'],
  cmr03m0fa00015ot8jh16grhn: ['Vinod sir', 'Chandra sir', 'BVL Srinu sir'],
};

const cacheKey = (outletId) => `ss_expenditure_approvers:${outletId || 'unknown'}`;

function readCache(outletId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey(outletId)) || 'null');
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(outletId, names) {
  try {
    localStorage.setItem(cacheKey(outletId), JSON.stringify(names));
  } catch {
    // Storage full / unavailable — non-critical
  }
}

/**
 * Returns the approver names for the current outlet. Never throws.
 * @param {{ edge?: boolean }} [opts] edge: try the billing PC first (default: isEdgeLocalAuth())
 */
export async function loadApproverNames({ edge = isEdgeLocalAuth() } = {}) {
  const outletId = getRestaurantConfig()?.id;
  const sources = edge
    ? [() => edgeFetch('/api/edge/expenditures/approver-names'), () => apiFetch('/api/expenditures/approver-names')]
    : [() => apiFetch('/api/expenditures/approver-names')];

  // Billing PC that hasn't synced the outlet list yet — owner names, used only as a last resort
  let unsyncedNames = null;

  for (const fetchNames of sources) {
    try {
      const data = await fetchNames();
      if (!Array.isArray(data?.names)) continue;
      if (data.source === 'unsynced') {
        unsyncedNames = data.names;
        continue;
      }
      writeCache(outletId, data.names);
      return data.names;
    } catch (err) {
      console.warn('[expenditureApprovers] lookup failed, trying next source:', err?.message || err);
    }
  }

  return readCache(outletId) || LEGACY_APPROVERS_BY_OUTLET[outletId] || unsyncedNames || [];
}
