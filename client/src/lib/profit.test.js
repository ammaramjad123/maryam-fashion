import { describe, it, expect } from 'vitest';
import { lineProfit } from './profit.js';

// Guards the Day Book grid's P cell: it must show the COMPUTED number (never the
// CASH/CREDIT text), and match what the server freezes at post time. cost is the
// code-derived costRate (k44 → 2200, k30 → 1500). Values from the real 24/07 sheet.
describe('lineProfit (Day Book P cell)', () => {
  it('k44 @2200 qty 1 → 0', () => {
    expect(lineProfit({ rate: 2200, qty: 1, cost: 2200 })).toBe(0);
  });

  it('k44 @2000 qty 50 → −10,000 (a loss is normal)', () => {
    expect(lineProfit({ rate: 2000, qty: 50, cost: 2200 })).toBe(-10000);
  });

  it('k30 @1400 qty −77 (a return) → +7,700', () => {
    expect(lineProfit({ rate: 1400, qty: -77, cost: 1500 })).toBe(7700);
  });

  it('purchase: buy k30 @1425 → +75 (cost − rate)', () => {
    expect(lineProfit({ rate: 1425, qty: 1, cost: 1500, kind: 'purchase' })).toBe(75);
  });

  it('returns null (not a number, not text) until the cost is resolved', () => {
    expect(lineProfit({ rate: 2000, qty: 50, cost: undefined })).toBeNull();
  });
});
