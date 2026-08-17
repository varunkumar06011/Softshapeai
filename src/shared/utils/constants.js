// ─────────────────────────────────────────────────────────────────────────────
// Shared constants — single source of truth for magic values across the frontend
// ─────────────────────────────────────────────────────────────────────────────

// Payment methods accepted by the system
export const PAYMENT_METHODS = ['CASH', 'BANK', 'UPI', 'CHEQUE'];

// API fetch timeouts (ms)
export const API_TIMEOUT_SHORT_MS = 10000;
export const API_TIMEOUT_DEFAULT_MS = 20000;
// Daily purchase save can have 1000+ rows — allow up to 10 minutes for the
// backend transaction to complete without the frontend aborting the request.
export const API_TIMEOUT_SAVE_DAILY_MS = 600000;

// Daily purchase entry limits
export const MAX_ITEM_NAME = 2000;
export const MAX_DAILY_ROWS = 5000;
