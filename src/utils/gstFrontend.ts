// ─────────────────────────────────────────────────────────────────────────────
// GST Utilities — Frontend port of softshape-backend/src/utils/gst.ts
// ─────────────────────────────────────────────────────────────────────────────
// Handles GST (Goods and Services Tax) calculations for Indian restaurants.
// GST is split equally into CGST (Central) and SGST (State) for intra-state sales.
//
// Rate resolution priority:
//   1. Owner override: if gstRate is a non-null number > 0, use it directly
//   2. Category-based: AC = 18%, NON_AC/TAKEAWAY = 5%
//   3. If gstRegistered is false, always returns 0% (unregistered restaurants)
//
// This file MUST be kept in sync with softshape-backend/src/utils/gst.ts.
// See PARITY_MAINTENANCE.md for the process.
// ─────────────────────────────────────────────────────────────────────────────

export type GstCategory = 'NON_AC' | 'AC' | 'TAKEAWAY';

export function getEffectiveGstRate(
  gstRate: number | null | undefined,
  gstCategory: string | null | undefined,
  gstRegistered: boolean | null | undefined,
): number {
  if (gstRegistered === false) return 0;
  if (gstRate != null && gstRate > 0) return gstRate;
  const category = (gstCategory || 'NON_AC').toUpperCase() as GstCategory;
  return category === 'AC' ? 18 : 5;
}

export function getGstBreakdownWithRate(
  taxableAmount: number,
  ratePercent: number,
): { cgst: number; sgst: number; tax: number; baseAmount: number } {
  const amount = Math.max(0, Number(taxableAmount) || 0);

  if (ratePercent <= 0) {
    return { cgst: 0, sgst: 0, tax: 0, baseAmount: amount };
  }

  // GST is always added on top of the taxable amount.
  // Per-item GST control is handled via menuItem.gstEnabled flag from admin panel,
  // not via pricesIncludeGst. CGST/SGST are NOT rounded — only grand total is rounded.
  const totalRate = ratePercent / 100;
  const halfRate = totalRate / 2;
  const tax = amount * totalRate;
  const cgst = amount * halfRate;
  const sgst = amount * halfRate;
  return { cgst, sgst, tax, baseAmount: amount };
}
