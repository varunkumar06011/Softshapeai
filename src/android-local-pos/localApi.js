function getHeader(headers = {}, name) {
  const target = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1] || '';
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

function json(status, body) {
  return { status, body };
}

export function createLocalApiHandler({ database, getStatus, token = null, authorize = null, onPair = null, onOrder = null, onOrderUpdate = null, onPrintBill = null, onReprintBill = null, onSettle = null, onCancel = null, onCancelItem = null, getSyncStatus = null, getDeadLetters = null, retryDeadLetter = null }) {
  if (!database || typeof database.query !== 'function') throw new TypeError('Local API requires a database adapter');
  if (typeof getStatus !== 'function') throw new TypeError('Local API requires a status provider');
  if (authorize !== null && typeof authorize !== 'function') throw new TypeError('Local API authorize must be a function');
  if (onPair !== null && typeof onPair !== 'function') throw new TypeError('Local API onPair must be a function');
  if (onOrder !== null && typeof onOrder !== 'function') throw new TypeError('Local API onOrder must be a function');
  if (onOrderUpdate !== null && typeof onOrderUpdate !== 'function') throw new TypeError('Local API onOrderUpdate must be a function');
  if (onPrintBill !== null && typeof onPrintBill !== 'function') throw new TypeError('Local API onPrintBill must be a function');
  if (onReprintBill !== null && typeof onReprintBill !== 'function') throw new TypeError('Local API onReprintBill must be a function');
  if (onSettle !== null && typeof onSettle !== 'function') throw new TypeError('Local API onSettle must be a function');
  if (onCancel !== null && typeof onCancel !== 'function') throw new TypeError('Local API onCancel must be a function');
  if (onCancelItem !== null && typeof onCancelItem !== 'function') throw new TypeError('Local API onCancelItem must be a function');

  return async function handleLocalRequest(request = {}) {
    const method = String(request.method || 'GET').toUpperCase();
    const path = String(request.path || '/').split('?')[0];
    const isLocalStatus = path === '/api/local/status' || path === '/api/edge/status';

    if (method === 'GET' && isLocalStatus) {
      const runtime = getStatus();
      return json(200, {
        success: true,
        runtime,
        registered: true,
        sessionValid: true,
        isOperational: runtime.ready === true || runtime.state === 'ready',
        localStats: { menuItems: 0 },
      });
    }

    if (method === 'GET' && path === '/health') {
      return json(200, { ok: true, service: 'softshape-cashier-local-pos' });
    }

    if (method === 'POST' && path === '/api/local/pair') {
      if (!onPair) return json(503, { error: 'Pairing is not ready' });
      try {
        return json(200, { success: true, ...(await onPair(parseJsonBody(request.body))) });
      } catch (error) {
        return json(400, { error: error.message || 'Pairing failed' });
      }
    }

    const requestToken = getHeader(request.headers, 'x-local-token')
      || getHeader(request.headers, 'authorization').replace(/^Bearer\s+/i, '');
    const authorized = authorize
      ? await authorize(requestToken)
      : Boolean(token && requestToken === token);
    if (!authorized) {
      return json(401, { error: 'Local device pairing required' });
    }

    if (method === 'GET' && (path === '/api/local/sync/status' || path === '/api/edge/sync/status')) {
      return json(200, getSyncStatus ? await getSyncStatus() : { enabled: false });
    }

    if (method === 'GET' && path === '/api/local/sync/dead-letters') {
      return json(200, { records: getDeadLetters ? await getDeadLetters() : [] });
    }

    if (method === 'POST' && path.startsWith('/api/local/sync/dead-letters/') && path.endsWith('/retry')) {
      if (!retryDeadLetter) return json(503, { error: 'Sync recovery is not ready' });
      const id = Number(path.split('/')[5]);
      if (!Number.isInteger(id)) return json(400, { error: 'Invalid sync record ID' });
      return json(200, await retryDeadLetter(id));
    }

    if (method === 'POST' && path === '/api/local/order') {
      if (!onOrder) return json(503, { error: 'Local order service is not ready' });
      try {
        return json(201, await onOrder(parseJsonBody(request.body)));
      } catch (error) {
        return json(400, { error: error.message || 'Order creation failed' });
      }
    }

    if (method === 'POST' && (path === '/api/local/order/update' || path === '/api/edge/order/update')) {
      if (!onOrderUpdate) return json(503, { error: 'Local order service is not ready' });
      try {
        const body = parseJsonBody(request.body);
        return json(200, await onOrderUpdate(body.orderId, body));
      } catch (error) {
        return json(400, { error: error.message || 'Order update failed' });
      }
    }

    if (method === 'POST' && (path === '/api/local/order/print-bill' || path === '/api/edge/order/print-bill')) {
      if (!onPrintBill) return json(503, { error: 'Local billing service is not ready' });
      try {
        const body = parseJsonBody(request.body);
        return json(200, await onPrintBill(body.orderId, body));
      } catch (error) {
        return json(400, { error: error.message || 'Bill printing failed' });
      }
    }

    if (method === 'POST' && (path === '/api/local/order/reprint-bill' || path === '/api/edge/order/reprint-bill')) {
      if (!onReprintBill) return json(503, { error: 'Local billing service is not ready' });
      try {
        const body = parseJsonBody(request.body);
        return json(200, await onReprintBill(body.orderId, body));
      } catch (error) {
        return json(400, { error: error.message || 'Bill reprint failed' });
      }
    }

    if (method === 'POST' && (path === '/api/local/order/settle' || path === '/api/edge/order/settle')) {
      if (!onSettle) return json(503, { error: 'Local settlement service is not ready' });
      try {
        const body = parseJsonBody(request.body);
        return json(200, await onSettle(body.orderId, body));
      } catch (error) {
        return json(400, { error: error.message || 'Settlement failed' });
      }
    }

    if (method === 'POST' && (path === '/api/local/order/cancel' || path === '/api/edge/order/cancel')) {
      if (!onCancel) return json(503, { error: 'Local order service is not ready' });
      try {
        const body = parseJsonBody(request.body);
        return json(200, await onCancel(body.orderId, body.requestId));
      } catch (error) {
        return json(400, { error: error.message || 'Order cancellation failed' });
      }
    }

    if (method === 'POST' && (path === '/api/local/order/item-cancel' || path === '/api/edge/order/cancel-item')) {
      if (!onCancelItem) return json(503, { error: 'Local order service is not ready' });
      try {
        const body = parseJsonBody(request.body);
        return json(200, await onCancelItem(body.orderId, body.orderItemId, body));
      } catch (error) {
        return json(400, { error: error.message || 'Item cancellation failed' });
      }
    }

    if (method === 'GET' && (path === '/api/local/menu' || path === '/api/edge/menu')) {
      const [categories, items] = await Promise.all([
        database.query('SELECT * FROM category WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'),
        database.query('SELECT * FROM menu_item WHERE is_available = 1 AND is_deleted = 0 ORDER BY sort_order ASC, name ASC'),
      ]);
      return path === '/api/edge/menu'
        ? json(200, { categories, items })
        : json(200, { success: true, categories, items });
    }

    if (method === 'GET' && (path === '/api/local/tables' || path === '/api/edge/tables')) {
      const tables = await database.query(
        'SELECT * FROM "table" ORDER BY section_id ASC, number ASC',
      );
      return path === '/api/edge/tables'
        ? json(200, tables)
        : json(200, { success: true, tables });
    }

    if (method === 'GET' && (path === '/api/local/sections' || path === '/api/edge/sections')) {
      const sections = await database.query('SELECT * FROM section WHERE is_active = 1 ORDER BY sort_order ASC, name ASC');
      return path === '/api/edge/sections'
        ? json(200, sections)
        : json(200, { success: true, sections });
    }

    return json(404, { error: 'Local POS route not found' });
  };
}
