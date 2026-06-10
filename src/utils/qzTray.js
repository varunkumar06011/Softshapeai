/**
 * Unified QZ Tray module
 *
 * Consolidates ALL QZ Tray connection and signing logic in one place.
 * Exports: connectQZ(), sendToPrinter(printerName, data), and signatureCache.
 *
 * Features:
 *   - Signature caching (55s TTL) to avoid round-trips to Render on every print
 *   - keepAliveSign() pre-fetches signatures so they're always warm
 *   - Single QZ Tray websocket connection shared across all callers
 */

import { QZ_CERT } from '../services/certificate.js';

const API_URL = import.meta.env.VITE_API_URL || '';

// ── Signature Cache ──────────────────────────────────────────────────────────
let cachedSignature = null;
let cachedToSign = null;
let cachedAt = 0;
const CACHE_TTL_MS = 55_000; // QZ tokens valid for 60s; cache for 55s
let keepAliveInterval = null;

export const signatureCache = {
  get(toSign) {
    if (cachedSignature && cachedToSign === toSign && Date.now() - cachedAt < CACHE_TTL_MS) {
      return cachedSignature;
    }
    return null;
  },
  set(toSign, signature) {
    cachedToSign = toSign;
    cachedSignature = signature;
    cachedAt = Date.now();
  },
  clear() {
    cachedToSign = null;
    cachedSignature = null;
    cachedAt = 0;
  },
};

async function fetchSignature(toSign) {
  const cached = signatureCache.get(toSign);
  if (cached) return cached;

  const res = await fetch(`${API_URL}/api/print/qz-sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toSign }),
  });
  if (!res.ok) throw new Error(`QZ sign request failed: ${res.status}`);
  const data = await res.json();
  if (!data.signature) throw new Error('QZ sign response missing signature');
  signatureCache.set(toSign, data.signature);
  return data.signature;
}

/**
 * Pre-fetch and cache a fresh signature immediately.
 * Call this during component mount / QZ init so the first print is fast.
 */
export async function warmSignature() {
  try {
    await fetchSignature('WARMUP');
  } catch (err) {
    console.warn('[qzTray] Signature warm-up failed:', err.message);
  }
}

/**
 * Start a background timer that refreshes the cached signature every 50s.
 * Call once after QZ connects. Returns a stop function.
 */
export function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    warmSignature().catch(() => {});
  }, 50_000);
  return () => {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  };
}

// ── QZ Tray singleton ──────────────────────────────────────────────────────
let _qz = null;
let _setupDone = false;

export async function getQZ() {
  if (!_qz) {
    const mod = await import('qz-tray');
    _qz = mod.default;
  }
  return _qz;
}

function setupSecurity(qz) {
  if (_setupDone) return;
  _setupDone = true;

  qz.security.setCertificatePromise(function (resolve) {
    resolve(QZ_CERT);
  });

  qz.security.setSignatureAlgorithm('SHA512');

  qz.security.setSignaturePromise(function (toSign) {
    return function (resolve, reject) {
      fetchSignature(toSign)
        .then((signature) => resolve(signature))
        .catch((err) => reject(err));
    };
  });
}

// ── Printer routing ──────────────────────────────────────────────────────────
const KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';
const BAR_PRINTER = import.meta.env.VITE_BAR_PRINTER_NAME || 'BAR_PRINTER';
const BILLING_PRINTER = import.meta.env.VITE_BILLING_PRINTER_NAME || 'BILLING_PRINTER';
const RESTAURANT_KITCHEN_PRINTER = import.meta.env.VITE_RESTAURANT_KITCHEN_PRINTER_NAME || KITCHEN_PRINTER;
const KOT_FAMILY_PRINTER = import.meta.env.VITE_KOT_FAMILY_PRINTER_NAME || 'KOT FAMILY';
const DINE_IN_BILL_PRINTER = import.meta.env.VITE_DINE_IN_BILL_PRINTER_NAME || 'Dine in Bill';
const KOT_PRINTER = import.meta.env.VITE_KOT_PRINTER_NAME || 'KOT PRINTER';

export function getPrinterForJob(type, restaurantId, sectionTag) {
  if (type === 'KOT') {
    if (restaurantId === 'venue-001') return KOT_FAMILY_PRINTER;
    return restaurantId === 'restaurant-001' ? RESTAURANT_KITCHEN_PRINTER : KITCHEN_PRINTER;
  }
  if (type === 'BAR_KOT') return BAR_PRINTER;
  if (type === 'BILL' || type === 'FINAL_BILL') {
    if (sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel') {
      return DINE_IN_BILL_PRINTER;
    }
    return restaurantId === 'bar-001' ? BAR_PRINTER : BILLING_PRINTER;
  }
  if (type === 'CANCEL_KOT') {
    if (restaurantId === 'venue-001') return KOT_FAMILY_PRINTER;
    if (sectionTag === 'venue-family-restaurant') return KOT_FAMILY_PRINTER;
    if (sectionTag === 'venue-restaurant-parcel') return KOT_PRINTER;
    return KITCHEN_PRINTER;
  }
  if (type === 'CANCEL_ORDER') return KITCHEN_PRINTER;
  if (type === 'TABLE_SWAP') return KITCHEN_PRINTER;
  return BILLING_PRINTER;
}

// ── Setup (eager pre-warm) ─────────────────────────────────────────────────
let _setupPromise = null;

export async function setupQZ() {
  if (_setupPromise) return _setupPromise;
  _setupPromise = (async () => {
    const qz = await getQZ();
    setupSecurity(qz);
    // Pre-fetch a signature so the first real print is instant
    await warmSignature();
  })();
  return _setupPromise;
}

// Eager pre-warm on module load
setupQZ().catch(() => {});

/**
 * Connect to QZ Tray if not already connected.
 * Idempotent — safe to call multiple times.
 */
export async function connectQZ() {
  const qz = await getQZ();
  setupSecurity(qz);

  if (!qz.websocket.isActive()) {
    try {
      signatureCache.clear();
      await qz.websocket.connect();
    } catch (err) {
      const msg = 'QZ Tray is not running on this computer. Please start QZ Tray.';
      console.error('[qzTray]', msg, err);
      throw new Error(msg);
    }
  }
  return qz;
}

/**
 * Send ESC/POS data to a named printer via QZ Tray.
 * @param printerName - Exact Windows printer name
 * @param data - Array of print commands (e.g. [{ type: 'raw', format: 'plain', data: '...' }])
 */
export async function sendToPrinter(printerName, data) {
  const qz = await connectQZ();
  const config = qz.configs.create(printerName);
  await qz.print(config, data);
}
