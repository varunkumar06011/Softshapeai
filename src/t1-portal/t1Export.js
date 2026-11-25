// t1Export.js — turns the report sheet into a PNG image or an A4 PDF and saves it.
//   - Browser (PC / phone): downloads the file → it lands in the Downloads folder,
//     visible in File Explorer (PC) and in the Gallery's "Download" album (Android).
//   - Softshape Android app: writes to Documents/T1 Reports and opens the share
//     sheet, so it can also be saved to the Gallery / Photos or sent on WhatsApp.

// Tailwind v4 colours are oklch(), which html2canvas cannot parse. The sheet itself
// uses hex inline styles; this resets the inherited defaults in the cloned copy.
const SAFE_CSS = '*,*::before,*::after{border-color:#E7B9BF;outline-color:transparent;text-decoration-color:currentColor;box-shadow:none!important;caret-color:transparent;}';

export async function captureCanvas(node) {
  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true,
    windowWidth: 1280,
    onclone: (doc) => {
      const s = doc.createElement('style');
      s.textContent = SAFE_CSS;
      doc.head.appendChild(s);
    },
  });
}

const isNative = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function saveFile(filename, blob, mime) {
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const path = `T1 Reports/${filename}`;
    await Filesystem.writeFile({ path, data: await blobToBase64(blob), directory: Directory.Documents, recursive: true });
    try {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or share report' });
    } catch { /* user closed the share sheet: the file is already saved */ }
    return `Saved to Documents/T1 Reports/${filename}`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.type = mime;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  return `Downloaded ${filename} to your Downloads folder`;
}

export function fileBase(outletCode, date, branch) {
  return `T1-Daily-Report_${(branch || 'branch').replace(/\W+/g, '-')}_${date}${outletCode ? `_${outletCode}` : ''}`;
}

export async function exportImage(node, base) {
  const canvas = await captureCanvas(node);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Could not create the image.');
  return saveFile(`${base}.png`, blob, 'image/png');
}

export async function exportPdf(node, base) {
  const canvas = await captureCanvas(node);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  const margin = 14;
  const w = pw - margin * 2;
  const h = (canvas.height / canvas.width) * w;
  // One page: shrink to fit the height if needed (the form is designed as one page).
  const scale = h > ph - margin * 2 ? (ph - margin * 2) / h : 1;
  const dw = w * scale, dh = h * scale;
  doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - dw) / 2, margin, dw, dh);
  return saveFile(`${base}.pdf`, doc.output('blob'), 'application/pdf');
}
