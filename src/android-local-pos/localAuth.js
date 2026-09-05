const HUB_TOKEN_KEY = 'hub_token';
const PAIRING_CODE_KEY = 'pairing_code';
const PAIRING_EXPIRES_KEY = 'pairing_expires_at';
const PAIRING_WINDOW_MS = 5 * 60 * 1000;

function randomToken(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function randomPairingCode() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return String(100000 + (values[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getMeta(database, key) {
  const rows = await database.query('SELECT value FROM local_meta WHERE key = ?', [key]);
  return rows[0]?.value || null;
}

async function setMeta(database, key, value) {
  await database.execute(
    `INSERT INTO local_meta(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, Date.now()],
  );
}

export function createLocalAuth(database, { now = () => Date.now() } = {}) {
  let failedPairAttempts = 0;
  let pairingBlockedUntil = 0;

  return {
    async ensureHubToken() {
      const existing = await getMeta(database, HUB_TOKEN_KEY);
      if (existing) return existing;
      const token = randomToken('hub');
      await setMeta(database, HUB_TOKEN_KEY, token);
      return token;
    },

    async getPairingInfo() {
      const expiresAt = Number(await getMeta(database, PAIRING_EXPIRES_KEY) || 0);
      let code = await getMeta(database, PAIRING_CODE_KEY);
      if (!code || expiresAt <= now()) {
        code = randomPairingCode();
        await setMeta(database, PAIRING_CODE_KEY, code);
        await setMeta(database, PAIRING_EXPIRES_KEY, String(now() + PAIRING_WINDOW_MS));
      }
      return { code, expiresAt: Number(await getMeta(database, PAIRING_EXPIRES_KEY)) };
    },

    async pair({ code, deviceName = 'Captain' } = {}) {
      if (pairingBlockedUntil > now()) throw new Error('Pairing temporarily locked; try again later');
      const pairing = await this.getPairingInfo();
      if (String(code || '') !== pairing.code || pairing.expiresAt <= now()) {
        failedPairAttempts += 1;
        if (failedPairAttempts >= 5) {
          pairingBlockedUntil = now() + 60_000;
          failedPairAttempts = 0;
        }
        throw new Error('Pairing code is invalid or expired');
      }
      failedPairAttempts = 0;
      const deviceId = randomToken('device');
      const deviceToken = randomToken('device-token');
      await database.execute(
        `INSERT INTO local_device(id, name, role, token, status, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [deviceId, String(deviceName).slice(0, 80), 'CAPTAIN', deviceToken, 'ACTIVE', now(), now()],
      );
      await setMeta(database, PAIRING_EXPIRES_KEY, '0');
      return { deviceId, deviceToken };
    },

    async authorize(token) {
      if (!token) return false;
      if (token === await this.ensureHubToken()) return true;
      const devices = await database.query(
        'SELECT id FROM local_device WHERE token = ? AND status = ? LIMIT 1',
        [token, 'ACTIVE'],
      );
      if (devices.length === 1) {
        await database.execute('UPDATE local_device SET last_seen_at = ? WHERE id = ?', [now(), devices[0].id]);
        return true;
      }
      return false;
    },
  };
}

export { PAIRING_WINDOW_MS };
