// ─────────────────────────────────────────────────────────────────────────────
// usePrinter — React hook for all printing operations (KOTs and receipts)
// ─────────────────────────────────────────────────────────────────────────────
// Provides functions to send print jobs to the backend, which generates
// ESC/POS data and sends it to QZ Tray (browser) or the Windows Print Agent.
//
// Exposes:
//   printFoodKOT(orderData)   — POST to backend → print to kitchen printer
//   printLiquorKOT(orderData) — POST to backend → print to bar printer
//   printReceipt(orderId)     — POST to backend (fetches full order from DB) → print to cashier printer
//   loading                   — true while any print job is in progress
//   error                     — last error message (null if none)
//
// Also exports:
//   usePrintOrder(orderData)  — Fires food KOT + liquor KOT simultaneously
//                               using Promise.all — call this from "Place Order" button
//
// IMPORTANT:
//   - Receipts always fetch from the DB by orderId (never trust frontend item list)
//   - KOTs send items directly from the frontend (with type field for food/liquor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * usePrinter — React hook for all printing operations
 *
 * Exposes:
 *   printFoodKOT(orderData)   – POST to backend → print to kitchen printer
 *   printLiquorKOT(orderData) – POST to backend → print to bar printer
 *   printReceipt(orderId)     – POST to backend (fetches full order from DB) → print to cashier printer
 *   loading                   – true while any print job is in progress
 *   error                     – last error message (null if none)
 *
 * Also exports:
 *   usePrintOrder(orderData)  – Fires food KOT + liquor KOT simultaneously
 *                               using Promise.all — call this from "Place Order" button
 *
 * IMPORTANT:
 *   – Never call print functions directly from components.
 *     Always use this hook.
 *   – The receipt route fetches items from DB by orderId.
 *     The frontend never sends the item list for receipts.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 * // Waiter places order:
 * const { usePrintOrder } = usePrinter();
 * await usePrintOrder(orderData); // fires kitchen + bar simultaneously
 *
 * // Cashier settles:
 * const { printReceipt } = usePrinter();
 * await printReceipt(orderId); // fires combined bill to cashier printer
 */

// DEPRECATED: All direct QZ Tray printing has been removed.
// PrintStation is the ONLY component that talks to QZ Tray.
// Cashier / Captain apps emit print jobs via backend socket events.
// This file is kept as a placeholder to avoid breaking import references.
// If you need printing utilities, use src/utils/qzTray.js (PrintStation only).

export function usePrinter() {
  return {
    printFoodKOT: async () => { throw new Error("Direct printing disabled. Use backend socket events."); },
    printLiquorKOT: async () => { throw new Error("Direct printing disabled. Use backend socket events."); },
    printReceipt: async () => { throw new Error("Direct printing disabled. Use backend socket events."); },
    usePrintOrder: async () => { throw new Error("Direct printing disabled. Use backend socket events."); },
    loading: false,
    error: null,
  };
}

export default usePrinter;
