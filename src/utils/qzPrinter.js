/**
 * QZ Tray printer utility
 *
 * Handles:
 *   - Setting up QZ Tray security (certificate + SHA512 signing via backend)
 *   - Connecting to QZ Tray WebSocket (wss://localhost:8181)
 *   - Sending print jobs to the three printers
 *
 * Environment variables (Vite — must be prefixed with VITE_):
 *   VITE_BACKEND_URL             – Backend base URL (e.g. https://softshape-backend.onrender.com)
 *   VITE_KOT_FOOD_PRINTER_NAME  – Exact Windows printer name for food KOT
 *   VITE_KOT_LIQUOR_PRINTER_NAME – Exact Windows printer name for liquor/bar KOT
 *   VITE_RECEIPT_PRINTER_NAME   – Exact Windows printer name for cashier receipt
 *
 * QZ Tray must be running on the bar PC and listening on wss://localhost:8181.
 * If QZ Tray is not running, all print functions throw a clear error message.
 */

import qz from "qz-tray";
import { QZ_CERT } from "../services/certificate.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "";

// ─── Security Setup ───────────────────────────────────────────────────────────

let _setupDone = false;

/**
 * Configure QZ Tray security once.
 * - Certificate: loaded from constants/certificate.js (public, safe to commit)
 * - Signing: done server-side via POST /api/print/qz-sign (private key never leaves Render)
 */
function setupQZ() {
  if (_setupDone) return;
  _setupDone = true;

  qz.security.setCertificatePromise((_resolve, _reject) => {
    _resolve(QZ_CERT);
  });

  qz.security.setSignatureAlgorithm("SHA512");

  qz.security.setSignaturePromise((toSign) => {
    return (resolve, reject) => {
      fetch(`${BACKEND_URL}/api/print/qz-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toSign }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`QZ sign request failed: ${r.status}`);
          return r.json();
        })
        .then((data) => resolve(data.signature))
        .catch((err) => {
          console.error("[qzPrinter] Signing error:", err);
          reject(err);
        });
    };
  });
}

// ─── Connection ───────────────────────────────────────────────────────────────

/**
 * Connect to QZ Tray if not already connected.
 * Throws a clear message if QZ Tray is not running on the PC.
 */
export async function connectQZ() {
  setupQZ();

  if (qz.websocket.isActive()) return;

  try {
    await qz.websocket.connect();
  } catch (err) {
    const msg =
      "QZ Tray is not running. Please start QZ Tray on the printer PC and try again.";
    console.error("[qzPrinter]", msg, err);
    throw new Error(msg);
  }
}

// ─── Print Helpers ────────────────────────────────────────────────────────────

/**
 * Send ESC/POS data to a named printer via QZ Tray.
 * @param printerName - Exact Windows printer name
 * @param data - Array returned by the backend build* functions
 */
async function sendToPrinter(printerName, data) {
  await connectQZ();

  const config = qz.configs.create(printerName);
  await qz.print(config, data);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Send data to the Food KOT printer (kitchen) */
export async function printToFoodKOT(data) {
  const printerName = import.meta.env.VITE_KOT_FOOD_PRINTER_NAME;
  if (!printerName) throw new Error("VITE_KOT_FOOD_PRINTER_NAME is not configured");
  await sendToPrinter(printerName, data);
}

/** Send data to the Liquor KOT printer (bar) */
export async function printToLiquorKOT(data) {
  const printerName = import.meta.env.VITE_KOT_LIQUOR_PRINTER_NAME;
  if (!printerName) throw new Error("VITE_KOT_LIQUOR_PRINTER_NAME is not configured");
  await sendToPrinter(printerName, data);
}

/** Send data to the Receipt printer (cashier) */
export async function printToReceipt(data) {
  const printerName = import.meta.env.VITE_RECEIPT_PRINTER_NAME;
  if (!printerName) throw new Error("VITE_RECEIPT_PRINTER_NAME is not configured");
  await sendToPrinter(printerName, data);
}
