// ── Offline Print Pipeline ───────────────────────────────────────────────────
// Handles local printing when the backend socket is unavailable (offline mode).
// Dispatch strategy by platform:
//   1. Tauri desktop: window.__TAURI__.invoke('print_raw', { printerName, bytes })
//   2. Web/PWA with QZ Tray: sendToPrinter() from qzTray.js
//   3. Capacitor Android: Bluetooth/USB ESC/POS plugin (future)
//   4. iOS PWA: generate shareable PDF receipt
//   5. No printer: queue in offlinePrintJobs IndexedDB store for auto-print on reconnect

import { addOfflinePrintJob, getOfflinePrintJobs, updateOfflinePrintJob, getLocalPrinterMapping, getPrintAgentUrl } from './offlineDB';

// ── Platform detection ───────────────────────────────────────────────────────

function detectPlatform() {
  if (window.__TAURI__) return 'tauri';
  if (window.Capacitor?.isNativePlatform?.()) return 'capacitor';
  // iOS Safari standalone (PWA added to home screen)
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && window.navigator.standalone) return 'ios-pwa';
  if (isIOS) return 'ios-browser';
  return 'web';
}

// ── Printer config ───────────────────────────────────────────────────────────

async function getPrinterMapping() {
  try {
    return await getLocalPrinterMapping();
  } catch {
    // Fallback to legacy localStorage mapping if IndexedDB is unavailable
    try {
      const stored = localStorage.getItem('agent_printer_mapping');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }
}

function resolvePrinter(jobType, mapping) {
  // Fall back to mapping
  if (jobType === 'KOT' || jobType === 'CANCEL_KOT') return mapping.kitchen;
  if (jobType === 'BAR_KOT') return mapping.bar;
  if (jobType === 'FINAL_BILL' || jobType === 'BILL') return mapping.bill;
  if (jobType === 'TABLE_SWAP') return mapping.kitchen;
  return null;
}

// ── ESC/POS generation helpers ───────────────────────────────────────────────

function textToEscpos(text) {
  // Simple text-to-ESC/POS: just encode the raw text.
  // The backend normally generates proper ESC/POS with formatting,
  // but for offline we send plain text with basic line breaks.
  // Real ESC/POS commands can be added here later if needed.
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

function buildBillText({ tableNumber, items, subtotal, discount, cgst, sgst, grandTotal, billNumber, restaurantName }) {
  const lines = [];
  const W = 32; // 32 chars wide for 58mm paper (48 for 80mm)
  const center = (s) => {
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    return ' '.repeat(pad) + s;
  };
  const line = '-'.repeat(W);

  if (restaurantName) lines.push(center(restaurantName));
  lines.push(center('*** TAX INVOICE ***'));
  lines.push(line);
  if (billNumber) lines.push(`Bill: ${billNumber}`);
  if (tableNumber) lines.push(`Table: ${tableNumber}`);
  lines.push(`Date: ${new Date().toLocaleString('en-IN')}`);
  lines.push(line);

  for (const item of items) {
    const name = (item.name || item.n || '').substring(0, 20);
    const qty = String(item.quantity || item.q || 1).padStart(3);
    const price = Number(item.price || item.p || 0).toFixed(0).padStart(7);
    lines.push(`${name}${qty}x${price}`);
  }

  lines.push(line);
  lines.push(`Subtotal:        Rs.${Number(subtotal || 0).toFixed(0)}`);
  if (discount && Number(discount.amount || 0) > 0) {
    lines.push(`Discount (${discount.percent || 0}%): -Rs.${Number(discount.amount || 0).toFixed(0)}`);
  }
  if (cgst) lines.push(`CGST:            Rs.${Number(cgst).toFixed(0)}`);
  if (sgst) lines.push(`SGST:            Rs.${Number(sgst).toFixed(0)}`);
  lines.push(line);
  lines.push(`GRAND TOTAL:     Rs.${Number(grandTotal || 0).toFixed(0)}`);
  lines.push(line);
  lines.push(center('Thank You!'));
  lines.push('\n\n\n');

  return lines.join('\n');
}

function buildKotText({ tableNumber, items, kotNumber, restaurantName, captainName }) {
  const lines = [];
  const W = 32;
  const center = (s) => {
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    return ' '.repeat(pad) + s;
  };
  const line = '-'.repeat(W);

  if (restaurantName) lines.push(center(restaurantName));
  lines.push(center('*** K O T ***'));
  lines.push(line);
  if (kotNumber) lines.push(`KOT: ${kotNumber}`);
  if (tableNumber) lines.push(`Table: ${tableNumber}`);
  if (captainName) lines.push(`Captain: ${captainName}`);
  lines.push(`Time: ${new Date().toLocaleTimeString('en-IN')}`);
  lines.push(line);

  for (const item of items) {
    const name = (item.name || item.n || '').substring(0, 24);
    const qty = String(item.quantity || item.q || 1).padStart(3);
    lines.push(`${qty}x  ${name}`);
    if (item.notes) lines.push(`    * ${item.notes}`);
  }

  lines.push(line);
  lines.push('\n\n\n');

  return lines.join('\n');
}

// ── Print dispatch ───────────────────────────────────────────────────────────

/**
 * Attempt to print a job locally based on the current platform.
 * Returns true if printed, false if queued.
 *
 * @param {{ jobType: string, text?: string, data?: object, printerName?: string }} job
 * @returns {Promise<{ printed: boolean, queued: boolean, error?: string }>}
 */
export async function printLocal(job) {
  const platform = detectPlatform();
  const mapping = await getPrinterMapping();
  const printerName = job.printerName || resolvePrinter(job.jobType, mapping);
  const printAgentUrl = await getPrintAgentUrl();

  // Generate text content if not provided
  const text = job.text || (job.jobType === 'FINAL_BILL' || job.jobType === 'BILL'
    ? buildBillText(job.data || {})
    : job.jobType === 'KOT' || job.jobType === 'BAR_KOT'
    ? buildKotText(job.data || {})
    : JSON.stringify(job.data || {}));
  const bytes = Array.from(textToEscpos(text));

  // ── Primary: local Print Agent HTTP endpoint ──
  // Try the Print Agent first regardless of platform. This lets a single local
  // Print Agent handle all printer dispatch, even if the backend is offline.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${printAgentUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobType: job.jobType,
        printerName: printerName || undefined,
        text,
        bytes,
        data: job.data || {},
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      console.log(`[printOffline] Printed [${job.jobType}] via Print Agent at ${printAgentUrl}`);
      return { printed: true, queued: false };
    }
  } catch (err) {
    // Print Agent not reachable — fall through to platform-specific paths
    if (err.name !== 'AbortError') {
      console.log(`[printOffline] Print Agent not reachable at ${printAgentUrl}, falling back:`, err.message);
    }
  }

  // ── Tauri desktop: raw print via Rust command ──
  if (platform === 'tauri') {
    if (!printerName) {
      return await queuePrintJob(job, text, 'No printer mapped');
    }
    try {
      const bytes = Array.from(textToEscpos(text));
      await window.__TAURI__.invoke('print_raw', {
        printerName,
        bytes,
      });
      console.log(`[printOffline] Printed [${job.jobType}] → ${printerName} (Tauri)`);
      return { printed: true, queued: false };
    } catch (err) {
      console.error(`[printOffline] Tauri print failed:`, err);
      return await queuePrintJob(job, text, err?.message || String(err));
    }
  }

  // ── Web with QZ Tray: try direct print ──
  if (platform === 'web') {
    if (!printerName) {
      return await queuePrintJob(job, text, 'No printer mapped');
    }
    try {
      const { sendToPrinter } = await import('./qzTray');
      const printData = [{ type: 'raw', format: 'plain', data: text }];
      await sendToPrinter(printerName, printData);
      console.log(`[printOffline] Printed [${job.jobType}] → ${printerName} (QZ Tray)`);
      return { printed: true, queued: false };
    } catch (err) {
      console.warn(`[printOffline] QZ Tray print failed, queuing:`, err.message);
      return await queuePrintJob(job, text, err?.message || String(err));
    }
  }

  // ── iOS PWA: generate shareable PDF ──
  if (platform === 'ios-pwa' || platform === 'ios-browser') {
    try {
      await shareAsPDF(job, text);
      console.log(`[printOffline] Shared [${job.jobType}] as PDF (iOS)`);
      return { printed: true, queued: false };
    } catch (err) {
      console.warn(`[printOffline] iOS PDF share failed, queuing:`, err.message);
      return await queuePrintJob(job, text, err?.message || String(err));
    }
  }

  // ── Capacitor Android: ESC/POS via native plugin ──
  if (platform === 'capacitor') {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const EscposPrint = registerPlugin('EscposPrint');

      // Try network printer first if configured
      const networkPrinterIp = localStorage.getItem('offline_network_printer_ip');
      if (networkPrinterIp) {
        const networkPort = parseInt(localStorage.getItem('offline_network_printer_port') || '9100', 10);
        const bytes = Array.from(textToEscpos(text));
        await EscposPrint.printNetwork({ ip: networkPrinterIp, port: networkPort, bytes });
        console.log(`[printOffline] Printed [${job.jobType}] → ${networkPrinterIp}:${networkPort} (Capacitor network)`);
        return { printed: true, queued: false };
      }

      // Try Bluetooth/raw print
      if (printerName) {
        const bytes = Array.from(textToEscpos(text));
        await EscposPrint.printRaw({ printerName, bytes });
        console.log(`[printOffline] Printed [${job.jobType}] → ${printerName} (Capacitor Bluetooth)`);
        return { printed: true, queued: false };
      }

      return await queuePrintJob(job, text, 'No printer configured for Android');
    } catch (err) {
      console.warn(`[printOffline] Capacitor print failed, queuing:`, err.message);
      return await queuePrintJob(job, text, err?.message || String(err));
    }
  }

  // ── Unknown platform: queue ──
  return await queuePrintJob(job, text, 'Unknown platform — cannot print locally');
}

// ── Queue management ─────────────────────────────────────────────────────────

async function queuePrintJob(job, text, reason) {
  const id = `offline-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await addOfflinePrintJob({
    id,
    jobType: job.jobType,
    orderId: job.data?.orderId || null,
    requestId: job.data?.requestId || null,
    text,
    data: job.data || {},
    printerName: job.printerName || null,
    status: 'pending',
    failReason: reason,
    createdAt: Date.now(),
  });
  console.log(`[printOffline] Queued [${job.jobType}] — ${reason}`);
  return { printed: false, queued: true, error: reason };
}

/**
 * Process all queued print jobs. Called when connectivity is restored
 * or when a printer becomes available.
 */
export async function flushQueuedPrintJobs() {
  const jobs = await getOfflinePrintJobs();
  if (!jobs || jobs.length === 0) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;

  for (const job of jobs) {
    if (job.status !== 'pending') continue;

    try {
      const result = await printLocal({
        jobType: job.jobType,
        text: job.text,
        data: job.data,
        printerName: job.printerName,
      });

      if (result.printed) {
        await updateOfflinePrintJob(job.id, { status: 'printed', printedAt: Date.now() });
        flushed++;
      } else {
        // Still can't print — leave as pending
        failed++;
      }
    } catch (err) {
      console.error(`[printOffline] Flush failed for job ${job.id}:`, err);
      failed++;
    }
  }

  console.log(`[printOffline] Flush complete: ${flushed} printed, ${failed} still pending`);
  return { flushed, failed };
}

// ── iOS PDF sharing ──────────────────────────────────────────────────────────

async function shareAsPDF(job, text) {
  // Create a simple printable HTML document and open in new window for AirPrint
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${job.jobType === 'KOT' ? 'KOT' : 'Bill'}</title>
<style>
  body { font-family: 'Courier New', monospace; font-size: 12px; margin: 10px; white-space: pre; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>${text.replace(/</g, '&lt;')}</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (win) {
    // Trigger print dialog after a short delay
    setTimeout(() => {
      win.print();
      URL.revokeObjectURL(url);
    }, 500);
  } else {
    // Pop-up blocked — try Web Share API as fallback
    if (navigator.share) {
      const file = new File([blob], `${job.jobType}-${Date.now()}.html`, { type: 'text/html' });
      await navigator.share({ files: [file], title: job.jobType });
    } else {
      throw new Error('Cannot open print window or share — pop-up blocked');
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export { detectPlatform, buildBillText, buildKotText, getPrinterMapping, resolvePrinter };
