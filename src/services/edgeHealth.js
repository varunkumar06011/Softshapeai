// ─────────────────────────────────────────────────────────────────────────────
// edgeHealth.js — Shared edge server availability check
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for edge server detection. Used by orderApi.js,
// tableApi.js, menuService.js, and any other service that needs to check
// if the local edge server (Bun sidecar) is running.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, apiUrl, getAuthHeaders, apiFetch } from "./apiConfig";
import secureStorage from "../utils/secureStorage";
import { isAndroidLocalCaptainEnabled } from "../android-local-pos/config";
import { getStoredCashierHub } from "../android-local-pos/hubStorage";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { isCaptainEdgeOnly } from "./captainEdgeOnly";

const EDGE_API_KEY_STORAGE_KEY = "softshape_edge_api_key";
const EDGE_RUNTIME_TOKEN_STORAGE_KEY = "softshape_edge_runtime_token";
const EDGE_URL_STORAGE_KEY = "softshape_edge_url";
const EDGE_DISCOVERED_URL_STORAGE_KEY = "softshape_edge_url_discovered";
// Per-outlet memory so captains moving between outlets (bar ↔ restaurant)
// reconnect to each outlet's PC with one fast health probe instead of a scan.
const EDGE_URL_BY_OUTLET_STORAGE_KEY = "softshape_edge_url_by_outlet";   // { outletId: url }
const EDGE_HINTS_BY_OUTLET_STORAGE_KEY = "softshape_edge_hints_by_outlet"; // { outletId: [url] } from cloud
const EDGE_OUTLET_ALIAS_STORAGE_KEY = "softshape_edge_outlet_alias";     // { code|slug (lowercase): outletId }

const DEFAULT_EDGE_URL = 'http://127.0.0.1:3101';
const EDGE_CHECK_TIMEOUT_MS = 3000;
const EDGE_CHECK_INTERVAL_MS = 30_000;
const LAN_DISCOVERY_TIMEOUT_MS = 1200;
// Known-URL probe (remembered / cloud hint). A LAN /health answers in <100ms.
const FAST_PROBE_TIMEOUT_MS = 1200;
const LAN_SCAN_BATCH_SIZE = 48;

/**
 * Returns true when the page is served over HTTPS in a browser (not Tauri
 * or Capacitor native). In this context, all edge server HTTP fetches are
 * blocked by the browser as mixed active content — the edge server runs on
 * HTTP (port 3101) on the LAN and can never be reached from an HTTPS page.
 * Tauri and Capacitor apps are exempt because their webviews don't enforce
 * mixed-content blocking the same way browser tabs do.
 */
function isHttpsBrowserContext() {
  if (typeof window === 'undefined' || !window.location) return false;
  if (window.location.protocol !== 'https:') return false;
  if (window.__TAURI__) return false;
  if (window.Capacitor?.isNativePlatform?.()) return false;
  return true;
}

let _edgeAvailable = false;
let _edgeLastCheck = 0;
let _discoveredEdgeUrl = null;
let _discoveryInProgress = null;
let _discoveryInProgressKey = null;
let _discoveryLastFailed = 0;
// Per-filter cooldown: a failed scan for outlet A must not block a scan for B.
let _discoveryFailedAt = new Map();
const DISCOVERY_FAILURE_COOLDOWN_MS = 15_000;
// Set by the captain app so background recovery (isEdgeAvailable) applies the
// same captainHub filter as the Auto-Discover button.
let _discoveryContext = { forCaptain: false };

// Diagnostic reason for the last failed LAN discovery. Survives cache
// invalidation (invalidateEdgeHealthCache does NOT clear this) because it's
// a user-facing diagnostic, not a cached health result. Only cleared on a
// successful discovery or at the start of a new attempt.
let _discoveryFailReason = null;

/**
 * Returns the current edge URL.
 * Priority: localStorage (user configured) > LAN discovery > default localhost.
 */
export function getEdgeUrl() {
  if (isAndroidLocalCaptainEnabled()) {
    const localHub = getStoredCashierHub();
    if (localHub.url && localHub.token) return localHub.url;
  }
  try {
    const stored = localStorage.getItem(EDGE_URL_STORAGE_KEY);
    if (stored) return stored;
  } catch { /* ignore */ }
  try {
    const discovered = localStorage.getItem(EDGE_DISCOVERED_URL_STORAGE_KEY);
    if (discovered) return discovered;
  } catch { /* ignore */ }
  if (_discoveredEdgeUrl) return _discoveredEdgeUrl;
  return DEFAULT_EDGE_URL;
}

/**
 * Manually set the edge URL (used by captain settings UI).
 */
export function setEdgeUrl(url) {
  try {
    if (url) {
      localStorage.setItem(EDGE_URL_STORAGE_KEY, url);
    } else {
      localStorage.removeItem(EDGE_URL_STORAGE_KEY);
    }
    resetEdgeCache();
  } catch { /* ignore */ }
}

/**
 * Captain app: PCs are found automatically. A URL typed in on an older
 * version would pin the phone to that address forever (discovery skips when a
 * manual URL is set), so it becomes an ordinary discovered URL — still tried
 * first, but replaced when it is dead or belongs to another outlet.
 */
export function stopUsingManualEdgeUrl() {
  try {
    const manual = localStorage.getItem(EDGE_URL_STORAGE_KEY);
    if (!manual) return;
    localStorage.removeItem(EDGE_URL_STORAGE_KEY);
    _discoveredEdgeUrl = manual;
    localStorage.setItem(EDGE_DISCOVERED_URL_STORAGE_KEY, manual);
    resetEdgeCache();
  } catch { /* ignore */ }
}

// ── Edge credentials ─────────────────────────────────────────────────────────
// The edge API key is per outlet and the runtime token per edge server, but
// both used to be stored once per device. After a captain moved from the bar
// to the restaurant, every LAN call to the restaurant PC carried the bar's
// credentials, was rejected, and "recovery" re-read the same cached key — so
// the app stayed on cloud. They are now stored per edge URL (credentials the
// PC itself handed out) and per outlet (key fetched from the cloud), with the
// old single value kept only as a last-resort fallback.
const EDGE_CREDS_BY_URL_STORAGE_KEY = "softshape_edge_creds_by_url";       // { url: { apiKey, runtimeToken } }
const EDGE_KEY_BY_OUTLET_STORAGE_KEY = "softshape_edge_key_by_outlet";     // { outletId: apiKey }

function updateCredsForUrl(url, patch) {
  if (!url) return;
  const map = readJsonStore(EDGE_CREDS_BY_URL_STORAGE_KEY);
  const next = { ...(map[url] || {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
  if (Object.keys(next).length) map[url] = next; else delete map[url];
  writeJsonStore(EDGE_CREDS_BY_URL_STORAGE_KEY, map);
}

export function getStoredEdgeApiKey(url = getEdgeUrl()) {
  try {
    const byUrl = readJsonStore(EDGE_CREDS_BY_URL_STORAGE_KEY)[url]?.apiKey;
    if (byUrl) return byUrl;
    const outletId = getCurrentOutletId();
    const byOutlet = outletId ? readJsonStore(EDGE_KEY_BY_OUTLET_STORAGE_KEY)[outletId] : null;
    if (byOutlet) return byOutlet;
    return localStorage.getItem(EDGE_API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {{ url?: string, outletId?: string }} [scope] — url: the edge that
 *   issued / accepted the key; outletId: the outlet the cloud issued it for.
 *   Defaults to the current edge URL.
 */
export function setStoredEdgeApiKey(key, { url, outletId } = {}) {
  if (!key) return;
  try {
    if (outletId) {
      const map = readJsonStore(EDGE_KEY_BY_OUTLET_STORAGE_KEY);
      map[outletId] = key;
      writeJsonStore(EDGE_KEY_BY_OUTLET_STORAGE_KEY, map);
    } else {
      updateCredsForUrl(url || getEdgeUrl(), { apiKey: key });
    }
    localStorage.setItem(EDGE_API_KEY_STORAGE_KEY, key);
  } catch {
    // Ignore storage errors (e.g., private mode)
  }
}

export function getStoredEdgeRuntimeToken(url = getEdgeUrl()) {
  try {
    return readJsonStore(EDGE_CREDS_BY_URL_STORAGE_KEY)[url]?.runtimeToken
      || localStorage.getItem(EDGE_RUNTIME_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredEdgeRuntimeToken(token, { url } = {}) {
  if (!token) return;
  try {
    updateCredsForUrl(url || getEdgeUrl(), { runtimeToken: token });
    localStorage.setItem(EDGE_RUNTIME_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage errors (e.g., private mode)
  }
}

function clearStoredEdgeRuntimeToken(url = getEdgeUrl()) {
  updateCredsForUrl(url, { runtimeToken: null });
  try { localStorage.removeItem(EDGE_RUNTIME_TOKEN_STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * @param {{ force?: boolean }} [opts] — force: skip the cached key and ask the
 *   cloud for the current outlet's key (after login / outlet switch, or when
 *   the edge rejected the cached one).
 */
export async function ensureEdgeApiKey({ force = false } = {}) {
  if (!force) {
    const cached = getStoredEdgeApiKey();
    if (cached) return cached;
  }

  // Edge-local tokens (offline PIN login) are not cloud JWTs — the backend
  // rejects them with 401. Skip the cloud fetch entirely; the edge server
  // returns edgeApiKey in the PIN login response, so the captain should
  // already have it. If not, there's no way to get it from cloud with a
  // fake token.
  const token = secureStorage.getItem('ss_token');
  if (token && token.startsWith('edge-local-')) {
    console.warn("[Edge] Skipping edge API key fetch — edge-local token cannot authenticate with cloud");
    return force ? getStoredEdgeApiKey() : null;
  }

  try {
    const res = await fetch(`${API_BASE}/api/edge/key`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { edgeApiKey } = await res.json();
    // The key belongs to the outlet in the JWT, not to whatever PC
    // getEdgeUrl() currently points at.
    setStoredEdgeApiKey(edgeApiKey, { outletId: getCurrentOutletId() || undefined });
    return edgeApiKey;
  } catch (err) {
    console.warn("[Edge] Failed to fetch edge API key:", err.message);
    return null;
  }
}

/**
 * Fetch the runtime token from the edge server using the stored edge API key.
 * This is the recovery path for captains that logged in via cloud (and thus
 * never obtained a runtime token from PIN login). The edge server's
 * /api/edge/runtime-token endpoint accepts the X-Edge-Key header and returns
 * the runtime token — no Bearer token required (the endpoint is in PUBLIC_PATHS).
 */
export async function ensureEdgeRuntimeToken() {
  const url = getEdgeUrl();
  const cached = getStoredEdgeRuntimeToken(url);
  if (cached) return cached;

  const edgeApiKey = getStoredEdgeApiKey(url);
  if (!edgeApiKey) return null;

  try {
    const res = await fetch(`${url}/api/edge/runtime-token`, {
      headers: { 'X-Edge-Key': edgeApiKey },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.runtimeToken) {
      setStoredEdgeRuntimeToken(data.runtimeToken, { url });
      return data.runtimeToken;
    }
    return null;
  } catch (err) {
    console.warn("[Edge] Failed to fetch runtime token:", err.message);
    return null;
  }
}

export function resetEdgeCache() {
  // Only reset the timestamp so the next isEdgeAvailable() call does a fresh
  // health check. Do NOT set _edgeAvailable = false — that causes the edge
  // socket reconnect loop and other callers to assume the edge is down for
  // up to 30 seconds, even though the edge server is perfectly fine. This
  // was the root cause of "edge keeps checking but not connecting" — normal
  // cashier operations (bill print, KOT reprint) called resetEdgeCache(),
  // which nuked the availability state and prevented socket reconnection.
  _edgeLastCheck = 0;
  _connectivityLastCheck = 0;
}

/**
 * Manually invalidate the edge health cache. Call this after a known edge server
 * restart or when the user manually changes the edge URL.
 *
 * Only resets the cache timestamps so the next check runs fresh. Does NOT clear
 * the discovered edge URL — clearing it mid-operation causes getEdgeUrl() to
 * fall back to 127.0.0.1:3101 (localhost), which doesn't work on the captain's
 * phone. The URL should only be cleared by resetEdgeCache() during a full
 * re-discovery cycle, not during normal cache invalidation.
 */
export function invalidateEdgeHealthCache() {
  _edgeLastCheck = 0;
  _discoveryLastFailed = 0;
  _discoveryFailedAt.clear();
  _connectivityLastCheck = 0;
  // Intentionally does NOT clear _discoveryFailReason — it's a diagnostic,
  // not a health cache. See comment at the variable declaration.
}

/**
 * Returns the diagnostic reason for the last failed LAN discovery, or null
 * if the last discovery succeeded or hasn't been attempted yet. Used by the
 * captain UI to show an actionable error instead of a blank "Edge Offline".
 */
export function getEdgeDiscoveryFailReason() {
  return _discoveryFailReason;
}

/**
 * Pre-warm the edge health cache. Call once on app startup so the first
 * data fetch doesn't pay the health check latency.
 */
export function prewarmEdgeHealth() {
  if (isHttpsBrowserContext()) return;
  isEdgeAvailable().catch(() => {});
}

// The outlet id the linked edge server is actually bound to, read from /health.
// Cached briefly so callers can resolve tenant-scoped cache keys without
// hammering the endpoint on every read.
let _edgeRestaurantId = null;
let _edgeRestaurantIdAt = 0;
const EDGE_RESTAURANT_ID_TTL_MS = 60_000;

/**
 * Returns the restaurantId the linked edge server is bound to, or null when
 * the edge is unreachable / not linked. When this differs from
 * getCurrentRestaurantId() (e.g. the app was logged in while the edge was
 * linked to a different outlet), tenant-scoped caches hold the wrong outlet's
 * data and callers should trust the edge id instead.
 */
export async function getEdgeRestaurantId({ force = false } = {}) {
  if (!force && _edgeRestaurantId && Date.now() - _edgeRestaurantIdAt < EDGE_RESTAURANT_ID_TTL_MS) {
    return _edgeRestaurantId;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
    const res = await fetch(`${getEdgeUrl()}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const health = await res.json().catch(() => ({}));
      _edgeRestaurantId = health.restaurantId || null;
      _edgeRestaurantIdAt = Date.now();
    }
  } catch { /* edge unreachable — keep last known value */ }
  return _edgeRestaurantId;
}

/**
 * Wait for the edge server to become fully operational (isOperational: true).
 * The Runtime returns isOperational=false while BOOTING/STARTING (downloading
 * config, warming cache). This helper polls until the runtime is READY
 * or the timeout expires, so callers don't read an empty menu from a
 * half-synced DB.
 *
 * @param {number} timeoutMs — max time to wait (default 15s)
 * @param {number} intervalMs — poll interval (default 1s)
 * @returns {Promise<boolean>} true if edge is operational, false on timeout
 */
export async function waitForEdgeReady(timeoutMs = 15_000, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const edgeUrl = getEdgeUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
      const res = await fetch(`${edgeUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const health = await res.json().catch(() => ({}));
        // isOperational is the single source of truth from RuntimeManager.
        // It's true only when runtimeState === READY — the HTTP server is
        // listening AND config sync has completed AND local data is available.
        // The old status === "ok" fallback is removed because it was true
        // during STARTING, causing the UI to read empty/half-synced data.
        if (health.isOperational === true) {
          _edgeAvailable = true;
          _edgeLastCheck = Date.now();
          return true;
        }
      }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

// ── Outlet-aware edge memory ─────────────────────────────────────────────────
// Captains rotate between outlets (bar ↔ restaurant) that share one WiFi. Each
// outlet has its own billing PC, so we remember which PC served which outlet
// and probe that address first. A full LAN scan only runs when every known
// address has failed.

function readJsonStore(key) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeJsonStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function aliasKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Resolve the outlet code / slug a captain typed to the outlet id, once we
 * have seen it (cloud crew lookup or an edge /health). Ids pass through.
 */
export function resolveOutletId(idOrCode) {
  if (!idOrCode) return null;
  const aliases = readJsonStore(EDGE_OUTLET_ALIAS_STORAGE_KEY);
  return aliases[aliasKey(idOrCode)] || String(idOrCode).trim();
}

export function rememberOutletAlias(codeOrSlug, outletId) {
  const key = aliasKey(codeOrSlug);
  if (!key || !outletId || key === aliasKey(outletId)) return;
  const aliases = readJsonStore(EDGE_OUTLET_ALIAS_STORAGE_KEY);
  if (aliases[key] === outletId) return;
  aliases[key] = outletId;
  writeJsonStore(EDGE_OUTLET_ALIAS_STORAGE_KEY, aliases);
}

function rememberEdgeUrlForOutlet(outletId, url) {
  if (!outletId || !url) return;
  const map = readJsonStore(EDGE_URL_BY_OUTLET_STORAGE_KEY);
  if (map[outletId] === url) return;
  map[outletId] = url;
  writeJsonStore(EDGE_URL_BY_OUTLET_STORAGE_KEY, map);
}

/**
 * Store the LAN addresses the cloud reports for an outlet's PCs (crew lookup /
 * agent-endpoint). They are only candidates — every one is health-checked and
 * outlet-filtered before use — but they let a phone on a different subnet
 * (routed buildings) reach the PC without scanning.
 */
export function setOutletEdgeHints(outletId, urls) {
  if (!outletId || !Array.isArray(urls)) return;
  const clean = [...new Set(urls.filter(u => typeof u === 'string' && /^https?:\/\/[^/]+$/.test(u)))].slice(0, 8);
  const map = readJsonStore(EDGE_HINTS_BY_OUTLET_STORAGE_KEY);
  map[outletId] = clean;
  writeJsonStore(EDGE_HINTS_BY_OUTLET_STORAGE_KEY, map);
}

function getKnownEdgeUrlsForOutlet(outletId) {
  if (!outletId) return [];
  const remembered = readJsonStore(EDGE_URL_BY_OUTLET_STORAGE_KEY)[outletId];
  const hints = readJsonStore(EDGE_HINTS_BY_OUTLET_STORAGE_KEY)[outletId];
  return [remembered, ...(Array.isArray(hints) ? hints : [])].filter(Boolean);
}

function getCurrentOutletId() {
  // Same source as tenant scoping / CaptainApp, so the poll and background
  // recovery share one filtered scan instead of running two.
  const fromUser = getCurrentRestaurantId();
  if (fromUser) return fromUser;
  try {
    const raw = localStorage.getItem('ss_restaurant');
    return raw ? (JSON.parse(raw)?.id || null) : null;
  } catch {
    return null;
  }
}

/**
 * Captain app calls this once so background recovery in isEdgeAvailable()
 * skips counter PCs (captainHub=false), same as the Auto-Discover button.
 */
export function setEdgeDiscoveryContext({ forCaptain = false } = {}) {
  _discoveryContext = { forCaptain: !!forCaptain };
}

function isPrivateIPv4(ip) {
  const p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

function subnetPrefixOfUrl(url) {
  const m = /^https?:\/\/(\d+\.\d+\.\d+)\.\d+(?::\d+)?$/.exec(url || '');
  return m && isPrivateIPv4(`${m[1]}.1`) ? m[1] : null;
}

async function probeEdgeHealth(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json().catch(() => ({}));
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * `expected` is an outlet id, or — before the first cloud lookup — the code /
 * slug the captain typed, so compare against every identifier the runtime
 * reports. Comparing a slug against the id alone rejected every PC and made
 * each login sit through a full failed scan.
 */
function healthMatchesOutlet(health, expected) {
  // Older runtimes that don't report an id stay eligible.
  if (!expected || !health.restaurantId) return true;
  const want = aliasKey(expected);
  return [health.restaurantId, health.restaurantCode, health.restaurantSlug]
    .some(v => v && aliasKey(v) === want);
}

/**
 * Is `health` (read from `url`) another outlet's PC? Two outlets on one WiFi
 * both answer /health, so a phone that once latched onto the sibling outlet's
 * PC (stale discovered URL, cloud primary shared between outlets, or a URL
 * typed in Settings) kept showing "Edge" and sent every KOT there. Localhost
 * is this machine's own runtime and is never filtered.
 */
function isOtherOutletsEdge(url, health) {
  if (!health || url.includes('127.0.0.1') || url.includes('localhost')) return false;
  const outletId = getCurrentOutletId();
  return !!outletId && !healthMatchesOutlet(health, outletId);
}

/** Stop using `url` (another outlet's PC) so recovery finds this outlet's PC. */
function dropOtherOutletsEdge(url) {
  console.warn(`[Edge] ${url} belongs to another outlet — not using it`);
  try {
    if (localStorage.getItem(EDGE_URL_STORAGE_KEY) === url) localStorage.removeItem(EDGE_URL_STORAGE_KEY);
    if (localStorage.getItem(EDGE_DISCOVERED_URL_STORAGE_KEY) === url) localStorage.removeItem(EDGE_DISCOVERED_URL_STORAGE_KEY);
  } catch { /* ignore */ }
  if (_discoveredEdgeUrl === url) _discoveredEdgeUrl = null;
  _edgeAvailable = false;
  _connectivityLastCheck = 0;
}

/**
 * Is the edge at getEdgeUrl() bound to this outlet (id, code or slug)?
 * Unreachable → false. Used by login so a stale URL pointing at the previous
 * outlet's PC is never sent a PIN.
 */
export async function isCurrentEdgeForOutlet(outletIdOrCode) {
  if (!outletIdOrCode) return true;
  const health = await probeEdgeHealth(getEdgeUrl(), EDGE_CHECK_TIMEOUT_MS);
  return !!health && healthMatchesOutlet(health, resolveOutletId(outletIdOrCode));
}

/**
 * Does the edge at `url` belong to this outlet (id, code or slug)? Used to
 * pick a print target: with two outlets on one WiFi, a KOT must only go to
 * its own outlet's PC. Unreachable or not onboarded → false.
 */
export async function isEdgeAtUrlForOutlet(url, outletIdOrCode, timeoutMs = FAST_PROBE_TIMEOUT_MS) {
  const health = await probeEdgeHealth(url, timeoutMs);
  if (!health || health.onboarded === false) return false;
  return healthMatchesOutlet(health, outletIdOrCode ? resolveOutletId(outletIdOrCode) : null);
}

function isUsableEdgeHealth(health, { expected, forCaptain }) {
  if (!health) return false;
  // Reject non-onboarded edge servers — a print agent installed but never
  // linked to a restaurant responds on /health with onboarded=false.
  // Returning it poisons PIN login with 401 "Restaurant is not linked locally".
  if (health.onboarded === false) return false;
  // Reject edge servers belonging to a different outlet. When two outlets
  // (e.g. bar + restaurant) share the same WiFi, both edge servers respond on
  // /health — without this, KOTs could go to the wrong kitchen.
  if (!healthMatchesOutlet(health, expected)) return false;
  // Multi-PC restaurant: a counter PC that opted out of captains is skipped.
  // Older runtimes don't report the field (undefined) and stay eligible.
  if (forCaptain && health.captainHub === false) return false;
  return true;
}

/** Make `url` the active edge server and remember it for its outlet. */
async function adoptEdgeUrl(url, health) {
  _discoveredEdgeUrl = url;
  // Persist so the URL survives page reloads (e.g. after logout).
  try { localStorage.setItem(EDGE_DISCOVERED_URL_STORAGE_KEY, url); } catch { /* ignore */ }
  _discoveryFailReason = null;
  if (health?.restaurantId) {
    rememberEdgeUrlForOutlet(health.restaurantId, url);
    rememberOutletAlias(health.restaurantCode, health.restaurantId);
    rememberOutletAlias(health.restaurantSlug, health.restaurantId);
  }
  // Sync availability caches from the health we just read so the UI and the
  // login gate agree immediately instead of waiting for the next poll.
  if (health?.isOperational === true) {
    _edgeAvailable = true;
    _edgeLastCheck = Date.now();
    _connectivityState = (health.sessionValid && health.onboarded !== false) ? 'edge_reachable' : 'edge_not_ready';
    _connectivityLastCheck = Date.now();
  } else {
    _edgeLastCheck = 0; // force health re-check on new URL
    _connectivityLastCheck = 0;
  }
  // Invalidate the Print Agent URL cache so the next print attempt rebuilds
  // the candidate list with the new edge URL. Without this, the captain uses
  // a stale 30s-cached list that only contains 127.0.0.1:3101 (the phone
  // itself) and KOT prints fail during that window.
  try {
    const { invalidatePrintAgentUrlCache } = await import('../utils/printOffline');
    invalidatePrintAgentUrlCache();
  } catch { /* printOffline not loaded yet — cache will rebuild on first call */ }
}

/**
 * Probe the addresses we already know for the outlet (remembered PC, cloud
 * hints, current URL) in parallel. ~100ms when the PC is there.
 */
async function probeKnownEdgeUrls({ expected, forCaptain }) {
  const urls = [];
  const push = (u) => { if (u && !urls.includes(u)) urls.push(u); };
  getKnownEdgeUrlsForOutlet(expected || getCurrentOutletId()).forEach(push);
  push(_discoveredEdgeUrl);
  try { push(localStorage.getItem(EDGE_DISCOVERED_URL_STORAGE_KEY)); } catch { /* ignore */ }
  // Cashier PC: the runtime is local. On a phone this is refused instantly.
  push(DEFAULT_EDGE_URL);

  const healths = await Promise.all(urls.map(u => probeEdgeHealth(u, FAST_PROBE_TIMEOUT_MS)));
  for (let i = 0; i < urls.length; i++) {
    if (isUsableEdgeHealth(healths[i], { expected, forCaptain })) {
      if (urls[i] === DEFAULT_EDGE_URL) {
        // The runtime is on this machine. Every LAN URL before it failed, so
        // drop the persisted one — otherwise getEdgeUrl() keeps returning it
        // instead of localhost.
        _discoveredEdgeUrl = null;
        try { localStorage.removeItem(EDGE_DISCOVERED_URL_STORAGE_KEY); } catch { /* ignore */ }
        const h = healths[i];
        if (h.restaurantId) {
          rememberOutletAlias(h.restaurantCode, h.restaurantId);
          rememberOutletAlias(h.restaurantSlug, h.restaurantId);
        }
        if (h.isOperational === true) {
          _edgeAvailable = true;
          _edgeLastCheck = Date.now();
          _connectivityState = (h.sessionValid && h.onboarded !== false) ? 'edge_reachable' : 'edge_not_ready';
          _connectivityLastCheck = Date.now();
        }
        return urls[i];
      }
      await adoptEdgeUrl(urls[i], healths[i]);
      return urls[i];
    }
  }
  return null;
}

/**
 * Private /24 prefixes of this device. Non-private addresses (mobile data,
 * CGNAT) are ignored — scanning the carrier's subnet is pointless and was what
 * happened when a captain stepped out of WiFi range.
 */
async function getLocalSubnetPrefixes() {
  const prefixes = [];
  const add = (ip) => {
    if (!ip || !isPrivateIPv4(ip)) return;
    const prefix = ip.split('.').slice(0, 3).join('.');
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
  };

  // Capacitor native plugin: read local IP via ConnectivityManager. On
  // Android, WebRTC is often disabled in the WebView (or only yields mDNS
  // candidates), so ask the native side first. Needs only
  // ACCESS_NETWORK_STATE — no location permission.
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const LocalNetwork = registerPlugin('LocalNetwork');
      const result = await LocalNetwork.getLocalIp();
      add(result?.ip);
    } catch { /* plugin not available or failed */ }
  }

  if (!prefixes.length && typeof window !== 'undefined' && window.RTCPeerConnection) {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Wait briefly for ICE gathering
      await new Promise(resolve => setTimeout(resolve, 500));
      const lines = pc.localDescription?.sdp?.split('\n') || [];
      for (const line of lines) {
        const match = line.match(/a=candidate.*\b(\d+\.\d+\.\d+\.\d+)\b/);
        if (match) add(match[1]);
      }
      pc.close();
    } catch { /* WebRTC not available */ }
  }
  return prefixes;
}

// Fallback guess-list across RFC 1918 ranges, used after the subnet sweep.
// Covers SOHO defaults and common POS-vendor/mesh router IPs.
const COMMON_EDGE_HOSTS = [
  '192.168.0.1', '192.168.0.2', '192.168.0.100',
  '192.168.1.1', '192.168.1.2', '192.168.1.100',
  '192.168.2.1', '192.168.2.100',
  '192.168.10.1', '192.168.10.100',
  '192.168.100.1', '192.168.100.100',
  '192.168.254.1',
  '10.0.0.1', '10.0.0.2', '10.0.0.100', '10.0.1.1', '10.0.10.1', '10.0.90.1',
  '10.1.1.1', '10.10.10.10', '10.90.0.1', '10.255.255.1',
  '172.16.0.1', '172.16.0.2', '172.16.0.100', '172.17.0.1', '172.20.0.1',
  '172.30.0.1', '172.31.0.1',
];

function buildScanCandidates(prefixes) {
  const candidates = [];
  const seen = new Set();
  const add = (host) => {
    if (seen.has(host)) return;
    seen.add(host);
    candidates.push(`http://${host}:3101`);
  };
  for (const p of prefixes) {
    // Likely static addresses first, then the full DHCP range.
    add(`${p}.1`);
    add(`${p}.100`);
    for (let i = 2; i <= 254; i++) add(`${p}.${i}`);
  }
  COMMON_EDGE_HOSTS.forEach(add);
  return candidates;
}

/**
 * Every outlet's billing PC on this WiFi, one entry per outlet:
 * [{ outletId, name, url }]. Used by the captain login so the captain picks
 * their outlet by name (the PCs report their outlet on /health) — no code to
 * type and no cloud lookup. Remembered PCs are probed first; `onFound` gets
 * the list each time a new outlet turns up so the screen fills in while the
 * scan runs. Each PC found is remembered for its outlet, so connecting to the
 * chosen one afterwards is a single probe.
 */
export async function findBillingPcsOnLan({ forCaptain = true, onFound } = {}) {
  if (isHttpsBrowserContext()) return [];
  const outlets = new Map(); // outletId -> { outletId, name, url }
  const consider = (url, health) => {
    if (!isUsableEdgeHealth(health, { expected: null, forCaptain }) || !health.restaurantId) return;
    if (outlets.has(health.restaurantId)) return;
    outlets.set(health.restaurantId, { outletId: health.restaurantId, name: health.restaurantName || 'Billing PC', url });
    rememberEdgeUrlForOutlet(health.restaurantId, url);
    rememberOutletAlias(health.restaurantCode, health.restaurantId);
    rememberOutletAlias(health.restaurantSlug, health.restaurantId);
    try { onFound?.([...outlets.values()]); } catch { /* ignore */ }
  };
  const probeAll = async (urls) => {
    const healths = await Promise.all(urls.map(u => probeEdgeHealth(u, LAN_DISCOVERY_TIMEOUT_MS)));
    urls.forEach((u, i) => consider(u, healths[i]));
  };

  const known = [...new Set([
    ...Object.values(readJsonStore(EDGE_URL_BY_OUTLET_STORAGE_KEY)),
    _discoveredEdgeUrl,
  ].filter(u => typeof u === 'string' && u))];
  await probeAll(known);

  const candidates = buildScanCandidates(await getLocalSubnetPrefixes()).filter(u => !known.includes(u));
  for (let i = 0; i < candidates.length; i += LAN_SCAN_BATCH_SIZE) {
    await probeAll(candidates.slice(i, i + LAN_SCAN_BATCH_SIZE));
  }
  return [...outlets.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function scanLanForEdge({ expected, forCaptain, wide }) {
  const prefixes = await getLocalSubnetPrefixes();
  if (wide) {
    // Routed buildings: the outlet's PC may sit on another /24 (the other
    // building's WiFi). Sweep the subnets we have seen it on / the cloud
    // reported, so a DHCP change there is still found. Capped to bound the scan.
    const extra = getKnownEdgeUrlsForOutlet(expected || getCurrentOutletId())
      .map(subnetPrefixOfUrl)
      .filter(p => p && !prefixes.includes(p));
    for (const p of [...new Set(extra)].slice(0, 2)) prefixes.push(p);
  }

  const candidates = buildScanCandidates(prefixes);
  for (let i = 0; i < candidates.length; i += LAN_SCAN_BATCH_SIZE) {
    const batch = candidates.slice(i, i + LAN_SCAN_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (url) => {
      const health = await probeEdgeHealth(url, LAN_DISCOVERY_TIMEOUT_MS);
      return isUsableEdgeHealth(health, { expected, forCaptain }) ? { url, health } : null;
    }));
    const hit = results.find(Boolean);
    if (hit) {
      await adoptEdgeUrl(hit.url, hit.health);
      console.log('[Edge] Discovered edge server on LAN:', hit.url);
      return hit.url;
    }
  }
  return null;
}

/**
 * Discover the edge server URL from the cloud backend.
 * The backend stores each print agent's LAN IP when it registers; the edge
 * server runs on port 3101 on the same machine. Call this after login so the
 * captain app on a different device can find the edge server without relying
 * on 127.0.0.1 (which only works on the cashier PC itself).
 */
export async function discoverEdgeUrlFromBackend({ forCaptain = false } = {}) {
  // On an HTTPS browser page, the discovered HTTP edge URL would be blocked
  // as mixed content on every subsequent health check. Skip discovery entirely.
  if (isHttpsBrowserContext()) return null;
  // The captain app finds its PC on the WiFi only.
  if (isCaptainEdgeOnly()) return null;
  try {
    // Don't overwrite a user-configured URL
    const stored = localStorage.getItem(EDGE_URL_STORAGE_KEY);
    if (stored) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const headers = getAuthHeaders();
    // Edge-local tokens (offline PIN login) are not cloud JWTs — the backend
    // rejects them with 401. Fall back to the preauth token so backend
    // discovery still works when the captain has a stale edge-local session
    // and the edge server is unreachable.
    const token = secureStorage.getItem('ss_token');
    const isEdgeLocal = token && token.startsWith('edge-local-');
    if (!headers['Authorization'] || isEdgeLocal) {
      const preAuthToken = secureStorage.getItem('ss_preauth_token');
      if (preAuthToken) {
        headers['Authorization'] = `Bearer ${preAuthToken}`;
      } else if (isEdgeLocal) {
        // No preauth token and only an edge-local token — cloud discovery
        // will fail. Skip the fetch entirely rather than wasting 3s on a 401.
        clearTimeout(timeoutId);
        return null;
      }
    }
    const res = await fetch(`${API_BASE}/api/print/agent-endpoint`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();

    const urls = [];
    if (data.lanIp) urls.push(`http://${data.lanIp}:3101`);
    for (const agent of Array.isArray(data.agents) ? data.agents : []) {
      const u = agent?.lanIp ? `http://${agent.lanIp}:3101` : null;
      if (u && agent.online !== false && !urls.includes(u)) urls.push(u);
    }
    if (!urls.length) return null;
    const outletId = getCurrentOutletId();
    if (outletId) setOutletEdgeHints(outletId, urls);

    const primaryUrl = data.lanIp ? urls[0] : null;
    if (forCaptain) {
      // Multi-PC restaurant: the cloud's primary PC may be a counter PC that
      // opted out of captains. Probe every PC the outlet has and take the
      // first one that serves captains.
      const healths = await Promise.all(urls.map(u => probeEdgeHealth(u, LAN_DISCOVERY_TIMEOUT_MS)));
      const idx = healths.findIndex(h => isUsableEdgeHealth(h, { expected: outletId, forCaptain: true }));
      if (idx >= 0) {
        await adoptEdgeUrl(urls[idx], healths[idx]);
        console.log('[edgeHealth] Discovered edge server at', urls[idx], 'from backend');
        return urls[idx];
      }
      // None reachable from here. Don't adopt the primary blind: from the
      // other building's WiFi (or with no routing) it would replace a working
      // URL on every poll. The addresses are stored as hints above, so known-
      // URL probes keep trying them.
      return null;
    }
    if (!primaryUrl) return null;
    // Persist so the URL survives page reloads (e.g. after logout triggers
    // window.location.href = '/captain'). Without this, getEdgeUrl() falls
    // back to 127.0.0.1:3101 — the phone itself, not the cashier PC.
    await adoptEdgeUrl(primaryUrl, null);
    console.log('[edgeHealth] Discovered edge server at', primaryUrl, 'from backend');
    return primaryUrl;
  } catch (err) {
    console.debug('[edgeHealth] Backend edge URL discovery failed:', err.message);
  }
  return null;
}

/**
 * Returns true if the current session was established via offline edge PIN
 * login (the stored token is an `edge-local-*` marker, not a real JWT).
 * In this state, cloud API fallback calls will always fail because the
 * cloud backend cannot verify the fake token. Read functions should check
 * this before attempting a cloud fallback and surface a clear error instead.
 */
export function isEdgeLocalAuth() {
  try {
    const token = secureStorage.getItem('ss_token');
    return !!token && token.startsWith('edge-local-');
  } catch {
    return false;
  }
}

function clearDiscoveredEdgeUrl() {
  let persisted = null;
  try { persisted = localStorage.getItem(EDGE_DISCOVERED_URL_STORAGE_KEY); } catch { /* ignore */ }
  if (!_discoveredEdgeUrl && !persisted) return;
  _discoveredEdgeUrl = null;
  try { localStorage.removeItem(EDGE_DISCOVERED_URL_STORAGE_KEY); } catch { /* ignore */ }
  resetEdgeCache();
}

/**
 * Find the edge server: known addresses first (remembered PC for the outlet,
 * cloud hints, current URL — one parallel probe), then a LAN scan.
 *
 * @param {{ force?: boolean, expectedRestaurantId?: string, forCaptain?: boolean, fastOnly?: boolean, wide?: boolean }} [opts]
 *   - force: bypasses the failure cooldown (Auto-Discover button).
 *   - expectedRestaurantId: outlet id, code or slug. Only edge servers whose
 *     /health identifies this outlet are accepted, so two outlets sharing
 *     WiFi never cross-connect.
 *   - forCaptain: skips PCs that report captainHub=false (counter PCs).
 *   - fastOnly: probe known addresses only, never scan.
 *   - wide: also sweep subnets the outlet's PC was previously seen on (for
 *     routed multi-building networks). Off for login so it stays quick.
 * Returns the discovered edge URL or null.
 */
export async function discoverEdgeOnLAN({ force = false, expectedRestaurantId, forCaptain = false, fastOnly = false, wide = false } = {}) {
  // On an HTTPS browser page, HTTP LAN probes are blocked as mixed content.
  if (isHttpsBrowserContext()) return null;
  try {
    // Skip discovery if user has manually configured a URL
    if (localStorage.getItem(EDGE_URL_STORAGE_KEY)) return null;
  } catch { /* ignore */ }

  const expected = expectedRestaurantId ? resolveOutletId(expectedRestaurantId) : null;
  // Fast path is read-mostly and quick — never queue it behind a running scan.
  if (fastOnly) return probeKnownEdgeUrls({ expected, forCaptain });

  const key = `${expected || ''}|${forCaptain ? 'captain' : ''}`;
  if (_discoveryInProgress) {
    // Same filter (login + poll overlap) or an unfiltered caller → share the
    // running scan. A different filter waits for it to drain, then runs its
    // own, so it can never be handed another outlet's PC.
    if (_discoveryInProgressKey === key || (!force && !expected)) return _discoveryInProgress;
    await _discoveryInProgress.catch(() => {});
  }

  const run = (async () => {
    const known = await probeKnownEdgeUrls({ expected, forCaptain });
    if (known) return known;

    // A specific outlet was asked for and the current URL isn't it (other
    // outlet's PC, or dead). Drop it even during the cooldown, otherwise PIN
    // login would be sent to the previous outlet's PC.
    if (expected) clearDiscoveredEdgeUrl();

    // Cooldown: a scan with this filter failed recently. Fast-fail without
    // re-scanning; _discoveryFailReason persists so the UI can still show why.
    // Known addresses were still probed above, so returning to WiFi reconnects
    // even while cooling down.
    if (!force && Date.now() - (_discoveryFailedAt.get(key) || 0) < DISCOVERY_FAILURE_COOLDOWN_MS) {
      return null;
    }
    _discoveryFailReason = null;

    // The persisted URL is dead or belongs to another outlet. Clear it so
    // getEdgeUrl() doesn't keep returning it during and after the scan.
    clearDiscoveredEdgeUrl();

    const found = await scanLanForEdge({ expected, forCaptain, wide });
    if (found) {
      _discoveryFailedAt.delete(key);
      return found;
    }

    // All candidates exhausted — arm cooldown and set diagnostic reason.
    _discoveryLastFailed = Date.now();
    _discoveryFailedAt.set(key, _discoveryLastFailed);
    _discoveryFailReason = expected
      ? 'Could not find this outlet\'s edge server on this WiFi. Connect to the same WiFi ' +
        'as the outlet\'s billing PC, or enter its Edge URL manually in Settings.'
      : 'Could not find the cashier PC on this LAN. If your network uses ' +
        '10.x.x.x or 172.16-31.x.x, enter the Edge URL manually in Settings.';
    return null;
  })();

  _discoveryInProgress = run;
  _discoveryInProgressKey = key;
  try {
    return await run;
  } finally {
    if (_discoveryInProgress === run) {
      _discoveryInProgress = null;
      _discoveryInProgressKey = null;
    }
  }
}

/**
 * Re-run edge discovery when the device's network changes (WiFi rejoined or
 * switched, app resumed). Without this, a captain walking out of WiFi range
 * and back stayed disconnected until a poll happened to get past the
 * discovery cooldown — or until they tapped Auto-Discover.
 * Returns a cleanup function.
 */
export function startEdgeNetworkWatcher(onNetworkChange) {
  if (typeof window === 'undefined') return () => {};
  let disposed = false;
  let lastScheduled = 0;
  let appListener = null;
  const timers = new Set();

  const fire = (networkChanged) => {
    if (disposed) return;
    // A real network change clears the scan cooldown too. Plain resume /
    // unlock only forces fresh health checks — the remembered PCs are still
    // probed, without re-scanning the LAN every time a captain unlocks.
    if (networkChanged) invalidateEdgeHealthCache();
    else resetEdgeCache();
    try { onNetworkChange?.(); } catch { /* ignore */ }
  };
  const schedule = (networkChanged) => {
    const now = Date.now();
    if (now - lastScheduled < 3000) return;
    lastScheduled = now;
    // The DHCP lease / route can take a few seconds after the change event:
    // check shortly after, then once more.
    for (const ms of networkChanged ? [1500, 6000] : [500]) {
      const t = setTimeout(() => { timers.delete(t); fire(networkChanged); }, ms);
      timers.add(t);
    }
  };
  const onNetwork = () => schedule(true);
  const onResume = () => schedule(false);
  const onVisible = () => { if (document.visibilityState === 'visible') onResume(); };

  window.addEventListener('online', onNetwork);
  document.addEventListener('visibilitychange', onVisible);
  const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
  conn?.addEventListener?.('change', onNetwork);
  if (window.Capacitor?.isNativePlatform?.()) {
    import('@capacitor/app')
      .then(({ App }) => App.addListener('resume', onResume))
      .then((handle) => { if (disposed) handle?.remove?.(); else appListener = handle; })
      .catch(() => {});
  }

  return () => {
    disposed = true;
    window.removeEventListener('online', onNetwork);
    document.removeEventListener('visibilitychange', onVisible);
    conn?.removeEventListener?.('change', onNetwork);
    appListener?.remove?.();
    timers.forEach(clearTimeout);
    timers.clear();
  };
}

export async function isEdgeAvailable() {
  // On an HTTPS browser page, edge HTTP fetches are blocked as mixed content.
  // Short-circuit to avoid spawning dozens of blocked fetch requests.
  if (isHttpsBrowserContext()) return false;

  const now = Date.now();
  const edgeUrl = getEdgeUrl();
  const isLocalEdge = edgeUrl.includes('127.0.0.1') || edgeUrl.includes('localhost');
  const checkInterval = isLocalEdge ? 10_000 : EDGE_CHECK_INTERVAL_MS;
  if (now - _edgeLastCheck < checkInterval) return _edgeAvailable;
  _edgeLastCheck = now;

  const checkTimeout = isLocalEdge ? 1500 : EDGE_CHECK_TIMEOUT_MS;

  // Try the current edge URL health check first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), checkTimeout);
    const res = await fetch(`${edgeUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      // isEdgeAvailable() returns true when isOperational is true, even if
      // not yet onboarded — EdgeSetupScreen needs this to show the registration
      // form (chicken-and-egg). Callers that need onboarding (orders, PIN
      // login) check isLocalReady() or getEdgeConnectivityState() separately.
      const health = await res.json().catch(() => ({}));
      if (isOtherOutletsEdge(edgeUrl, health)) {
        dropOtherOutletsEdge(edgeUrl);
      } else {
        _edgeAvailable = health.isOperational === true;
        // Sync connectivity state so the UI and login gate agree. Without this,
        // isEdgeAvailable() can say "connected" while getEdgeConnectivityState()
        // says "unreachable" (cache desync — Bug 3).
        _connectivityState = (_edgeAvailable && health.sessionValid && health.onboarded !== false)
          ? 'edge_reachable'
          : 'edge_not_ready';
        _connectivityLastCheck = now;
      }
    } else {
      _edgeAvailable = false;
    }
    if (_edgeAvailable) return true;
  } catch {
    _edgeAvailable = false;
  }

  // If health check failed, try discovery regardless of whether we're using
  // DEFAULT_EDGE_URL or a stale discovered URL. This handles DHCP IP changes
  // where the cashier desktop gets a new LAN IP and the old discovered URL
  // becomes unreachable.
  // Skip LAN discovery entirely when the edge URL is localhost — the edge server
  // runs on the same machine (cashier desktop). Scanning 253 LAN IPs when the
  // server is on 127.0.0.1 is wasteful and causes a 19s UI freeze cascade when
  // the edge server is briefly busy (e.g. during a sync cycle).
  // A phone (Capacitor) whose discovered URL was cleared falls back to
  // 127.0.0.1 — that must still recover, otherwise the captain stays
  // disconnected until someone taps Auto-Discover. Only skip on the PC that
  // hosts the runtime itself.
  // Limited to the captain app: admin/cashier phone apps with no edge would
  // otherwise scan the LAN in the background every cooldown period.
  const isRuntimeHost = (edgeUrl.includes('127.0.0.1') || edgeUrl.includes('localhost'))
    && !(_discoveryContext.forCaptain && typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
  if (!_edgeAvailable && !isRuntimeHost) {
    // Recover to the logged-in outlet's PC only, never a sibling outlet's.
    const opts = {
      expectedRestaurantId: getCurrentOutletId() || undefined,
      forCaptain: _discoveryContext.forCaptain,
    };

    // 1. Known addresses for this outlet (one fast probe each) — runs even
    //    during the cooldown so rejoining WiFi reconnects on the next poll.
    try {
      if (await discoverEdgeOnLAN({ ...opts, fastOnly: true })) return _edgeAvailable;
    } catch { /* fall through */ }

    // Skip the expensive steps if discovery recently failed.
    if (Date.now() - _discoveryLastFailed < DISCOVERY_FAILURE_COOLDOWN_MS) {
      return _edgeAvailable;
    }

    // 2. Cloud: the outlet's registered PC addresses (print agent heartbeat).
    try {
      if (await discoverEdgeUrlFromBackend({ forCaptain: opts.forCaptain })) {
        const health = await probeEdgeHealth(getEdgeUrl(), EDGE_CHECK_TIMEOUT_MS);
        if (health?.isOperational === true) {
          _edgeAvailable = true;
          _edgeLastCheck = Date.now();
          _connectivityState = (health.sessionValid && health.onboarded !== false) ? 'edge_reachable' : 'edge_not_ready';
          _connectivityLastCheck = Date.now();
          return true;
        }
      }
    } catch { /* fall through to LAN scan */ }

    // 3. LAN scan (adoptEdgeUrl syncs _edgeAvailable from the found PC).
    try {
      const discovered = await discoverEdgeOnLAN({ ...opts, wide: true });
      if (!discovered || !_edgeAvailable) _discoveryLastFailed = Date.now();
    } catch {
      _discoveryLastFailed = Date.now();
    }
  }

  return _edgeAvailable;
}

/**
 * Fast edge availability check — skips LAN discovery entirely.
 * Used by the KOT submission path (sendIncrementalKOT) where blocking for
 * 19s on a 253-IP LAN scan is unacceptable. Uses a 3s health-check timeout
 * against the current known edge URL only. If the edge is unreachable, returns
 * false immediately so the caller can fall through to cloud or show an error.
 *
 * @returns {Promise<boolean>} true if the edge server responded and is operational
 */
export async function isEdgeAvailableFast() {
  if (isHttpsBrowserContext()) return false;

  const edgeUrl = getEdgeUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
    const res = await fetch(`${edgeUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const health = await res.json().catch(() => ({}));
      if (isOtherOutletsEdge(edgeUrl, health)) {
        dropOtherOutletsEdge(edgeUrl);
        _edgeLastCheck = Date.now();
        return false;
      }
      const available = health.isOperational === true;
      // Update the shared cache so subsequent isEdgeAvailable() calls benefit
      _edgeAvailable = available;
      _edgeLastCheck = Date.now();
      _connectivityState = available
        ? (health.sessionValid && health.onboarded !== false ? 'edge_reachable' : 'edge_not_ready')
        : 'edge_not_ready';
      _connectivityLastCheck = Date.now();
      return available;
    }
  } catch {
    // Edge unreachable — fall through
  }
  _edgeAvailable = false;
  _edgeLastCheck = Date.now();
  return false;
}

// ── Connectivity state machine ───────────────────────────────────────────────
// Returns a richer state than just boolean isEdgeAvailable:
//   'edge_reachable'    — edge server is online and session is valid
//   'edge_not_ready'    — edge server is reachable but session invalid/not registered
//   'cloud_reachable'   — edge unreachable but cloud backend is reachable
//   'fully_offline'     — neither edge nor cloud is reachable
//   'checking'          — still determining

let _connectivityState = 'checking';
let _connectivityLastCheck = 0;
const CONNECTIVITY_CHECK_INTERVAL_MS = 10_000;

export async function getEdgeConnectivityState() {
  const now = Date.now();
  if (now - _connectivityLastCheck < CONNECTIVITY_CHECK_INTERVAL_MS) {
    return _connectivityState;
  }
  _connectivityLastCheck = now;

  try {
    const edgeUrl = getEdgeUrl();
    const isLocal = edgeUrl.includes('127.0.0.1') || edgeUrl.includes('localhost');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isLocal ? 1500 : EDGE_CHECK_TIMEOUT_MS);
    const res = await fetch(`${edgeUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const health = res.ok ? await res.json().catch(() => ({})) : null;
    if (isOtherOutletsEdge(edgeUrl, health)) {
      // Treated as unreachable below: cloud check, then discovery for our PC.
      dropOtherOutletsEdge(edgeUrl);
      _connectivityLastCheck = now;
    } else if (res.ok) {
      if (health.isOperational === true && health.sessionValid && health.onboarded !== false) {
        _connectivityState = 'edge_reachable';
        // Sync isEdgeAvailable cache so print routing (orderApi.js) sees the
        // same result as the UI. Without this, isEdgeAvailable() could return
        // a stale false for up to 30s while the UI already shows Edge Connected.
        _edgeAvailable = true;
        _edgeLastCheck = now;
      } else if (health.isOperational === true) {
        // Edge server is running but not onboarded or session invalid —
        // still reachable for registration/setup, just not ready for POS ops.
        _connectivityState = 'edge_not_ready';
        _edgeAvailable = true;
        _edgeLastCheck = now;
      } else {
        _connectivityState = 'edge_not_ready';
        _edgeAvailable = false;
      }
      return _connectivityState;
    }
  } catch { /* edge unreachable */ }

  // Edge unreachable — check if cloud is reachable
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    _connectivityState = res.ok ? 'cloud_reachable' : 'fully_offline';
  } catch {
    _connectivityState = 'fully_offline';
  }

  // Trigger discovery if not yet attempted. On the first call, block on
  // discovery so the caller gets an accurate result. On subsequent calls,
  // fire-and-forget to avoid adding latency.
  if (_connectivityState === 'cloud_reachable' || _connectivityState === 'fully_offline') {
    if (!_discoveryLastFailed && !_discoveredEdgeUrl) {
      try {
        await isEdgeAvailable();
        if (_edgeAvailable) return _connectivityState;
      } catch { /* discovery failed */ }
    } else {
      isEdgeAvailable().catch(() => {});
    }
  }

  return _connectivityState;
}

export function getConnectivityState() {
  return _connectivityState;
}

export const EDGE_FETCH_TIMEOUT_MS = 30_000;
export const EDGE_READ_TIMEOUT_MS = 3_000; // Fast-fail for reads (tables/sections/venues)
export const EDGE_WRITE_TIMEOUT_MS = 30_000; // Writes (POST/PUT/PATCH) — 30s for weak WiFi

// Write methods that use the shorter timeout and no retries. The captain app's
// KOT flow handles retry at a higher level with idempotency (same requestId)
// and a fresh stuck-guard window, which is safer than a blind edgeFetch retry.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Cancellation support: callers can pass an external AbortController via
// options.signal so an in-flight edgeFetch can be cancelled (e.g. when the
// captain navigates away or the stuck-guard fires). The controller is merged
// with the internal timeout controller — aborting either one cancels the fetch.
async function _edgeFetchWithKey(path, options, headers, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If the caller provided an external AbortController, wire it so aborting
  // the external signal also aborts this fetch. This lets sendIncrementalKOT
  // cancel an in-flight KOT write when the stuck-guard fires or the captain
  // switches tables — preventing orphaned promises that corrupt state.
  let onExternalAbort = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      const cancelErr = new Error(`Edge request to ${path} cancelled before start`);
      cancelErr.name = 'AbortError';
      throw cancelErr;
    }
    onExternalAbort = () => controller.abort();
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let res;
  try {
    res = await fetch(`${getEdgeUrl()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
    if (err?.name === 'AbortError') {
      // Distinguish external cancellation from timeout — both surface as
      // AbortError so existing callers that check err.name === 'AbortError'
      // (e.g. barTableSyncService.js) recognize intentional cancellation.
      if (externalSignal?.aborted) {
        const cancelErr = new Error(`Edge request to ${path} cancelled`);
        cancelErr.name = 'AbortError';
        throw cancelErr;
      }
      const timeoutErr = new Error(`Edge request to ${path} timed out after ${timeoutMs / 1000}s`);
      timeoutErr.name = 'AbortError';
      throw timeoutErr;
    }
    throw err;
  }
  clearTimeout(timeoutId);
  if (externalSignal && onExternalAbort) {
    externalSignal.removeEventListener('abort', onExternalAbort);
  }
  return res;
}

export async function edgeFetch(path, options = {}) {
  const edgeApiKey = getStoredEdgeApiKey();
  const runtimeToken = getStoredEdgeRuntimeToken();
  const localHub = isAndroidLocalCaptainEnabled() ? getStoredCashierHub() : null;
  // Writes (POST/PUT/PATCH/DELETE) use a shorter timeout and NO retries.
  // A KOT write that fails should surface immediately so the captain can
  // retry or fix connectivity — not block for 92s (3×30s + 2×1s) staring
  // at "Sending...". Reads keep the 30s timeout + 2 retries because they're
  // idempotent and a retry is always safe.
  const method = (options.method || 'GET').toUpperCase();
  const isWrite = WRITE_METHODS.has(method);
  const timeoutMs = options.timeoutMs ?? (isWrite ? EDGE_WRITE_TIMEOUT_MS : EDGE_FETCH_TIMEOUT_MS);
  const maxRetries = isWrite ? 0 : 2;
  const externalSignal = options.signal || null;
  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs; // don't pass to native fetch
  delete fetchOptions.signal;    // handled via _edgeFetchWithKey merge
  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {}),
  };
  if (edgeApiKey) {
    headers['X-Edge-Key'] = edgeApiKey;
  }
  if (runtimeToken) {
    headers['Authorization'] = `Bearer ${runtimeToken}`;
  }
  if (localHub?.token) {
    headers['X-Local-Token'] = localHub.token;
    delete headers.Authorization;
    delete headers['X-Edge-Key'];
  }

  // Retry on network errors (not HTTP error statuses). The edge server is a
  // separate process that survives page reloads — a transient failure usually
  // means the sidecar is still starting up or a brief network blip. Retries
  // are disabled for writes (maxRetries=0) because a write timeout must
  // surface immediately — the captain app's KOT flow has its own retry UX.
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let res = await _edgeFetchWithKey(path, fetchOptions, headers, timeoutMs, externalSignal);

      // If the edge server rejected our API key (or we never had one), try to
      // fetch a fresh key from the cloud and retry once. The edge server
      // requires the key for all POS routes, so without it every call fails.
      if (res.status === 401) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        const isKeyError = body?.error && /edge api key/i.test(body.error);
        let isTokenError = body?.error && /runtime token/i.test(body.error);

        // Step 1: Recover edge API key if missing/rejected
        if (isKeyError || !edgeApiKey) {
          console.warn('[edgeFetch] Edge API key missing or rejected — refreshing from cloud');
          // Don't remove the existing key until we have a fresh one.
          // If ensureEdgeApiKey() fails (cloud unreachable, no auth token),
          // wiping the key would permanently break all edge access.
          const freshKey = await ensureEdgeApiKey({ force: true }).catch(() => null);
          if (freshKey && freshKey !== edgeApiKey) {
            setStoredEdgeApiKey(freshKey, { url: getEdgeUrl() });
            const retryHeaders = { ...headers, 'X-Edge-Key': freshKey };
            res = await _edgeFetchWithKey(path, fetchOptions, retryHeaders, timeoutMs, externalSignal);
            // Key was fixed — check if retry also failed with a token error
            if (res.status === 401) {
              try { body = await res.json(); } catch { /* ignore */ }
              isTokenError = body?.error && /runtime token/i.test(body.error);
            } else {
              isTokenError = false;
            }
          } else if (!freshKey && edgeApiKey) {
            // Refresh failed but we still have the old key — it might be
            // stale on the edge server side. Surface the original 401 error
            // instead of silently wiping the key.
            console.warn('[edgeFetch] Could not refresh edge API key — keeping existing key');
          }
        }

        // Step 2: Recover runtime token if missing/rejected (either originally
        // or after key recovery retry returned a token 401). Using a separate
        // if (not else if) so both recoveries can run in sequence when both
        // credentials are missing.
        if (isTokenError || (!runtimeToken && !isKeyError)) {
          console.warn('[edgeFetch] Runtime token missing or rejected — fetching from edge server');
          // If we already have a token but the server rejected it, the token
          // is stale (rotated). Clear it so ensureEdgeRuntimeToken() fetches
          // a fresh one instead of returning the cached invalid token.
          if (runtimeToken) clearStoredEdgeRuntimeToken();
          const freshToken = await ensureEdgeRuntimeToken().catch(() => null);
          if (freshToken) {
            const retryHeaders = { ...headers, 'Authorization': `Bearer ${freshToken}` };
            res = await _edgeFetchWithKey(path, fetchOptions, retryHeaders, timeoutMs, externalSignal);
          } else if (runtimeToken) {
            // Restore the old token so we don't leave things worse than before
            setStoredEdgeRuntimeToken(runtimeToken);
            console.warn('[edgeFetch] Could not refresh runtime token — keeping existing token');
          }
        }
      }

      if (!res.ok) {
        let message = `Edge request failed (${res.status})`;
        let body = null;
        try {
          body = await res.json();
          if (body?.error) message = body.error;
        } catch { /* ignore */ }
        const err = new Error(message);
        err.status = res.status;
        err.statusCode = res.status;
        if (body?.orderId) err.existingOrderId = body.orderId;
        if (body?.missing) err.missing = body.missing;
        throw err;
      }
      if (res.status === 204) return null;
      return res.json();
    } catch (err) {
      lastError = err;
      // Only retry on network errors (not HTTP error statuses which throw
      // with a .status property). AbortError (timeout) also retries since
      // the edge server may be slow to respond during startup.
      // Writes never retry (maxRetries=0) — the captain app's KOT flow handles
      // retry at a higher level with idempotency (same requestId) and a fresh
      // stuck-guard window, which is safer than a blind edgeFetch retry.
      // Don't retry if the caller cancelled the request — the signal is already
      // aborted so retries would fail instantly and waste 2s on delays.
      if (err?.status) throw err; // HTTP error — don't retry
      if (externalSignal?.aborted) throw err; // caller cancelled — don't retry
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000));
        // Reset edge availability cache so isEdgeAvailable() re-checks
        _edgeLastCheck = 0;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ── Frontend auto-recovery (Tauri desktop only) ──────────────────────────────
// Polls edge health every 30 seconds. If the edge server is unreachable AND
// we're running inside the Tauri desktop app, auto-invokes restart_edge_server.
// This is a fallback for the Rust-side watchdog — if the watchdog somehow
// misses a crash (e.g. the process is alive but hung), the frontend catches it.
// Avoids rapid restart loops with a 60-second cooldown between restart attempts.

let _autoRecoveryStarted = false;
let _lastRestartAttempt = 0;
const AUTO_RECOVERY_INTERVAL_MS = 30_000;
const AUTO_RECOVERY_COOLDOWN_MS = 60_000;

function getTauriInvoke() {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.core?.invoke
    || window.__TAURI__?.invoke
    || window.__TAURI_INTERNALS__?.invoke
    || null;
}

export function startEdgeAutoRecovery() {
  if (_autoRecoveryStarted) return;
  _autoRecoveryStarted = true;

  setInterval(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) return; // Not running in Tauri desktop app

    try {
      const available = await isEdgeAvailable();
      if (available) return;

      const now = Date.now();
      if (now - _lastRestartAttempt < AUTO_RECOVERY_COOLDOWN_MS) return;
      _lastRestartAttempt = now;

      console.warn('[EdgeAutoRecovery] Edge server unreachable — auto-restarting via Tauri');
      await invoke('restart_edge_server');
      invalidateEdgeHealthCache();
    } catch (err) {
      console.warn('[EdgeAutoRecovery] Restart attempt failed:', err?.message || err);
    }
  }, AUTO_RECOVERY_INTERVAL_MS);
}

let _configResyncInProgress = null;

/**
 * Triggers a config re-sync on the edge server and waits for it to complete.
 * Deduplicates concurrent calls — if a re-sync is already in progress, waits
 * for that one instead of starting another.
 * @returns {Promise<boolean>} true if re-sync succeeded, false otherwise
 */
export async function triggerEdgeConfigResync() {
  if (_configResyncInProgress) return _configResyncInProgress;
  _configResyncInProgress = (async () => {
    try {
      console.warn('[edgeHealth] Triggering edge config re-sync');
      const result = await edgeFetch('/api/edge/config/sync', {
        method: 'POST',
        timeoutMs: 60_000,
      });
      return result?.success === true;
    } catch (err) {
      console.warn('[edgeHealth] Config re-sync failed:', err?.message || err);
      return false;
    } finally {
      _configResyncInProgress = null;
    }
  })();
  return _configResyncInProgress;
}

// ── Backfill missing transactions (recover unsynced settlements) ────────────
// Calls the edge server's /api/edge/sync/backfill endpoint, which scans all
// locally settled orders and re-enqueues transaction sync records that are
// missing from sync_queue (dequeued as rejected/conflict, dead-lettered, or
// never enqueued). Also handles walk-in transactions.
//
// Returns { success, summary, details } on success, throws on edge unreachable.

/**
 * Re-enqueue missing transaction syncs on the edge server.
 * @param {{ dryRun?: boolean }} opts — dryRun=true to preview without changes
 * @returns {Promise<{success: boolean, dryRun: boolean, summary: object, details: array}>}
 */
export async function backfillMissingTransactions({ dryRun = false } = {}) {
  const path = dryRun ? '/api/edge/sync/backfill?dry-run=1' : '/api/edge/sync/backfill';
  const result = await edgeFetch(path, {
    method: 'POST',
    timeoutMs: 60_000,
  });
  return result;
}

// ── Runtime event bus listener (replaces polling for state changes) ──────────
// Connects to the Runtime's WebSocket /events endpoint and listens for
// runtime.state_changed, config_sync.state_changed, and connection.state_changed
// events. When a state change arrives, it updates the cached connectivity state
// immediately — no need to wait for the next poll cycle.

let _runtimeWs = null;
let _runtimeWsStarted = false;
let _runtimeWsReconnectDelay = 1_000; // starts at 1s, grows to 30s max
const WS_RECONNECT_MAX_MS = 30_000;
const _runtimeEventListeners = new Set();

export function onRuntimeStateChange(callback) {
  _runtimeEventListeners.add(callback);
  return () => _runtimeEventListeners.delete(callback);
}

export function startRuntimeEventBus() {
  if (_runtimeWsStarted) return;
  _runtimeWsStarted = true;

  // On an HTTPS browser page, ws:// connections to the edge server are blocked
  // as mixed content. Skip the event bus entirely — it would just spin in
  // reconnect loops with no chance of connecting.
  if (isHttpsBrowserContext()) return;

  const connect = () => {
    const edgeUrl = getEdgeUrl();
    const wsUrl = edgeUrl.replace(/^http/, 'ws') + '/events';

    try {
      _runtimeWs = new WebSocket(wsUrl);
    } catch {
      setTimeout(connect, _runtimeWsReconnectDelay);
      _runtimeWsReconnectDelay = Math.min(_runtimeWsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
      return;
    }

    _runtimeWs.onopen = () => {
      // Reset reconnect backoff on successful connection
      _runtimeWsReconnectDelay = 1_000;
      // Authenticate with the runtime token (separate from edge API key)
      const token = getStoredEdgeRuntimeToken() || getStoredEdgeApiKey();
      if (token) {
        _runtimeWs.send(JSON.stringify({ type: 'auth', token }));
      }
    };

    _runtimeWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'auth' && msg.ok === false) return;

        // Handle runtime events
        if (msg.event) {
          switch (msg.event) {
            case 'runtime.state_changed':
              handleRuntimeStateChanged(msg.data);
              break;
            case 'config_sync.state_changed':
              handleConfigSyncStateChanged(msg.data);
              break;
            case 'connection.state_changed':
              handleConnectionStateChanged(msg.data);
              break;
            case 'config_sync.progress':
              // Notify listeners of progress
              for (const cb of _runtimeEventListeners) {
                try { cb({ type: 'config_sync.progress', data: msg.data }); } catch { /* ignore */ }
              }
              break;
            case 'config.changed':
              // Edge server applied a config change (menu item, category, etc.)
              // to local SQLite. Notify listeners so they can refresh their
              // menu cache immediately instead of waiting for the next poll.
              for (const cb of _runtimeEventListeners) {
                try { cb({ type: 'config.changed', data: msg.data }); } catch { /* ignore */ }
              }
              break;
          }
        }
      } catch { /* ignore malformed messages */ }
    };

    _runtimeWs.onclose = () => {
      _runtimeWs = null;
      // Reconnect with exponential backoff if the app is still running.
      // 1s → 2s → 4s → 8s → 15s → 30s, capped at 30s. Resets to 1s on
      // successful connect (onopen). Prevents noisy reconnect storms when
      // the edge server is down for an extended period.
      if (_runtimeWsStarted) {
        setTimeout(connect, _runtimeWsReconnectDelay);
        _runtimeWsReconnectDelay = Math.min(_runtimeWsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
      }
    };

    _runtimeWs.onerror = () => {
      try { _runtimeWs?.close(); } catch { /* ignore */ }
    };
  };

  connect();
}

export function stopRuntimeEventBus() {
  _runtimeWsStarted = false;
  if (_runtimeWs) {
    try { _runtimeWs.close(); } catch { /* ignore */ }
    _runtimeWs = null;
  }
}

function handleRuntimeStateChanged(data) {
  if (!data) return;
  const { newState, isOperational } = data;

  // Update cached availability immediately
  if (isOperational) {
    _edgeAvailable = true;
    _edgeLastCheck = Date.now();
  } else {
    _edgeAvailable = false;
  }

  // Update connectivity state
  if (isOperational) {
    _connectivityState = 'edge_reachable';
  } else {
    _connectivityState = 'edge_not_ready';
  }
  _connectivityLastCheck = Date.now();

  // Notify listeners
  for (const cb of _runtimeEventListeners) {
    try { cb({ type: 'runtime.state_changed', data }); } catch { /* ignore */ }
  }
}

function handleConfigSyncStateChanged(data) {
  if (!data) return;
  for (const cb of _runtimeEventListeners) {
    try { cb({ type: 'config_sync.state_changed', data }); } catch { /* ignore */ }
  }
}

function handleConnectionStateChanged(data) {
  if (!data) return;
  for (const cb of _runtimeEventListeners) {
    try { cb({ type: 'connection.state_changed', data }); } catch { /* ignore */ }
  }
}

// ── Edge-aware JSON fetch for analytics/reports ──────────────────────────────
// Cashier/captain devices that logged in via PIN have an edge-local token,
// not a cloud JWT. Direct calls to /api/analytics or /api/reports get 401.
// This helper tries the edge server's proxy routes first (which forward to
// the cloud with the agent session token), and falls back to a direct cloud
// fetch (which works for JWT-logged-in devices like the admin panel).
//
// Usage:
//   const data = await edgeAwareJsonFetch(
//     '/api/edge/analytics/today-specials-sold?startDate=...',
//     '/api/analytics/today-specials-sold?startDate=...',
//   );
export async function edgeAwareJsonFetch(edgePath, cloudPath, options = {}) {
  // Try edge server first (works for PIN-logged-in devices). edgeFetch()
  // already throws on non-2xx and resolves with the parsed JSON body — it is
  // not a Response, so res.ok/res.status checks here would always fail and
  // silently discard good edge data.
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(edgePath, { ...options, method: 'GET' });
    } catch (err) {
      // Surface definite API errors; only fall back to cloud for
      // transient/auth-recoverable failures (or no response at all).
      const status = err?.status ?? err?.statusCode;
      if (status && status !== 401 && status !== 502 && status !== 503) {
        throw err;
      }
    }
  }
  // Fall back to the shared cloud client. It refreshes expired user JWTs and
  // deliberately rejects edge-local PIN session markers instead of sending
  // them to the cloud, where they would be reported as invalid tokens.
  return apiFetch(cloudPath, {
    ...options,
    method: 'GET',
  });
}

// ── Native HTTP POST for KOT writes on Android APK ───────────────────────────
// Bypasses WebView fetch() which kills connections after 8-15s. Uses Android's
// native HttpURLConnection with a 30s read timeout and OS-level TCP retry.
// Only used for edge server POST writes (KOT submission). Falls back to
// edgeFetch() when not running in a native APK (dev/browser testing).
let _NativeHttpPlugin = null;
async function _getNativeHttpPlugin() {
  if (_NativeHttpPlugin !== null) return _NativeHttpPlugin;
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      _NativeHttpPlugin = false;
      return false;
    }
    _NativeHttpPlugin = registerPlugin('NativeHttp');
    return _NativeHttpPlugin;
  } catch {
    _NativeHttpPlugin = false;
    return false;
  }
}

export async function nativeEdgePost(path, body, options = {}) {
  const plugin = await _getNativeHttpPlugin();
  if (!plugin) {
    // Not in APK — fall back to edgeFetch (browser/dev mode)
    return edgeFetch(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  const edgeUrl = getEdgeUrl();
  const url = `${edgeUrl}${path}`;
  const edgeKey = getStoredEdgeApiKey();
  const runtimeToken = getStoredEdgeRuntimeToken();
  const localHub = isAndroidLocalCaptainEnabled() ? getStoredCashierHub() : null;

  try {
    const result = await plugin.post({
      url,
      body: JSON.stringify(body),
      timeout: options.timeoutMs || EDGE_WRITE_TIMEOUT_MS,
      edgeKey: edgeKey || undefined,
      authToken: localHub ? undefined : (runtimeToken || undefined),
      localToken: localHub?.token || undefined,
    });
    const status = result.status;
    const data = result.data;
    if (status >= 200 && status < 300) {
      // Mimic the Response object shape that callers expect
      return {
        ok: true,
        status,
        json: async () => { try { return JSON.parse(data); } catch { return null; } },
        text: async () => data,
      };
    }
    // HTTP error — throw with status like edgeFetch does
    const err = new Error(`Edge POST ${path} failed: ${status}`);
    err.statusCode = status;
    try { err.body = JSON.parse(data); } catch { /* ignore */ }
    throw err;
  } catch (err) {
    // Native HTTP failed — translate error types for the caller
    const msg = err.message || '';
    if (msg.startsWith('TIMEOUT')) {
      const timeoutErr = new Error(`Edge request to ${path} timed out after ${(options.timeoutMs || EDGE_WRITE_TIMEOUT_MS) / 1000}s`);
      timeoutErr.name = 'AbortError';
      throw timeoutErr;
    }
    if (msg.startsWith('CONNECT_FAILED')) {
      const connErr = new Error('Edge server unreachable — check WiFi or cashier machine');
      connErr.code = 'EDGE_UNREACHABLE';
      throw connErr;
    }
    if (msg.startsWith('HTTP_ERROR')) {
      const netErr = new Error(`Network error: ${msg}`);
      netErr.code = 'EDGE_UNREACHABLE';
      throw netErr;
    }
    // Already an HTTP status error from above
    throw err;
  }
}

