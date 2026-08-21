import { num } from './format.js';

// The ONE place the on-screen profit formula lives, so the grid's P cell and the
// live totals can never drift from each other — or from what the server freezes
// at post time (docs/07 R6/R8).
//
//   cost      = codeNumber × Setting.codeMultiplier (e.g. k30 → 1500, k44 → 2200)
//   sale P    = (rate − cost) × qty − discount   (often negative — that's normal)
//   purchase P= (cost − rate) × qty
//
// `discount` is a per-line Rs amount (sales only) that reduces profit only — it
// never touches amount or cash. Returns null when the product/cost isn't
// resolved yet (render a placeholder, never a wrong number).
export function lineProfit({ rate, qty, cost, discount = 0, kind = 'sale' } = {}) {
  if (cost === undefined || cost === null) return null;
  const r = num(rate) || 0;
  const q = num(qty) || 0;
  const c = num(cost) || 0;
  if (kind === 'purchase') return (c - r) * q;
  return (r - c) * q - (num(discount) || 0);
}
