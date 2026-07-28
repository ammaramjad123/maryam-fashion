// Number & ledger formatting. Thousand separators, tabular-friendly.

export function num(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
}

// Format a number with thousand separators; blank for empty/NaN.
export function fmt(v, { blankZero = false } = {}) {
  const n = num(v);
  if (Number.isNaN(n)) return '';
  if (blankZero && n === 0) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Always show a value (0 included), for the totals footer.
export function money(v) {
  const n = num(v) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// A ledger balance with its Dr/Cr suffix — never a bare negative.
export function drcr({ side, amount }) {
  if (side === 'NONE' || !amount) return '0';
  return `${money(amount)} ${side}`;
}
