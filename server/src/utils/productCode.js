// The product code IS the cost bucket (docs/07 R6). Only the NUMBER matters —
// the letter prefix (K, M, A…) is decorative. This parses the numeric part,
// INCLUDING a decimal point so point-value codes price correctly:
//   'K30' → 30 · 'k44' → 44 · 'M180' → 180 · 'K24.50' → 24.5 · '' → 0
// We match the first number (optionally decimal) rather than stripping every
// non-digit — stripping would turn 'K24.50' into 2450 and 50× the cost.
export function parseCodeNumber(code) {
  const m = String(code ?? '').match(/\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}
