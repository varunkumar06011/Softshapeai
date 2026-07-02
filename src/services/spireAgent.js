// Frontend service for the Spire AI assistant.

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function sendSpireMessage(message, options = {}) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  const res = await fetch(`${API_BASE}/api/spire/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
