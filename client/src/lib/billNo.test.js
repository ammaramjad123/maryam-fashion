import { describe, it, expect } from 'vitest';
import { assignBillNos, isBillStart } from './billNo.js';

// Bill numbers are AUTO-generated per BILL (docs/07 R9.1): a cash line is its own
// bill; consecutive lines for the same credit party are ONE bill (number on the
// first row only). The sequence continues from `base` (the last posted day + 1).
describe('assignBillNos (auto per-bill numbering)', () => {
  const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';

  it('cash + 3-line same-party credit block + cash → 3 numbers from base, continuations blank', () => {
    const sales = [
      { productId: 'p', partyId: null }, // cash → bill 12040
      { productId: 'p', partyId: A }, // credit block starts → 12041
      { productId: 'p', partyId: A }, // continuation → blank
      { productId: 'p', partyId: A }, // continuation → blank
      { productId: 'p', partyId: null }, // cash → bill 12042
    ];
    expect(assignBillNos(sales, 12040)).toEqual([12040, 12041, null, null, 12042]);
  });

  it('an operator override is used and carries the sequence forward from it', () => {
    const sales = [
      { productId: 'p', partyId: null, billNo: '' }, // auto 12040
      { productId: 'p', partyId: null, billNo: '500' }, // override 500
      { productId: 'p', partyId: null }, // auto 501 (follows the override)
    ];
    expect(assignBillNos(sales, 12040)).toEqual([12040, 500, 501]);
  });

  it('unfilled rows (no product) and continuations get no number', () => {
    const sales = [
      { productId: 'p', partyId: A },
      { productId: 'p', partyId: A }, // continuation
      { productId: null, partyId: null }, // trailing blank row
    ];
    expect(assignBillNos(sales, 1)).toEqual([1, null, null]);
    // grouping rule sanity
    expect(isBillStart(sales[1], sales[0])).toBe(false);
  });
});
