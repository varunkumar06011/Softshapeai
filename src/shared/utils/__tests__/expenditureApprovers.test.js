import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetch = vi.fn();
const edgeFetch = vi.fn();
let outletId = 'outlet-1';

vi.mock('../../../services/apiConfig', () => ({ apiFetch: (...a) => apiFetch(...a) }));
vi.mock('../../../services/edgeHealth', () => ({
  isEdgeLocalAuth: () => false,
  edgeFetch: (...a) => edgeFetch(...a),
}));
vi.mock('../../../utils/getRestaurantConfig', () => ({ getRestaurantConfig: () => ({ id: outletId }) }));

const { loadApproverNames } = await import('../expenditureApprovers');

const VGRAND_LOUNGE = 'cmqy60ci200027dscyj9ubg8h';

describe('loadApproverNames', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    edgeFetch.mockReset();
    localStorage.clear();
    outletId = 'outlet-1';
  });

  it("returns the outlet's own names from the cloud", async () => {
    apiFetch.mockResolvedValue({ names: ['Ramesh sir'], source: 'configured' });
    expect(await loadApproverNames()).toEqual(['Ramesh sir']);
    expect(apiFetch).toHaveBeenCalledWith('/api/expenditures/approver-names');
  });

  it('uses the billing PC first in edge mode', async () => {
    edgeFetch.mockResolvedValue({ names: ['Ramesh sir'], source: 'configured' });
    expect(await loadApproverNames({ edge: true })).toEqual(['Ramesh sir']);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('falls back to the cloud when the billing PC has not synced the list yet', async () => {
    edgeFetch.mockResolvedValue({ names: ['Owner Login'], source: 'unsynced' });
    apiFetch.mockResolvedValue({ names: ['Vinod sir'], source: 'configured' });
    expect(await loadApproverNames({ edge: true })).toEqual(['Vinod sir']);
  });

  it('uses the last list seen on this device when offline', async () => {
    apiFetch.mockResolvedValueOnce({ names: ['Ramesh sir'], source: 'configured' });
    await loadApproverNames();
    apiFetch.mockRejectedValue(new Error('offline'));
    expect(await loadApproverNames()).toEqual(['Ramesh sir']);
  });

  it('keeps the old names for Vgrand on an un-updated billing PC with no cache', async () => {
    outletId = VGRAND_LOUNGE;
    edgeFetch.mockRejectedValue(new Error('404'));
    apiFetch.mockRejectedValue(new Error('offline'));
    expect(await loadApproverNames({ edge: true })).toEqual(['Vinod sir', 'Chandra sir', 'BVL Srinu sir']);
  });

  it('never shows the Vgrand names to other restaurants', async () => {
    edgeFetch.mockRejectedValue(new Error('404'));
    apiFetch.mockRejectedValue(new Error('offline'));
    expect(await loadApproverNames({ edge: true })).toEqual([]);
  });
});
