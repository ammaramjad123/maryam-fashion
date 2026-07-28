import { num } from './format.js';

// The ONE place the on-screen profit formula lives, so the grid's P cell and the
// live totals can never drift from each other — or from what the server freezes
// at post time (docs/07 R6/R8).
//
//   cost      = codeNumber × Setting.codeMultiplier (e.g. k30 → 1500, k44 → 2200)
//   sale P    = (rate − cost) × qty        (often negative — that's normal)
//   purchase P= (cost − rate) × qty
//
// Returns null when the product/cost isn't resolved yet (render a placeholder,
// never a wrong number, and never anything but a number once resolved).
export function lineProfit({ rate, qty, cost, kind = 'sale' } = {}) {
  if (cost === undefined || cost === null) return null;
  const r = num(rate) || 0;
  const q = num(qty) || 0;
  const c = num(cost) || 0;
  return kind === 'purchase' ? (c - r) * q : (r - c) * q;
}
