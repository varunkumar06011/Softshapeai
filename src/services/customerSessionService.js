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

/**
 * Generate a unique call ID for waiter calls.
 * Used by the backend API flow (cooldown is now enforced server-side).
 */
export function generateCallId() {
  return `wc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
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
