/**
 * Tests for authService.js
 * Run: npx vitest run src/services/__tests__/authService.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the imports that authService depends on
vi.mock('../../utils/cacheKeys', () => ({
  purgeLegacyCaches: vi.fn(),
  clearTenantCaches: vi.fn(),
}));

vi.mock('../../hooks/useSocket', () => ({
  disconnectSocket: vi.fn(),
}));

// Mock global.fetch and localStorage
const store = {};
global.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = value; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

vi.stubEnv('VITE_API_URL', 'http://localhost:3000');

// Helper to create a JWT token with a given payload
function makeToken(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

// Helper to create a token that expires in the future
function makeValidToken() {
  return makeToken({
    userId: 'u1',
    role: 'OWNER',
    restaurantId: 'r1',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

// Helper to create an expired token
function makeExpiredToken() {
  return makeToken({
    userId: 'u1',
    role: 'OWNER',
    restaurantId: 'r1',
    exp: Math.floor(Date.now() / 1000) - 3600,
  });
}

describe('authService', () => {
  let authService;

  beforeEach(async () => {
    // Clear store
    for (const k of Object.keys(store)) delete store[k];
    vi.clearAllMocks();
    // Re-import to get fresh module
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000');
    authService = (await import('../authService')).authService;
  });

  describe('getToken / setToken', () => {
    it('should return null when no token is stored', () => {
      expect(authService.getToken()).toBeNull();
    });

    it('should return the stored token after setToken', () => {
      authService.setToken('my-token');
      expect(authService.getToken()).toBe('my-token');
    });
  });

  describe('getUser', () => {
    it('should return null when no user is stored', () => {
      expect(authService.getUser()).toBeNull();
    });

    it('should return the parsed user object', () => {
      const user = { id: 'u1', role: 'OWNER', name: 'Test' };
      store['ss_user'] = JSON.stringify(user);
      expect(authService.getUser()).toEqual(user);
    });

    it('should return null for corrupted JSON', () => {
      store['ss_user'] = '{invalid json';
      expect(authService.getUser()).toBeNull();
    });
  });

  describe('getRestaurantId', () => {
    it('should return null when no restaurant is stored', () => {
      expect(authService.getRestaurantId()).toBeNull();
    });

    it('should return the restaurant id from stored object', () => {
      store['ss_restaurant'] = JSON.stringify({ id: 'r-123', name: 'Test Resto' });
      expect(authService.getRestaurantId()).toBe('r-123');
    });

    it('should return null for corrupted JSON', () => {
      store['ss_restaurant'] = '{invalid json';
      expect(authService.getRestaurantId()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token is stored', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should return true for a valid unexpired token', () => {
      store['ss_token'] = makeValidToken();
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return false for an expired token', () => {
      store['ss_token'] = makeExpiredToken();
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should return true for a token without exp field', () => {
      store['ss_token'] = makeToken({ userId: 'u1', role: 'OWNER' });
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return false for an invalid token string', () => {
      store['ss_token'] = 'not-a-jwt';
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('getAuthHeader', () => {
    it('should return empty object when no token', () => {
      expect(authService.getAuthHeader()).toEqual({});
    });

    it('should return Authorization header with Bearer token', () => {
      store['ss_token'] = 'my-token';
      expect(authService.getAuthHeader()).toEqual({ Authorization: 'Bearer my-token' });
    });
  });

  describe('login', () => {
    it('should store token, user, and restaurant on successful login', async () => {
      const mockData = {
        token: makeValidToken(),
        user: { id: 'u1', role: 'OWNER' },
        restaurant: { id: 'r1', name: 'Test' },
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (key) => key === 'content-type' ? 'application/json' : null },
        json: () => Promise.resolve(mockData),
      });

      const result = await authService.login('test@test.com', 'pass', 'REST001');
      expect(result).toEqual(mockData);
      expect(store['ss_token']).toBe(mockData.token);
      expect(JSON.parse(store['ss_user'])).toEqual(mockData.user);
      expect(JSON.parse(store['ss_restaurant'])).toEqual(mockData.restaurant);
    });

    it('should throw on failed login', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: (key) => key === 'content-type' ? 'application/json' : null },
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      });

      await expect(authService.login('test@test.com', 'wrong', 'REST001'))
        .rejects.toThrow('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('should remove all stored items and call disconnectSocket', async () => {
      store['ss_token'] = makeValidToken();
      store['ss_user'] = JSON.stringify({ id: 'u1' });
      store['ss_restaurant'] = JSON.stringify({ id: 'r1' });

      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await authService.logout();

      const { disconnectSocket } = await import('../../hooks/useSocket');
      expect(store['ss_token']).toBeUndefined();
      expect(store['ss_user']).toBeUndefined();
      expect(store['ss_restaurant']).toBeUndefined();
      expect(disconnectSocket).toHaveBeenCalled();
    });

    it('should not throw if fetch fails during logout', async () => {
      store['ss_token'] = makeValidToken();
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(authService.logout()).resolves.not.toThrow();
    });
  });
});
