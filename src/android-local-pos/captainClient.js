function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function ensureBaseUrl(url) {
  const baseUrl = normalizeBaseUrl(url);
  if (!baseUrl) throw new Error('Cashier hub address is required');
  return baseUrl;
}

export function createCashierHubClient({ baseUrl, token = null, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const base = ensureBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['X-Local-Token'] = token;

    try {
      const response = await fetchImpl(`${base}${path}`, { ...options, headers, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error || `Cashier hub request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    health: () => request('/health', { headers: {} }),
    status: () => request('/api/local/status', { headers: {} }),
    pair: ({ code, deviceName }) => request('/api/local/pair', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ code, deviceName }),
    }),
    menu: () => request('/api/local/menu'),
    tables: () => request('/api/local/tables'),
    createOrder: (order) => request('/api/local/order', {
      method: 'POST',
      body: JSON.stringify(order),
    }),
    updateOrder: (orderId, order) => request('/api/local/order/update', {
      method: 'POST',
      body: JSON.stringify({ orderId, ...order }),
    }),
    printBill: (orderId, options = {}) => request('/api/local/order/print-bill', {
      method: 'POST',
      body: JSON.stringify({ orderId, ...options }),
    }),
    reprintBill: (orderId, options = {}) => request('/api/local/order/reprint-bill', {
      method: 'POST',
      body: JSON.stringify({ orderId, ...options }),
    }),
    settle: (orderId, payment = {}) => request('/api/local/order/settle', {
      method: 'POST',
      body: JSON.stringify({ orderId, ...payment }),
    }),
    cancel: (orderId, requestId) => request('/api/local/order/cancel', {
      method: 'POST',
      body: JSON.stringify({ orderId, requestId }),
    }),
    cancelItem: (orderId, orderItemId, options = {}) => request('/api/local/order/item-cancel', {
      method: 'POST',
      body: JSON.stringify({ orderId, orderItemId, ...options }),
    }),
  };
}
