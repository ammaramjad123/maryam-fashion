// Shop timezone = Asia/Karachi (UTC+5, no DST). A "day" is the half-open range
// [dayStart, nextDayStart) in that zone. uptoDate is a 'YYYY-MM-DD' string.

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Start of the shop-local day, as an absolute instant.
export function dayStart(ymd) {
  return new Date(`${ymd}T00:00:00+05:00`);
}

// Start of the NEXT shop-local day → the exclusive upper bound for "as of ymd".
export function nextDayStart(ymd) {
  return new Date(dayStart(ymd).getTime() + DAY_MS);
}

// The shop-local calendar day ('YYYY-MM-DD') that contains the given instant.
export function karachiDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + KARACHI_OFFSET_MS).toISOString().slice(0, 10);
}

// Shift a shop-local day by n days (n may be negative).
export function addDays(ymd, n) {
  return karachiDay(new Date(dayStart(ymd).getTime() + n * DAY_MS));
}
