import { describe, expect, it, vi } from 'vitest';
import { createLocalAuth } from '../localAuth';

function makeDb(initialMeta = {}, initialDevices = []) {
  const meta = new Map(Object.entries(initialMeta));
  return {
    query: vi.fn(async (sql, values = []) => {
      if (sql.includes('FROM local_meta')) {
        const value = meta.get(values[0]);
        return value == null ? [] : [{ value }];
      }
      if (sql.includes('FROM local_device')) return initialDevices;
      return [];
    }),
    execute: vi.fn(async (sql, values = []) => {
      if (sql.includes('INTO local_meta')) meta.set(values[0], values[1]);
      return { changes: 1 };
    }),
    meta,
  };
}

describe('Android local pairing auth', () => {
  it('creates a short-lived pairing code and a device token', async () => {
    const db = makeDb();
    const auth = createLocalAuth(db, { now: () => 1000 });
    const pairing = await auth.getPairingInfo();

    expect(pairing.code).toMatch(/^\d{6}$/);
    expect(pairing.expiresAt).toBeGreaterThan(1000);

    const paired = await auth.pair({ code: pairing.code, deviceName: 'Captain 1' });

    expect(paired.deviceId).toMatch(/^device-/);
    expect(paired.deviceToken).toMatch(/^device-token-/);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO local_device'), expect.arrayContaining(['Captain 1', 'CAPTAIN']));
  });

  it('rejects an invalid pairing code', async () => {
    const db = makeDb();
    const auth = createLocalAuth(db, { now: () => 1000 });

    await expect(auth.pair({ code: '000000' })).rejects.toThrow('invalid or expired');
  });

  it('authorizes the hub token and active captain tokens', async () => {
    const db = makeDb({ hub_token: 'hub-token' }, [{ id: 'device-1' }]);
    const auth = createLocalAuth(db, { now: () => 1000 });

    await expect(auth.authorize('hub-token')).resolves.toBe(true);
    await expect(auth.authorize('device-token')).resolves.toBe(true);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE local_device'), [1000, 'device-1']);
  });
});
