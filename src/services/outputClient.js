// ─────────────────────────────────────────────────────────────────────────────
// outputClient.ts — Frontend client for the Output Intent API (R2)
// ─────────────────────────────────────────────────────────────────────────────
// Sends an OutputIntent to the edge server first (low latency, local),
// falling back to the cloud backend if the edge is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import { edgeFetch, isEdgeAvailable } from "./edgeHealth";
import { apiUrl, getAuthHeaders } from "./apiConfig";

/**
 * Send an OutputIntent to the runtime for processing.
 * Tries the edge server first, falls back to cloud.
 *
 * @param {object} intent - OutputIntent object
 * @returns {Promise<{ ok: boolean; jobId?: number }>}
 */
export async function sendOutputIntent(intent) {
  if (await isEdgeAvailable()) {
    try {
      const result = await edgeFetch("/api/output/intent", {
        method: "POST",
        body: JSON.stringify(intent),
      });
      if (result && result.jobs) {
        const allOk = result.jobs.every((j) => j.ok);
        return { ok: allOk, jobs: result.jobs };
      }
      return { ok: true };
    } catch (err) {
      console.warn("[outputClient] Edge intent failed, falling back to cloud:", err.message);
    }
  }

  const res = await fetch(`${apiUrl("/api/output/intent")}`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Output intent failed (HTTP ${res.status}): ${text}`);
  }

  return await res.json();
}

/**
 * Generate a unique intent ID using crypto.randomUUID if available,
 * falling back to a timestamp-based ID.
 */
export function generateIntentId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
