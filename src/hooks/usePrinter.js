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

import { useState, useCallback } from "react";
import {
  printToFoodKOT,
  printToLiquorKOT,
  printToReceipt,
} from "../utils/qzPrinter";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "";

/**
 * @typedef {Object} OrderData
 * @property {number|string} tableNumber
 * @property {string} orderId
 * @property {Array<{ name: string, quantity: number, price: number, notes?: string, type: 'food'|'liquor' }>} items
 */

export function usePrinter() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ─── Internal helper ──────────────────────────────────────────────────────

  const withLoadingAndError = useCallback(async (fn) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const message =
        err?.message ??
        "Printing failed. Please check QZ Tray and try again.";
      console.error("[usePrinter]", message, err);
      setError(message);
      throw err; // re-throw so caller can catch if needed
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Food KOT ─────────────────────────────────────────────────────────────

  /**
   * Print food KOT to kitchen printer.
   * If there are no food items in the order, the backend returns null
   * and the kitchen printer stays silent — no error is thrown.
   *
   * @param {OrderData} orderData
   */
  const printFoodKOT = useCallback(
    async (orderData) => {
      await withLoadingAndError(async () => {
        const res = await fetch(`${BACKEND_URL}/api/print/food-kot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableNumber: orderData.tableNumber,
            orderId: orderData.orderId,
            items: orderData.items,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Food KOT request failed (${res.status})`);
        }

        const { data } = await res.json();
        if (data === null) {
          // No food items — kitchen printer stays silent
          return;
        }
        await printToFoodKOT(data);
      });
    },
    [withLoadingAndError]
  );

  // ─── Liquor KOT ───────────────────────────────────────────────────────────

  /**
   * Print liquor KOT to bar printer.
   * If there are no liquor items, the backend returns null
   * and the bar printer stays silent — no error is thrown.
   *
   * @param {OrderData} orderData
   */
  const printLiquorKOT = useCallback(
    async (orderData) => {
      await withLoadingAndError(async () => {
        const res = await fetch(`${BACKEND_URL}/api/print/liquor-kot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableNumber: orderData.tableNumber,
            orderId: orderData.orderId,
            items: orderData.items,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Liquor KOT request failed (${res.status})`);
        }

        const { data } = await res.json();
        if (data === null) {
          // No liquor items — bar printer stays silent
          return;
        }
        await printToLiquorKOT(data);
      });
    },
    [withLoadingAndError]
  );

  // ─── Receipt ──────────────────────────────────────────────────────────────

  /**
   * Print full combined receipt to cashier printer.
   * The backend fetches the COMPLETE order from DB (all rounds).
   * Item type is resolved from DB (menuItem.menuType).
   *
   * @param {string} orderId
   */
  const printReceipt = useCallback(
    async (orderId) => {
      await withLoadingAndError(async () => {
        const res = await fetch(`${BACKEND_URL}/api/print/receipt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Receipt request failed (${res.status})`);
        }

        const { data } = await res.json();
        await printToReceipt(data);
      });
    },
    [withLoadingAndError]
  );

  // ─── Combined KOT (Place Order) ───────────────────────────────────────────

  /**
   * Fire food KOT + liquor KOT simultaneously.
   * This is what the waiter's "Place Order" button calls.
   * Uses Promise.all so both printers start at the same time.
   * If one has no items the backend silences that printer automatically.
   *
   * Loading and error state is managed per-call — if one fails the other
   * still completes. Errors from both are combined.
   *
   * @param {OrderData} orderData
   */
  const usePrintOrder = useCallback(
    async (orderData) => {
      setLoading(true);
      setError(null);
      const errors = [];

      const results = await Promise.allSettled([
        printFoodKOT(orderData),
        printLiquorKOT(orderData),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          errors.push(result.reason?.message ?? "Print error");
        }
      }

      setLoading(false);

      if (errors.length > 0) {
        const combined = errors.join(" | ");
        setError(combined);
        throw new Error(combined);
      }
    },
    [printFoodKOT, printLiquorKOT]
  );

  return {
    printFoodKOT,
    printLiquorKOT,
    printReceipt,
    usePrintOrder,
    loading,
    error,
  };
}

export default usePrinter;

// ─────────────────────────────────────────────────────────────────────────────
// Usage examples (for reference — do not import from here)
// ─────────────────────────────────────────────────────────────────────────────

// Waiter places order:
// const { usePrintOrder } = usePrinter();
// await usePrintOrder(orderData); // fires kitchen + bar simultaneously
//
// Where orderData looks like:
// {
//   tableNumber: 5,
//   orderId: "order-abc123",
//   items: [
//     { name: "Butter Chicken", quantity: 2, price: 280, type: "food" },
//     { name: "Old Monk", quantity: 1, price: 180, type: "liquor", notes: "No ice" },
//   ]
// }
//
// Cashier settles:
// const { printReceipt } = usePrinter();
// await printReceipt(orderId); // fires combined bill to cashier receipt printer
