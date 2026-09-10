// ─────────────────────────────────────────────────────────────────────────────
// canvasToPdf — convert an html2canvas canvas into a multi-page A4 PDF
// ─────────────────────────────────────────────────────────────────────────────
// Slices a tall canvas into A4-sized pages so long reports paginate
// cleanly instead of becoming one giant image.
//
// Usage:
//   const canvas = await html2canvas(container, { ... });
//   const blob = await canvasToA4PdfBlob(canvas, { orientation: 'portrait' });
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';

/**
 * Convert a canvas to a multi-page A4 PDF blob.
 *
 * @param {HTMLCanvasElement} canvas  — the html2canvas output
 * @param {Object} opts
 * @param {'portrait'|'landscape'} opts.orientation — default 'portrait'
 * @param {number} opts.margin — page margin in mm (default 10)
 * @param {string} opts.format — jsPDF format string (default 'a4')
 * @returns {Promise<Blob>} — PDF blob
 */
export async function canvasToA4PdfBlob(canvas, opts = {}) {
  const { orientation = 'portrait', margin = 10, format = 'a4' } = opts;

  const pdfWidth = orientation === 'landscape' ? 297 : 210;
  const pdfHeight = orientation === 'landscape' ? 210 : 297;
  const usableWidth = pdfWidth - 2 * margin;
  const usableHeight = pdfHeight - 2 * margin;

  // Scaled image height on the PDF (preserving canvas aspect ratio)
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  const imgData = canvas.toDataURL('image/png');
  const doc = new jsPDF(orientation, 'mm', format);

  if (imgHeight <= usableHeight) {
    // Single page
    doc.addImage(imgData, 'PNG', margin, margin, usableWidth, imgHeight);
  } else {
    // Multi-page: slice the tall image across pages.
    // We render the full image at a negative Y offset so only the visible
    // portion of the page shows, then add a new page and advance the offset.
    let remainingHeight = imgHeight;
    let yOffset = 0;
    while (remainingHeight > 0) {
      doc.addImage(imgData, 'PNG', margin, margin - yOffset, usableWidth, imgHeight);
      remainingHeight -= usableHeight;
      if (remainingHeight > 0) {
        doc.addPage();
        yOffset += usableHeight;
      }
    }
  }

  return doc.output('blob');
}
