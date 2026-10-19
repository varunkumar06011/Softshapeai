/**
 * Tests for printLocal() target selection — a KOT goes to exactly one PC,
 * the current outlet's, never every reachable PC on the shared WiFi.
 * Run: npx vitest run src/utils/__tests__/printTarget.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const BAR_PC = 'http://192.168.5.41:3101';
const RESTO_PC = 'http://192.168.5.40:3101';
let currentOutlet = 'outlet-resto';
let configuredUrl = BAR_PC; // stale "configured" URL from a bar shift

vi.mock('../offlineDB', () => ({
  addOfflinePrintJob: vi.fn(async () => {}),
  getOfflinePrintJobs: vi.fn(async () => []),
  updateOfflinePrintJob: vi.fn(async () => {}),
  getLocalPrinterMapping: vi.fn(async () => ({})),
  setLocalPrinterMapping: vi.fn(async () => {}),
  getPrintAgentUrl: vi.fn(async () => configuredUrl),
}));
vi.mock('../getCurrentRestaurantId', () => ({ getCurrentRestaurantId: () => currentOutlet }));
vi.mock('../../services/apiConfig', () => ({ apiUrl: (p) => `http://cloud${p}`, getAuthHeaders: () => ({}) }));
vi.mock('../../services/edgeHealth', () => ({
  getEdgeUrl: () => RESTO_PC,
  isEdgeLocalAuth: () => true,
  getStoredEdgeApiKey: (url) => `key-for-${url}`,
  getStoredEdgeRuntimeToken: () => null,
  isEdgeAtUrlForOutlet: async (url, outletId) =>
    (url === BAR_PC && outletId === 'outlet-bar') || (url === RESTO_PC && outletId === 'outlet-resto'),
}));
vi.mock('../secureStorage', () => ({ default: { getItem: () => null } }));

let printPosts;
beforeEach(() => {
  localStorage.clear();
  currentOutlet = 'outlet-resto';
  configuredUrl = BAR_PC;
  printPosts = [];
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    if (String(url).endsWith('/print')) {
      printPosts.push({ url: String(url), key: opts.headers?.['X-Edge-Key'] });
      return { ok: true, json: async () => ({ ok: true, queued: false }) };
    }
    throw new TypeError('Failed to fetch');
  });
});

async function load() {
  vi.resetModules();
  return import('../printOffline.js');
}

describe('printLocal target selection', () => {
  it('sends a restaurant KOT only to the restaurant PC, even with the bar PC configured', async () => {
    const { printLocal } = await load();
    const result = await printLocal({ type: 'KOT', escposData: [27, 64], eventId: 'e1', data: {} });
    expect(result.printed).toBe(true);
    expect(printPosts.map(p => p.url)).toEqual([`${RESTO_PC}/print`]);
    // Credentials for that PC, not for getEdgeUrl() in general.
    expect(printPosts[0].key).toBe(`key-for-${RESTO_PC}`);
  });

  it('fails the KOT instead of printing in another outlet when its own PC is down', async () => {
    currentOutlet = 'outlet-other';
    const { printLocal } = await load();
    const result = await printLocal({ type: 'KOT', escposData: [27, 64], eventId: 'e2', data: {} });
    expect(result.printed).toBe(false);
    expect(printPosts).toHaveLength(0);
  });
});
