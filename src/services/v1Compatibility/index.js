/**
 * Temporary V1 compatibility adapter entry point.
 *
 * Purpose: Single import for orderApi.js. Dispatches to the right
 * shadow workflow, compares V1 vs V2 state, and logs the result.
 *
 * Shadow execution is fire-and-forget. It never blocks, never throws,
 * and never affects the V1 response.
 *
 * M2.6A: Migration mode config (shadow | cutover), shadow session ID,
 * rich context capture (uptime, duration, versions).
 *
 * Remove after V1 cutover.
 */

import {
  shadowCreateOrder,
  shadowAddOrderItems,
  shadowCancelOrderItem,
  shadowSendKot,
  shadowGenerateBill,
  queryV2OrderState,
  executeV1ShadowCreateOrder,
  executeV1ShadowAddOrderItems,
  executeV1ShadowCancelOrderItem,
  executeV1ShadowSendKot,
  executeV1ShadowGenerateBill,
} from './orderAdapter.js';
import { compareOrderState, compareOperationResult } from './shadowCompare.js';
import { logComparison } from './comparisonLogger.js';

// ── Feature flag ─────────────────────────────────────────────────────────────

const SHADOW_FLAG_KEY = 'shadowV2';
const MIGRATION_MODE_KEY = 'shadowMigrationMode';

export function isShadowEnabled() {
  try {
    return localStorage.getItem(SHADOW_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setShadowEnabled(enabled) {
  try {
    localStorage.setItem(SHADOW_FLAG_KEY, enabled ? 'true' : 'false');
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

// ── Migration mode ───────────────────────────────────────────────────────────
// "shadow" = V1 is primary, V2 is shadow (current behavior, default)
// "cutover" = V2 is primary, V1 is shadow (after cutover)
//
// This is NOT a raw primaryEngine switch. Migration mode makes cutover
// intentional — changing from "shadow" to "cutover" is a conscious
// deployment decision, not a config tweak.

export function getMigrationMode() {
  try {
    const mode = localStorage.getItem(MIGRATION_MODE_KEY);
    return mode === 'cutover' ? 'cutover' : 'shadow';
  } catch {
    return 'shadow';
  }
}

export function setMigrationMode(mode) {
  try {
    localStorage.setItem(MIGRATION_MODE_KEY, mode === 'cutover' ? 'cutover' : 'shadow');
  } catch {
    // localStorage may be unavailable
  }
}

// ── Shadow session ID ────────────────────────────────────────────────────────
// Generated once per browser session. All comparisons in this session
// share the same session ID, so you can analyze one runtime lifecycle
// without mixing it with yesterday's.

let _shadowSessionId = null;

function getShadowSessionId() {
  if (_shadowSessionId) return _shadowSessionId;
  _shadowSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return _shadowSessionId;
}

// ── Runtime uptime tracking ──────────────────────────────────────────────────
// Tracks when the shadow session started (proxy for runtime uptime from
// the cashier's perspective).

const _sessionStartTime = Date.now();

function getRuntimeUptimeMs() {
  return Date.now() - _sessionStartTime;
}

// ── ID generation ────────────────────────────────────────────────────────────

function generateComparisonId() {
  return `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Execute a V2 shadow operation, compare with V1 result, and log.
 *
 * This function is ALWAYS fire-and-forget. The caller should never
 * await it. It catches all errors internally.
 *
 * @param {string} operation - One of: createOrder, addOrderItems, cancelOrderItem, sendKot, generateBill
 * @param {object} v1Request - The V1 request that was sent
 * @param {object} v1Result - The V1 response that was received
 * @param {number} v1DurationMs - V1 execution duration
 */
export async function shadowExecute(operation, v1Request, v1Result, v1DurationMs = 0) {
  if (!isShadowEnabled()) return;
  if (!v1Result || !v1Result.ok) return; // Don't shadow if V1 failed

  const comparisonId = generateComparisonId();
  const v1RequestId = v1Request.requestId || 'unknown';
  const migrationMode = getMigrationMode();
  const shadowStartTime = Date.now();

  try {
    let shadowResult;
    let comparison;

    if (migrationMode === 'shadow') {
      // V1 is primary (already executed), V2 is shadow
      shadowResult = await executeShadowWorkflow(operation, v1Request);

      if (operation === 'createOrder' || operation === 'generateBill') {
        const v2OrderId = shadowResult.orderId;
        if (v2OrderId) {
          const v2State = await queryV2OrderState(v2OrderId);
          comparison = compareOrderState(v1Result, v2State);
        } else {
          comparison = { match: false, mismatches: ['V2 did not produce an orderId'] };
        }
      } else {
        comparison = compareOperationResult(operation, v1Result, shadowResult);
      }
    } else {
      // Cutover mode: V2 is primary, V1 is shadow.
      // The caller passes the V2 result as "v1Result" and we execute V1 as shadow.
      // NOTE: This path is built now but NOT activated until cutover deployment.
      // orderApi.js still calls V1 first. When migrationMode="cutover",
      // orderApi.js would need to call V2 first and V1 as shadow.
      // That wiring happens at cutover time — the executor model is ready.
      shadowResult = await executeV1ShadowWorkflow(operation, v1Request);

      if (operation === 'createOrder' || operation === 'generateBill') {
        comparison = compareOperationResult(operation, v1Result, shadowResult);
      } else {
        comparison = compareOperationResult(operation, v1Result, shadowResult);
      }
    }

    const shadowDurationMs = Date.now() - shadowStartTime;

    // Log to Runtime SQLite with rich context
    await logComparison({
      id: comparisonId,
      operation,
      v1RequestId,
      v2RequestId: shadowResult.v2RequestId || v1RequestId,
      v1EntityId: v1Result.orderId || v1Result.kotId || v1Result.billId || null,
      v2EntityId: shadowResult.orderId || shadowResult.kotId || shadowResult.billId || null,
      match: comparison.match,
      mismatches: comparison.mismatches,
      v1DurationMs,
      v2DurationMs: shadowResult.durationMs || 0,
      v1Result: sanitizeForLog(v1Result),
      v2Result: sanitizeForLog(shadowResult),
      // M2.6A: rich context
      command: operation,
      correlationId: v1RequestId,
      eventIds: shadowResult.eventIds || [],
      primaryEngine: migrationMode === 'shadow' ? 'v1' : 'v2',
      runtimeUptimeMs: getRuntimeUptimeMs(),
      shadowDurationMs,
      shadowSessionId: getShadowSessionId(),
      comparisonSchemaVersion: 1,
    });
  } catch (err) {
    // Shadow execution must NEVER affect the cashier
    console.warn(`[shadow] ${operation} shadow execution failed:`, err?.message || err);

    const shadowDurationMs = Date.now() - shadowStartTime;

    // Log the failure as a mismatch
    await logComparison({
      id: comparisonId,
      operation,
      v1RequestId,
      v2RequestId: v1RequestId,
      v1EntityId: v1Result.orderId || null,
      v2EntityId: null,
      match: false,
      mismatches: [`shadow execution error: ${err?.message || 'unknown'}`],
      v1DurationMs,
      v2DurationMs: 0,
      v1Result: sanitizeForLog(v1Result),
      v2Result: { error: err?.message || 'unknown' },
      // M2.6A: rich context
      command: operation,
      correlationId: v1RequestId,
      eventIds: [],
      primaryEngine: migrationMode === 'shadow' ? 'v1' : 'v2',
      runtimeUptimeMs: getRuntimeUptimeMs(),
      shadowDurationMs,
      shadowSessionId: getShadowSessionId(),
      comparisonSchemaVersion: 1,
    }).catch(() => {});
  }
}

// ── Workflow dispatchers ─────────────────────────────────────────────────────

async function executeShadowWorkflow(operation, v1Request) {
  switch (operation) {
    case 'createOrder':
      return await shadowCreateOrder(v1Request);
    case 'addOrderItems':
      return await shadowAddOrderItems(v1Request);
    case 'cancelOrderItem':
      return await shadowCancelOrderItem(v1Request);
    case 'sendKot':
      return await shadowSendKot(v1Request);
    case 'generateBill':
      return await shadowGenerateBill(v1Request);
    default:
      return { ok: false, error: `Unknown shadow operation: ${operation}`, events: [] };
  }
}

// V1 shadow executor — used in cutover mode (V2 primary, V1 shadow)
async function executeV1ShadowWorkflow(operation, v2Request) {
  switch (operation) {
    case 'createOrder':
      return await executeV1ShadowCreateOrder(v2Request);
    case 'addOrderItems':
      return await executeV1ShadowAddOrderItems(v2Request);
    case 'cancelOrderItem':
      return await executeV1ShadowCancelOrderItem(v2Request);
    case 'sendKot':
      return await executeV1ShadowSendKot(v2Request);
    case 'generateBill':
      return await executeV1ShadowGenerateBill(v2Request);
    default:
      return { ok: false, error: `Unknown V1 shadow operation: ${operation}` };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeForLog(obj) {
  try {
    // Remove any sensitive fields and ensure JSON-serializable
    const safe = { ...obj };
    delete safe.token;
    delete safe.runtimeToken;
    return JSON.parse(JSON.stringify(safe));
  } catch {
    return { error: 'failed to serialize' };
  }
}
