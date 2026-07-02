// Frontend service for the Spire AI assistant.

import { API_BASE, getAuthHeaders } from './apiConfig';

export async function sendSpireMessage(message, options = {}) {
  const res = await fetch(`${API_BASE}/api/spire/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ message, language: options.language }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Spire request failed (${res.status})`);
  }

  return res.json();
}

export default { sendSpireMessage };
