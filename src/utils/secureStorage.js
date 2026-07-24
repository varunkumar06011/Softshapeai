/**
 * Secure storage abstraction for sensitive tokens (ss_token, ss_preauth_token).
 *
 * In a Tauri desktop app, tokens are stored in the OS app-data directory via
 * Tauri's filesystem API instead of browser localStorage. This mitigates XSS
 * token theft — a malicious script cannot read the filesystem.
 *
 * In a web browser, falls back to localStorage (same behavior as before).
 */

const TOKEN_FILE = 'ss_secure_tokens.json';

function isTauri() {
  return typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.fs;
}

async function getTauriDir() {
  const { appDataDir } = window.__TAURI__.path;
  const dir = await appDataDir();
  return dir;
}

async function readTauriFile() {
  try {
    const { readTextFile } = window.__TAURI__.fs;
    const dir = await getTauriDir();
    const content = await readTextFile(`${dir}/${TOKEN_FILE}`);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeTauriFile(data) {
  const { writeTextFile, exists, mkdir } = window.__TAURI__.fs;
  const dir = await getTauriDir();
  try {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  } catch {
    // dir may already exist
  }
  await writeTextFile(`${dir}/${TOKEN_FILE}`, JSON.stringify(data));
}

// In-memory cache for synchronous access (populated on first read)
let memCache = null;
let initPromise = null;

async function ensureCache() {
  if (memCache) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = (async () => {
    if (isTauri()) {
      memCache = await readTauriFile();
    } else {
      memCache = {};
    }
  })();
  await initPromise;
}

// Synchronous getter — uses in-memory cache.
// For Tauri, call secureStorage.init() on app startup to pre-populate the cache.
export function getItem(key) {
  if (memCache && key in memCache) return memCache[key];
  // Fallback to localStorage for synchronous access in browser mode
  if (!isTauri()) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  // Tauri but cache not yet loaded — return null (init() should be called at startup)
  return null;
}

// Async setter — writes to secure storage in Tauri, localStorage in browser.
// In Tauri mode, tokens are ONLY stored in the filesystem — never mirrored to
// localStorage, so XSS attacks cannot exfiltrate them.
export async function setItem(key, value) {
  if (!memCache) memCache = {};
  memCache[key] = value;
  if (isTauri()) {
    await writeTauriFile(memCache);
    // Purge from localStorage so no XSS-readable copy remains
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return;
  }
  // Browser mode — use localStorage
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // localStorage may be unavailable
  }
}

// Async remove — removes from secure storage and localStorage.
export async function removeItem(key) {
  if (memCache) delete memCache[key];
  if (isTauri()) {
    await writeTauriFile(memCache);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Call this on app startup in Tauri to pre-load the cache.
// After loading, PURGE tokens from localStorage so no XSS-readable copy remains.
export async function init() {
  await ensureCache();
  if (isTauri() && memCache) {
    // Purge any stale tokens from localStorage — the secure file is now the
    // single source of truth. This closes the XSS vector.
    for (const key of Object.keys(memCache)) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  }
}

// Migration helper — moves tokens from localStorage to secure storage.
export async function migrate() {
  if (!isTauri()) return;
  const tokenKeys = ['ss_token', 'ss_preauth_token'];
  let changed = false;
  for (const key of tokenKeys) {
    try {
      const val = localStorage.getItem(key);
      if (val && (!memCache || !(key in memCache))) {
        if (!memCache) memCache = {};
        memCache[key] = val;
        changed = true;
      }
    } catch {
      // ignore
    }
  }
  if (changed) {
    await writeTauriFile(memCache);
  }
}

const secureStorage = { getItem, setItem, removeItem, init, migrate };
export default secureStorage;
