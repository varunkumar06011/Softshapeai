// ─────────────────────────────────────────────────────────────────────────────
// canvasToPdf — convert an html2canvas canvas into a multi-page A4 PDF
// ─────────────────────────────────────────────────────────────────────────────
// Slices a tall canvas into A4-sized pages so long reports paginate
// cleanly instead of becoming one giant image.
//
// Page breaks are chosen intelligently instead of at fixed heights:
//   1. at caller-supplied `breakPoints` (canvas px Y-coords of safe cut
//      lines, e.g. the top edges of top-level report sections)
//   2. else at the nearest all-white row above the page limit (gap
//      between rows/lines inside a long section)
//   3. else a hard cut (last resort)
//
// Usage:
//   const canvas = await html2canvas(container, { ... });
//   const breakPoints = collectBreakPoints(container, canvas); // optional
//   const blob = await canvasToA4PdfBlob(canvas, { orientation: 'portrait', breakPoints });
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';

// A page slice must be at least this fraction of usable page height,
// otherwise a break point very close to the top would leave a sliver page.
const MIN_SLICE_RATIO = 0.25;
// Pixels with every channel >= this are treated as white for break scanning.
const WHITE_THRESHOLD = 245;

/**
 * Scan upward from `limitY` for a fully white (or transparent) pixel row.
 * Returns the canvas Y to cut at, or -1 if none found above `minY`.
 */
function findWhiteRow(canvas, limitY, minY) {
  const top = Math.max(0, Math.floor(minY));
  const bottom = Math.min(canvas.height, Math.floor(limitY));
  if (bottom <= top) return -1;

  const { data, width } = canvas
    .getContext('2d')
    .getImageData(0, top, canvas.width, bottom - top);

  for (let y = bottom - top - 1; y >= 0; y--) {
    let white = true;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = rowStart + x * 4;
      // Transparent counts as white — slices are filled white before drawing.
      if (data[i + 3] > 8 && (data[i] < WHITE_THRESHOLD || data[i + 1] < WHITE_THRESHOLD || data[i + 2] < WHITE_THRESHOLD)) {
        white = false;
        break;
      }
    }
    if (white) return top + y;
  }
  return -1;
}

/** True if every pixel in canvas rows [startY, endY) is white/transparent. */
function isRegionWhite(canvas, startY, endY) {
  const top = Math.max(0, Math.floor(startY));
  const bottom = Math.min(canvas.height, Math.ceil(endY));
  if (bottom <= top) return true;

  const { data } = canvas.getContext('2d').getImageData(0, top, canvas.width, bottom - top);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 8 && (data[i] < WHITE_THRESHOLD || data[i + 1] < WHITE_THRESHOLD || data[i + 2] < WHITE_THRESHOLD)) {
      return false;
    }
  }
  return true;
}

/**
 * Choose slice boundaries [start, end) in canvas px.
 * Greedy: each page takes the deepest safe cut that still fits.
 */
function computeSliceCuts(canvas, pageHeightPx, breakPoints) {
  const sorted = [...breakPoints].sort((a, b) => a - b);
  const cuts = [0];
  let pos = 0;

  while (pos + pageHeightPx < canvas.height) {
    const limit = pos + pageHeightPx;
    const minY = pos + pageHeightPx * MIN_SLICE_RATIO;

    let cut = -1;
    for (const bp of sorted) {
      if (bp <= minY) continue;
      if (bp > limit) break;
      cut = bp;
    }
    if (cut === -1) cut = findWhiteRow(canvas, limit, minY);
    if (cut === -1) cut = limit;

    cuts.push(cut);
    pos = cut;
  }

  cuts.push(canvas.height);

  // Drop trailing slices that are pure whitespace (would render as blank
  // pages), but always keep at least one page.
  while (cuts.length > 2 && isRegionWhite(canvas, cuts[cuts.length - 2], cuts[cuts.length - 1])) {
    cuts.pop();
  }
  return cuts;
}

/**
 * Convert a canvas to a multi-page A4 jsPDF document.
 *
 * @param {HTMLCanvasElement} canvas  — the html2canvas output
 * @param {Object} opts
 * @param {'portrait'|'landscape'} opts.orientation — default 'portrait'
 * @param {number} opts.margin — page margin in mm (default 10)
 * @param {string} opts.format — jsPDF format string (default 'a4')
 * @param {number[]} opts.breakPoints — canvas px Y-coords safe to cut at
 * @returns {jsPDF}
 */
export function canvasToA4PdfDoc(canvas, opts = {}) {
  const { orientation = 'portrait', margin = 10, format = 'a4', breakPoints = [] } = opts;

  const pdfWidth = orientation === 'landscape' ? 297 : 210;
  const pdfHeight = orientation === 'landscape' ? 210 : 297;
  const usableWidth = pdfWidth - 2 * margin;
  const usableHeight = pdfHeight - 2 * margin;

  const pxPerMm = canvas.width / usableWidth;
  const pageHeightPx = usableHeight * pxPerMm;
  const cuts = computeSliceCuts(canvas, pageHeightPx, breakPoints);

  const doc = new jsPDF(orientation, 'mm', format);

  for (let i = 0; i < cuts.length - 1; i++) {
    const start = Math.round(cuts[i]);
    const height = Math.round(cuts[i + 1]) - start;
    if (height <= 0) continue;

    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = height;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, height);
    ctx.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height);

    if (i > 0) doc.addPage();
    doc.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, usableWidth, height / pxPerMm);
  }

  return doc;
}

/**
 * Convert a canvas to a multi-page A4 PDF blob.
 *
 * @param {HTMLCanvasElement} canvas  — the html2canvas output
 * @param {Object} opts — same options as canvasToA4PdfDoc
 * @returns {Promise<Blob>} — PDF blob
 */
export async function canvasToA4PdfBlob(canvas, opts = {}) {
  return canvasToA4PdfDoc(canvas, opts).output('blob');
}
