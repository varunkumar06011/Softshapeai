/**
 * Tests for outlet-aware edge discovery in edgeHealth.js
 * Run: npx vitest run src/services/__tests__/edgeDiscovery.test.js
 *
 * Scenario: two outlets (bar + restaurant) on the same WiFi, each with its
 * own billing PC. Captains rotate between them.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let deviceIp = '192.168.5.23';
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ getLocalIp: async () => ({ ip: deviceIp }) }),
}));
vi.mock('../../android-local-pos/config', () => ({ isAndroidLocalCaptainEnabled: () => false }));
vi.mock('../../android-local-pos/hubStorage', () => ({ getStoredCashierHub: () => ({}) }));
vi.mock('../../utils/printOffline', () => ({ invalidatePrintAgentUrlCache: vi.fn() }));

const BAR = { restaurantId: 'outlet-bar', restaurantCode: 'VGL01', restaurantSlug: 'vigrand-lounge' };
const RESTO = { restaurantId: 'outlet-resto', restaurantCode: 'VFR01', restaurantSlug: 'vigrand-family' };

function health(outlet, extra = {}) {
  return { isOperational: true, sessionValid: true, onboarded: true, captainHub: true, ...outlet, ...extra };
}

let pcs; // url → /health body
let fetchCalls;

function installFetch() {
  fetchCalls = [];
  globalThis.fetch = vi.fn(async (url) => {
    fetchCalls.push(url);
    const base = String(url).replace(/\/health$/, '');
    if (pcs[base]) return { ok: true, json: async () => pcs[base] };
    throw new TypeError('Failed to fetch');
  });
}

async function loadEdgeHealth() {
  vi.resetModules();
  return import('../edgeHealth.js');
}

beforeEach(() => {
  localStorage.clear();
  deviceIp = '192.168.5.23';
  window.Capacitor = { isNativePlatform: () => true };
  pcs = {
    'http://192.168.5.40:3101': health(RESTO),
    'http://192.168.5.41:3101': health(BAR),
  };
  installFetch();
});

afterEach(() => {
  delete window.Capacitor;
  vi.useRealTimers();
});

describe('discoverEdgeOnLAN', () => {
  it('matches the typed outlet code against /health and skips the other outlet', async () => {
    const edge = await loadEdgeHealth();
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'vgl01', forCaptain: true });
    expect(url).toBe('http://192.168.5.41:3101');
    expect(edge.getEdgeUrl()).toBe('http://192.168.5.41:3101');
    // Code is now known to map to the bar's outlet id.
    expect(edge.resolveOutletId('VGL01')).toBe('outlet-bar');
    expect(edge.resolveOutletId('vigrand-lounge')).toBe('outlet-bar');
  });

  it('reconnects to a remembered outlet PC with one probe round instead of a scan', async () => {
    let edge = await loadEdgeHealth();
    await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-resto', forCaptain: true });
    expect(edge.getEdgeUrl()).toBe('http://192.168.5.40:3101');

    // Fresh app start (module state gone, localStorage kept), captain back in the bar.
    edge = await loadEdgeHealth();
    installFetch();
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(url).toBe('http://192.168.5.41:3101');
    expect(fetchCalls.length).toBeLessThan(5);
  });

  it('never returns the other outlet even when it is the only PC answering', async () => {
    delete pcs['http://192.168.5.41:3101'];
    const edge = await loadEdgeHealth();
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(url).toBeNull();
    expect(edge.getEdgeUrl()).not.toBe('http://192.168.5.40:3101');
  });

  it('skips counter PCs that opted out of captains', async () => {
    pcs['http://192.168.5.41:3101'] = health(BAR, { captainHub: false });
    pcs['http://192.168.5.77:3101'] = health(BAR);
    const edge = await loadEdgeHealth();
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(url).toBe('http://192.168.5.77:3101');
  });

  it('reaches a PC on another (routed) subnet through cloud hints without scanning', async () => {
    pcs = { 'http://192.168.9.15:3101': health(BAR) };
    const edge = await loadEdgeHealth();
    edge.setOutletEdgeHints('outlet-bar', ['http://192.168.9.15:3101']);
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true, fastOnly: true });
    expect(url).toBe('http://192.168.9.15:3101');
  });

  it('does not sweep the carrier subnet when the phone is on mobile data', async () => {
    deviceIp = '100.70.1.2'; // CGNAT — not a LAN
    pcs = {};
    const edge = await loadEdgeHealth();
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(url).toBeNull();
    expect(fetchCalls.some(u => String(u).includes('100.70.1.'))).toBe(false);
    expect(fetchCalls.length).toBeLessThan(40);
  });

  it('probes remembered PCs even during the failure cooldown', async () => {
    const edge = await loadEdgeHealth();
    await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    const barPc = pcs['http://192.168.5.41:3101'];
    delete pcs['http://192.168.5.41:3101']; // captain walks out of WiFi range
    expect(await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true })).toBeNull();

    pcs['http://192.168.5.41:3101'] = barPc; // back in range, cooldown still armed
    installFetch();
    const url = await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(url).toBe('http://192.168.5.41:3101');
    expect(fetchCalls.length).toBeLessThan(5);
  });
});

describe('outlet switching on shared WiFi', () => {
  it('drops the previous outlet\'s PC even while the scan cooldown is armed', async () => {
    const edge = await loadEdgeHealth();
    await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(edge.getEdgeUrl()).toBe('http://192.168.5.41:3101');

    // Restaurant PC is down: first attempt fails and arms the cooldown...
    const restoPc = pcs['http://192.168.5.40:3101'];
    delete pcs['http://192.168.5.40:3101'];
    expect(await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-resto', forCaptain: true })).toBeNull();
    // ...the bar URL must not linger for the restaurant login.
    await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-resto', forCaptain: true })).toBeNull();
    expect(edge.getEdgeUrl()).not.toBe('http://192.168.5.41:3101');
    expect(await edge.isCurrentEdgeForOutlet('outlet-resto')).toBe(false);

    pcs['http://192.168.5.40:3101'] = restoPc;
  });

  it('a phone already saved to the other outlet\'s PC stops using it and finds its own', async () => {
    // Restaurant captain whose app latched onto the bar PC (old unfiltered discovery).
    localStorage.setItem('ss_user', JSON.stringify({ restaurantId: 'outlet-resto' }));
    localStorage.setItem('softshape_edge_url_discovered', 'http://192.168.5.41:3101');
    const edge = await loadEdgeHealth();
    edge.setEdgeDiscoveryContext({ forCaptain: true });
    expect(await edge.isEdgeAvailable()).toBe(true);
    expect(edge.getEdgeUrl()).toBe('http://192.168.5.40:3101');
  });

  it('never reports the other outlet\'s PC as connected, even when it is the only one answering', async () => {
    delete pcs['http://192.168.5.40:3101'];
    localStorage.setItem('ss_user', JSON.stringify({ restaurantId: 'outlet-resto' }));
    localStorage.setItem('softshape_edge_url', 'http://192.168.5.41:3101'); // typed in Settings
    let edge = await loadEdgeHealth();
    expect(await edge.isEdgeAvailableFast()).toBe(false);
    expect(edge.getEdgeUrl()).not.toBe('http://192.168.5.41:3101');

    localStorage.setItem('softshape_edge_url_discovered', 'http://192.168.5.41:3101');
    edge = await loadEdgeHealth();
    expect(await edge.getEdgeConnectivityState()).not.toBe('edge_reachable');
    expect(await edge.isEdgeAvailable()).toBe(false);
    expect(edge.getEdgeUrl()).not.toBe('http://192.168.5.41:3101');
  });

  it('keeps using the runtime on this machine (billing PC) without an outlet check', async () => {
    pcs = { 'http://127.0.0.1:3101': health(BAR) };
    localStorage.setItem('ss_user', JSON.stringify({ restaurantId: 'outlet-resto' }));
    window.Capacitor = { isNativePlatform: () => false };
    const edge = await loadEdgeHealth();
    expect(await edge.isEdgeAvailableFast()).toBe(true);
    expect(await edge.getEdgeConnectivityState()).toBe('edge_reachable');
  });

  it('isCurrentEdgeForOutlet accepts the outlet id, code or slug and rejects other outlets', async () => {
    const edge = await loadEdgeHealth();
    await edge.discoverEdgeOnLAN({ expectedRestaurantId: 'outlet-bar', forCaptain: true });
    expect(await edge.isCurrentEdgeForOutlet('outlet-bar')).toBe(true);
    expect(await edge.isCurrentEdgeForOutlet('VGL01')).toBe(true);
    expect(await edge.isCurrentEdgeForOutlet('vigrand-lounge')).toBe(true);
    expect(await edge.isCurrentEdgeForOutlet('outlet-resto')).toBe(false);
    expect(await edge.isCurrentEdgeForOutlet('VFR01')).toBe(false);
  });
});

describe('edge credentials per PC / outlet', () => {
  it('keeps each PC\'s key and runtime token separate', async () => {
    const edge = await loadEdgeHealth();
    edge.setStoredEdgeApiKey('bar-key', { url: 'http://192.168.5.41:3101' });
    edge.setStoredEdgeRuntimeToken('bar-token', { url: 'http://192.168.5.41:3101' });
    edge.setStoredEdgeApiKey('resto-key', { url: 'http://192.168.5.40:3101' });
    edge.setStoredEdgeRuntimeToken('resto-token', { url: 'http://192.168.5.40:3101' });
    expect(edge.getStoredEdgeApiKey('http://192.168.5.41:3101')).toBe('bar-key');
    expect(edge.getStoredEdgeRuntimeToken('http://192.168.5.41:3101')).toBe('bar-token');
    expect(edge.getStoredEdgeApiKey('http://192.168.5.40:3101')).toBe('resto-key');
    expect(edge.getStoredEdgeRuntimeToken('http://192.168.5.40:3101')).toBe('resto-token');
  });

  it('uses the cloud key of the logged-in outlet for a PC it has not talked to yet', async () => {
    const edge = await loadEdgeHealth();
    edge.setStoredEdgeApiKey('bar-key', { url: 'http://192.168.5.41:3101' });
    localStorage.setItem('ss_user', JSON.stringify({ restaurantId: 'outlet-resto' }));
    edge.setStoredEdgeApiKey('resto-cloud-key', { outletId: 'outlet-resto' });
    // The legacy single value was last written by the cloud fetch, but the
    // bar PC keeps its own key.
    expect(edge.getStoredEdgeApiKey('http://192.168.5.40:3101')).toBe('resto-cloud-key');
    expect(edge.getStoredEdgeApiKey('http://192.168.5.41:3101')).toBe('bar-key');
  });
});

describe('startEdgeNetworkWatcher', () => {
  it('re-checks once on resume without clearing the scan cooldown', async () => {
    vi.useFakeTimers();
    const edge = await loadEdgeHealth();
    const onChange = vi.fn();
    const stop = edge.startEdgeNetworkWatcher(onChange);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('re-runs discovery when the network comes back', async () => {
    vi.useFakeTimers();
    const edge = await loadEdgeHealth();
    const onChange = vi.fn();
    const stop = edge.startEdgeNetworkWatcher(onChange);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1600);
    expect(onChange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
