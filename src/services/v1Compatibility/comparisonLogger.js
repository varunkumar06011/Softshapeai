/**
 * Temporary V1 shadow comparison logger.
 *
 * Purpose: Persist comparison results to the Runtime's SQLite via the
 * /runtime/v2/shadow/* API endpoints. One database, one backup, one
 * support story.
 *
 * M2.6A: Enhanced with rich context capture (versions, uptime, session,
 * duration) so every mismatch is a self-contained bug report.
 *
 * Remove after V1 cutover.
 */

import { getEdgeUrl, getStoredEdgeRuntimeToken } from '../edgeHealth';

const SHADOW_LOG_PATH = '/runtime/v2/shadow/log';
const SHADOW_STATS_PATH = '/runtime/v2/shadow/stats';
const SHADOW_MISMATCHES_PATH = '/runtime/v2/shadow/mismatches';
const RELEASE_STATUS_PATH = '/runtime/v2/release-status';
const SHADOW_EXPORT_PATH = '/runtime/v2/shadow/export';
const DEFAULT_TIMEOUT_MS = 5000;

// ── Runtime context cache ────────────────────────────────────────────────────
// Fetched once per session to avoid an extra HTTP call on every comparison.
// Refreshed if older than 60 seconds.

let _runtimeContext = null;
let _runtimeContextFetchedAt = 0;
const RUNTIME_CONTEXT_TTL_MS = 60_000;

async function getRuntimeContext() {
  const now = Date.now();
  if (_runtimeContext && now - _runtimeContextFetchedAt < RUNTIME_CONTEXT_TTL_MS) {
    return _runtimeContext;
  }

  const runtimeToken = getStoredEdgeRuntimeToken();
  if (!runtimeToken) return null;

  try {
    const res = await fetch(`${getEdgeUrl()}/runtime/v2/status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${runtimeToken}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    _runtimeContext = {
      runtimeId: data?.runtime?.runtimeId ?? null,
      restaurantId: data?.runtime?.restaurantId ?? null,
      runtimeVersion: data?.apiVersion ? `v2.${data.apiVersion}` : 'unknown',
    };
    _runtimeContextFetchedAt = now;
    return _runtimeContext;
  } catch {
    return null;
  }
}

// ── Log a comparison result ──────────────────────────────────────────────────

export async function logComparison(report) {
  const runtimeToken = getStoredEdgeRuntimeToken();
  if (!runtimeToken) {
    console.warn('[shadow] Cannot log comparison — no runtime token');
    return;
  }

  // Enrich with runtime context (best-effort, never blocks)
  const ctx = await getRuntimeContext().catch(() => null);
  const enriched = {
    ...report,
    runtimeVersion: report.runtimeVersion ?? ctx?.runtimeVersion ?? null,
    restaurantId: report.restaurantId ?? ctx?.restaurantId ?? null,
    runtimeId: report.runtimeId ?? ctx?.runtimeId ?? null,
  };

  try {
    const response = await fetch(`${getEdgeUrl()}${SHADOW_LOG_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${runtimeToken}`,
      },
      body: JSON.stringify(enriched),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      console.warn(`[shadow] Failed to log comparison (${response.status}): ${text}`);
    }
  } catch (err) {
    console.warn('[shadow] Failed to log comparison:', err?.message || err);
  }
}

// ── Get aggregate stats ──────────────────────────────────────────────────────

export async function getComparisonStats() {
  const runtimeToken = getStoredEdgeRuntimeToken();
  if (!runtimeToken) {
    return { total: 0, matches: 0, mismatches: 0, matchRate: 100, operations: [] };
  }

  const response = await fetch(`${getEdgeUrl()}${SHADOW_STATS_PATH}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${runtimeToken}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Shadow stats request failed (${response.status})`);
  }

  return response.json();
}

// ── Get recent mismatches ────────────────────────────────────────────────────

export async function getMismatches(limit = 50) {
  const runtimeToken = getStoredEdgeRuntimeToken();
  if (!runtimeToken) {
    return { mismatches: [] };
  }

  const response = await fetch(`${getEdgeUrl()}${SHADOW_MISMATCHES_PATH}?limit=${limit}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${runtimeToken}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Shadow mismatches request failed (${response.status})`);
  }

  return response.json();
}

// ── M2.6A: Release status ────────────────────────────────────────────────────

export async function getReleaseStatus() {
  const runtimeToken = getStoredEdgeRuntimeToken();
  if (!runtimeToken) {
    return null;
  }

  const response = await fetch(`${getEdgeUrl()}${RELEASE_STATUS_PATH}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${runtimeToken}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Release status request failed (${response.status})`);
  }

  return response.json();
}

// ── M2.6A: Export mismatches as JSON ─────────────────────────────────────────

export async function exportMismatches(limit = 1000) {
  const runtimeToken = getStoredEdgeRuntimeToken();
  if (!runtimeToken) {
    return { ok: false, exportedAt: Date.now(), count: 0, mismatches: [] };
  }

  const response = await fetch(`${getEdgeUrl()}${SHADOW_EXPORT_PATH}?limit=${limit}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${runtimeToken}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Shadow export request failed (${response.status})`);
  }

  return response.json();
}
