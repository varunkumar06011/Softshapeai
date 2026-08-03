// ─────────────────────────────────────────────────────────────────────────────
// Reports API — Frontend API client for sales and GST reports
// ─────────────────────────────────────────────────────────────────────────────
// Provides functions for fetching various report types from the backend:
//   - fetchDailyReport(date) — daily sales summary with GST breakdown
//   - fetchMonthlyReport(month) — monthly sales summary
//   - fetchCaptainReport(date) — captain performance report
//   - fetchSectionReport(date) — section-wise revenue report
//   - fetchGstReport(month) — GST liability report
//   - fetchPaymentReport(date) — payment method summary
//   - fetchDiscountReport(month) — discount analysis
//   - fetchTransactionReport(date) — transaction detail export
//
// All requests include auth headers. Uses authService for JWT token.
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl } from "./apiConfig";
import { authService } from "./authService";

export function isOfflineError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err) return false;
  const name = typeof err === 'string' ? '' : err.name;
  if (name === 'AbortError') return true;
  // Only a real fetch TypeError (DNS/network/CORS) is a true offline error.
  // Backend 500 messages like "Failed to fetch itemwise sales report" must NOT
  // match here — those are server errors, not network failures.
  if (name === 'TypeError' && /Failed to fetch|NetworkError|Load failed/i.test(err.message || '')) return true;
  return false;
}

// Helper: parse fetch response, throw on non-OK status with error message
async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchReportDailySales(startDate, endDate, outletId = 'all') {
  const qs = new URLSearchParams({ startDate, endDate, outletId });
  const res = await fetch(apiUrl(`/api/reports/daily-sales?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportItemwise(startDate, endDate, outletType = 'all', outletId = 'all') {
  const qs = new URLSearchParams({ startDate, endDate, outletType, outletId });
  const res = await fetch(apiUrl(`/api/reports/itemwise-sales?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportCategorywise(startDate, endDate, outletId = 'all') {
  const qs = new URLSearchParams({ startDate, endDate, outletId });
  const res = await fetch(apiUrl(`/api/reports/categorywise-sales?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportPaymentMethods(startDate, endDate, outletId = 'all') {
  const qs = new URLSearchParams({ startDate, endDate, outletId });
  const res = await fetch(apiUrl(`/api/reports/payment-methods?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportDiscounts(startDate, endDate, outletId = 'all') {
  const qs = new URLSearchParams({ startDate, endDate, outletId });
  const res = await fetch(apiUrl(`/api/reports/discount-report?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportGST(startDate, endDate, outletId = 'all') {
  const qs = new URLSearchParams({ startDate, endDate, outletId });
  const res = await fetch(apiUrl(`/api/reports/gst-report?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}
