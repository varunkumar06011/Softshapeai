const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  "https://softshape-backend.up.railway.app";

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

export async function fetchTables() {
  const res = await fetch(`${API_BASE}/api/tables`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return parseResponse(res);
}

export async function fetchSections() {
  const res = await fetch(`${API_BASE}/api/tables/sections`);
  return parseResponse(res);
}

export async function updateTableStatus(tableId, status) {
  const res = await fetch(`${API_BASE}/api/tables/${tableId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return parseResponse(res);
}

export async function createTable({ number, capacity, sectionId, restaurantId }) {
  const res = await fetch(`${API_BASE}/api/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number, capacity, sectionId, restaurantId }),
  });
  return parseResponse(res);
}

export async function deleteTable(tableId) {
  const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
    method: "DELETE",
  });
  return parseResponse(res);
}

export { API_BASE };
