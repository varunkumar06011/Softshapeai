/**
 * Captain app is edge-only: no cloud calls, no cloud-replay queue, and the
 * login lists each outlet's billing PC found on the WiFi.
 * Run: npx vitest run src/services/__tests__/captainEdgeOnly.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('../apiConfig', () => ({
  API_BASE: 'https://api.example.test',
  CLOUD_API_BASE: 'https://api.example.test',
  apiUrl: (p) => `https://api.example.test${p}`,
  getAuthHeaders: () => ({}),
  apiFetch: vi.fn(async () => { throw new TypeError('Failed to fetch'); }),
  isBackendReachable: () => true,
}));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ getLocalIp: async () => ({ ip: '192.168.5.23' }) }),
}));
vi.mock('../../android-local-pos/config', () => ({
  isAndroidLocalCaptainEnabled: () => false,
  isAndroidLocalPosEnabled: () => false,
}));
vi.mock('../../android-local-pos/hubStorage', () => ({ getStoredCashierHub: () => ({}) }));
vi.mock('../../utils/printOffline', () => ({ invalidatePrintAgentUrlCache: vi.fn() }));

const LOUNGE = { restaurantId: 'outlet-lounge', restaurantName: 'Vgrand Lounge' };
const RESTO = { restaurantId: 'outlet-resto', restaurantName: 'Vgrand Family Restaurant' };
const health = (outlet, extra = {}) => ({ isOperational: true, sessionValid: true, onboarded: true, ...outlet, ...extra });

let pcs;
let realFetch;

beforeEach(() => {
  localStorage.clear();
  window.Capacitor = { isNativePlatform: () => true };
  pcs = {
    'http://192.168.5.40:3101': health(RESTO),
    'http://192.168.5.41:3101': health(LOUNGE),
    'http://192.168.5.42:3101': health(LOUNGE), // second PC of the same outlet
    'http://192.168.5.50:3101': health(RESTO, { onboarded: false }),
  };
  realFetch = window.fetch;
  window.fetch = globalThis.fetch = vi.fn(async (url) => {
    const base = String(url).replace(/\/health$/, '');
    if (pcs[base]) return { ok: true, json: async () => pcs[base] };
    throw new TypeError('Failed to fetch');
  });
  window.history.pushState({}, '', '/captain/dashboard');
});

afterEach(() => {
  window.fetch = globalThis.fetch = realFetch;
  delete window.Capacitor;
  window.history.pushState({}, '', '/');
});

async function load(path) {
  vi.resetModules();
  return import(path);
}

describe('installCaptainCloudGuard', () => {
  it('refuses cloud requests on the captain screens only', async () => {
    const { installCaptainCloudGuard } = await load('../captainEdgeOnly.js');
    installCaptainCloudGuard();

    await expect(window.fetch('https://api.example.test/api/orders')).rejects.toThrow('Cloud is not used');
    // The billing PC on the LAN is still reachable.
    await expect(window.fetch('http://192.168.5.40:3101/health')).resolves.toBeTruthy();

    window.history.pushState({}, '', '/cashier/dashboard');
    await expect(window.fetch('https://api.example.test/api/orders')).rejects.toThrow('Failed to fetch');
  });
});

describe('findBillingPcsOnLan', () => {
  it('lists each outlet once by name and skips PCs that are not set up', async () => {
    const edge = await load('../edgeHealth.js');
    const seen = [];
    const outlets = await edge.findBillingPcsOnLan({ onFound: list => seen.push(list.length) });
    expect(outlets.map(o => o.name)).toEqual(['Vgrand Family Restaurant', 'Vgrand Lounge']);
    expect(outlets.find(o => o.outletId === 'outlet-resto').url).toBe('http://192.168.5.40:3101');
    expect(seen.length).toBeGreaterThan(0);
  });

  it('remembers the PC so connecting to the picked outlet is one probe', async () => {
    const edge = await load('../edgeHealth.js');
    await edge.findBillingPcsOnLan();
    window.fetch.mockClear();
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-resto', forCaptain: true, fastOnly: true });
    expect(url).toBe('http://192.168.5.40:3101');
    expect(window.fetch.mock.calls.length).toBeLessThan(5);
  });

  it('never asks the cloud where the PC is', async () => {
    const edge = await load('../edgeHealth.js');
    expect(await edge.discoverEdgeUrlFromBackend({ forCaptain: true })).toBeNull();
    expect(window.fetch).not.toHaveBeenCalled();
  });
});

describe('orderApi on the captain screens', () => {
  it('fails a KOT the billing PC did not take instead of queueing it for the cloud', async () => {
    window.fetch = globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    localStorage.setItem('ss_user', JSON.stringify({ id: 'cap-1', role: 'CAPTAIN', restaurantId: 'outlet-resto' }));
    const secureStorage = (await import('../../utils/secureStorage')).default;
    secureStorage.setItem('ss_token', 'edge-local-123');

    const orderApi = await load('../orderApi.js');
    const offlineDB = await import('../../utils/offlineDB');
    const before = await offlineDB.getPendingCount();

    // Edge write path with failFastOnEdgeDown off (the background KOT retry).
    await expect(orderApi.createOrder({
      tableId: 't1', tableNumber: '1', items: [{ menuItemId: 'm1', name: 'Water', price: 30, quantity: 1 }],
      requestId: 'req-1', failFastOnEdgeDown: false,
    })).rejects.toMatchObject({ code: 'EDGE_UNREACHABLE' });
    expect(await offlineDB.getPendingCount()).toBe(before);
  });
});
