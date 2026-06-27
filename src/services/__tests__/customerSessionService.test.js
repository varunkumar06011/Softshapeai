/**
 * Tests for customerSessionService.js — generateCallId and markWaiterCallAccepted
 * Run: npx vitest run src/services/__tests__/customerSessionService.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store = {};
global.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = value; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

describe('customerSessionService', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.resetModules();
  });

  describe('generateCallId', () => {
    it('should generate a unique call ID with wc_ prefix', async () => {
      const { generateCallId } = await import('../customerSessionService');
      const id = generateCallId();
      expect(id).toMatch(/^wc_\d+_/);
    });

    it('should generate different IDs on subsequent calls', async () => {
      const { generateCallId } = await import('../customerSessionService');
      const id1 = generateCallId();
      // Wait a tiny bit to ensure different timestamp
      await new Promise(r => setTimeout(r, 1));
      const id2 = generateCallId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getDeviceSessionId', () => {
    it('should create and persist a device session ID', async () => {
      const { getDeviceSessionId } = await import('../customerSessionService');
      const id1 = getDeviceSessionId();
      expect(id1).toMatch(/^session_/);
      // Should return the same ID on subsequent calls
      const id2 = getDeviceSessionId();
      expect(id2).toBe(id1);
    });
  });

  describe('markWaiterCallAccepted', () => {
    it('should return false when no call exists for the table', async () => {
      const { markWaiterCallAccepted } = await import('../customerSessionService');
      const result = markWaiterCallAccepted('nonexistent-table', 'captain-1');
      expect(result).toBe(false);
    });

    it('should accept a pending call and return true', async () => {
      const { markWaiterCallAccepted } = await import('../customerSessionService');
      // Manually set up a pending call in localStorage
      const calls = {
        'table-1': {
          callId: 'wc_123',
          tableId: 'table-1',
          timestamp: Date.now(),
          status: 'pending',
          handledBy: null,
          source: 'restaurant',
        }
      };
      store['softshape_waiter_calls'] = JSON.stringify(calls);

      const result = markWaiterCallAccepted('table-1', 'captain-1');
      expect(result).toBe(true);

      // Verify the call was marked as accepted
      const updated = JSON.parse(store['softshape_waiter_calls']);
      expect(updated['table-1'].status).toBe('accepted');
      expect(updated['table-1'].handledBy).toBe('captain-1');
    });

    it('should return false when call is already accepted', async () => {
      const { markWaiterCallAccepted } = await import('../customerSessionService');
      const calls = {
        'table-1': {
          callId: 'wc_123',
          tableId: 'table-1',
          timestamp: Date.now(),
          status: 'accepted',
          handledBy: 'captain-1',
          source: 'restaurant',
        }
      };
      store['softshape_waiter_calls'] = JSON.stringify(calls);

      const result = markWaiterCallAccepted('table-1', 'captain-2');
      expect(result).toBe(false);
    });
  });

  describe('deprecated validateAndCreateWaiterCall removal', () => {
    it('should not export validateAndCreateWaiterCall', async () => {
      const mod = await import('../customerSessionService');
      expect(mod.validateAndCreateWaiterCall).toBeUndefined();
    });
  });
});
