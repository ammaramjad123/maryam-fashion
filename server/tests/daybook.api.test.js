/**
 * Phase 5 — Day Book API (HTTP) tests via supertest. These drive the thin
 * controllers/routes over the Phase-4 services; no calculation is re-tested here
 * (that is engine.test.js) — only the HTTP surface and route-boundary validation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../src/app.js';
import env from '../src/config/env.js';
import User from '../src/models/User.js';
import { getStock } from '../src/services/stock.service.js';
import { getPartyBalance } from '../src/services/ledger.service.js';
import { seedMasters, seedSetting, build0724Sections } from './fixtures.js';

const BASE = '/api/v1';
let replset;
let app;
let ids;
let adminToken;
let operatorToken;

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'daybook_api_test' });
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
  const operator = await User.create({
    name: 'Operator',
    email: 'op@test.local',
    passwordHash: 'x',
    role: 'OPERATOR',
    permissions: { viewProfit: false },
  });
  adminToken = jwt.sign({ sub: admin._id.toString(), role: 'ADMIN' }, env.jwtSecret);
  operatorToken = jwt.sign({ sub: operator._id.toString(), role: 'OPERATOR' }, env.jwtSecret);
});

// Save the 24/07 draft and return the response.
const saveFixtureDraft = () =>
  request(app)
    .put(`${BASE}/daybook/2025-07-24`)
    .set(bearer(operatorToken))
    .send(build0724Sections(ids));

describe('Day Book API', () => {
  it('GET /daybook/:date returns an empty draft for VIEWING but PERSISTS NOTHING', async () => {
    const res = await request(app).get(`${BASE}/daybook/2025-07-24`).set(bearer(operatorToken));

    expect(res.status).toBe(200);
    expect(res.body.data.day.status).toBe('DRAFT');
    expect(res.body.data.day.sales).toEqual([]);
    expect(res.body.data.openingCash).toBe(260297); // Setting.openingCash (first day)

    // Critical: merely opening a date must NOT create a DayBook document —
    // otherwise the empty draft would later block posting the next day.
    const { default: DayBook } = await import('../src/models/DayBook.js');
    expect(await DayBook.countDocuments({})).toBe(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`${BASE}/daybook/2025-07-24`);
    expect(res.status).toBe(401);
  });

  it('PUT /daybook/:date saves the whole day as DRAFT', async () => {
    const res = await saveFixtureDraft();
    expect(res.status).toBe(200);
    expect(res.body.data.day.status).toBe('DRAFT');
    expect(res.body.data.day.sales).toHaveLength(10);
    expect(res.body.data.day.payments).toHaveLength(2);
  });

  it('POST /daybook/:date/post posts and returns the verified totals', async () => {
    await saveFixtureDraft();
    // Assert profit with the ADMIN token — the operator's response is (correctly)
    // stripped of totalProfit by the role filter (see roles.api.test.js).
    const res = await request(app).post(`${BASE}/daybook/2025-07-24/post`).set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.day.status).toBe('POSTED');
    const t = res.body.data.day.totals;
    expect(t.cashSale).toBe(6700);
    expect(t.creditSale).toBe(12500);
    expect(t.totalSale).toBe(19200);
    expect(t.totalProfit).toBe(-6100);
    expect(t.netCash).toBe(84157);
  });

  it('GET returns previous-day reminders dated the shop-local day (not one early)', async () => {
    // Post 24/07, then open 25/07: its reminder strip carries 24/07's totals and
    // must be dated '2025-07-24'. The daybook date is stored as the Karachi
    // day-start (2025-07-23T19:00Z), so a naive UTC slice would say '2025-07-23'.
    await saveFixtureDraft();
    await request(app).post(`${BASE}/daybook/2025-07-24/post`).set(bearer(adminToken));

    const res = await request(app).get(`${BASE}/daybook/2025-07-25`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    const prev = res.body.data.previousDay;
    expect(prev.date).toBe('2025-07-24');
    expect(prev.cashSale).toBe(6700);
    expect(prev.netCash).toBe(84157);
  });

  it('persists a billNo on a sale line (docs/07 R9.1)', async () => {
    await request(app)
      .put(`${BASE}/daybook/2025-07-24`)
      .set(bearer(operatorToken))
      .send({
        sales: [{ billNo: 12037, productId: ids.products.K44._id, partyId: null, qty: 1, rate: 2200 }],
        purchases: [],
        receipts: [],
        payments: [],
        expenses: [],
      });
    const res = await request(app).get(`${BASE}/daybook/2025-07-24`).set(bearer(operatorToken));
    expect(res.status).toBe(200);
    expect(res.body.data.day.sales[0].billNo).toBe(12037);
  });

  it('double POST is idempotent (no duplicate derived rows)', async () => {
    await saveFixtureDraft();
    await request(app).post(`${BASE}/daybook/2025-07-24/post`).set(bearer(operatorToken));
    const ledgerAfterFirst = await mongoose.connection
      .collection('ledgerentries')
      .countDocuments({});

    const second = await request(app)
      .post(`${BASE}/daybook/2025-07-24/post`)
      .set(bearer(operatorToken));

    expect(second.status).toBe(200);
    expect(second.body.data.day.status).toBe('POSTED');
    expect(await mongoose.connection.collection('ledgerentries').countDocuments({})).toBe(
      ledgerAfterFirst
    );
  });

  it('POST /daybook/:date/unpost is ADMIN only and reverts to DRAFT', async () => {
    await saveFixtureDraft();
    await request(app).post(`${BASE}/daybook/2025-07-24/post`).set(bearer(operatorToken));

    const forbidden = await request(app)
      .post(`${BASE}/daybook/2025-07-24/unpost`)
      .set(bearer(operatorToken));
    expect(forbidden.status).toBe(403);

    const ok = await request(app).post(`${BASE}/daybook/2025-07-24/unpost`).set(bearer(adminToken));
    expect(ok.status).toBe(200);
    expect(ok.body.data.day.status).toBe('DRAFT');
    expect(await mongoose.connection.collection('ledgerentries').countDocuments({})).toBe(0);
  });

  // A minimal one-line real draft (has content → is a genuine unposted day).
  const saveRealDraft = (date) =>
    request(app)
      .put(`${BASE}/daybook/${date}`)
      .set(bearer(operatorToken))
      .send({
        discountOnSale: 0,
        sales: [{ productId: ids.products.K30._id, partyId: null, qty: 1, rate: 1500 }],
        purchases: [],
        receipts: [],
        payments: [],
        expenses: [],
      });

  it('POST rejects a day whose previous day is an unposted draft WITH REAL content (no gaps)', async () => {
    await saveRealDraft('2025-07-23'); // 23/07 has a real unposted line
    await saveFixtureDraft();

    const res = await request(app)
      .post(`${BASE}/daybook/2025-07-24/post`)
      .set(bearer(operatorToken));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/previous day/i);
  });

  it('opening a date creates NOTHING, so it cannot block the next day', async () => {
    const { default: DayBook } = await import('../src/models/DayBook.js');
    // View several earlier dates — the old bug would create empty drafts here.
    for (const d of ['2025-07-21', '2025-07-22', '2025-07-23']) {
      await request(app).get(`${BASE}/daybook/${d}`).set(bearer(operatorToken));
    }
    expect(await DayBook.countDocuments({})).toBe(0); // nothing persisted

    await saveFixtureDraft();
    const res = await request(app)
      .post(`${BASE}/daybook/2025-07-24/post`)
      .set(bearer(operatorToken));
    expect(res.status).toBe(200); // posts fine — no empty draft blocks it
  });

  it('POST succeeds when the previous day exists but is an EMPTY draft', async () => {
    // Force an empty draft to exist for 23/07 (belt-and-braces: even a stray
    // empty draft from old data must not block).
    const { default: DayBook } = await import('../src/models/DayBook.js');
    await DayBook.create({ date: new Date('2025-07-23T00:00:00+05:00'), status: 'DRAFT' });
    await saveFixtureDraft();

    const res = await request(app)
      .post(`${BASE}/daybook/2025-07-24/post`)
      .set(bearer(adminToken));
    expect(res.status).toBe(200);
  });

  it('nextBillNo auto-continues from the highest bill number on posted days', async () => {
    // No posted day yet → the first bill is 12037 (the real book's start).
    const fresh = await request(app).get(`${BASE}/daybook/2025-07-24`).set(bearer(operatorToken));
    expect(fresh.body.data.nextBillNo).toBe(12037);

    // Post a day whose bills go up to 12050 → the next day continues at 12051.
    await request(app)
      .put(`${BASE}/daybook/2025-07-24`)
      .set(bearer(operatorToken))
      .send({
        sales: [
          { billNo: 12049, productId: ids.products.K44._id, partyId: null, qty: 1, rate: 2200 },
          { billNo: 12050, productId: ids.products.K30._id, partyId: null, qty: 1, rate: 1500 },
        ],
        purchases: [],
        receipts: [],
        payments: [],
        expenses: [],
      });
    await request(app).post(`${BASE}/daybook/2025-07-24/post`).set(bearer(adminToken));

    const next = await request(app).get(`${BASE}/daybook/2025-07-25`).set(bearer(operatorToken));
    expect(next.body.data.nextBillNo).toBe(12051);
  });

  it('pageNo is assigned at POST time only (never on view or draft), in date order', async () => {
    // Viewing assigns nothing (transient draft → null; a stored draft → unset).
    const view = await request(app).get(`${BASE}/daybook/2025-07-24`).set(bearer(operatorToken));
    expect(view.body.data.day.pageNo ?? null).toBeNull();

    // A saved DRAFT still has no page number.
    await saveFixtureDraft();
    const draft = await request(app).get(`${BASE}/daybook/2025-07-24`).set(bearer(operatorToken));
    expect(draft.body.data.day.pageNo ?? null).toBeNull();

    // Posting assigns 220 (first posted → highest posted + 1, base 220).
    const posted = await request(app)
      .post(`${BASE}/daybook/2025-07-24/post`)
      .set(bearer(adminToken));
    expect(posted.body.data.day.pageNo).toBe(220);

    // The next posted day (in date order) gets 221.
    await saveRealDraft('2025-07-25');
    const next = await request(app)
      .post(`${BASE}/daybook/2025-07-25/post`)
      .set(bearer(adminToken));
    expect(next.body.data.day.pageNo).toBe(221);
  });

  it('an operator page-number override is respected at post', async () => {
    await request(app)
      .put(`${BASE}/daybook/2025-07-24`)
      .set(bearer(operatorToken))
      .send({ ...build0724Sections(ids), pageNo: 500 });
    const posted = await request(app)
      .post(`${BASE}/daybook/2025-07-24/post`)
      .set(bearer(adminToken));
    expect(posted.body.data.day.pageNo).toBe(500);
  });

  it('ACCEPTS a negative-qty sale line (a return) — never rejects it', async () => {
    const sections = {
      discountOnSale: 0,
      sales: [
        {
          productId: ids.products.K30._id,
          partyId: ids.parties.slmnAzam._id,
          qty: -77,
          rate: 1400,
        },
      ],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
    };
    const put = await request(app)
      .put(`${BASE}/daybook/2025-07-24`)
      .set(bearer(operatorToken))
      .send(sections);
    expect(put.status).toBe(200); // saved, not rejected

    const post = await request(app)
      .post(`${BASE}/daybook/2025-07-24/post`)
      .set(bearer(operatorToken));
    expect(post.status).toBe(200); // posted, not rejected
  });

  it('rejects a qty === 0 sale line with a 400', async () => {
    const res = await request(app)
      .put(`${BASE}/daybook/2025-07-24`)
      .set(bearer(operatorToken))
      .send({
        sales: [{ productId: ids.products.K30._id, qty: 0, rate: 1400 }],
        purchases: [],
        receipts: [],
        payments: [],
        expenses: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/non-zero/);
  });

  it('rejects a purchase line without a supplier partyId', async () => {
    const res = await request(app)
      .put(`${BASE}/daybook/2025-07-24`)
      .set(bearer(operatorToken))
      .send({
        sales: [],
        purchases: [{ productId: ids.products.K30._id, qty: 5, rate: 1500 }], // no partyId
        receipts: [],
        payments: [],
        expenses: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/partyId \(supplier\) is required/);
  });

  it('rejects a bad :date and a future post date', async () => {
    const bad = await request(app).get(`${BASE}/daybook/24-07-2025`).set(bearer(operatorToken));
    expect(bad.status).toBe(400);

    await request(app).get(`${BASE}/daybook/2999-01-01`).set(bearer(operatorToken));
    const future = await request(app)
      .post(`${BASE}/daybook/2999-01-01/post`)
      .set(bearer(operatorToken));
    expect(future.status).toBe(400);
    expect(future.body.message).toMatch(/future/i);
  });
});

// ===========================================================================
// Holiday gap — the shop closes for days (Sundays, Eid). Intermediate days
// simply DON'T EXIST; posting resumes later must carry everything forward from
// the last POSTED day, and the no-gap rule must not block on absent days.
// ===========================================================================
describe('Holiday gap (shop closed for days)', () => {
  const NET_CASH_24 = 84157; // 24/07 closing cash
  const K30_CLOSING_24 = 628; // 24/07 K30 closing stock
  const SLMN_CLOSING_24 = 12500; // slmn azam's 24/07 credit-sale balance (Dr)

  // Post the real 24/07 sheet through the HTTP surface.
  async function post0724() {
    await request(app).put(`${BASE}/daybook/2025-07-24`).set(bearer(operatorToken)).send(build0724Sections(ids));
    const res = await request(app).post(`${BASE}/daybook/2025-07-24/post`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.day.totals.netCash).toBe(NET_CASH_24);
  }

  // A minimal one-line cash sale so the resuming day has real content to post.
  const minimalDraft = (date) =>
    request(app)
      .put(`${BASE}/daybook/${date}`)
      .set(bearer(operatorToken))
      .send({
        discountOnSale: 0,
        sales: [{ productId: ids.products.K30._id, partyId: null, qty: 5, rate: 1600 }],
        purchases: [],
        receipts: [],
        payments: [],
        expenses: [],
      });

  it('resumes after a 3-day gap: 25–27 never existed, everything carries from 24', async () => {
    await post0724();

    // Opening 28 — nothing exists for 25/26/27. Opening cash + the reminder strip
    // come from 24 (the last POSTED day), not a blank or a non-existent 27.
    const view = await request(app).get(`${BASE}/daybook/2025-07-28`).set(bearer(operatorToken));
    expect(view.status).toBe(200);
    expect(view.body.data.openingCash).toBe(NET_CASH_24); // cash carried from 24
    expect(view.body.data.previousDay.date).toBe('2025-07-24'); // last POSTED, not 27
    expect(view.body.data.previousDay.netCash).toBe(NET_CASH_24);
    expect(view.body.data.previousDay.cashSale).toBe(6700);

    // Opening stock / party balance on 28 = their 24 July closing (27 is absent,
    // so "as of the end of 27" == "as of the end of 24").
    expect(await getStock(ids.products.K30._id, '2025-07-27')).toBe(K30_CLOSING_24);
    const slmn = await getPartyBalance(ids.parties.slmnAzam._id, '2025-07-27');
    expect(slmn).toMatchObject({ side: 'DR', amount: SLMN_CLOSING_24 });

    // Posting 28 SUCCEEDS — the no-gap rule doesn't block when the intermediate
    // days simply don't exist; 28's frozen opening cash is 24's closing.
    await minimalDraft('2025-07-28');
    const post28 = await request(app).post(`${BASE}/daybook/2025-07-28/post`).set(bearer(adminToken));
    expect(post28.status).toBe(200);
    expect(post28.body.data.day.openingCash).toBe(NET_CASH_24);
  });

  it('resumes after a LONG (10-day) gap: 25 Jul–2 Aug absent, carries from 24', async () => {
    await post0724();

    // 24 Jul + 10 days = 3 Aug; every day in between is absent.
    const view = await request(app).get(`${BASE}/daybook/2025-08-03`).set(bearer(operatorToken));
    expect(view.status).toBe(200);
    expect(view.body.data.openingCash).toBe(NET_CASH_24);
    expect(view.body.data.previousDay.date).toBe('2025-07-24'); // still the last posted day
    expect(await getStock(ids.products.K30._id, '2025-08-02')).toBe(K30_CLOSING_24);
    const slmn = await getPartyBalance(ids.parties.slmnAzam._id, '2025-08-02');
    expect(slmn).toMatchObject({ side: 'DR', amount: SLMN_CLOSING_24 });

    await minimalDraft('2025-08-03');
    const post = await request(app).post(`${BASE}/daybook/2025-08-03/post`).set(bearer(adminToken));
    expect(post.status).toBe(200);
    expect(post.body.data.day.openingCash).toBe(NET_CASH_24);
  });
});
