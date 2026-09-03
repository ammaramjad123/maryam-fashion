/**
 * Go-live "Day Zero" seed: wipes every day record but KEEPS master data, then
 * posts a summary-only Day Zero whose cached totals carry the owner's opening
 * cash into Day 1. Verifies the exact cash reconciliation from the owner's
 * figures: 143,742 + 258,600 − 110,000 − 71,639 = 220,703.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import DayBook from '../src/models/DayBook.js';
import Product from '../src/models/Product.js';
import Party from '../src/models/Party.js';
import { seedDayZero } from '../src/services/golive.service.js';
import { getCashBalance } from '../src/services/cash.service.js';
import { getDailySale } from '../src/services/report.service.js';
import { addDays } from '../src/utils/shopDate.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'dayzero_test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
});

const TOTALS = {
  cashSale: 0, // Day Zero snapshot — no actual sales
  creditSale: 0,
  totalSale: 0,
  discountOnSale: 0,
  totalSaleLessDisc: 256700,
  cashSaleLessDisc: 258600,
  totalProfit: -265455,
  totalPurchase: 0,
  cashPurchase: 0,
  totalReceipts: 0,
  totalPayments: 110000,
  totalExpenses: 71639,
  totalCash: 402342,
  netCash: 220703,
};

describe('seedDayZero (go-live)', () => {
  it('wipes day records, keeps masters, and carries Net Cash into Day 1', async () => {
    // A master (kept) and an old day book (to be wiped).
    await Product.create({ code: 'K30', name: 'Cloth K30', openingStock: 100 });
    await Party.create({
      accountCode: '1101001',
      name: 'A Customer',
      type: 'CUSTOMER',
      openingBalance: 0,
      openingType: 'DR',
    });
    await DayBook.create({
      date: new Date('2026-08-20'),
      status: 'POSTED',
      sales: [],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
      totals: { netCash: 999 },
    });

    const reportOverride = {
      totals: { profitSalePur: 27500, totalSaleBank: 515300, totalExp: 378349 },
      previousDay: { totalProfit: -292955, cashSale: 256700, totalExpenses: 306710 },
    };
    const res = await seedDayZero({
      dayZeroDate: '2026-09-01',
      openingCash: 143742,
      totals: TOTALS,
      reportOverride,
    });

    expect(res.deleted.dayBooks).toBe(1);
    // Masters survive.
    expect(await Product.countDocuments()).toBe(1);
    expect(await Party.countDocuments()).toBe(1);

    // Exactly one day book now — the posted Day Zero.
    const days = await DayBook.find().lean();
    expect(days).toHaveLength(1);
    expect(days[0].status).toBe('POSTED');
    expect(days[0].openingCash).toBe(143742);
    expect(days[0].totals.netCash).toBe(220703);

    // Day Zero closes at 220,703; Day 1 (2026-09-02) opens there.
    expect(await getCashBalance('2026-09-01')).toBe(220703);
    expect(await getCashBalance(addDays('2026-09-02', -1))).toBe(220703);

    // The Daily Sale report shows the owner's exact figures (base + overrides).
    const rpt = await getDailySale('2026-09-01');
    expect(rpt.totals.totalProfit).toBe(-265455); // Total Profit (base)
    expect(rpt.totals.profitSalePur).toBe(27500); // Profit Sale/Pur (override)
    expect(rpt.totals.totalSaleBank).toBe(515300); // Total Sale Bank (override)
    expect(rpt.totals.totalExp).toBe(378349); // Total Exp (override)
    expect(rpt.totals.cashSaleLessDisc).toBe(258600);
    expect(rpt.totals.netCash).toBe(220703);
    // Top-band reminder (override).
    expect(rpt.previousDay.totalProfit).toBe(-292955);
    expect(rpt.previousDay.cashSale).toBe(256700);
    expect(rpt.previousDay.totalExpenses).toBe(306710);
  });

  it('rejects a bad date', async () => {
    await expect(
      seedDayZero({ dayZeroDate: '01-09-2026', openingCash: 143742, totals: TOTALS })
    ).rejects.toThrow(/YYYY-MM-DD/);
  });
});
