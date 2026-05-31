import { apiUrl } from "./apiConfig";
import { BAR_ID } from "./barApiConfig";

export { BAR_ID };

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { const errBody = await res.json(); if (errBody?.error) message = errBody.error; } catch {}
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchBarTables() {
  const res = await fetch(apiUrl(`/api/bar/tables?restaurantId=${BAR_ID}`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  return parseResponse(res);
}

export async function updateBarTableSession(tableId, sessionData) {
  const res = await fetch(apiUrl(`/api/bar/tables/${tableId}/session`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionData),
  });
  return parseResponse(res);
}

export async function deleteBarTableSession(tableId) {
  const res = await fetch(apiUrl(`/api/bar/tables/${tableId}/session`), {
    method: "DELETE",
  });
  return parseResponse(res);
}
