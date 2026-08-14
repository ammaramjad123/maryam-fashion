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
import {
  resetKeepParties,
  zeroBankOpenings,
  deleteAllBanks,
  recomputeCodeNumbers,
} from '../src/services/golive.service.js';
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

describe('zeroBankOpenings — clear bank balances but keep the banks', () => {
  it('drops bank OPENING entries + zeros openingBalance; balance becomes 0', async () => {
    const hbl = await createParty({
      name: 'HBL Main',
      type: 'BANK',
      openingBalance: 500000,
      openingType: 'DR',
      openingDate: '2025-04-01',
    });
    // A non-bank party keeps its opening (only banks are touched).
    const cust = await createParty({
      name: 'Kashif Unit',
      type: 'SUPPLIER',
      openingBalance: 1073600,
      openingType: 'CR',
      openingDate: '2026-08-07',
    });

    const res = await zeroBankOpenings();
    expect(res.banks).toBe(1);
    expect(res.openingEntriesRemoved).toBe(1);

    // Bank kept, but its balance is now 0.
    expect(await Party.findById(hbl._id)).not.toBeNull();
    const bankBal = await getPartyBalance(hbl._id, karachiDay(new Date()));
    expect(bankBal.amount).toBe(0);
    expect(bankBal.side).toBe('NONE');

    // The non-bank party is untouched.
    const custBal = await getPartyBalance(cust._id, karachiDay(new Date()));
    expect(custBal.amount).toBe(1073600);
    expect(custBal.side).toBe('CR');
  });
});

describe('recomputeCodeNumbers — fix stale/point-value code numbers', () => {
  it('re-derives codeNumber from the code, keeping the decimal', async () => {
    // Simulate a product saved before the parser kept the decimal point:
    // force the stored codeNumber to the digits-only 2450 via a raw update
    // (updateOne skips the pre-save hook that would re-derive it).
    const stale = await Product.create({ code: 'K24.50', name: 'Cloth' });
    await Product.updateOne({ _id: stale._id }, { $set: { codeNumber: 2450 } });
    // A correct one must be left untouched (idempotent).
    const good = await Product.create({ code: 'K30', name: 'Cloth K30' });

    const res = await recomputeCodeNumbers();
    expect(res.scanned).toBe(2);
    expect(res.changed).toBe(1);

    expect((await Product.findById(stale._id)).codeNumber).toBe(24.5);
    expect((await Product.findById(good._id)).codeNumber).toBe(30);
  });
});

describe('deleteAllBanks — remove banks so the owner adds his own', () => {
  it('hard-deletes banks with no entries; keeps non-bank parties', async () => {
    const hbl = await createParty({ name: 'HBL Main', type: 'BANK', openingType: 'DR' });
    await createParty({ name: 'Meezan Current', type: 'BANK', openingType: 'DR' });
    const cust = await createParty({ name: 'Kashif Unit', type: 'SUPPLIER', openingType: 'CR' });

    const res = await deleteAllBanks();
    expect(res.removed).toBe(2);
    expect(await Party.countDocuments({ type: 'BANK' })).toBe(0);
    expect(await Party.findById(hbl._id)).toBeNull();
    expect(await Party.findById(cust._id)).not.toBeNull(); // supplier survives
  });

  it('REFUSES to delete a bank that still has a ledger entry', async () => {
    const bank = await createParty({
      name: 'HBL Main',
      type: 'BANK',
      openingBalance: 500000,
      openingType: 'DR',
      openingDate: '2025-04-01',
    });
    // The opening wrote an OPENING entry → deletion must refuse.
    await expect(deleteAllBanks()).rejects.toThrow(/ledger entries/i);
    expect(await Party.findById(bank._id)).not.toBeNull();
  });
});
