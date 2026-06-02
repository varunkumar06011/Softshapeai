// Simulated Backend Service for Waiter Calls
// This file acts as a mock backend to ensure security logic (like cooldowns)
// are strictly enforced, rather than relying solely on the frontend UI state.

const WAITER_CALLS_KEY = "softshape_waiter_calls";
const DEVICE_SESSION_KEY = "softshape_device_session_id";

// Helper to read from local DB
function readDB(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// Helper to write to local DB
function writeDB(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to write to local DB", e);
  }
}

/**
 * Gets or creates a unique session ID for the current device.
 */
export function getDeviceSessionId() {
  let sessionId = localStorage.getItem(DEVICE_SESSION_KEY);
  if (!sessionId) {
    sessionId = `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    localStorage.setItem(DEVICE_SESSION_KEY, sessionId);
  }
  return sessionId;
}

// ==========================================
// WAITER CALL LOGIC
// ==========================================

const WAITER_CALL_COOLDOWN_MS = 15000; // 15 seconds

/**
 * Validates if a table is allowed to call a waiter.
 * Enforces the 15-second cooldown securely on the "backend".
 *
 * Also cleans up stale calls older than 5 minutes to prevent
 * ghost entries from blocking future calls.
 */
export function validateAndCreateWaiterCall(tableId, source) {
  const db = readDB(WAITER_CALLS_KEY);
  const now = Date.now();

  // ── Cleanup stale calls (> 5 min old) to prevent permanent blocks ──
  const STALE_THRESHOLD_MS = 5 * 60 * 1000;
  let cleaned = false;
  for (const key of Object.keys(db)) {
    if (db[key].timestamp && now - db[key].timestamp > STALE_THRESHOLD_MS) {
      console.log(`[CustomerSession] Cleaning stale call for table ${key} (age: ${Math.round((now - db[key].timestamp) / 1000)}s)`);
      delete db[key];
      cleaned = true;
    }
  }
  if (cleaned) writeDB(WAITER_CALLS_KEY, db);

  const existingCall = db[tableId];

  // If there's an active call and it was placed recently
  if (existingCall) {
    const timeSinceLastCall = now - existingCall.timestamp;
    if (timeSinceLastCall < WAITER_CALL_COOLDOWN_MS) {
      const retryAfter = Math.ceil((WAITER_CALL_COOLDOWN_MS - timeSinceLastCall) / 1000);
      console.log(`[CustomerSession] Cooldown active for table ${tableId}: retry in ${retryAfter}s`);
      return { 
        success: false, 
        reason: 'COOLDOWN', 
        retryAfter
      };
    }
  }

  // Create new valid call
  const callId = `wc_${now}`;
  db[tableId] = {
    callId,
    tableId,
    timestamp: now,
    status: 'pending', // pending, accepted, resolved
    handledBy: null,
    source
  };

  writeDB(WAITER_CALLS_KEY, db);
  console.log(`[CustomerSession] New waiter call created: ${callId} for table ${tableId} (source: ${source})`);

  return {
    success: true,
    callId,
    timestamp: now
  };
}

/**
 * Captain marks the call as accepted.
 * Uses atomic-like check to ensure only one captain can accept.
 */
export function markWaiterCallAccepted(tableId, captainId) {
  const db = readDB(WAITER_CALLS_KEY);
  const call = db[tableId];

  if (!call || call.status !== 'pending') {
    console.log(`[CustomerSession] markAccepted failed — call for table ${tableId} not found or already handled (status: ${call?.status})`);
    return false; // Already handled or doesn't exist
  }

  // Mark as accepted
  call.status = 'accepted';
  call.handledBy = captainId;
  writeDB(WAITER_CALLS_KEY, db);

  console.log(`[CustomerSession] Call for table ${tableId} accepted by captain ${captainId}`);
  return true;
}
