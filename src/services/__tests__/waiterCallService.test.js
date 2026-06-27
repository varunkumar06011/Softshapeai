/**
 * Tests for waiterCallService.js — resetWaiterCallListeners and generateCallId
 * Run: npx vitest run src/services/__tests__/waiterCallService.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock socket
const mockSocket = {
  connected: false,
  id: 'test-socket-id',
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  io: { on: vi.fn() },
};

vi.mock('../../hooks/useSocket', () => ({
  getSocket: () => mockSocket,
  getPublicSocket: () => mockSocket,
}));

vi.mock('./apiConfig', () => ({
  API_BASE: 'http://localhost:3000',
}));

vi.mock('../../utils/cacheKeys', () => ({
  getTenantScopedKey: (base) => `tenant:${base}`,
}));

vi.mock('../../utils/getCurrentRestaurantId', () => ({
  getCurrentRestaurantId: () => 'r-1',
}));

// Mock localStorage
const store = {};
global.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = value; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

describe('waiterCallService', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.clearAllMocks();
    mockSocket.connected = false;
    vi.resetModules();
  });

  it('resetWaiterCallListeners should be exported and callable', async () => {
    const { resetWaiterCallListeners } = await import('../waiterCallService');
    expect(typeof resetWaiterCallListeners).toBe('function');
    expect(() => resetWaiterCallListeners()).not.toThrow();
  });

  it('initSocket should call socket.on for connect and waiter:event', async () => {
    const { initSocket } = await import('../waiterCallService');
    initSocket();
    // Should register connect, waiter:event listeners
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('waiter:event', expect.any(Function));
  });

  it('initSocket should be idempotent — not register listeners twice', async () => {
    const { initSocket } = await import('../waiterCallService');
    initSocket();
    initSocket();
    // connect listener should only be registered once (first call)
    const connectCalls = mockSocket.on.mock.calls.filter(c => c[0] === 'connect');
    expect(connectCalls.length).toBe(1);
  });

  it('resetWaiterCallListeners should allow re-registration on next initSocket', async () => {
    const { initSocket, resetWaiterCallListeners } = await import('../waiterCallService');
    initSocket();
    const firstCallCount = mockSocket.on.mock.calls.length;
    resetWaiterCallListeners();
    initSocket();
    // Should have registered new listeners after reset
    expect(mockSocket.on.mock.calls.length).toBeGreaterThan(firstCallCount);
  });
});
