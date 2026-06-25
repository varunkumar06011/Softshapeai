import { apiUrl } from "./apiConfig";
import { authService } from "./authService";

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

export async function fetchReportDailySales(startDate, endDate) {
  const qs = new URLSearchParams({ startDate, endDate });
  const rid = authService.getUser()?.restaurantId;
  if (rid) qs.append('restaurantId', rid);
  const res = await fetch(apiUrl(`/api/reports/daily-sales?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportItemwise(startDate, endDate, outletType = 'all') {
  const qs = new URLSearchParams({ startDate, endDate, outletType });
  const rid = authService.getUser()?.restaurantId;
  if (rid) qs.append('restaurantId', rid);
  const res = await fetch(apiUrl(`/api/reports/itemwise-sales?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportCategorywise(startDate, endDate) {
  const qs = new URLSearchParams({ startDate, endDate });
  const rid = authService.getUser()?.restaurantId;
  if (rid) qs.append('restaurantId', rid);
  const res = await fetch(apiUrl(`/api/reports/categorywise-sales?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportPaymentMethods(startDate, endDate) {
  const qs = new URLSearchParams({ startDate, endDate });
  const rid = authService.getUser()?.restaurantId;
  if (rid) qs.append('restaurantId', rid);
  const res = await fetch(apiUrl(`/api/reports/payment-methods?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportDiscounts(startDate, endDate) {
  const qs = new URLSearchParams({ startDate, endDate });
  const rid = authService.getUser()?.restaurantId;
  if (rid) qs.append('restaurantId', rid);
  const res = await fetch(apiUrl(`/api/reports/discount-report?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchReportGST(startDate, endDate) {
  const qs = new URLSearchParams({ startDate, endDate });
  const rid = authService.getUser()?.restaurantId;
  if (rid) qs.append('restaurantId', rid);
  const res = await fetch(apiUrl(`/api/reports/gst-report?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}
