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
 */
export function validateAndCreateWaiterCall(tableId) {
  const db = readDB(WAITER_CALLS_KEY);
  
  const existingCall = db[tableId];
  const now = Date.now();

  // If there's an active call and it was placed recently
  if (existingCall) {
    const timeSinceLastCall = now - existingCall.timestamp;
    if (timeSinceLastCall < WAITER_CALL_COOLDOWN_MS) {
      return { 
        success: false, 
        reason: 'COOLDOWN', 
        retryAfter: Math.ceil((WAITER_CALL_COOLDOWN_MS - timeSinceLastCall) / 1000)
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
    handledBy: null
  };

  writeDB(WAITER_CALLS_KEY, db);

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
    return false; // Already handled or doesn't exist
  }

  // Mark as accepted
  call.status = 'accepted';
  call.handledBy = captainId;
  writeDB(WAITER_CALLS_KEY, db);

  return true;
}
