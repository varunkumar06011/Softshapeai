// ─────────────────────────────────────────────────────────────────────────────
// pendingKots — captain KOTs that failed to send, per table
// ─────────────────────────────────────────────────────────────────────────────
// A KOT that failed on weak WiFi may or may not have reached the billing PC
// (the order can arrive while the reply is lost). Until it is sent or
// discarded, every send from that table carries the time of the first attempt.
// The billing PC then refuses food that was added to the table since — by the
// cashier (the captain walked over) or by this very KOT — and the captain
// decides instead of the kitchen getting it twice.
//
// Same items as the failed KOT → same requestId, so a KOT that did arrive is
// returned as already done. Changed items → new requestId, same first-attempt
// time. Kept per outlet and per captain; cleared at logout. Forgotten after
// MAX_AGE_MS, so a long-abandoned failure (cart cleared by hand, table freed)
// is never compared against the next customer's order on that table.
// ─────────────────────────────────────────────────────────────────────────────

import { getTenantScopedKey } from '../utils/cacheKeys';

const MAX_AGE_MS = 30 * 60 * 1000;

const storageKey = (captainId) => getTenantScopedKey(`captain_pending_kots_${captainId || 'none'}`);

function load(captainId) {
  let map;
  try {
    map = JSON.parse(localStorage.getItem(storageKey(captainId)) || '{}') || {};
  } catch {
    return {};
  }
  const fresh = Object.fromEntries(Object.entries(map).filter(([, e]) => Date.now() - (e?.firstAttemptAt || 0) < MAX_AGE_MS));
  if (Object.keys(fresh).length !== Object.keys(map).length) save(captainId, fresh);
  return fresh;
}

function save(captainId, map) {
  try {
    if (Object.keys(map).length > 0) localStorage.setItem(storageKey(captainId), JSON.stringify(map));
    else localStorage.removeItem(storageKey(captainId));
  } catch { /* non-fatal */ }
}

/** Order-independent fingerprint of a KOT's items. */
export function kotItemsKey(apiItems) {
  return (apiItems || [])
    .map(i => `${i.menuItemId}:${Number(i.quantity) || 1}:${i.notes || ''}`)
    .sort()
    .join('|');
}

/** { requestId, firstAttemptAt, itemsKey, tableLabel, itemCount } or null. */
export function getPendingKot(captainId, tableId) {
  return load(captainId)[String(tableId)] || null;
}

export function getPendingKots(captainId) {
  return Object.entries(load(captainId)).map(([tableId, entry]) => ({ tableId, ...entry }));
}

export function savePendingKot(captainId, tableId, entry) {
  const map = load(captainId);
  map[String(tableId)] = entry;
  save(captainId, map);
}

export function clearPendingKot(captainId, tableId) {
  const map = load(captainId);
  if (!(String(tableId) in map)) return;
  delete map[String(tableId)];
  save(captainId, map);
}

export function clearAllPendingKots(captainId) {
  save(captainId, {});
}
