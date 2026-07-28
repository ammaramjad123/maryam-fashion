// A DayBook is "empty" when it has no real content in ANY of the five sections.
// Merely opening/viewing a date must never persist a day, and an empty draft must
// never block the next day's post (the no-gap rule). This is the single source of
// truth for "empty", used by getDay, the no-gap check, and the cleanup script.
export function isEmptyDay(day) {
  if (!day) return true;
  const s = day.sales || [];
  const p = day.purchases || [];
  const r = day.receipts || [];
  const y = day.payments || [];
  const e = day.expenses || [];
  return s.length === 0 && p.length === 0 && r.length === 0 && y.length === 0 && e.length === 0;
}
