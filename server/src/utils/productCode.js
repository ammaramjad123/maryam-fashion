// The product code IS the cost bucket (docs/07 R6). Only the NUMBER matters —
// the letter prefix (K, M, A…) is decorative. This parses the numeric part.
//   'K30' → 30 · 'k44' → 44 · 'M180' → 180 · '' → 0
export function parseCodeNumber(code) {
  const digits = String(code ?? '').replace(/\D/g, '');
  const n = digits ? Number(digits) : 0;
  return Number.isFinite(n) ? n : 0;
}
