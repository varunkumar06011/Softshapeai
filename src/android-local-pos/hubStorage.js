import secureStorage from '../utils/secureStorage';

const HUB_URL_KEY = 'softshape_android_cashier_hub_url';
const HUB_TOKEN_KEY = 'softshape_android_cashier_hub_token';

export function getStoredCashierHub() {
  return {
    url: secureStorage.getItem(HUB_URL_KEY),
    token: secureStorage.getItem(HUB_TOKEN_KEY),
  };
}

export async function saveCashierHub({ url, token }) {
  const normalizedUrl = String(url || '').trim().replace(/\/+$/, '');
  const normalizedToken = String(token || '').trim();
  if (!normalizedUrl || !normalizedToken) throw new Error('Cashier hub URL and device token are required');
  await secureStorage.setItem(HUB_URL_KEY, normalizedUrl);
  await secureStorage.setItem(HUB_TOKEN_KEY, normalizedToken);
  try { localStorage.setItem('softshape_captain_connection_mode', 'hub'); } catch { /* ignore storage errors */ }
}

export async function clearCashierHub() {
  await secureStorage.removeItem(HUB_URL_KEY);
  await secureStorage.removeItem(HUB_TOKEN_KEY);
  try { localStorage.removeItem('softshape_captain_connection_mode'); } catch { /* ignore storage errors */ }
}

export function setEdgeCaptainMode() {
  try { localStorage.setItem('softshape_captain_connection_mode', 'edge'); } catch { /* ignore storage errors */ }
}

export { HUB_URL_KEY, HUB_TOKEN_KEY };
