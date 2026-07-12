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

export interface GstRates {
  totalRate: number;
  cgstRate: number;
  sgstRate: number;
}

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

export function getGstRates(gstCategory: string | null | undefined): GstRates {
  const category = (gstCategory || 'NON_AC').toUpperCase() as GstCategory;
  const ratePercent = category === 'AC' ? 18 : 5;
  const totalRate = ratePercent / 100;
  const half = totalRate / 2;
  return { totalRate, cgstRate: half, sgstRate: half };
}

export function getGstBreakdownWithRate(
  taxableAmount: number,
  ratePercent: number,
  pricesIncludeGst: boolean,
): { cgst: number; sgst: number; tax: number; baseAmount: number } {
  const amount = Math.max(0, Number(taxableAmount) || 0);
  const totalRate = ratePercent / 100;
  const halfRate = totalRate / 2;

  if (ratePercent <= 0) {
    return { cgst: 0, sgst: 0, tax: 0, baseAmount: amount };
  }

  if (pricesIncludeGst) {
    const baseAmount = Math.round((amount / (1 + totalRate)) * 100) / 100;
    const cgst = Math.round(baseAmount * halfRate * 100) / 100;
    const sgst = Math.round(baseAmount * halfRate * 100) / 100;
    const tax = cgst + sgst;
    return { cgst, sgst, tax, baseAmount };
  }

  const cgst = Math.round(amount * halfRate * 100) / 100;
  const sgst = Math.round(amount * halfRate * 100) / 100;
  const tax = cgst + sgst;
  return { cgst, sgst, tax, baseAmount: amount };
}

export function getGstBreakdown(
  taxableAmount: number,
  gstCategory: string | null | undefined,
  pricesIncludeGst: boolean,
): { cgst: number; sgst: number; tax: number; baseAmount: number } {
  const ratePercent = getEffectiveGstRate(null, gstCategory, true);
  return getGstBreakdownWithRate(taxableAmount, ratePercent, pricesIncludeGst);
}
