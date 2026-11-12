import { getRestaurantConfig } from './getRestaurantConfig';
import { apiFetch } from '../services/apiConfig';
import { isEdgeLocalAuth, edgeFetch } from '../services/edgeHealth';

// Outlets that have not configured approvers yet (Settings → Approvers) keep
// the original list so existing screens don't go empty.
export const LEGACY_DEFAULT_APPROVERS = ['Vinod sir', 'Chandra sir', 'BVL Srinu sir'];

function fromModules(enabledModules) {
  const list = enabledModules?.expenditureApprovers;
  return Array.isArray(list) ? list.filter((n) => typeof n === 'string' && n.trim()) : null;
}

// Sync read from the outlet config stored at login / refreshed from the edge.
export function getApproverOptions() {
  return fromModules(getRestaurantConfig().enabledModules) ?? LEGACY_DEFAULT_APPROVERS;
}

// Fresh read from the edge server (desktop) or cloud, so a change made in
// Settings shows up without re-login. Falls back to the stored config.
export async function fetchApproverOptions() {
  try {
    const outlet = isEdgeLocalAuth()
      ? await edgeFetch('/api/edge/outlet')
      : (await apiFetch('/api/restaurant/me'))?.restaurant;
    const list = fromModules(outlet?.enabledModules);
    if (list) return list;
    if (outlet) return LEGACY_DEFAULT_APPROVERS;
  } catch {
    // offline / edge unavailable — use what we have locally
  }
  return getApproverOptions();
}
