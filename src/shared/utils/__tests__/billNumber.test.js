import { describe, it, expect } from 'vitest';
import { billSequence } from '../billNumber';

describe('billSequence', () => {
  it('reads plain numeric bill numbers exactly as before', () => {
    expect(billSequence('12')).toBe(12);
    expect(billSequence(7)).toBe(7);
    expect(billSequence('007')).toBe(7);
  });

  it('reads the counter from prefixed multi-PC bill numbers', () => {
    expect(billSequence('D-12')).toBe(12);
    expect(billSequence('C-3')).toBe(3);
    expect(billSequence('CP9')).toBe(9);
  });

  it('returns null when there is no bill number or no counter', () => {
    expect(billSequence(null)).toBeNull();
    expect(billSequence(undefined)).toBeNull();
    expect(billSequence('')).toBeNull();
    expect(billSequence('ABC')).toBeNull();
  });

  it('sorts prefixed bill numbers by counter without NaN', () => {
    const bills = [{ billNumber: 'C-10' }, { billNumber: 'D-2' }, { billNumber: 'C-1' }];
    const sorted = [...bills].sort((a, b) => billSequence(a.billNumber) - billSequence(b.billNumber));
    expect(sorted.map((b) => b.billNumber)).toEqual(['C-1', 'D-2', 'C-10']);
  });
});
