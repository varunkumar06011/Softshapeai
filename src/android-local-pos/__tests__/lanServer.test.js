import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  start: vi.fn(async () => ({ listening: true, port: 3101 })),
  stop: vi.fn(async () => ({ listening: false })),
  status: vi.fn(async () => ({ listening: true, port: 3101 })),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => plugin),
}));

import { createAndroidLanServerAdapter } from '../lanServer';

describe('Android LAN server adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts and stops the local hub on the configured port', async () => {
    const adapter = createAndroidLanServerAdapter({ port: 3101 });

    await adapter.start();
    expect(plugin.start).toHaveBeenCalledWith({ port: 3101 });
    expect(adapter.health()).toMatchObject({ enabled: true, listening: true, port: 3101 });

    await adapter.stop();
    expect(plugin.stop).toHaveBeenCalledOnce();
    expect(adapter.health()).toMatchObject({ enabled: true, listening: false, port: 3101 });
  });

  it('exposes native server status for diagnostics', async () => {
    const adapter = createAndroidLanServerAdapter();
    await expect(adapter.status()).resolves.toEqual({ listening: true, port: 3101 });
    expect(plugin.status).toHaveBeenCalledOnce();
  });
});
