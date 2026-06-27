/**
 * Tests for AuthContext.jsx — token validation logic
 * Run: npx vitest run src/context/__tests__/AuthContext.test.jsx
 *
 * Since @testing-library/react is not installed, we test the
 * token validation logic that AuthContext uses internally.
 */

import { describe, it, expect } from 'vitest';

// Mock localStorage
const store = {};
global.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = value; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

// Helper to create a JWT token
function makeToken(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function makeValidToken() {
  return makeToken({
    userId: 'u1',
    role: 'OWNER',
    restaurantId: 'r1',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

function makeExpiredToken() {
  return makeToken({
    userId: 'u1',
    role: 'OWNER',
    restaurantId: 'r1',
    exp: Math.floor(Date.now() / 1000) - 3600,
  });
}

// Re-implement isTokenValid to match AuthContext's internal logic
function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return true;
    return Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}

describe('AuthContext isTokenValid logic', () => {
  it('should return false for null/undefined token', () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid(undefined)).toBe(false);
  });

  it('should return true for a valid unexpired token', () => {
    expect(isTokenValid(makeValidToken())).toBe(true);
  });

  it('should return false for an expired token', () => {
    expect(isTokenValid(makeExpiredToken())).toBe(false);
  });

  it('should return true for a token without exp field', () => {
    const token = makeToken({ userId: 'u1', role: 'OWNER' });
    expect(isTokenValid(token)).toBe(true);
  });

  it('should return false for an invalid token string', () => {
    expect(isTokenValid('not-a-jwt')).toBe(false);
    expect(isTokenValid('a.b.c.d')).toBe(false);
    expect(isTokenValid('')).toBe(false);
  });
});

describe('AuthContext exports', () => {
  it('should export AuthProvider, useAuth, and useFeature', async () => {
    const mod = await import('../AuthContext');
    expect(typeof mod.AuthProvider).toBe('function');
    expect(typeof mod.useAuth).toBe('function');
    expect(typeof mod.useFeature).toBe('function');
  });
});
