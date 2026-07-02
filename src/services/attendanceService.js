// ─────────────────────────────────────────────────────────────────────────────
// Attendance Service — Frontend API client for staff attendance
// ─────────────────────────────────────────────────────────────────────────────
import { apiFetch } from './apiConfig';

export async function getTodayAttendanceSummary() {
  return apiFetch('/api/attendance/today');
}

export async function getAttendance(date) {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiFetch(`/api/attendance${query}`);
}

export async function getAttendanceRange(startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return apiFetch(`/api/attendance?${params.toString()}`);
}

export async function markAttendance({ employeeId, date, status, notes }) {
  return apiFetch('/api/attendance', {
    method: 'POST',
    body: JSON.stringify({ employeeId, date, status, notes }),
  });
}

export async function markAttendanceBulk({ date, items }) {
  return apiFetch('/api/attendance/bulk', {
    method: 'POST',
    body: JSON.stringify({ date, items }),
  });
}

export async function checkIn(attendanceId) {
  return apiFetch(`/api/attendance/${attendanceId}/check-in`, {
    method: 'POST',
  });
}

export async function checkOut(attendanceId) {
  return apiFetch(`/api/attendance/${attendanceId}/check-out`, {
    method: 'POST',
  });
}
