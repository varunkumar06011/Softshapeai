import { describe, expect, it, vi } from 'vitest';
import { AndroidLocalPosRuntime, RUNTIME_STATES } from '../runtime';
import { getAndroidLocalPosConfig, isAndroidLocalPosEnabled } from '../config';

function makeAdapters() {
  return {
    database: {
      open: vi.fn(),
      close: vi.fn(),
      health: vi.fn(() => ({ ready: true })),
    },
    printer: {
      print: vi.fn(async (job) => ({ success: true, job })),
      health: vi.fn(() => ({ ready: true })),
    },
    sync: {
      start: vi.fn(),
      stop: vi.fn(),
      health: vi.fn(() => ({ pending: 0 })),
    },
    lan: {
      start: vi.fn(),
      stop: vi.fn(),
      health: vi.fn(() => ({ listening: true })),
    },
  };
}

describe('AndroidLocalPosRuntime', () => {
  it('starts adapters in dependency order and exposes ready status', async () => {
    const adapters = makeAdapters();
    const runtime = new AndroidLocalPosRuntime(adapters);

    await runtime.start();

    expect(adapters.database.open).toHaveBeenCalledOnce();
    expect(adapters.lan.start).toHaveBeenCalledOnce();
    expect(adapters.sync.start).toHaveBeenCalledOnce();
    expect(runtime.getStatus()).toMatchObject({ state: RUNTIME_STATES.READY, ready: true });
  });

  it('prints only after the local runtime is ready', async () => {
    const adapters = makeAdapters();
    const runtime = new AndroidLocalPosRuntime(adapters);

    await expect(runtime.print({ type: 'KOT', eventId: 'kot-1' }))
      .rejects.toThrow('Android Local POS is not ready');

    await runtime.start();
    await runtime.print({ type: 'KOT', eventId: 'kot-1' });

    expect(adapters.printer.print).toHaveBeenCalledWith({ type: 'KOT', eventId: 'kot-1' });
  });

  it('stops all adapters and recovers cleanly from startup failure', async () => {
    const adapters = makeAdapters();
    const startupError = new Error('database unavailable');
    adapters.database.open.mockRejectedValueOnce(startupError);
    const runtime = new AndroidLocalPosRuntime(adapters);

    await expect(runtime.start()).rejects.toBe(startupError);
    expect(adapters.sync.stop).toHaveBeenCalledOnce();
    expect(adapters.lan.stop).toHaveBeenCalledOnce();
    expect(adapters.database.close).toHaveBeenCalledOnce();
    expect(runtime.getStatus()).toMatchObject({ state: RUNTIME_STATES.ERROR, ready: false });
  });
});

describe('Android Local POS build isolation', () => {
  it('requires both native platform and explicit build flag', () => {
    expect(isAndroidLocalPosEnabled({
      env: { VITE_ANDROID_LOCAL_POS: 'true' },
      capacitor: { isNativePlatform: () => true },
    })).toBe(true);

    expect(isAndroidLocalPosEnabled({
      env: { VITE_ANDROID_LOCAL_POS: 'true' },
      capacitor: { isNativePlatform: () => false },
    })).toBe(false);

    expect(isAndroidLocalPosEnabled({
      env: { VITE_ANDROID_LOCAL_POS: 'false' },
      capacitor: { isNativePlatform: () => true },
    })).toBe(false);

    expect(isAndroidLocalPosEnabled({
      env: { MODE: 'cashier-android' },
      capacitor: { isNativePlatform: () => true },
    })).toBe(true);
  });

  it('uses safe defaults for the local hub configuration', () => {
    expect(getAndroidLocalPosConfig({ env: {} })).toEqual({
      enabled: false,
      hubPort: 3101,
      cloudSyncEnabled: true,
    });
  });
});
