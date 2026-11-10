import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  verifyCaptainSession, markCaptainSessionVerified, forgetCaptainSessionVerified,
  isCaptainSessionRecentlyVerified, SESSION_TRUST_MS,
} from '../captainSession';

const ajay = { id: 'u-ajay', name: 'Ajay Kumar', role: 'CAPTAIN' };
const vgrand = { id: 'out-vgrand', name: 'VGrand Lounge' };

const deps = (over = {}) => ({
  discoverEdgeOnLAN: vi.fn().mockResolvedValue('http://192.168.1.50:3001'),
  isCurrentEdgeForOutlet: vi.fn().mockResolvedValue(true),
  fetchStaffFromEdge: vi.fn().mockResolvedValue([{ id: 'u-ajay' }, { id: 'u-ravi' }]),
  ...over,
});

describe('verifyCaptainSession', () => {
  it("is valid when the outlet's PC lists this captain", async () => {
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, deps())).toBe('valid');
  });

  it('is invalid when the outlet has no captains at all (nobody can be confirmed)', async () => {
    const d = deps({ fetchStaffFromEdge: vi.fn().mockResolvedValue([]) });
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, d)).toBe('invalid');
  });

  it('is invalid when the captain was removed from the outlet', async () => {
    const d = deps({ fetchStaffFromEdge: vi.fn().mockResolvedValue([{ id: 'u-ravi' }]) });
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, d)).toBe('invalid');
  });

  it("is not confirmed when the phone is at another restaurant (that outlet's PC is not on this WiFi)", async () => {
    const d = deps({ isCurrentEdgeForOutlet: vi.fn().mockResolvedValue(false) });
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, d)).toBe('unreachable');
    expect(d.fetchStaffFromEdge).not.toHaveBeenCalled();
  });

  it('is not confirmed when no PC is found or the search fails', async () => {
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, deps({ discoverEdgeOnLAN: vi.fn().mockResolvedValue(null) }))).toBe('unreachable');
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, deps({ discoverEdgeOnLAN: vi.fn().mockRejectedValue(new Error('x')) }))).toBe('unreachable');
  });

  it('is not confirmed when the staff list cannot be read', async () => {
    const d = deps({ fetchStaffFromEdge: vi.fn().mockRejectedValue(new Error('timeout')) });
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, d)).toBe('unreachable');
  });

  it('is invalid when the saved login has no outlet or no person', async () => {
    expect(await verifyCaptainSession({ user: ajay, restaurant: null }, deps())).toBe('invalid');
    expect(await verifyCaptainSession({ user: null, restaurant: vgrand }, deps())).toBe('invalid');
  });

  it('gives up on a search that takes too long', async () => {
    const d = deps({ discoverEdgeOnLAN: vi.fn(() => new Promise(() => {})) });
    expect(await verifyCaptainSession({ user: ajay, restaurant: vgrand }, d, 20)).toBe('unreachable');
  });
});

describe('trust window', () => {
  beforeEach(() => localStorage.clear());

  it('a login is trusted for 30 minutes after the PC confirmed it, and not before it was ever confirmed', () => {
    expect(isCaptainSessionRecentlyVerified()).toBe(false);
    markCaptainSessionVerified(1_000);
    expect(isCaptainSessionRecentlyVerified(1_000 + SESSION_TRUST_MS - 1)).toBe(true);
    expect(isCaptainSessionRecentlyVerified(1_000 + SESSION_TRUST_MS + 1)).toBe(false);
  });

  it('forgetting the confirmation asks the PC again', () => {
    markCaptainSessionVerified();
    forgetCaptainSessionVerified();
    expect(isCaptainSessionRecentlyVerified()).toBe(false);
  });
});
