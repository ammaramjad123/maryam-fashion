/**
 * One-off restore of the lost 31 Aug 2026 day book. Verifies the reconstructed
 * data end-to-end: restore saves a DRAFT (never posts), and posting it produces
 * EXACTLY the totals from the operator's screenshots — which cross-checks every
 * code/qty/rate/discount against the shop's own figures.
 *
 *   Total Sale 1,476,850 · Total Profit 51,550 · Credit Sale 970,600
 *   Cash Sale 506,250 · Total Purchase 607,850 · Paid Cash 109,300
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Product from '../src/models/Product.js';
import Party from '../src/models/Party.js';
import DayBook from '../src/models/DayBook.js';
import { restoreAug31Draft } from '../src/services/golive.service.js';
import { postByDate } from '../src/services/daybook.service.js';

let replset;

const CODES = [
  'K21', 'K22', 'K23', 'K24', 'K27', 'K30', 'K31', 'K32', 'K33', 'K34',
  'K36', 'K38', 'K56', 'K60', 'K61', 'K62', 'K65', 'K68', 'K70',
];
const PARTIES = ['Rashid Unit', 'SY Collection', 'Rana Akhter', 'Bebe Hafizabad', 'Shehbaz Unit', 'Haji Riyaz'];

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'restore_test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await mongoose.connection.collection('settings').insertOne({
    openingCash: 0,
    codeMultiplier: 50,
    purchaseProfitFormula: 'COST_MINUS_RATE',
    discountAppliesTo: 'CASH',
    allowNegativeStock: true,
  });
  // Masters (cost = codeNumber × 50, derived from the code).
  for (const code of CODES) {
    await Product.create({ code, name: `Cloth ${code}`, openingStock: 10000 });
  }
  let n = 1;
  for (const name of PARTIES) {
    await Party.create({
      accountCode: `330100${n++}`,
      name,
      type: name.includes('Collection') || name.includes('Riyaz') ? 'SUPPLIER' : 'CUSTOMER',
      openingBalance: 0,
      openingType: 'CR',
    });
  }
});

describe('restoreAug31Draft', () => {
  it('saves a DRAFT (not posted); posting yields the screenshot totals', async () => {
    const res = await restoreAug31Draft();
    expect(res.status).toBe('DRAFT');
    expect(res.saved).toEqual({ sales: 65, purchases: 7, payments: 6 });

    // Draft persisted, not posted.
    const draft = await DayBook.findOne({}).lean();
    expect(draft.status).toBe('DRAFT');
    expect(draft.sales).toHaveLength(65);
    expect(draft.purchases).toHaveLength(7);
    expect(draft.payments).toHaveLength(6);
    expect(draft.totals).toBeUndefined(); // totals only exist after posting

    // Post it and check the engine reproduces the shop's exact figures.
    const posted = await postByDate('2026-08-31');
    const t = posted.totals;
    expect(t.totalSale).toBe(1476850);
    expect(t.creditSale).toBe(970600);
    expect(t.cashSale).toBe(506250);
    expect(t.totalPurchase).toBe(607850);
    expect(t.totalProfit).toBe(51550); // net of the 2,200 line discounts
    expect(t.totalPayments).toBe(109300);
  });
});
