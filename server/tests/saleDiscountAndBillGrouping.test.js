/**
 * Two operator-facing Day Book features, verified against the posting engine:
 *
 *  1. Per-line discount (Rs) reduces PROFIT ONLY — the sale's amount, cashSale
 *     and netCash stay at the full qty×rate; only line.profit and totalProfit
 *     fall by the discount (owner-chosen behaviour).
 *
 *  2. Manual bill grouping — a sale line flagged `sameBill` joins the bill above
 *     (sharing its number) even with NO party, so several cash lines can form
 *     one bill. displayBillNos then prints the number on the first row only.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Product from '../src/models/Product.js';
import DayBook from '../src/models/DayBook.js';
import { postDayBook } from '../src/services/posting.service.js';
import { displayBillNos } from '../src/utils/billNo.js';

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'disc_bill_test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
});

async function seed() {
  await mongoose.connection.collection('settings').insertOne({
    openingCash: 0,
    codeMultiplier: 50,
    purchaseProfitFormula: 'ZERO',
    discountAppliesTo: 'CASH',
    allowNegativeStock: true,
  });
  // costRate is DERIVED: codeNumber × 50 → K44 = 2,200, K30 = 1,500.
  const k44 = await Product.create({ code: 'K44', name: 'Cloth K44', openingStock: 0 });
  const k30 = await Product.create({ code: 'K30', name: 'Cloth K30', openingStock: 10 });
  return { k44, k30 };
}

describe('per-line discount + manual bill grouping', () => {
  it('discount reduces profit only; two cash lines share one bill via sameBill', async () => {
    const { k44, k30 } = await seed();

    const draft = await DayBook.create({
      date: new Date('2025-07-24'),
      status: 'DRAFT',
      discountOnSale: 0,
      sales: [
        // Bill 100 — a cash line...
        { billNo: 100, productId: k44._id, partyId: null, qty: 1, rate: 2500, discount: 0 },
        // ...joined by the next cash line (sameBill) → same bill 100, blank row.
        { sameBill: true, productId: k30._id, partyId: null, qty: 2, rate: 1600, discount: 0 },
        // Bill 101 — a separate cash line carrying a 150 discount.
        { billNo: 101, productId: k44._id, partyId: null, qty: 1, rate: 2500, discount: 150 },
      ],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
    });

    const posted = await postDayBook(draft._id);
    const t = posted.totals;

    // --- amounts are NET of the discount (discount reduces sale/cash too) ---
    expect(posted.sales[0].amount).toBe(2500);
    expect(posted.sales[1].amount).toBe(3200);
    expect(posted.sales[2].amount).toBe(2350); // 2500 − 150 discount
    expect(t.cashSale).toBe(8050); // 2500 + 3200 + 2350 — discount subtracted
    expect(t.netCash).toBe(8050); // opening 0, no receipts/payments/expenses

    // --- profit is NET of the per-line discount (reduced once) ---
    expect(posted.sales[0].profit).toBe(300); // (2500−2200)×1
    expect(posted.sales[1].profit).toBe(200); // (1600−1500)×2
    expect(posted.sales[2].profit).toBe(150); // (2500−2200)×1 − 150 discount
    expect(posted.sales[2].discount).toBe(150); // frozen on the line
    expect(t.totalProfit).toBe(650); // 800 gross − 150 discount

    // --- bill grouping: number on the first row of each bill, blank on the join ---
    expect(displayBillNos(posted.sales)).toEqual([100, null, 101]);
  });
});
