import { API_BASE, apiUrl } from "./apiConfig";

export const RESTAURANT_ID = "restaurant-001";

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

export async function fetchTables(restaurantId = RESTAURANT_ID) {
  const res = await fetch(apiUrl(`/api/tables?restaurantId=${encodeURIComponent(restaurantId)}`), {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return parseResponse(res);
}

export async function fetchSections(restaurantId = RESTAURANT_ID) {
  const res = await fetch(apiUrl(`/api/sections?restaurantId=${encodeURIComponent(restaurantId)}`));
  return parseResponse(res);
}

export async function updateTableStatus(tableId, status) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}/status`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return parseResponse(res);
}

export async function updateTableSession(tableId, session) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}/session`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  return parseResponse(res);
}

export async function createTable({ number, capacity, sectionId, restaurantId }) {
  const res = await fetch(apiUrl("/api/tables"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number, capacity, sectionId, restaurantId }),
  });
  return parseResponse(res);
}

export async function deleteTable(tableId) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}`), {
    method: "DELETE",
  });
  return parseResponse(res);
}

export { API_BASE };
