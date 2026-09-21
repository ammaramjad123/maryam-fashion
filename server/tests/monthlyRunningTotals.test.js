/**
 * Month-wise closing (docs/07 R10.1): the running Total Profit, Cash Sale and
 * Shop Exp accumulate WITHIN a calendar month and RESET to 0 at the start of the
 * next month — a new month never inherits the previous month's totals. The cash
 * chain (Opening / Net Cash) carries across months, untouched.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Product from '../src/models/Product.js';
import ExpenseHead from '../src/models/ExpenseHead.js';
import DayBook from '../src/models/DayBook.js';
import { postByDate } from '../src/services/daybook.service.js';
import { getDailySale } from '../src/services/report.service.js';
import { getCashBalance } from '../src/services/cash.service.js';

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'monthly_test' });
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
  await ExpenseHead.create({ name: 'misc' });
});

async function postDay(date, { qty, rate, expense = 0 }) {
  const prod = await Product.findOne({ code: 'K34' });
  const head = await ExpenseHead.findOne();
  await DayBook.create({
    date: new Date(date),
    status: 'DRAFT',
    sales: [{ productId: prod._id, partyId: null, qty, rate, discount: 0 }],
    purchases: [],
    receipts: [],
    payments: [],
    expenses: expense ? [{ expenseHeadId: head._id, narration: '', amount: expense }] : [],
    discountOnSale: 0,
  });
  return postByDate(date);
}

describe('month-wise running totals', () => {
  it('accumulate within a month and reset to 0 at the next month', async () => {
    // Aug 30: profit (2000−1700)×1 = 300, cash sale 2000, shop exp 500.
    await postDay('2026-08-30', { qty: 1, rate: 2000, expense: 500 });
    // Aug 31: profit 600, cash sale 4000, shop exp 300.
    await postDay('2026-08-31', { qty: 2, rate: 2000, expense: 300 });
    // Sep 1: profit 300, cash sale 2000.
    await postDay('2026-09-01', { qty: 1, rate: 2000 });

    const aug31 = await getDailySale('2026-08-31');
    // Total Profit = August month-to-date = 300 (Aug 30) + 600 (Aug 31).
    expect(aug31.totals.totalProfit).toBe(600); // the DAY's profit (Profit Sale/Pur)
    expect(aug31.totals.mtdProfit).toBe(900); // running Total Profit (month-to-date)
    // Top band = August carried before Aug 31 = Aug 30's figures.
    expect(aug31.previousDay.totalProfit).toBe(300);
    expect(aug31.previousDay.cashSale).toBe(2000);
    expect(aug31.previousDay.totalExpenses).toBe(500);

    const sep1 = await getDailySale('2026-09-01');
    // NEW MONTH → Total Profit is just Sep 1's own; August's 900 is NOT carried.
    expect(sep1.totals.mtdProfit).toBe(300);
    // Top band resets to 0 — September inherits nothing from August.
    expect(sep1.previousDay.totalProfit).toBe(0);
    expect(sep1.previousDay.cashSale).toBe(0);
    expect(sep1.previousDay.totalExpenses).toBe(0);

    // But the CASH carries across the month boundary: Sep 1 opens with Aug 31's
    // net cash (opening 0 + 2000 + 4000 − 500 − 300 = 5,200).
    expect(await getCashBalance('2026-08-31')).toBe(5200);
    expect(sep1.openingCash).toBe(5200);
  });
});
