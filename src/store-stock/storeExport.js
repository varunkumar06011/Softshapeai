// storeExport.js — Excel and PDF downloads for the Store Stock reports.
// Libraries are loaded on demand so the portal opens fast.
import { fd } from './storeEngine';

function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const stamp = (from, to) => (from === to ? from : `${from}_to_${to}`);
const cell = (v) => (typeof v === 'number' ? (Math.round(v * 100) / 100).toLocaleString('en-IN') : v);

export async function exportExcel(book, from, to, outletName) {
  const XLSX = await import('xlsx');
  const Rp = book.buildReports(from, to), wb = XLSX.utils.book_new();
  const add = (name, t) => {
    const rows = [t.head, ...t.body];
    if (t.foot) rows.push(t.foot);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  };
  add('Stock Movement', book.tStock(Rp));
  add('Purchase Prices', book.tPrice(Rp));
  add('Consumption', book.tCons(Rp));
  add('Dept Summary', book.tDeptValue(Rp));
  add('Price History', book.tHistory());
  add('Ledger', book.tLedger(from, to));
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(`store-report-${(outletName || 'outlet').replace(/\W+/g, '-')}-${stamp(from, to)}.xlsx`,
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export async function exportPdf(book, from, to, outletName) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const Rp = book.buildReports(from, to), doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  let y = 40;
  const section = (name, t) => {
    if (y > 480) { doc.addPage(); y = 40; }
    doc.setFontSize(12); doc.setTextColor(20); doc.text(name, 30, y);
    const body = t.body.map((r) => r.map(cell));
    if (t.foot) body.push(t.foot.map(cell));
    autoTable(doc, { head: [t.head], body, startY: y + 8, theme: 'grid', styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: [183, 28, 28] }, margin: { left: 30, right: 30 } });
    y = doc.lastAutoTable.finalY + 26;
  };
  doc.setFontSize(16);
  doc.text(`${outletName || 'Store'} · store report: ${from === to ? fd(from) : fd(from) + ' to ' + fd(to)}`, 30, y);
  y += 24;
  section('1. Inventory and stock movement', book.tStock(Rp));
  doc.addPage(); y = 40;
  section('2a. Purchase price analysis', book.tPrice(Rp));
  section('2b. Consumption by department', book.tCons(Rp));
  section('Department summary', book.tDeptValue(Rp));
  const adj = book.tLedger(from, to);
  adj.body = adj.body.filter((r) => r[4] === 'Adjust' || r[4] === 'Correction');
  if (adj.body.length) section('Adjustments and corrections', adj);
  download(`store-report-${(outletName || 'outlet').replace(/\W+/g, '-')}-${stamp(from, to)}.pdf`, doc.output('blob'));
}
