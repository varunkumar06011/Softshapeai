// ─────────────────────────────────────────────────────────────────────────────
// Date Format — IST (Kolkata) timezone date utilities for consistent display
// ─────────────────────────────────────────────────────────────────────────────
// All date display and filtering uses IST (Asia/Kolkata) timezone to ensure
// consistency between frontend and backend (which also uses IST for business day).
//
// Exports:
//   - KOLKATA_TIME_ZONE: 'Asia/Kolkata' constant
//   - getKolkataDateString(date): returns YYYY-MM-DD in IST
//   - shiftKolkataDate(dateStr, days): adds/subtracts days from an IST date string
//   - getKolkataMonthString(date): returns YYYY-MM in IST
//   - formatDateDisplay(dateStr): human-readable date (e.g., "15 Jan 2025")
//   - formatTxnDisplayId(date, number): bill number format DD/MM/YY-NNN
// ─────────────────────────────────────────────────────────────────────────────

// IST timezone constant used by all date functions
const KOLKATA_TIME_ZONE = 'Asia/Kolkata';

// Helper: get date parts (day, month, year) in IST using Intl.DateTimeFormat
function getParts(date, options = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: KOLKATA_TIME_ZONE,
    ...options,
  }).formatToParts(date);
}

function partValue(parts, type) {
  return parts.find((part) => part.type === type)?.value || '';
}

export function getKolkataDateString(date = new Date()) {
  const parts = getParts(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const year = partValue(parts, 'year');
  const month = partValue(parts, 'month');
  const day = partValue(parts, 'day');

  return `${year}-${month}-${day}`;
}

export function getKolkataMonthString(date = new Date()) {
  return getKolkataDateString(date).slice(0, 7);
}

export function shiftKolkataDate(date = new Date(), dayOffset = 0) {
  const [year, month, day] = getKolkataDateString(date).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return getKolkataDateString(shifted);
}

export function formatDateDisplay(value) {
  if (!value) return 'dd/mm/yy';

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return 'dd/mm/yy';

  return `${day}/${month}/${year.slice(-2)}`;
}

export function formatTxnDisplayId(txnDate, txnNumber) {
  if (!txnNumber) return '\u2014';
  return `TXN-${String(txnNumber).padStart(3, '0')}`;
}

export { KOLKATA_TIME_ZONE };
