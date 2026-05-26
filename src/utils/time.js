/**
 * Shared IST (Asia/Kolkata) time formatting utilities.
 * Import these everywhere instead of raw toLocaleTimeString() calls
 * so time is always shown in IST regardless of the device's OS timezone.
 */

export const IST = 'Asia/Kolkata';

/** "02:30 PM" */
export function fmtTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IST,
  });
}

/** "02:30:45 PM" */
export function fmtTimeSec(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: IST,
  });
}

/** "26/05/2026" */
export function fmtDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { timeZone: IST });
}

/** "26 May, 02:30 PM" */
export function fmtDateTime(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
}

/** "YYYY-MM-DD" in IST — for cache keys, API params, daily counters */
export function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST });
}
