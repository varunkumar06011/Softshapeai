import { apiFetch } from '../services/apiConfig';

const SYNC_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 50;
const CONFIG_PULL_INTERVAL_MS = 60_000;
const MAX_SYNC_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 30_000;

function parsePayload(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return {}; }
}

function bool(value) {
  return value ? 1 : 0;
}

function configStatements(config) {
  const statements = [];
  const outlet = config.outlet;
  if (outlet?.id) statements.push({
    sql: `INSERT INTO outlet(id, name, restaurant_code, gstin, address, phone, prices_include_gst, gst_category, gst_rate, gst_registered, service_charge_percent, printer_config, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, restaurant_code=excluded.restaurant_code, gstin=excluded.gstin, address=excluded.address, phone=excluded.phone, prices_include_gst=excluded.prices_include_gst, gst_category=excluded.gst_category, gst_rate=excluded.gst_rate, gst_registered=excluded.gst_registered, service_charge_percent=excluded.service_charge_percent, printer_config=excluded.printer_config, updated_at=excluded.updated_at`,
    values: [outlet.id, outlet.name || '', outlet.restaurantCode || null, outlet.gstin || null, outlet.address || null, outlet.phone || null, bool(outlet.pricesIncludeGst), outlet.gstCategory || 'NON_AC', outlet.gstRate ?? null, bool(outlet.gstRegistered !== false), Number(outlet.serviceChargePercent || 0), JSON.stringify(outlet.printerConfig || null), Date.now()],
  });

  for (const category of config.categories || []) statements.push({
    sql: `INSERT INTO category(id, restaurant_id, name, sort_order, is_active, printer_target, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, sort_order=excluded.sort_order, is_active=excluded.is_active, printer_target=excluded.printer_target, updated_at=excluded.updated_at`,
    values: [category.id, category.restaurantId || outlet?.id, category.name || '', Number(category.sortOrder || 0), bool(category.isActive !== false), category.printerTarget || null, Date.now()],
  });

  for (const item of config.menuItems || []) statements.push({
    sql: `INSERT INTO menu_item(id, restaurant_id, category_id, name, description, base_price, menu_type, printer_target, printer_name, gst_enabled, is_available, is_deleted, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id, name=excluded.name, description=excluded.description, base_price=excluded.base_price, menu_type=excluded.menu_type, printer_target=excluded.printer_target, printer_name=excluded.printer_name, gst_enabled=excluded.gst_enabled, is_available=excluded.is_available, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at`,
    values: [item.id, item.restaurantId || outlet?.id, item.categoryId, item.name || '', item.description || null, Number(item.basePrice || item.price || 0), item.menuType || 'FOOD', item.printerTarget || null, item.printerName || null, bool(item.gstEnabled !== false), bool(item.isAvailable !== false), bool(item.isDeleted), Date.now()],
  });

  for (const venue of config.venues || []) statements.push({
    sql: `INSERT INTO venue(id, restaurant_id, name, venue_type, price_profile_id, tax_profile_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, venue_type=excluded.venue_type, price_profile_id=excluded.price_profile_id, tax_profile_id=excluded.tax_profile_id, updated_at=excluded.updated_at`,
    values: [venue.id, venue.restaurantId || outlet?.id, venue.name || '', venue.venueType || 'DINE_IN', venue.priceProfileId || null, venue.taxProfileId || null, Date.now()],
  });

  for (const section of config.sections || []) statements.push({
    sql: `INSERT INTO section(id, restaurant_id, venue_id, name, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET venue_id=excluded.venue_id, name=excluded.name, sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
    values: [section.id, section.restaurantId || outlet?.id, section.venueId || null, section.name || '', Number(section.sortOrder || 0), Date.now()],
  });

  for (const table of config.tables || []) statements.push({
    sql: `INSERT INTO "table"(id, restaurant_id, section_id, number, status, guests, current_bill, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET section_id=excluded.section_id, number=excluded.number, status=CASE WHEN "table".status IN ('OCCUPIED', 'BILLING_REQUESTED') THEN "table".status ELSE excluded.status END, updated_at=excluded.updated_at`,
    values: [table.id, table.restaurantId || outlet?.id, table.sectionId || null, Number(table.number || 0), table.status || 'AVAILABLE', Number(table.guests || 0), Number(table.currentBill || 0), Number(table.revision || 1), Date.now()],
  });

  return statements;
}

export function createAndroidSyncAdapter(database, { intervalMs = SYNC_INTERVAL_MS, configIntervalMs = CONFIG_PULL_INTERVAL_MS } = {}) {
  let timer;
  let configTimer;
  let running = false;
  let syncing = false;
  let lastError = null;
  let lastSyncAt = null;
  let lastConfigPullAt = null;
  let pending = 0;
  const handleOnline = () => { syncNow().catch(() => {}); };

  async function getRestaurantId() {
    const rows = await database.query('SELECT id FROM outlet ORDER BY id LIMIT 1');
    return rows[0]?.id || null;
  }

  async function refreshPending() {
    const rows = await database.query('SELECT COUNT(*) AS count FROM sync_queue WHERE status IN (?, ?) AND dead_lettered = 0', ['PENDING', 'RETRY']);
    pending = Number(rows[0]?.count || 0);
    return pending;
  }

  async function syncNow() {
    if (syncing) return { skipped: true, pending };
    syncing = true;
    lastError = null;
    try {
      const restaurantId = await getRestaurantId();
      if (!restaurantId) return { skipped: true, reason: 'outlet-not-configured', pending: await refreshPending() };
      const rows = await database.query(
        'SELECT * FROM sync_queue WHERE status IN (?, ?) AND dead_lettered = 0 AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY id ASC LIMIT ?',
        ['PENDING', 'RETRY', Date.now(), MAX_BATCH_SIZE],
      );
      if (!rows.length) return { pushed: 0, accepted: 0, pending: 0 };

      const batch = rows.map((row) => ({ queueId: row.id, tableName: row.table_name, recordId: row.record_id, operation: row.operation, data: parsePayload(row.payload) }));
      const response = await apiFetch('/api/edge/sync', { method: 'POST', timeout: 10_000, body: JSON.stringify({ restaurantId, batch }) });
      const result = await response.json();
      const accepted = new Set(result.accepted || []);
      const rejected = new Map((result.rejected || []).map((item) => [item.queueId, item]));
      for (const row of rows) {
        if (accepted.has(row.id)) {
          await database.execute('UPDATE sync_queue SET status = ?, synced_at = ?, resolved_at = ?, last_error = NULL WHERE id = ?', ['SYNCED', Date.now(), Date.now(), row.id]);
        } else {
          const outcome = rejected.get(row.id);
          const retryable = !outcome || outcome.outcome === 'error' || outcome.outcome === 'waiting_dependency';
          const attempts = Number(row.attempts || 0) + 1;
          const deadLettered = retryable && attempts >= MAX_SYNC_ATTEMPTS;
          const status = deadLettered ? 'DEAD_LETTER' : retryable ? 'RETRY' : 'FAILED';
          const nextAttemptAt = deadLettered ? null : Date.now() + (RETRY_BASE_DELAY_MS * Math.min(32, 2 ** Math.max(0, attempts - 1)));
          await database.execute(
            'UPDATE sync_queue SET status = ?, attempts = ?, last_attempt_at = ?, next_attempt_at = ?, dead_lettered = ?, resolved_at = ?, last_error = ? WHERE id = ?',
            [status, attempts, Date.now(), nextAttemptAt, deadLettered ? 1 : 0, deadLettered || !retryable ? Date.now() : null, outcome?.error || 'Sync item was not accepted', row.id],
          );
        }
      }
      lastSyncAt = Date.now();
      pending = await refreshPending();
      return { pushed: rows.length, accepted: accepted.size, pending };
    } catch (error) {
      lastError = error;
      pending = await refreshPending().catch(() => pending);
      return { pushed: 0, accepted: 0, pending, error: error.message || 'Sync failed' };
    } finally {
      syncing = false;
    }
  }

  async function pullConfig() {
    try {
      const response = await apiFetch('/api/edge/config', { timeout: 15_000 });
      const config = await response.json();
      const statements = configStatements(config);
      if (statements.length) await database.transaction(statements);
      lastConfigPullAt = Date.now();
      return { applied: statements.length, pulledAt: lastConfigPullAt };
    } catch (error) {
      lastError = error;
      return { applied: 0, error: error.message || 'Config pull failed' };
    }
  }

  async function getDeadLetters() {
    return database.query('SELECT * FROM sync_queue WHERE dead_lettered = 1 ORDER BY id ASC');
  }

  async function retryDeadLetter(id) {
    await database.execute(
      'UPDATE sync_queue SET status = ?, attempts = 0, dead_lettered = 0, next_attempt_at = NULL, resolved_at = NULL, last_error = NULL WHERE id = ? AND dead_lettered = 1',
      ['RETRY', id],
    );
    return syncNow();
  }

  return {
    async start() {
      if (running) return;
      running = true;
      if (typeof window !== 'undefined') window.addEventListener('online', handleOnline);
      await refreshPending();
      pullConfig().catch(() => {});
      timer = setInterval(() => { syncNow().catch(() => {}); }, intervalMs);
      configTimer = setInterval(() => { pullConfig().catch(() => {}); }, configIntervalMs);
    },
    async stop() {
      running = false;
      if (typeof window !== 'undefined') window.removeEventListener('online', handleOnline);
      if (timer) clearInterval(timer);
      if (configTimer) clearInterval(configTimer);
      timer = undefined;
      configTimer = undefined;
    },
    syncNow,
    pullConfig,
    getDeadLetters,
    retryDeadLetter,
    health() {
      return { enabled: true, running, syncing, pending, lastSyncAt, lastConfigPullAt, lastError: lastError?.message || null };
    },
  };
}

export { CONFIG_PULL_INTERVAL_MS, MAX_BATCH_SIZE, SYNC_INTERVAL_MS };
