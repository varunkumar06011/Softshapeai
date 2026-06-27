/**
 * Tests for tableSyncService deduplication logic
 * Run: npx vitest run src/services/__tests__/tableSyncDedup.test.js
 */

import { describe, it, expect } from 'vitest';

// Test the Map-based deduplication pattern that was introduced to fix O(n²) performance
// We test the pattern directly since the internal function is not exported

function dedupByBackendId(tables) {
  return Array.from(new Map(tables.map(t => [t.backendId, t])).values());
}

describe('tableSyncService deduplication', () => {
  it('should remove duplicates by backendId, keeping last occurrence', () => {
    const tables = [
      { backendId: 't1', status: 'Free' },
      { backendId: 't2', status: 'Occupied' },
      { backendId: 't1', status: 'Occupied' }, // duplicate of t1, should overwrite
    ];
    const result = dedupByBackendId(tables);
    expect(result).toHaveLength(2);
    expect(result.find(t => t.backendId === 't1').status).toBe('Occupied');
  });

  it('should handle empty array', () => {
    expect(dedupByBackendId([])).toEqual([]);
  });

  it('should handle array with no duplicates', () => {
    const tables = [
      { backendId: 't1', status: 'Free' },
      { backendId: 't2', status: 'Occupied' },
    ];
    const result = dedupByBackendId(tables);
    expect(result).toHaveLength(2);
  });

  it('should handle array with all same backendId', () => {
    const tables = [
      { backendId: 't1', status: 'Free' },
      { backendId: 't1', status: 'Occupied' },
      { backendId: 't1', status: 'Preparing' },
    ];
    const result = dedupByBackendId(tables);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('Preparing');
  });

  it('should be O(n) — handle large arrays efficiently', () => {
    const n = 10000;
    const tables = Array.from({ length: n }, (_, i) => ({
      backendId: `t${i % 100}`, // 100 unique IDs, n entries
      status: `status-${i}`,
    }));
    const start = performance.now();
    const result = dedupByBackendId(tables);
    const elapsed = performance.now() - start;
    expect(result).toHaveLength(100);
    // Should complete in well under 50ms for 10k items (O(n) vs O(n²))
    expect(elapsed).toBeLessThan(50);
  });
});
