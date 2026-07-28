// Shop-local calendar-day helpers on 'YYYY-MM-DD' strings (Asia/Karachi is the
// shop zone, but string math is zone-agnostic so we avoid Date drift here).

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

// The shop-local calendar day ('YYYY-MM-DD') of any instant (Date, ISO string,
// or an already-'YYYY-MM-DD' string, which round-trips unchanged). The ONLY way
// the client should turn a stored timestamp into a day — never slice a raw
// toISOString(), which is a UTC day and drifts one day early for Karachi
// day-starts (mirrors server utils/shopDate.js#karachiDay).
export function ymdOf(value) {
  if (!value) return '';
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return '';
  return new Date(t.getTime() + KARACHI_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayYmd() {
  // Shift to Asia/Karachi (UTC+5) so "today" matches the server's shop day.
  return ymdOf(new Date());
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2025-07-24' -> 'Thu 24 Jul 2025'
export function prettyDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]} ${d} ${MON[m - 1]} ${y}`;
}

export function isValidYmd(ymd) {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(new Date(`${ymd}T00:00:00Z`).getTime());
}
