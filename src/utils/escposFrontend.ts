// ─────────────────────────────────────────────────────────────────────────────
// ESC/POS Builders — Compatibility shim for @softshape/output
// ─────────────────────────────────────────────────────────────────────────────
// This file re-exports the shared renderer package functions with the original
// builder names and return types (object[] instead of RenderedOutput).
// Existing imports from "../utils/escposFrontend" continue to work unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import {
  renderFoodKOT,
  renderLiquorKOT,
  renderFinalBill,
  renderCancelKOT,
  renderTableSwap,
  renderXReport,
  renderReceipt,
  numberToWords,
} from "@softshape/output";
import type {
  PrintItem,
  OrderData,
  BillData,
  BillPrintRestaurant,
  CancelKotItem,
  CancelKotPrintInput,
  TableSwapPrintInput,
  XReportDenomination,
  XReportExpenditureRow,
  XReportData,
  RenderedOutput,
} from "@softshape/output";

function toBlocks(rendered: RenderedOutput): object[] {
  return rendered.blocks as unknown as object[];
}

export {
  type PrintItem,
  type OrderData,
  type BillData,
  type BillPrintRestaurant,
  type CancelKotItem,
  type CancelKotPrintInput,
  type TableSwapPrintInput,
  type XReportDenomination,
  type XReportExpenditureRow,
  type XReportData,
};

export function buildFoodKOT(orderData: OrderData): object[] {
  return toBlocks(renderFoodKOT(orderData));
}

export function buildLiquorKOT(orderData: OrderData): object[] {
  return toBlocks(renderLiquorKOT(orderData));
}

export function buildFinalBill(data: BillData): object[] {
  return toBlocks(renderFinalBill(data));
}

export function buildBillEscpos(data: BillData): object[] {
  return toBlocks(renderFinalBill(data));
}

export function buildCancelKOT(input: CancelKotPrintInput): object[] {
  return toBlocks(renderCancelKOT(input));
}

export function buildTableSwap(input: TableSwapPrintInput): object[] {
  return toBlocks(renderTableSwap(input));
}

export function buildXReportEscpos(data: XReportData): object[] {
  return toBlocks(renderXReport(data));
}

export function buildReceipt(
  orderData: OrderData,
  tax: { cgst: number; sgst: number; total: number },
): object[] {
  return toBlocks(renderReceipt(orderData, tax));
}

export { numberToWords };
