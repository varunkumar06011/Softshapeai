import { describe, it, expect } from 'vitest';
import { isEdgeReady, edgeNotReadyReason } from '../edgeReadiness';

const status = (over = {}) => ({
  registered: true,
  sessionValid: true,
  configSyncCompleted: true,
  localStats: { menuItems: 120, tables: 20 },
  ...over,
});

describe('edgeReadiness', () => {
  it('a linked PC with its menu loaded is ready', () => {
    expect(isEdgeReady(status())).toBe(true);
    expect(edgeNotReadyReason(status())).toBeNull();
  });

  it('a finished sync with no menu items (new outlet) is ready — no "Continue" loop', () => {
    expect(isEdgeReady(status({ localStats: { menuItems: 0, tables: 5 } }))).toBe(true);
  });

  it('menu items already present are enough while the sync flag is not set yet', () => {
    expect(isEdgeReady(status({ configSyncCompleted: false }))).toBe(true);
  });

  it('no menu and no finished sync is not ready, and says why', () => {
    const s = status({ configSyncCompleted: false, localStats: { menuItems: 0, tables: 0 } });
    expect(isEdgeReady(s)).toBe(false);
    expect(edgeNotReadyReason(s)).toMatch(/menu has not been loaded/i);
  });

  it('an expired link is not ready, and says to link again', () => {
    const s = status({ sessionValid: false });
    expect(isEdgeReady(s)).toBe(false);
    expect(edgeNotReadyReason(s)).toMatch(/expired/i);
  });

  it('an unlinked PC, or no answer at all, is not ready', () => {
    expect(edgeNotReadyReason(status({ registered: false }))).toMatch(/not linked/i);
    expect(isEdgeReady(undefined)).toBe(false);
    expect(isEdgeReady(null)).toBe(false);
  });
});
