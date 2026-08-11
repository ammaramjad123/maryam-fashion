/**
 * Product hard-delete guard + the "everything to zero EXCEPT parties" reset.
 * These are destructive maintenance paths, so pin the exact contract:
 *  - a code that never moved can be physically deleted; one that moved cannot
 *  - the reset keeps every party AND its opening balance, and zeros the rest
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Party from '../src/models/Party.js';
import Product from '../src/models/Product.js';
import DayBook from '../src/models/DayBook.js';
import LedgerEntry from '../src/models/LedgerEntry.js';
import StockTransaction from '../src/models/StockTransaction.js';
import Setting from '../src/models/Setting.js';
import * as productService from '../src/services/product.service.js';
import { resetKeepParties } from '../src/services/golive.service.js';
import { create as createParty } from '../src/services/party.service.js';
import { getPartyBalance } from '../src/services/ledger.service.js';
import { getStockAll } from '../src/services/stock.service.js';
import { karachiDay } from '../src/utils/shopDate.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'masters_reset_test' });
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
});

describe('product hard-delete guard', () => {
  it('removes a code that has NO stock movement', async () => {
    const p = await Product.create({ code: 'K10', name: 'Cloth K10', openingStock: 5 });
    const res = await productService.remove(p._id);
    expect(res.code).toBe('K10');
    expect(await Product.findById(p._id)).toBeNull();
  });

  it('REFUSES a code that has a stock movement (409), leaving it intact', async () => {
    const p = await Product.create({ code: 'K20', name: 'Cloth K20', openingStock: 5 });
    await StockTransaction.create({
      date: new Date(),
      productId: p._id,
      type: 'SALE',
      qty: 2,
      rate: 1000,
      sourceType: 'DAYBOOK',
    });
    await expect(productService.remove(p._id)).rejects.toMatchObject({ status: 409 });
    expect(await Product.findById(p._id)).not.toBeNull();
  });
});

describe('resetKeepParties — everything to zero except parties', () => {
  it('keeps parties + opening balances, zeros stock/cash and deletes transactions', async () => {
    // A party with a real opening balance (writes an OPENING ledger entry).
    const farhan = await createParty({
      name: 'farhan malik',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
      openingDate: '2025-04-01',
    });
    // A product with opening stock + a posted movement.
    const k30 = await Product.create({ code: 'K30', name: 'Cloth K30', openingStock: 551 });
    await StockTransaction.create({
      date: new Date(),
      productId: k30._id,
      type: 'SALE',
      qty: 77,
      rate: 1400,
      sourceType: 'DAYBOOK',
    });
    // A posted day book + a posted (non-opening) ledger entry.
    await DayBook.create({ date: new Date('2025-07-24T00:00:00+05:00'), status: 'POSTED' });
    await LedgerEntry.create({
      partyId: farhan._id,
      date: new Date(),
      voucherType: 'DV',
      voucherNo: 1,
      debit: 45000,
      credit: 0,
      sourceType: 'DAYBOOK',
    });
    await Setting.updateOne({}, { $set: { openingCash: 260297 } }, { upsert: true });

    const counts = await resetKeepParties();

    // Kept: the party and its opening balance survive untouched.
    expect(await Party.countDocuments({})).toBe(1);
    const bal = await getPartyBalance(farhan._id, karachiDay(new Date()));
    expect(bal.amount).toBe(44118);
    expect(bal.side).toBe('CR');
    expect(counts.openingLedgerEntriesKept).toBe(1);

    // Zeroed: no day books, no posted entries, no stock movements.
    expect(await DayBook.countDocuments({})).toBe(0);
    expect(await StockTransaction.countDocuments({})).toBe(0);
    expect(await LedgerEntry.countDocuments({ sourceType: { $ne: 'OPENING' } })).toBe(0);

    // Product kept, but stock derived to 0 (openingStock zeroed, movements gone).
    expect(await Product.countDocuments({})).toBe(1);
    const stock = await getStockAll(karachiDay(new Date()));
    expect(stock.get(String(k30._id))).toBe(0);

    // Opening cash zeroed.
    expect((await Setting.findOne().lean()).openingCash).toBe(0);
  });
});
