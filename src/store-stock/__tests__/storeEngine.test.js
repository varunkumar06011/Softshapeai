import { describe, it, expect } from 'vitest';
import { createBook, unitRatio, rangeFor, addDays } from '../storeEngine';

let seq = 0;
const e = (itemId, type, qty, date, extra = {}) => ({ id: 'e' + ++seq, itemId, type, qty, date, ts: Date.parse(date + 'T10:00:00+05:30') + seq, by: 't', ...extra });
const ITEM = { id: 'i1', name: 'Dal', unit: 'kg' };
const DEPTS = ['Indian Kitchen', 'Chinese Kitchen', 'Tandoori Kitchen', 'Other'];

describe('store engine', () => {
  it('values stock at weighted-average cost and keeps balances exact', () => {
    const b = createBook({ items: [ITEM], depts: DEPTS, entries: [
      e('i1', 'OPENING', 20, '2026-11-01', { rate: 40 }),
      e('i1', 'PURCHASE', 15, '2026-11-04', { rate: 55 }),
      e('i1', 'ISSUE', -10, '2026-11-05', { dept: 'Indian Kitchen' }),
    ] });
    // avg after purchase = (800 + 825) / 35
    const avg = 1625 / 35;
    const bal = b.bal('i1');
    expect(bal.q).toBe(25);
    expect(bal.v).toBeCloseTo(1625 - 10 * avg, 6);
  });

  it('opening of a day is the previous closing, and every report balances', () => {
    const b = createBook({ items: [ITEM], depts: DEPTS, entries: [
      e('i1', 'OPENING', 20, '2026-11-01', { rate: 40 }),
      e('i1', 'PURCHASE', 15, '2026-11-04', { rate: 55 }),
      e('i1', 'ISSUE', -10, '2026-11-04', { dept: 'Chinese Kitchen' }),
      e('i1', 'ADJUST', -2, '2026-11-05', { reason: 'Wastage' }),
      e('i1', 'ISSUE', -3, '2026-11-06', { dept: 'Tandoori Kitchen' }),
    ] });
    const d4 = b.period('i1', '2026-11-04', '2026-11-04'), d5 = b.period('i1', '2026-11-05', '2026-11-05');
    expect(d5.openQ).toBe(d4.closeQ);
    expect(d5.openV).toBeCloseTo(d4.closeV, 6);
    for (const [f, t] of [['2026-11-01', '2026-11-30'], ['2026-11-04', '2026-11-06'], ['2026-11-05', '2026-11-05']]) {
      const P = b.period('i1', f, t);
      expect(P.openQ + P.pQty + P.adjQ - P.issQ).toBeCloseTo(P.closeQ, 9);
    }
    const week = b.buildReports('2026-11-02', '2026-11-08');
    expect(week.rows[0].P.dq['Chinese Kitchen']).toBe(10);
    expect(week.rows[0].P.dq['Tandoori Kitchen']).toBe(3);
  });

  it('a correction undoes the entry in stock, value, price history and department totals', () => {
    const issue = e('i1', 'ISSUE', -10, '2026-11-05', { dept: 'Indian Kitchen' });
    const buy = e('i1', 'PURCHASE', 5, '2026-11-05', { rate: 90 });
    const before = createBook({ items: [ITEM], depts: DEPTS, entries: [e('i1', 'OPENING', 20, '2026-11-01', { rate: 40 })] }).bal('i1');
    const b = createBook({ items: [ITEM], depts: DEPTS, entries: [
      e('i1', 'OPENING', 20, '2026-11-01', { rate: 40 }), issue, buy,
      e('i1', 'REVERSAL', 10, '2026-11-06', { reverses: issue.id, reason: 'typo' }),
      e('i1', 'REVERSAL', -5, '2026-11-06', { reverses: buy.id, reason: 'typo' }),
    ] });
    expect(b.bal('i1').q).toBe(before.q);
    expect(b.bal('i1').v).toBeCloseTo(before.v, 6);
    expect(b.priceInfo('i1').cur.rate).toBe(40); // corrected purchase no longer counts as a price point
    const P = b.period('i1', '2026-11-01', '2026-11-30');
    expect(P.issQ).toBe(0);
    expect(P.pQty).toBe(0);
  });

  it('shows previous vs current rate and the percentage change', () => {
    const b = createBook({ items: [ITEM], depts: DEPTS, entries: [
      e('i1', 'PURCHASE', 20, '2026-11-01', { rate: 40 }),
      e('i1', 'PURCHASE', 15, '2026-11-04', { rate: 55 }),
      e('i1', 'PURCHASE', 10, '2026-11-07', { rate: 52 }),
    ] });
    const p = b.priceInfo('i1');
    expect(p.prev.rate).toBe(55);
    expect(p.cur.rate).toBe(52);
    expect(p.pct).toBeCloseTo(-5.4545, 3);
    expect(b.priceInfo('i1', '2026-11-04').pct).toBeCloseTo(37.5, 6);
  });

  it('converts typed units into the item unit', () => {
    expect(unitRatio('g', 'kg')).toBeCloseTo(0.001, 9);
    expect(unitRatio('ton', 'kg')).toBe(1000);
    expect(unitRatio('ml', 'litre')).toBeCloseTo(0.001, 9);
    expect(unitRatio('dozen', 'piece')).toBe(12);
    expect(500 * unitRatio('g', 'kg')).toBeCloseTo(0.5, 9); // 500 g into a KG item
    expect(0.05 / unitRatio('g', 'kg')).toBeCloseTo(50, 6); // Rs 0.05/g = Rs 50/kg
  });

  it('builds day, week and month ranges', () => {
    expect(rangeFor('week', '2026-11-09')).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(rangeFor('week', '2026-11-15')).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(rangeFor('month', '2026-11-20')).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});
