/**
 * Running "Total Profit": each posted day's Total Profit = the previous posted
 * day's Total Profit + that day's own profit (Profit Sale/Pur). The chain's
 * baseline is the seeded Day Zero, whose totalProfit is the opening cumulative.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Product from '../src/models/Product.js';
import DayBook from '../src/models/DayBook.js';
import { postByDate } from '../src/services/daybook.service.js';
import { getDailySale } from '../src/services/report.service.js';

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'cumprofit_test' });
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
    purchaseProfitFormula: 'ZERO',
    discountAppliesTo: 'CASH',
    allowNegativeStock: true,
  });
  await Product.create({ code: 'K34', name: 'Cloth K34', openingStock: 1000 }); // cost 1700
});

async function draftWithSale(date, qty, rate) {
  const prod = await Product.findOne({ code: 'K34' });
  await DayBook.create({
    date: new Date(date),
    status: 'DRAFT',
    sales: [{ productId: prod._id, partyId: null, qty, rate, discount: 0 }],
    purchases: [],
    receipts: [],
    payments: [],
    expenses: [],
    discountOnSale: 0,
  });
}

describe('running Total Profit (cumulativeProfit)', () => {
  it('carries the previous day total forward + adds the day profit', async () => {
    // Baseline "Day Zero": opening cumulative Total Profit = −643,804 (as seeded).
    await DayBook.create({
      date: new Date('2026-08-30'),
      status: 'POSTED',
      sales: [],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
      totals: { totalProfit: -643804, netCash: 0, cashSaleLessDisc: 0 },
    });

    // Day 1: K34 ×1 @2000 → day profit (2000−1700)×1 = 300.
    await draftWithSale('2026-08-31', 1, 2000);
    const d1 = await postByDate('2026-08-31');
    expect(d1.totals.totalProfit).toBe(300); // Profit Sale/Pur = the day's profit
    expect(d1.totals.cumulativeProfit).toBe(-643504); // −643,804 + 300

    // Day 2: K34 ×2 @2000 → day profit 600 → cumulative −643,504 + 600.
    await draftWithSale('2026-09-01', 2, 2000);
    const d2 = await postByDate('2026-09-01');
    expect(d2.totals.totalProfit).toBe(600);
    expect(d2.totals.cumulativeProfit).toBe(-642904);

    // The report shows Day 2's Total Profit = cumulative, and its top-band
    // "Profit" = Day 1's cumulative.
    const rpt = await getDailySale('2026-09-01');
    expect(rpt.totals.cumulativeProfit).toBe(-642904);
    expect(rpt.totals.totalProfit).toBe(600); // Profit Sale/Pur
    expect(rpt.previousDay.totalProfit).toBe(-643504); // top band = Day 1's total
  });
});
