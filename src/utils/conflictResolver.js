// ─────────────────────────────────────────────────────────────────────────────
// Conflict Resolver — Offline sync conflict resolution matrix
// ─────────────────────────────────────────────────────────────────────────────
// Defines per-action-type policies for resolving conflicts when offline
// actions are replayed to the backend and encounter state mismatches.
//
// Each resolver receives: { action, result, context: { serverOrder, localOrder } }
// Each resolver returns: { resolution, message, updatedBody?, alertLevel }
//
// Resolution types:
//   - adopt_server: accept server state, discard local changes
//   - keep_local: retry with local state (server may be stale)
//   - merge: combine server and local data intelligently
//   - skip: drop the action (no-op or already applied)
//   - manual: requires user intervention (shows alert)
//
// Conflict types handled:
//   - Order already settled (KOT sent after bill generated)
//   - Table status mismatch (table was reassigned while offline)
//   - Item already added (duplicate KOT item)
//   - Price changed on server (menu updated while offline)
//   - Order not found (deleted on server while offline)
//
// Also provides: addConflict(), clearConflict(), getConflicts() for tracking.
// ─────────────────────────────────────────────────────────────────────────────

// ── Conflict Resolution Matrix ───────────────────────────────────────────────
// Per-action-type policies for resolving conflicts when offline actions are
// replayed to the backend and encounter state mismatches.
//
// Each resolver receives:
//   - action:   the original queued action from IndexedDB
//   - result:   the per-action result from bulk sync or individual sync
//   - context:  { serverOrder, localOrder } if available
//
// Each resolver returns:
//   {
//     resolution: 'adopt_server' | 'keep_local' | 'merge' | 'skip' | 'manual',
//     message: string,           // human-readable explanation
//     updatedBody?: object,      // patched body for retry (if applicable)
//     alertLevel: 'info' | 'warning' | 'error',
//   }

export function resolveConflict(action, result, context = {}) {
  const { actionType } = action;
  const { serverOrder, localOrder } = context;

  switch (actionType) {
    // ── createOrder ──────────────────────────────────────────────────────────
    case 'create-order': {
      if (result.status === 'skipped' || result.statusCode === 200) {
        // Server already processed this requestId — adopt the server order
        return {
          resolution: 'adopt_server',
          message: `Order already created on server. Adopting server order ID.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        return {
          resolution: 'adopt_server',
          message: `Order conflict: server has a different order for this table. Adopting server state.`,
          alertLevel: 'warning',
        };
      }
      return {
        resolution: 'manual',
        message: `createOrder failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── updateOrderItems ─────────────────────────────────────────────────────
    case 'update-items': {
      if (result.status === 'skipped') {
        return {
          resolution: 'skip',
          message: `Item update already applied. No action needed.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        // Server order was modified by captain/admin while offline
        // Try to merge: if same items differ in quantity, surface alert
        if (serverOrder && localOrder) {
          const conflicts = detectItemConflicts(localOrder.items, serverOrder.items);
          if (conflicts.length > 0) {
            return {
              resolution: 'manual',
              message: `Item conflicts detected: ${conflicts.map(c => `${c.name} (local: ${c.localQty}, server: ${c.serverQty})`).join(', ')}. Cashier must choose.`,
              alertLevel: 'warning',
              conflicts,
            };
          }
        }
        return {
          resolution: 'adopt_server',
          message: `Order was modified on server while offline. Adopting server items.`,
          alertLevel: 'warning',
        };
      }
      return {
        resolution: 'manual',
        message: `updateOrderItems failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── print-bill ───────────────────────────────────────────────────────────
    case 'print-bill': {
      if (result.status === 'skipped') {
        return {
          resolution: 'skip',
          message: `Bill already printed. Bill number: ${result.data?.billNumber || 'unknown'}.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        // Order already paid or already printed
        const errMsg = result.error || '';
        if (errMsg.toLowerCase().includes('already paid')) {
          return {
            resolution: 'skip',
            message: `Order already paid — cannot print bill. Marking as settled locally.`,
            alertLevel: 'warning',
          };
        }
        // Already printed — check if we have a bill number
        if (result.data?.billNumber) {
          return {
            resolution: 'adopt_server',
            message: `Bill already printed with number ${result.data.billNumber}. Adopting server bill.`,
            alertLevel: 'info',
          };
        }
        return {
          resolution: 'skip',
          message: `Bill already printed. Skipping.`,
          alertLevel: 'info',
        };
      }
      return {
        resolution: 'manual',
        message: `print-bill failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── settle ───────────────────────────────────────────────────────────────
    case 'settle': {
      if (result.status === 'skipped') {
        return {
          resolution: 'skip',
          message: `Order already settled. Transaction number: ${result.data?.transaction?.txnNumber || 'unknown'}.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        const errMsg = result.error || '';
        if (errMsg.toLowerCase().includes('already paid')) {
          // Another device settled this order while we were offline
          return {
            resolution: 'adopt_server',
            message: `Order was settled by another device. Marking local table as free. Transaction: ${result.data?.transaction?.txnNumber || 'N/A'}.`,
            alertLevel: 'warning',
          };
        }
        if (errMsg.toLowerCase().includes('mismatch')) {
          return {
            resolution: 'manual',
            message: `Bill total mismatch — please refresh and retry settlement.`,
            alertLevel: 'error',
          };
        }
        return {
          resolution: 'manual',
          message: `Settlement conflict: ${errMsg}`,
          alertLevel: 'error',
        };
      }
      return {
        resolution: 'manual',
        message: `settle failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── quick-settle (print-bill + settle combined) ─────────────────────────
    case 'quick-settle': {
      if (result.status === 'skipped') {
        return {
          resolution: 'skip',
          message: `Order already settled. Transaction number: ${result.data?.transaction?.txnNumber || 'unknown'}.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        const errMsg = result.error || '';
        if (errMsg.toLowerCase().includes('already paid')) {
          return {
            resolution: 'adopt_server',
            message: `Order was settled by another device. Marking local table as free. Transaction: ${result.data?.transaction?.txnNumber || 'N/A'}.`,
            alertLevel: 'warning',
          };
        }
        if (errMsg.toLowerCase().includes('mismatch')) {
          return {
            resolution: 'manual',
            message: `Bill total mismatch — please refresh and retry settlement.`,
            alertLevel: 'error',
          };
        }
        return {
          resolution: 'manual',
          message: `Quick-settle conflict: ${errMsg}`,
          alertLevel: 'error',
        };
      }
      return {
        resolution: 'manual',
        message: `quick-settle failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── cancel-items ─────────────────────────────────────────────────────────
    case 'cancel-items': {
      if (result.status === 'skipped') {
        return {
          resolution: 'skip',
          message: `Items already cancelled.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        const errMsg = result.error || '';
        if (errMsg.toLowerCase().includes('paid')) {
          return {
            resolution: 'skip',
            message: `Cannot cancel items — order already paid. Skipping.`,
            alertLevel: 'warning',
          };
        }
        // Some items may already be cancelled — partial conflict
        return {
          resolution: 'adopt_server',
          message: `Some items may already be cancelled on server. Adopting server state.`,
          alertLevel: 'warning',
        };
      }
      return {
        resolution: 'manual',
        message: `cancel-items failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── transfer-items ───────────────────────────────────────────────────────
    case 'transfer-items': {
      if (result.status === 'skipped') {
        return {
          resolution: 'skip',
          message: `Transfer already applied.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        // Source or target table changed — do not auto-merge
        return {
          resolution: 'manual',
          message: `Table transfer conflict: source or target table was modified. Please retry manually.`,
          alertLevel: 'error',
        };
      }
      return {
        resolution: 'manual',
        message: `transfer-items failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── bill-edit ────────────────────────────────────────────────────────────
    case 'bill-edit': {
      if (result.status === 'skipped') {
        return {
          resolution: 'skip',
          message: `Bill edit already applied.`,
          alertLevel: 'info',
        };
      }
      if (result.statusCode === 409) {
        return {
          resolution: 'manual',
          message: `Bill edit conflict: order was modified. Please review and retry.`,
          alertLevel: 'error',
        };
      }
      return {
        resolution: 'manual',
        message: `bill-edit failed: ${result.error || 'Unknown error'}`,
        alertLevel: 'error',
      };
    }

    // ── Unknown action type ──────────────────────────────────────────────────
    default:
      return {
        resolution: 'manual',
        message: `Unknown action type '${actionType}': ${result.error || 'No resolution available'}`,
        alertLevel: 'error',
      };
  }
}

// ── Item conflict detection helper ──────────────────────────────────────────

function detectItemConflicts(localItems, serverItems) {
  const conflicts = [];
  const serverMap = new Map();

  for (const item of serverItems) {
    serverMap.set(item.menuItemId, item);
  }

  for (const localItem of localItems) {
    const serverItem = serverMap.get(localItem.menuItemId);
    if (serverItem && serverItem.quantity !== localItem.quantity) {
      conflicts.push({
        menuItemId: localItem.menuItemId,
        name: localItem.name || serverItem.name,
        localQty: localItem.quantity,
        serverQty: serverItem.quantity,
      });
    }
  }

  return conflicts;
}

// ── Batch conflict resolution ───────────────────────────────────────────────

export function resolveConflictsBatch(actions, results, context = {}) {
  const resolutions = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result = results[i] || { status: 'error', error: 'No result returned' };

    // Only resolve if there's a conflict or error — success/skip don't need resolution
    if (result.status === 'success') {
      continue;
    }

    const resolution = resolveConflict(action, result, context);
    resolutions.push({
      actionId: action.id,
      requestId: action.requestId,
      actionType: action.actionType,
      ...resolution,
    });
  }

  return resolutions;
}

// ── Conflict store (in-memory, for UI access) ───────────────────────────────

let conflicts = [];
const conflictListeners = new Set();

export function getConflicts() {
  return [...conflicts];
}

export function addConflict(conflict) {
  conflicts.push(conflict);
  notifyConflictListeners();
}

export function clearConflict(actionId) {
  conflicts = conflicts.filter(c => c.actionId !== actionId);
  notifyConflictListeners();
}

export function clearAllConflicts() {
  conflicts = [];
  notifyConflictListeners();
}

export function subscribeConflicts(callback) {
  conflictListeners.add(callback);
  callback(getConflicts());
  return () => conflictListeners.delete(callback);
}

function notifyConflictListeners() {
  const snapshot = getConflicts();
  conflictListeners.forEach(cb => {
    try { cb(snapshot); } catch (e) { /* ignore */ }
  });
}
