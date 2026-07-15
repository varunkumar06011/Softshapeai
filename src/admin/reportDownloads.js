// ─────────────────────────────────────────────────────────────────────────────
// Report Downloads — PDF and Excel export utilities for admin reports
// ─────────────────────────────────────────────────────────────────────────────
// Provides functions to export report data as downloadable files:
//   - downloadPDF({ title, dateRange, headers, rows, filename }) — jsPDF with autoTable
//   - downloadExcel({ title, dateRange, headers, rows, filename }) — XLSX spreadsheet
//
// Both functions format monetary values in Indian Rupees (₹) with en-IN locale.
// Used by AdminReports.jsx for exporting sales, GST, and performance reports.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Format amount as Indian Rupees string
function formatMoney(amount) {
  if (amount == null) return '—';
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function todayString() {
  const d = new Date();
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function downloadPDF({ title, dateRange, headers, rows, filename }) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(18);
  doc.text(`Softshape — ${title}`, 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Period: ${dateRange}`, 14, 28);
  doc.setTextColor(0);

  const body = rows.map((row) => headers.map((h) => {
    const val = row[h.key];
    if (val == null) return '—';
    if (h.format === 'money') return formatMoney(val);
    if (h.format === 'percent') return `${val}%`;
    return String(val);
  }));

  const head = [headers.map((h) => h.label)];

  doc.autoTable({
    head,
    body,
    startY: 34,
    theme: 'grid',
    headStyles: { fillColor: [183, 28, 28], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  const finalY = doc.lastAutoTable?.finalY || 240;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated on ${todayString()} | Softshape Restaurant Management`, 14, finalY + 10);

  doc.save(`${filename}.pdf`);
}

export function downloadExcel({ title, dateRange, sheets, filename }) {
  const wb = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const wsData = [
      [`Softshape — ${title}`],
      [`Period: ${dateRange}`],
      [],
      sheet.headers.map((h) => h.label),
      ...sheet.rows.map((row) =>
        sheet.headers.map((h) => {
          const val = row[h.key];
          if (val == null) return '';
          if (h.format === 'money') return Number(val);
          if (h.format === 'percent') return `${val}%`;
          return val;
        })
      ),
    ];

    if (sheet.summaryRows) {
      wsData.push([]);
      sheet.summaryRows.forEach((r) => wsData.push(r));
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-width approximation
    const colWidths = sheet.headers.map((h) => {
      const maxDataLen = Math.max(
        h.label.length,
        ...sheet.rows.map((r) => String(r[h.key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxDataLen + 2, 10), 40) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
