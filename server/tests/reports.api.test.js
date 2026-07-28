/**
 * Phase 7 — Reports API tests. Assert the report endpoints surface the Phase-4
 * engine numbers unchanged (nothing is recomputed in the report layer).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';

import { createApp } from '../src/app.js';
import env from '../src/config/env.js';
import User from '../src/models/User.js';
import Party from '../src/models/Party.js';
import { saveDraft, postByDate } from '../src/services/daybook.service.js';
import { seedMasters, seedSetting, build0724Sections } from './fixtures.js';
import { PRODUCT_OPENINGS, OPENING_TOTAL } from '../src/data/productOpenings.js';

const BASE = '/api/v1';
let replset;
let app;
let token;
let ids;

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'reports_api_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  ids = await seedMasters();
  await seedSetting(260297);
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@test.local',
    passwordHash: 'x',
    role: 'ADMIN',
    permissions: { viewProfit: true },
  });
  token = jwt.sign({ sub: admin._id.toString(), role: 'ADMIN' }, env.jwtSecret);
});

// Post the real 24/07 day through the engine so the reports read posted data.
async function post0724() {
  await saveDraft('2025-07-24', build0724Sections(ids));
  await postByDate('2025-07-24');
}

describe('Reports API', () => {
  it('daily-sale reproduces the sheet totals (netCash 84,157 etc.)', async () => {
    await post0724();
    const res = await request(app).get(`${BASE}/reports/daily-sale?date=2025-07-24`).set(auth());

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.status).toBe('POSTED');
    expect(d.totals.cashSale).toBe(6700);
    expect(d.totals.creditSale).toBe(12500);
    expect(d.totals.totalSale).toBe(19200);
    expect(d.totals.totalProfit).toBe(-6100);
    expect(d.totals.netCash).toBe(84157);
    // Sheet reproduction: 10 sale lines, resolved product codes, cash/credit tag.
    expect(d.sales).toHaveLength(10);
    expect(d.sales[0].productCode).toBe('K44');
    expect(d.creditSaleByParty[0]).toMatchObject({ partyName: 'Slmn azam', amount: 12500 });
  });

  it('the 41 real opening stocks sum to exactly 2,804 (the sheet Opening total)', () => {
    const sum = Object.values(PRODUCT_OPENINGS).reduce((s, v) => s + v, 0);
    expect(sum).toBe(2804);
    expect(OPENING_TOTAL).toBe(2804);
  });

  it('daily-stock shows K30 closing 628 and whole-inventory totals 2,804 → 2,820', async () => {
    await post0724();
    const res = await request(app).get(`${BASE}/reports/daily-stock?date=2025-07-24`).set(auth());

    expect(res.status).toBe(200);
    const k30 = res.body.data.rows.find((r) => r.code === 'K30');
    expect(k30.opening).toBe(551);
    expect(k30.saleQty).toBe(-77);
    expect(k30.saleAmount).toBe(-107500);
    expect(k30.profit).toBe(8000);
    expect(k30.closing).toBe(628);

    // Report totals must match the real 24/07 sheet's Total row exactly:
    //   Total | 2804 | (blank) | 0 | 2804 | -16 | 19,200 | -6,100 | 2,820
    const t = res.body.data.totals;
    expect(t.opening).toBe(2804);
    expect(t.purchaseAmount).toBe(0); // prints 0, not blank
    expect(t.total).toBe(2804); // Total column = Opening + Purchase
    expect(t.saleQty).toBe(-16);
    expect(t.saleAmount).toBe(19200);
    expect(t.profit).toBe(-6100);
    expect(t.closing).toBe(2820);
  });

  it('ledger for farhan malik closes 42,784 Cr', async () => {
    const farhan = await Party.create({
      accountCode: '2201009',
      name: 'farhan malik account',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
      openingDate: new Date('2025-04-01'),
    });
    await mongoose.connection.collection('ledgerentries').insertMany([
      {
        partyId: farhan._id,
        date: new Date('2025-04-01T00:00:00+05:00'),
        voucherType: 'OP',
        voucherNo: 0,
        narration: 'Opening balance',
        debit: 0,
        credit: 44118,
        sourceType: 'OPENING',
        createdAt: new Date('2025-04-01'),
      },
      {
        partyId: farhan._id,
        date: new Date('2025-04-08T00:00:00+05:00'),
        voucherType: 'DV',
        voucherNo: 3890,
        narration: 'salary',
        debit: 44000,
        credit: 0,
        sourceType: 'DAYBOOK',
        createdAt: new Date('2025-04-08'),
      },
      {
        partyId: farhan._id,
        date: new Date('2025-04-30T00:00:00+05:00'),
        voucherType: 'JV',
        voucherNo: 82,
        narration: 'salary',
        debit: 0,
        credit: 42666,
        sourceType: 'JOURNAL',
        createdAt: new Date('2025-04-30'),
      },
    ]);

    const res = await request(app)
      .get(`${BASE}/reports/ledger?partyId=${farhan._id}&from=2025-04-01&to=2025-04-30`)
      .set(auth());

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.closing).toMatchObject({ side: 'CR', amount: 42784 });
    // The OP row shows its amount only in the Balance column (blank debit/credit),
    // so the movement totals match the printed sheet.
    expect(d.totalDebit).toBe(44000);
    expect(d.totalCredit).toBe(42666);
    const op = d.rows.find((r) => r.type === 'OP');
    expect(op.debit).toBeNull();
    expect(op.balance).toMatchObject({ side: 'CR', amount: 44118 });
    expect(d.rows.at(-1).balance).toMatchObject({ side: 'CR', amount: 42784 });

    // Date is the shop-local (Karachi) day, NOT the raw UTC instant. The DV was
    // stored at 2025-04-08T00:00+05:00 (= 2025-04-07T19:00Z); a naive UTC slice
    // would render it as 04-07 (one day early). Guards the shopDate regression.
    const dv = d.rows.find((r) => r.type === 'DV');
    expect(dv.date).toBe('2025-04-08');
    expect(op.date).toBe('2025-04-01');
  });

  it('cashbook chains opening → closing to 84,157 after 24/07', async () => {
    await post0724();
    const res = await request(app)
      .get(`${BASE}/reports/cashbook?from=2025-07-24&to=2025-07-24`)
      .set(auth());

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.openingCash).toBe(260297);
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({ opening: 260297, closing: 84157 });
    expect(d.closingCash).toBe(84157);
    // The row's date is the shop-local day, not the UTC instant of its day-start
    // (2025-07-23T19:00Z) — which would have rendered as 07-23.
    expect(d.rows[0].date).toBe('2025-07-24');
  });

  it('product code lookup is case-insensitive (typing "k30" resolves K30)', async () => {
    for (const q of ['k30', 'K30', ' k30 ']) {
      const res = await request(app).get(`${BASE}/products/search?q=${encodeURIComponent(q.trim())}`).set(auth());
      expect(res.status, q).toBe(200);
      const codes = res.body.data.items.map((i) => i.code);
      expect(codes, q).toContain('K30'); // stored uppercase, matched case-insensitively
    }
  });

  it('party create auto-generates an account code (never asked for), by type', async () => {
    const { create } = await import('../src/services/party.service.js');
    const cust = await create({ name: 'walk-in', type: 'CUSTOMER', openingBalance: 0, openingType: 'DR' });
    const emp = await create({ name: 'new worker', type: 'EMPLOYEE', openingBalance: 0, openingType: 'DR' });
    expect(cust.accountCode).toMatch(/^11\d{5}$/); // customer prefix
    expect(emp.accountCode).toMatch(/^22\d{5}$/); // employee prefix
    expect(cust.accountCode).not.toBe(emp.accountCode);
    expect(cust.name).toBe('walk-in');
  });

  it('GET /parties/outstanding resolves ahead of /parties/:id and lists balances', async () => {
    // farhan opens 44,118 Cr via the party service's OP entry → a payable.
    const { create } = await import('../src/services/party.service.js');
    await create({
      accountCode: '2201100',
      name: 'employee owed',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
      openingDate: '2025-04-01',
    });

    const res = await request(app).get(`${BASE}/parties/outstanding`).set(auth());
    expect(res.status).toBe(200);
    const owed = res.body.data.payables.find((p) => p.accountCode === '2201100');
    expect(owed.amount).toBe(44118);
    expect(res.body.data.totalPayable).toBeGreaterThanOrEqual(44118);
  });

  it('a CR opening (e.g. farhan 44,118 Cr) is a PAYABLE, never a receivable', async () => {
    // Guards the OP ledger-entry direction: openingType CR must write a CREDIT,
    // giving a negative signed balance → side CR → "whom we owe" (docs/07 R1).
    const { create } = await import('../src/services/party.service.js');
    const farhan = await create({
      accountCode: '2201077',
      name: 'farhan malik (test)',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
      openingDate: '2025-04-01',
    });

    const { getPartyBalance } = await import('../src/services/ledger.service.js');
    const bal = await getPartyBalance(farhan._id, '2025-07-24');
    expect(bal.side).toBe('CR');
    expect(bal.amount).toBe(44118);
    expect(bal.signedBalance).toBeLessThan(0);

    const res = await request(app).get(`${BASE}/parties/outstanding`).set(auth());
    expect(res.body.data.payables.some((p) => p.accountCode === '2201077')).toBe(true);
    expect(res.body.data.receivables.some((p) => p.accountCode === '2201077')).toBe(false);
  });

  it('rejects an opening balance with no openingDate (never dates the OP row "today")', async () => {
    const { create } = await import('../src/services/party.service.js');
    // An opening balance without a date must fail with a clear 400…
    await expect(
      create({
        accountCode: '2201200',
        name: 'no date',
        type: 'EMPLOYEE',
        openingBalance: 5000,
        openingType: 'CR',
      })
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/openingDate/i) });

    // …and no party (or stray OP row dated today) is left behind.
    const { getPartyBalance } = await import('../src/services/ledger.service.js');
    const strays = await mongoose.connection
      .collection('ledgerentries')
      .countDocuments({ voucherType: 'OP', narration: 'Opening balance', date: { $gte: new Date('2026-01-01') } });
    expect(strays).toBe(0);

    // A ZERO opening writes no OP row, so it needs no date and succeeds.
    const zero = await create({
      accountCode: '2201201',
      name: 'zero open',
      type: 'CUSTOMER',
      openingBalance: 0,
      openingType: 'DR',
    });
    expect(zero.accountCode).toBe('2201201');
    const bal = await getPartyBalance(zero._id, '2025-07-24');
    expect(bal.side).toBe('NONE');
  });
});

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Collect a binary (xlsx) response body as a Buffer.
async function getXlsx(p) {
  return request(app)
    .get(p)
    .set(auth())
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
}

// Find the cell immediately to the right of the first cell equal to `label`.
function labelValue(ws, label) {
  let found;
  ws.eachRow((row) => {
    row.eachCell((cell, col) => {
      if (found === undefined && cell.value === label) found = row.getCell(col + 1).value;
    });
  });
  return found;
}

describe('Reports XLSX export', () => {
  async function endpoints() {
    await post0724(); // daily-sale/stock/cashbook need a posted day
    return [
      [`${BASE}/reports/daily-sale.xlsx?date=2025-07-24`],
      [`${BASE}/reports/daily-stock.xlsx?date=2025-07-24`],
      [`${BASE}/reports/ledger.xlsx?partyId=${ids.parties.farhan._id}&from=2025-04-01&to=2025-04-30`],
      [`${BASE}/reports/cashbook.xlsx?from=2025-07-24&to=2025-07-24`],
      [`${BASE}/reports/outstanding.xlsx`],
    ];
  }

  it('every endpoint returns 200 + xlsx content-type + a non-empty body', async () => {
    for (const [p] of await endpoints()) {
      const res = await getXlsx(p);
      expect(res.status, p).toBe(200);
      expect(res.headers['content-type'], p).toContain(XLSX_TYPE);
      expect(res.body.length, p).toBeGreaterThan(0);
    }
  });

  it('every endpoint is 401 without a token', async () => {
    for (const [p] of await endpoints()) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(401);
    }
  });

  it('the daily-sale workbook carries the SAME numbers as the PDF (Net Cash 84,157, Total Profit -6,100)', async () => {
    await post0724();
    const res = await getXlsx(`${BASE}/reports/daily-sale.xlsx?date=2025-07-24`);
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];

    expect(labelValue(ws, 'Net Cash')).toBe(84157);
    expect(labelValue(ws, 'Total Profit')).toBe(-6100);
    expect(labelValue(ws, 'Total Sale')).toBe(19200);
  });
});

describe('Bank Accounts + Position (docs/07 R9.3)', () => {
  // A bank opens with a PLAIN amount (no Dr/Cr), then debit/credit entries move it.
  async function seedBank() {
    const { create } = await import('../src/services/party.service.js');
    const bank = await create({
      accountCode: '4101001',
      name: 'HBL Main',
      type: 'BANK',
      openingBalance: 100000, // plain starting amount — NO openingType
      openingDate: '2025-04-01',
    });
    const { addEntry } = await import('../src/services/bank.service.js');
    await addEntry(bank._id, { date: '2025-05-10', direction: 'DR', amount: 50000, narration: 'deposit' });
    await addEntry(bank._id, { date: '2025-05-15', direction: 'CR', amount: 20000, narration: 'cheque' });
    return bank;
  }

  it('a bank opens with a PLAIN amount (no Dr/Cr) and moves via debit/credit', async () => {
    const { create } = await import('../src/services/party.service.js');
    const { addEntry } = await import('../src/services/bank.service.js');
    const { getPartyBalance } = await import('../src/services/ledger.service.js');
    // Create with NO openingType — the server treats a bank opening as plain.
    const bank = await create({ name: 'Meezan', type: 'BANK', openingBalance: 500000, openingDate: '2025-04-01' });
    expect(bank.openingType).toBe('DR'); // stored as a positive/asset opening

    let bal = await getPartyBalance(bank._id, '2025-12-31');
    expect(bal.signedBalance).toBe(500000); // plain starting amount
    await addEntry(bank._id, { date: '2025-05-10', direction: 'DR', amount: 150000, narration: 'deposit' });
    await addEntry(bank._id, { date: '2025-05-20', direction: 'CR', amount: 90000, narration: 'cheque' });
    bal = await getPartyBalance(bank._id, '2025-12-31');
    expect(bal.signedBalance).toBe(560000); // 500,000 + 150,000 − 90,000
  });

  it('a BANK balance is opening + Σdebit − Σcredit (reuses the ledger engine)', async () => {
    const bank = await seedBank();
    const { getPartyBalance } = await import('../src/services/ledger.service.js');
    const bal = await getPartyBalance(bank._id, '2025-12-31');
    expect(bal.side).toBe('DR');
    expect(bal.amount).toBe(130000); // 100,000 + 50,000 − 20,000
  });

  it('Position GRAND TOTAL equals the sum of the individual bank balances', async () => {
    const { create } = await import('../src/services/party.service.js');
    const { addEntry } = await import('../src/services/bank.service.js');
    // HBL 560,000 · Meezan 160,000 · Imtiaz 0  → grand total 720,000.
    const hbl = await create({ name: 'HBL', type: 'BANK', openingBalance: 500000, openingDate: '2025-04-01' });
    await addEntry(hbl._id, { date: '2025-05-10', direction: 'DR', amount: 150000, narration: 'deposit' });
    await addEntry(hbl._id, { date: '2025-05-20', direction: 'CR', amount: 90000, narration: 'cheque' });
    await create({ name: 'Meezan', type: 'BANK', openingBalance: 160000, openingDate: '2025-04-01' });
    await create({ name: 'Imtiaz', type: 'BANK', openingBalance: 0 });

    const res = await request(app).get(`${BASE}/reports/position?from=2025-04-01&to=2025-12-31`).set(auth());
    expect(res.status).toBe(200);
    const { accounts, grandTotal } = res.body.data;
    const sumOfBalances = accounts.reduce((s, a) => s + a.closing.signedBalance, 0);
    expect(sumOfBalances).toBe(720000);
    expect(grandTotal.signedBalance).toBe(720000); // grand total == sum of individual balances
    expect(grandTotal.amount).toBe(720000);
  });

  it('Position lists every bank with its correct balance and movement totals', async () => {
    await seedBank();
    const res = await request(app)
      .get(`${BASE}/reports/position?from=2025-04-01&to=2025-12-31`)
      .set(auth());
    expect(res.status).toBe(200);
    const acc = res.body.data.accounts.find((a) => a.party.accountCode === '4101001');
    expect(acc.closing).toMatchObject({ side: 'DR', amount: 130000 });
    expect(acc.totalDebit).toBe(50000); // OP excluded from movement totals
    expect(acc.totalCredit).toBe(20000);
  });

  it('Position .xlsx is authed and non-empty (401 without a token)', async () => {
    await seedBank();
    const p = `${BASE}/reports/position.xlsx?from=2025-04-01&to=2025-12-31`;
    const res = await getXlsx(p);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(XLSX_TYPE);
    expect(res.body.length).toBeGreaterThan(0);
    expect((await request(app).get(p)).status).toBe(401);
  });

  it('bank entries NEVER touch a Day Book total (posting is unaffected)', async () => {
    await seedBank(); // 100k/50k/20k of bank movements exist BEFORE posting
    await post0724();
    const res = await request(app).get(`${BASE}/reports/daily-sale?date=2025-07-24`).set(auth());
    const t = res.body.data.totals;
    expect(t.totalSale).toBe(19200);
    expect(t.totalProfit).toBe(-6100);
    expect(t.netCash).toBe(84157); // unchanged by the bank ledger
  });

  it('banks are EXCLUDED from receivables/payables (dashboard + Outstanding), only in Position', async () => {
    const { create } = await import('../src/services/party.service.js');
    // Two banks holding money (our own asset, not a debtor/creditor).
    await create({ accountCode: '4101001', name: 'HBL Main', type: 'BANK', openingBalance: 500000, openingType: 'DR', openingDate: '2025-04-01' });
    await create({ accountCode: '4101002', name: 'Meezan', type: 'BANK', openingBalance: 120000, openingType: 'DR', openingDate: '2025-04-01' });
    // A real debtor (customer owes us) and a real creditor (we owe supplier).
    await create({ accountCode: '1101050', name: 'debtor co', type: 'CUSTOMER', openingBalance: 30000, openingType: 'DR', openingDate: '2025-04-01' });
    await create({ accountCode: '3101050', name: 'creditor co', type: 'SUPPLIER', openingBalance: 20000, openingType: 'CR', openingDate: '2025-04-01' });

    const noBank = (rows) => rows.every((r) => !String(r.accountCode).startsWith('4101'));

    // Dashboard: banks excluded from tiles and lists.
    const dash = (await request(app).get(`${BASE}/dashboard?date=2025-12-31`).set(auth())).body.data;
    expect(dash.totalReceivable).toBe(30000); // NOT 30,000 + 620,000 of bank money
    expect(dash.totalPayable).toBe(20000);
    expect(noBank(dash.receivables)).toBe(true);
    expect(noBank(dash.payables)).toBe(true);

    // Outstanding report: banks excluded from both lists and totals.
    const out = (await request(app).get(`${BASE}/parties/outstanding`).set(auth())).body.data;
    expect(noBank(out.receivables)).toBe(true);
    expect(noBank(out.payables)).toBe(true);
    expect(out.receivables.some((r) => r.accountCode === '1101050')).toBe(true);
    expect(out.payables.some((r) => r.accountCode === '3101050')).toBe(true);

    // Parties master list + type-ahead: banks are hidden there too.
    const list = (await request(app).get(`${BASE}/parties?limit=200`).set(auth())).body.data;
    expect(noBank(list.items)).toBe(true);
    const search = (await request(app).get(`${BASE}/parties/search?q=HBL`).set(auth())).body.data;
    expect(search.items.length).toBe(0);

    // Position: the banks DO appear here.
    const pos = (await request(app).get(`${BASE}/reports/position?from=2025-04-01&to=2025-12-31`).set(auth())).body.data;
    const codes = pos.accounts.map((a) => a.party.accountCode);
    expect(codes).toContain('4101001');
    expect(codes).toContain('4101002');
  });
});
