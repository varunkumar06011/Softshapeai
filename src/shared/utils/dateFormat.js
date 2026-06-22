const KOLKATA_TIME_ZONE = 'Asia/Kolkata';

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
  return `TXN-${String(txnNumber).padStart(6, '0')}`;
}

export { KOLKATA_TIME_ZONE };
