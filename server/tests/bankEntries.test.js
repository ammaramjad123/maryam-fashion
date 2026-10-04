/**
 * Bank ledger entries are fully editable (docs/07 R9.3 — a separate ledger that
 * never touches the Day Book or shop cash). listEntries exposes each entry's id +
 * a running balance; updateEntry and deleteEntry change them and the balance
 * re-derives from what remains.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Party from '../src/models/Party.js';
import { addEntry, listEntries, updateEntry, deleteEntry } from '../src/services/bank.service.js';

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'bank_entries_test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await mongoose.connection.collection('settings').insertOne({ openingCash: 0, codeMultiplier: 50 });
});

async function makeBank() {
  return Party.create({
    accountCode: '3301001',
    name: 'Mezan Bank',
    type: 'BANK',
    openingBalance: 0,
    openingType: 'DR',
  });
}

describe('bank entry edit/delete', () => {
  it('lists entries with ids + running balance, edits, and deletes', async () => {
    const bank = await makeBank();
    await addEntry(bank._id, { date: '2026-08-31', direction: 'DR', amount: 181385, narration: 'in' });
    await addEntry(bank._id, { date: '2026-09-15', direction: 'DR', amount: 152367, narration: 'in2' });

    let { rows, balance } = await listEntries(bank._id);
    expect(rows).toHaveLength(2);
    expect(rows[0]._id).toBeTruthy();
    expect(rows[0].balance.signedBalance).toBe(181385); // running after row 1
    expect(balance.signedBalance).toBe(333752); // 181,385 + 152,367

    // Edit row 1: change amount + narration.
    await updateEntry(bank._id, rows[0]._id, {
      date: '2026-08-31',
      narration: 'corrected',
      direction: 'DR',
      amount: 100000,
    });
    ({ rows, balance } = await listEntries(bank._id));
    expect(rows[0].debit).toBe(100000);
    expect(rows[0].narration).toBe('corrected');
    expect(balance.signedBalance).toBe(252367); // 100,000 + 152,367

    // Flip row 2 to a credit (money out) via edit.
    await updateEntry(bank._id, rows[1]._id, { direction: 'CR', amount: 2367 });
    ({ balance } = await listEntries(bank._id));
    expect(balance.signedBalance).toBe(97633); // 100,000 − 2,367

    // Delete row 1.
    await deleteEntry(bank._id, rows[0]._id);
    ({ rows, balance } = await listEntries(bank._id));
    expect(rows).toHaveLength(1);
    expect(balance.signedBalance).toBe(-2367); // only the credit remains
  });

  it('rejects an edit with neither/both sides, and a bad entry id', async () => {
    const bank = await makeBank();
    await addEntry(bank._id, { date: '2026-09-01', direction: 'DR', amount: 500, narration: '' });
    const { rows } = await listEntries(bank._id);

    await expect(
      updateEntry(bank._id, rows[0]._id, { debit: 10, credit: 10 })
    ).rejects.toThrow(/exactly one/i);
    await expect(
      deleteEntry(bank._id, new mongoose.Types.ObjectId().toString())
    ).rejects.toThrow(/not found/i);
  });
});
