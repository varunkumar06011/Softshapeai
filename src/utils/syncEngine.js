import { getPendingActions, removePendingAction } from './offlineDB';
import { API_BASE, getAuthHeaders } from '../services/apiConfig';

let syncing = false;

export async function syncPendingActions() {
  if (syncing) return;
  syncing = true;

  try {
    const actions = await getPendingActions();
    if (actions.length === 0) return;

    console.log(`[SyncEngine] Flushing ${actions.length} pending action(s)`);

    for (const action of actions) {
      try {
        const res = await fetch(`${API_BASE}${action.url}`, {
          method: action.method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(action.body),
        });

        if (res.ok) {
          await removePendingAction(action.id);
          console.log(`[SyncEngine] Synced action ${action.id}: ${action.url}`);
        } else {
          console.warn(`[SyncEngine] Action ${action.id} returned ${res.status} — will retry`);
        }
      } catch (err) {
        console.warn(`[SyncEngine] Action ${action.id} failed:`, err.message);
        break; // Stop on network error — still offline
      }
    }
  } finally {
    syncing = false;
  }
}

let initialized = false;
export function initSyncEngine() {
  if (initialized) return;
  initialized = true;

  window.addEventListener('online', () => {
    console.log('[SyncEngine] Back online — flushing pending actions');
    syncPendingActions();
  });

  // Also attempt sync on startup if already online
  if (navigator.onLine) {
    syncPendingActions();
  }
}
