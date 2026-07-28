import { describe, it, expect } from 'vitest';
import { isBillStart, displayBillNos } from '../src/utils/billNo.js';

// Bill number is per-BILL, not per-line (docs/07 R9.1). Scenario from the brief:
// one cash line + a 3-line credit block (same party) + another cash line →
// exactly THREE bill numbers, with the credit continuation rows blank.
describe('displayBillNos (per-bill numbering)', () => {
  const A = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // credit party id

  it('1 cash + 3-line same-party credit block + 1 cash → 3 numbers, continuations blank', () => {
    const sales = [
      { billNo: 12037, partyId: null }, // cash → bill start
      { billNo: 12038, partyId: A }, // credit block starts
      { billNo: 99, partyId: A }, // continuation → blank (even if a number was stored)
      { billNo: 99, partyId: A }, // continuation → blank
      { billNo: 12039, partyId: null }, // cash → bill start
    ];
    const shown = displayBillNos(sales);
    expect(shown).toEqual([12037, 12038, null, null, 12039]);
    expect(shown.filter((n) => n != null)).toHaveLength(3); // exactly three bills
  });

  it('each cash line is its own bill; a new party starts a new bill', () => {
    const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const sales = [
      { billNo: 1, partyId: null },
      { billNo: 2, partyId: A },
      { billNo: null, partyId: A },
      { billNo: 3, partyId: B }, // different party → new bill
    ];
    expect(displayBillNos(sales)).toEqual([1, 2, null, 3]);
  });

  it('isBillStart: cash + first line + party change are starts; same party is not', () => {
    expect(isBillStart({ partyId: null }, { partyId: A })).toBe(true); // cash
    expect(isBillStart({ partyId: A }, undefined)).toBe(true); // first
    expect(isBillStart({ partyId: A }, { partyId: null })).toBe(true); // prev cash
    expect(isBillStart({ partyId: A }, { partyId: A })).toBe(false); // continuation
  });
});
