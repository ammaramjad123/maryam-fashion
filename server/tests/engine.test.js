/**
 * Phase 4 — Core engine specification (TESTS FIRST, no implementation yet).
 *
 * Every expected number below is copied from the verified fixtures in
 * docs/07-business-rules.md (Farhan Malik ledger Apr-2025; Daily Stock Report
 * and Daily Sale & Expenses Sheet 24/07/2025). Nothing here is invented.
 *
 * The functions under test do not exist yet — these tests DEFINE them. Until
 * Phase 4 is implemented, importing the service modules below will fail; that
 * is the expected "red" state.
 *
 * `uptoDate` is a shop-local calendar day as a 'YYYY-MM-DD' string. "As of
 * uptoDate" means the WHOLE of that day: internally each day is the half-open
 * range [dayStart, nextDayStart) in Asia/Karachi (UTC+5, no DST). An entry
 * timestamped any time on 24/07 is included when uptoDate = '2025-07-24'; an
 * entry at 00:00 on 25/07 is not. This makes closing(day N) == opening(day N+1).
 *
 * Contracts defined by this suite
 * -------------------------------
 *   getPartyBalance(partyId, uptoDate)
 *       -> { signedBalance, side, amount }
 *          signedBalance = Σdebit − Σcredit  over ALL entries (the opening is an
 *                          OP LedgerEntry, so there is NO special opening case)
 *          side          = signedBalance > 0 ? 'DR' : signedBalance < 0 ? 'CR' : 'NONE'
 *          amount        = Math.abs(signedBalance)   // side 'NONE' ⇒ display "0"
 *
 *   getStock(productId, uptoDate)      -> Number  (closing qty; whole uptoDate day)
 *          closing = openingStock + ΣpurchaseQty − ΣsaleQty   (sale qty is SIGNED)
 *
 *   getCashBalance(uptoDate)           -> Number  (closing/net cash; whole uptoDate day)
 *          = Setting.openingCash + Σreceipts + ΣcashSaleLessDisc − Σpayments − Σexpenses
 *
 *   getCostRate(productId, date)       -> Number  (the FIXED Product.costRate)
 *
 *   postDayBook(dayBookId)   / unpostDayBook(dayBookId)
 *          atomic + idempotent; writes/removes derived rows keyed by sourceId.
 *
 * The operator only enters { productId, partyId, qty, rate } on a line — the
 * engine computes amount, freezes costRate, and computes profit at post time.
 *
 * Opening balances: creating a Party with an opening balance writes a real OP
 * LedgerEntry (voucherType 'OP', voucherNo 0, "Opening balance"); the tests seed
 * that OP row explicitly, matching the real printed ledger.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Party from '../src/models/Party.js';
import Product from '../src/models/Product.js';
import ExpenseHead from '../src/models/ExpenseHead.js';

// --- functions under test (do not exist until Phase 4 is implemented) --------
import { getPartyBalance } from '../src/services/ledger.service.js';
import { getStock } from '../src/services/stock.service.js';
import { getCashBalance } from '../src/services/cash.service.js';
import { getCostRate } from '../src/services/profit.js';
import { postDayBook, unpostDayBook } from '../src/services/posting.service.js';

const { Types } = mongoose;

// ---------------------------------------------------------------------------
// Expected values — all from docs/07-business-rules.md
// ---------------------------------------------------------------------------
const EXPECTED = {
  // R2 — cash vs credit (24/07 sheet)
  cashSale: 6700, // 2,200 + 4,500 (lines with NO party)
  creditSale: 12500, // 100,000+16,200+27,000−107,800−8,700−5,400−4,200−4,600
  totalSale: 19200, // 6,700 + 12,500

  // R6 — profit (fixed cost per product, may be negative)
  totalProfit: -6100,
  k44CreditLineProfit: -10000, // 50 @2000, cost 2200 → (2000−2200)*50
  k30ReturnLineProfit: 7700, // −77 @1400, cost 1500 → (1400−1500)*−77

  // R7 — cash chain
  openingCash: 260297,
  cashReceipts: 0,
  paidCash: 90000, // farhan 45,000 + salman 45,000  (PAYMENTS, not expenses)
  shopExpenses: 92840, // sum of the 10 expense lines
  netCash: 84157, // 260,297 + 0 + 6,700 − 90,000 − 92,840

  // R5 — stock (signed sale)
  k30Opening: 551,
  k30Closing: 628, // 551 − (−77)
  k50Closing: 2, // 0 − (−2)

  // R6 — fixed cost rates
  k30Cost: 1500,

  // R1 — Farhan Malik ledger (April 2025)
  farhanClosingAmount: 42784, // 44,118 Cr − 44,000 + 42,666
};

// ---------------------------------------------------------------------------
// In-memory Mongo (replica set → transactions work for postDayBook)
// ---------------------------------------------------------------------------
let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'engine_test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
});

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

// Raw-collection accessors (these models arrive in Phase 4; tests read the
// collections directly so they don't depend on not-yet-existing models).
const daybooks = () => mongoose.connection.collection('daybooks');
const ledgerEntries = () => mongoose.connection.collection('ledgerentries');
const stockTx = () => mongoose.connection.collection('stocktransactions');
const settings = () => mongoose.connection.collection('settings');

async function seedSetting(openingCash = EXPECTED.openingCash) {
  await settings().insertOne({
    openingCash,
    shopName: 'Test Shop',
    currency: 'PKR',
    purchaseProfitFormula: 'ZERO',
    discountAppliesTo: 'CASH',
    allowNegativeStock: true,
  });
}

// Seed the masters needed by the 24/07 fixture, with their fixed cost rates.
async function seedMasters() {
  const productSpecs = [
    { code: 'K30', costRate: 1500, saleRate: 1500, openingStock: 551 },
    { code: 'K44', costRate: 2200, saleRate: 2200, openingStock: 0 },
    { code: 'K64', costRate: 3200, saleRate: 2700, openingStock: 0 },
    { code: 'K40', costRate: 2000, saleRate: 1800, openingStock: 0 },
    { code: 'K32', costRate: 1600, saleRate: 1450, openingStock: 0 },
    { code: 'K50', costRate: 2500, saleRate: 2300, openingStock: 0 }, // opening 0 (R4)
  ];
  const products = {};
  for (const s of productSpecs) {
    products[s.code] = await Product.create({
      ...s,
      name: `Cloth ${s.code}`,
      costRateUpdatedAt: new Date('2025-04-01'),
      openingDate: new Date('2025-04-01'),
    });
  }

  const parties = {
    slmnAzam: await Party.create({
      accountCode: '1101001',
      name: 'Slmn azam',
      type: 'CUSTOMER',
      openingBalance: 0,
      openingType: 'DR',
      openingDate: new Date('2025-04-01'),
    }),
    farhan: await Party.create({
      accountCode: '2201001',
      name: 'farhan malik account',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
      openingDate: new Date('2025-04-01'),
    }),
    salman: await Party.create({
      accountCode: '2201002',
      name: 'salman malik',
      type: 'EMPLOYEE',
      openingBalance: 0,
      openingType: 'CR',
      openingDate: new Date('2025-04-01'),
    }),
  };

  const headNames = [
    'masjid',
    'gaurd',
    'safai',
    'boys exp',
    'hall rent',
    'tea',
    'stall khana',
    'water',
    'computer rprng',
    'slmn mill kraya',
  ];
  const heads = {};
  for (const name of headNames) heads[name] = await ExpenseHead.create({ name });

  await seedSetting();
  return { products, parties, heads };
}

/**
 * The exact 24/07/2025 Daily Sale & Expense Sheet as a DRAFT DayBook.
 * Sale lines carry only { productId, partyId, qty, rate } — the engine derives
 * amount / costRate / profit at post time.
 */
function build0724Draft({ products, parties, heads }) {
  const sale = (code, partyKey, qty, rate) => ({
    productId: products[code]._id,
    partyId: partyKey ? parties[partyKey]._id : null, // null = CASH (R2)
    qty,
    rate,
  });

  return {
    date: new Date('2025-07-24'),
    status: 'DRAFT',
    discountOnSale: 0,
    sales: [
      // Cash lines (no party) → cashSale 6,700
      sale('K44', null, 1, 2200), //   2,200  P 0
      sale('K30', null, 3, 1500), //   4,500  P 0
      // Credit lines (party "Slmn azam") → creditSale 12,500
      sale('K44', 'slmnAzam', 50, 2000), //  100,000  P −10,000
      sale('K64', 'slmnAzam', 6, 2700), //   16,200  P  −3,000
      sale('K40', 'slmnAzam', 15, 1800), //   27,000  P  −3,000
      sale('K30', 'slmnAzam', -77, 1400), // −107,800  P  +7,700  (return, R3)
      sale('K32', 'slmnAzam', -6, 1450), //   −8,700  P    +900  (return)
      sale('K40', 'slmnAzam', -3, 1800), //   −5,400  P    +600  (return)
      sale('K30', 'slmnAzam', -3, 1400), //   −4,200  P    +300  (return)
      sale('K50', 'slmnAzam', -2, 2300), //   −4,600  P    +400  (return, opening 0 → R4)
    ],
    purchases: [],
    receipts: [], // Cash Rec = 0
    payments: [
      // Paid Cash 90,000 — these are PAYMENTS, not shop expenses (R7)
      { partyId: parties.farhan._id, narration: 'salary', amount: 45000 },
      { partyId: parties.salman._id, narration: 'salary', amount: 45000 },
    ],
    expenses: [
      // Shop Exp 92,840
      { expenseHeadId: heads['masjid']._id, narration: 'masjid', amount: 5000 },
      { expenseHeadId: heads['gaurd']._id, narration: 'gaurd', amount: 1000 },
      { expenseHeadId: heads['safai']._id, narration: 'safai', amount: 1000 },
      { expenseHeadId: heads['boys exp']._id, narration: 'boys exp', amount: 7140 },
      { expenseHeadId: heads['hall rent']._id, narration: 'hall rent', amount: 73000 },
      { expenseHeadId: heads['tea']._id, narration: 'tea', amount: 1250 },
      { expenseHeadId: heads['stall khana']._id, narration: 'stall khana', amount: 500 },
      { expenseHeadId: heads['water']._id, narration: 'water', amount: 1050 },
      { expenseHeadId: heads['computer rprng']._id, narration: 'computer rprng', amount: 2500 },
      { expenseHeadId: heads['slmn mill kraya']._id, narration: 'slmn mill kraya', amount: 400 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function insertDayBook(doc) {
  const res = await daybooks().insertOne(doc);
  return res.insertedId;
}

async function readDayBook(id) {
  return daybooks().findOne({ _id: id });
}

// A trivial 1-line cash-sale draft for tests that only care about posting order.
async function seedOneProduct(code = 'K1') {
  return Product.create({
    code,
    name: `Cloth ${code}`,
    costRate: 100,
    openingStock: 10,
  });
}

async function insertMinimalDraft(date, product) {
  return insertDayBook({
    date,
    status: 'DRAFT',
    discountOnSale: 0,
    sales: [{ productId: product._id, partyId: null, qty: 1, rate: 100 }],
    purchases: [],
    receipts: [],
    payments: [],
    expenses: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

const UPTO = '2025-07-24'; // shop-local day; "as of" covers the whole 24/07

// ===========================================================================
// R1 — LEDGER: debit/credit sign convention
// ===========================================================================
describe('R1 — party ledger balance (Farhan Malik, April 2025)', () => {
  async function seedFarhanLedger() {
    const farhan = await Party.create({
      accountCode: '2201001',
      name: 'farhan malik account',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
      openingDate: new Date('2025-04-01'),
    });
    // Opening is a real OP LedgerEntry (matches the printed ledger's OP row),
    // NOT derived from the Party master. getPartyBalance = Σ(entries) only.
    await ledgerEntries().insertMany([
      // 01/04 OP — opening balance → Credit 44,118
      {
        partyId: farhan._id,
        date: new Date('2025-04-01T00:00:00+05:00'),
        voucherType: 'OP',
        voucherNo: 0,
        narration: 'Opening balance',
        debit: 0,
        credit: 44118,
        sourceType: 'OPENING',
      },
      // 08/04 DV — cash PAID to him → Debit 44,000
      {
        partyId: farhan._id,
        date: new Date('2025-04-08T00:00:00+05:00'),
        voucherType: 'DV',
        voucherNo: 3890,
        narration: 'salary',
        debit: 44000,
        credit: 0,
        sourceType: 'DAYBOOK',
      },
      // 30/04 JV — salary accrual → Credit 42,666
      {
        partyId: farhan._id,
        date: new Date('2025-04-30T00:00:00+05:00'),
        voucherType: 'JV',
        voucherNo: 82,
        narration: 'salary',
        debit: 0,
        credit: 42666,
        sourceType: 'JOURNAL',
      },
    ]);
    return farhan;
  }

  it('computes 42,784 Cr from OP + DV + JV entries (44,118 Cr − 44,000 + 42,666)', async () => {
    const farhan = await seedFarhanLedger();
    const bal = await getPartyBalance(farhan._id, '2025-04-30');

    expect(bal.amount).toBe(EXPECTED.farhanClosingAmount); // 42,784
    expect(bal.side).toBe('CR'); // shop owes him → Credit
    expect(bal.signedBalance).toBe(-EXPECTED.farhanClosingAmount); // < 0 ⇒ Cr
  });

  it('a Credit balance is a NEGATIVE signed number (never a bare positive shown as Cr)', async () => {
    const farhan = await seedFarhanLedger();
    const bal = await getPartyBalance(farhan._id, '2025-04-30');
    expect(bal.signedBalance).toBeLessThan(0);
    expect(bal.side).not.toBe('DR');
  });

  it('a party whose entries net to ZERO shows side NONE and amount 0 (never "0 Cr"/"0 Dr")', async () => {
    const party = await Party.create({
      accountCode: '2201009',
      name: 'settled employee',
      type: 'EMPLOYEE',
      openingBalance: 44118,
      openingType: 'CR',
      openingDate: new Date('2025-04-01'),
    });
    // OP credit 44,118 fully cancelled by a DV debit 44,118 → net 0.
    await ledgerEntries().insertMany([
      {
        partyId: party._id,
        date: new Date('2025-04-01T00:00:00+05:00'),
        voucherType: 'OP',
        voucherNo: 0,
        narration: 'Opening balance',
        debit: 0,
        credit: 44118,
        sourceType: 'OPENING',
      },
      {
        partyId: party._id,
        date: new Date('2025-04-10T00:00:00+05:00'),
        voucherType: 'DV',
        voucherNo: 7,
        narration: 'full settlement',
        debit: 44118,
        credit: 0,
        sourceType: 'DAYBOOK',
      },
    ]);

    const bal = await getPartyBalance(party._id, '2025-04-30');
    expect(bal.signedBalance).toBe(0);
    expect(bal.amount).toBe(0);
    expect(bal.side).toBe('NONE'); // not 'DR', not 'CR' → displays as plain "0"
  });
});

// ===========================================================================
// uptoDate — "as of" covers the WHOLE shop-local day (Asia/Karachi, half-open)
// ===========================================================================
describe('uptoDate — whole shop-local day boundary (Asia/Karachi)', () => {
  it('counts an entry at 23:59 on uptoDate but NOT one at 00:00 the next day', async () => {
    const party = await Party.create({
      accountCode: '1101009',
      name: 'boundary co',
      type: 'CUSTOMER',
      openingBalance: 0,
      openingType: 'DR',
      openingDate: new Date('2025-07-24'),
    });
    await ledgerEntries().insertMany([
      // 24/07 23:59 Karachi (= 24/07 18:59 UTC) — inside [24/07 00:00, 25/07 00:00) Karachi
      {
        partyId: party._id,
        date: new Date('2025-07-24T23:59:00+05:00'),
        voucherType: 'DV',
        voucherNo: 1,
        narration: 'late on 24th',
        debit: 100,
        credit: 0,
        sourceType: 'DAYBOOK',
      },
      // 25/07 00:00 Karachi (= 24/07 19:00 UTC) — first instant of the NEXT day → excluded
      {
        partyId: party._id,
        date: new Date('2025-07-25T00:00:00+05:00'),
        voucherType: 'DV',
        voucherNo: 2,
        narration: 'midnight into 25th',
        debit: 100,
        credit: 0,
        sourceType: 'DAYBOOK',
      },
    ]);

    // As of 24/07 → only the 23:59 entry counts. This is closing(24) = 100.
    const asOf24 = await getPartyBalance(party._id, '2025-07-24');
    expect(asOf24.amount).toBe(100);
    expect(asOf24.side).toBe('DR');

    // As of 25/07 → both count (200). Since closing(24) = 100 and only the
    // 00:00-on-25 entry is new, opening(25) = closing(24) = 100. No entry is
    // double-counted or dropped at the day boundary.
    const asOf25 = await getPartyBalance(party._id, '2025-07-25');
    expect(asOf25.amount).toBe(200);
  });
});

// ===========================================================================
// R2 — CASH vs CREDIT decided by the party on the line
// R6 — PROFIT   R7 — CASH   (all read off the posted 24/07 day)
// ===========================================================================
describe('24/07/2025 posted day', () => {
  let ids;
  let dayId;

  beforeEach(async () => {
    ids = await seedMasters();
    dayId = await insertDayBook(build0724Draft(ids));
  });

  // R3 — negative qty must never be rejected
  it('R3 — posts without throwing even though lines carry negative qty (returns)', async () => {
    await expect(postDayBook(dayId)).resolves.toBeDefined();
  });

  it('R2 — splits cashSale 6,700 / creditSale 12,500 / totalSale 19,200 by party presence', async () => {
    await postDayBook(dayId);
    const day = await readDayBook(dayId);

    expect(day.totals.cashSale).toBe(EXPECTED.cashSale);
    expect(day.totals.creditSale).toBe(EXPECTED.creditSale);
    expect(day.totals.totalSale).toBe(EXPECTED.totalSale);
  });

  it('R6 — totalProfit is −6,100 and is NOT clamped at zero', async () => {
    await postDayBook(dayId);
    const day = await readDayBook(dayId);

    expect(day.totals.totalProfit).toBe(EXPECTED.totalProfit); // −6,100
    expect(day.totals.totalProfit).toBeLessThan(0); // genuinely negative

    // Individual loss-making / return lines keep their signed profit (no clamp).
    const k44Credit = day.sales.find((l) => l.qty === 50 && l.rate === 2000);
    expect(k44Credit.profit).toBe(EXPECTED.k44CreditLineProfit); // −10,000
    const k30Return = day.sales.find((l) => l.qty === -77);
    expect(k30Return.profit).toBe(EXPECTED.k30ReturnLineProfit); // +7,700
  });

  it('R6 — costRate is frozen onto the line at post time (later cost edits do not rewrite it)', async () => {
    await postDayBook(dayId);

    const before = await readDayBook(dayId);
    const k30Line = before.sales.find((l) => l.qty === -77);
    expect(k30Line.costRate).toBe(EXPECTED.k30Cost); // frozen 1,500

    // Admin edits the product cost afterwards…
    await Product.updateOne({ code: 'K30' }, { $set: { costRate: 9999 } });

    // …the already-posted line still carries the frozen cost.
    const after = await readDayBook(dayId);
    const k30LineAfter = after.sales.find((l) => l.qty === -77);
    expect(k30LineAfter.costRate).toBe(EXPECTED.k30Cost); // still 1,500
    expect(k30LineAfter.profit).toBe(EXPECTED.k30ReturnLineProfit); // still +7,700
  });

  it('R7 — netCash 84,157, and a cash PAYMENT is NOT counted as an expense', async () => {
    await postDayBook(dayId);
    const day = await readDayBook(dayId);

    // Payments and expenses are kept in two separate totals…
    expect(day.totals.totalPayments).toBe(EXPECTED.paidCash); // 90,000
    expect(day.totals.totalExpenses).toBe(EXPECTED.shopExpenses); // 92,840

    // …and both are subtracted exactly once.
    expect(day.totals.netCash).toBe(EXPECTED.netCash); // 84,157
    expect(getCashBalanceInputSanity(day.totals)).toBe(EXPECTED.netCash);
  });

  it('R7 — getCashBalance(uptoDate) returns the closing cash 84,157', async () => {
    await postDayBook(dayId);
    const cash = await getCashBalance(UPTO);
    expect(cash).toBe(EXPECTED.netCash); // 84,157
  });

  it('R5/R3 — getStock(K30) closes at 628 (551 − (−77)); the return INCREASED stock', async () => {
    await postDayBook(dayId);
    const closing = await getStock(ids.products.K30._id, UPTO);
    expect(closing).toBe(EXPECTED.k30Closing); // 628
    expect(closing).toBeGreaterThan(EXPECTED.k30Opening); // return added stock
  });

  it('R4 — getStock(K50) closes at 2 from opening 0 (negative stock allowed, no error)', async () => {
    await postDayBook(dayId);
    const closing = await getStock(ids.products.K50._id, UPTO);
    expect(closing).toBe(EXPECTED.k50Closing); // 2
  });

  it('R6 — getCostRate reads the FIXED product cost (1,500 for K30)', async () => {
    const rate = await getCostRate(ids.products.K30._id, UPTO);
    expect(rate).toBe(EXPECTED.k30Cost); // 1,500
  });
});

// Local re-derivation of net cash from the day totals, used to assert that
// payments and expenses are two independent subtractions (R7), not one.
function getCashBalanceInputSanity(t) {
  return EXPECTED.openingCash + t.totalReceipts + t.cashSale - t.totalPayments - t.totalExpenses;
}

// ===========================================================================
// R10/R11 — POSTING: atomic, idempotent, scoped unpost, no gaps
// ===========================================================================
describe('R10/R11 — posting engine', () => {
  it('writes derived rows keyed by sourceId = dayBook._id', async () => {
    const ids = await seedMasters();
    const dayId = await insertDayBook(build0724Draft(ids));

    await postDayBook(dayId);

    const ledgerCount = await ledgerEntries().countDocuments({ sourceId: dayId });
    const stockCount = await stockTx().countDocuments({ sourceId: dayId });
    expect(ledgerCount).toBeGreaterThan(0);
    expect(stockCount).toBeGreaterThan(0);

    const day = await readDayBook(dayId);
    expect(day.status).toBe('POSTED');
  });

  it('is idempotent — posting twice does not duplicate derived rows', async () => {
    const ids = await seedMasters();
    const dayId = await insertDayBook(build0724Draft(ids));

    await postDayBook(dayId);
    const ledgerAfterFirst = await ledgerEntries().countDocuments({ sourceId: dayId });
    const stockAfterFirst = await stockTx().countDocuments({ sourceId: dayId });

    await postDayBook(dayId); // second call — must be a no-op

    expect(await ledgerEntries().countDocuments({ sourceId: dayId })).toBe(ledgerAfterFirst);
    expect(await stockTx().countDocuments({ sourceId: dayId })).toBe(stockAfterFirst);
  });

  it('is atomic — a failing post writes NOTHING and leaves the day DRAFT', async () => {
    await seedSetting();
    // A sale line that references a non-existent product must abort the post.
    const dayId = await insertDayBook({
      date: new Date('2025-07-24'),
      status: 'DRAFT',
      discountOnSale: 0,
      sales: [{ productId: new Types.ObjectId(), partyId: null, qty: 1, rate: 100 }],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(postDayBook(dayId)).rejects.toThrow();

    expect(await ledgerEntries().countDocuments({ sourceId: dayId })).toBe(0);
    expect(await stockTx().countDocuments({ sourceId: dayId })).toBe(0);
    const day = await readDayBook(dayId);
    expect(day.status).toBe('DRAFT');
  });

  it('unpost (of the LATEST day) removes EXACTLY its rows and leaves earlier days untouched', async () => {
    const product = await seedOneProduct();
    await seedSetting(0);

    const day1 = await insertMinimalDraft(new Date('2025-07-24'), product);
    await postDayBook(day1);
    const day2 = await insertMinimalDraft(new Date('2025-07-25'), product); // prev day posted → allowed
    await postDayBook(day2);

    await unpostDayBook(day2); // unpost the LATEST posted day

    // day2's derived rows are gone and it is DRAFT again…
    expect(await ledgerEntries().countDocuments({ sourceId: day2 })).toBe(0);
    expect(await stockTx().countDocuments({ sourceId: day2 })).toBe(0);
    expect((await readDayBook(day2)).status).toBe('DRAFT');

    // …but the earlier day1's rows remain (scoped by sourceId).
    expect(await stockTx().countDocuments({ sourceId: day1 })).toBeGreaterThan(0);
    expect((await readDayBook(day1)).status).toBe('POSTED');
  });

  it('refuses to unpost an EARLIER day while a later day is still posted (chain integrity)', async () => {
    const product = await seedOneProduct();
    await seedSetting(0);

    const day1 = await insertMinimalDraft(new Date('2025-07-24'), product);
    await postDayBook(day1);
    const day2 = await insertMinimalDraft(new Date('2025-07-25'), product);
    await postDayBook(day2);

    // Unposting 24 while 25 is posted would leave 25's frozen opening cash stale.
    await expect(unpostDayBook(day1)).rejects.toThrow(/later day/i);
    expect((await readDayBook(day1)).status).toBe('POSTED'); // unchanged

    // Unpost the latest first, THEN the earlier one is unpostable.
    await unpostDayBook(day2);
    await expect(unpostDayBook(day1)).resolves.toBeDefined();
    expect((await readDayBook(day1)).status).toBe('DRAFT');
  });

  it('refuses to post an EARLIER day out of order when a later day is already posted', async () => {
    const product = await seedOneProduct();
    await seedSetting(0);

    const day2 = await insertMinimalDraft(new Date('2025-07-25'), product);
    await postDayBook(day2); // 24 is absent → allowed
    const day1 = await insertMinimalDraft(new Date('2025-07-24'), product);

    // Posting 24 now would freeze a stale opening for the already-posted 25.
    await expect(postDayBook(day1)).rejects.toThrow(/later day/i);
  });

  it('refuses to post a day when the PREVIOUS day exists but is not posted (no gaps)', async () => {
    const product = await seedOneProduct();
    await seedSetting(0);

    await insertMinimalDraft(new Date('2025-07-23'), product); // exists, still DRAFT
    const day2 = await insertMinimalDraft(new Date('2025-07-24'), product);

    await expect(postDayBook(day2)).rejects.toThrow();
  });

  it('allows posting when the previous day is ABSENT', async () => {
    const product = await seedOneProduct();
    await seedSetting(0);

    const day2 = await insertMinimalDraft(new Date('2025-07-24'), product); // 23/07 does not exist
    await expect(postDayBook(day2)).resolves.toBeDefined();
  });

  it('allows posting when the previous day is an EMPTY draft (must never block)', async () => {
    const product = await seedOneProduct();
    await seedSetting(0);

    // 23/07 exists but has NO lines in any section — treated as if absent.
    await insertDayBook({
      date: new Date('2025-07-23'),
      status: 'DRAFT',
      discountOnSale: 0,
      sales: [],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const day2 = await insertMinimalDraft(new Date('2025-07-24'), product);
    await expect(postDayBook(day2)).resolves.toBeDefined();
  });

  it('allows posting when the previous day is POSTED', async () => {
    const product = await seedOneProduct();
    await seedSetting(0);

    const day1 = await insertMinimalDraft(new Date('2025-07-23'), product);
    await postDayBook(day1);
    const day2 = await insertMinimalDraft(new Date('2025-07-24'), product);

    await expect(postDayBook(day2)).resolves.toBeDefined();
  });
});

// ===========================================================================
// R5 — MULTI-DAY stock chain: closing(day N) == opening(day N+1); openingStock
// is seeded exactly ONCE, never re-added per day.
// ===========================================================================
describe('R5 — multi-day stock chain (K30)', () => {
  it('rolls closing(24) into opening(25): 551 → 628 → 618', async () => {
    const ids = await seedMasters();

    // Day 24/07 — K30 nets −77 (a return) → closing 628.
    const day24 = await insertDayBook(build0724Draft(ids));
    await postDayBook(day24);
    expect(await getStock(ids.products.K30._id, '2025-07-24')).toBe(628);

    // Day 25/07 — a straight K30 sale of qty 10 (previous day posted → allowed).
    const day25 = await insertDayBook({
      date: new Date('2025-07-25'),
      status: 'DRAFT',
      discountOnSale: 0,
      sales: [{ productId: ids.products.K30._id, partyId: null, qty: 10, rate: 1500 }],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await postDayBook(day25);

    // Opening of 25/07 == closing of 24/07 = stock as of the end of the previous day.
    const openingFor25 = await getStock(ids.products.K30._id, '2025-07-24');
    expect(openingFor25).toBe(628);

    // Closing of 25/07 = 628 − 10. The opening stock (551) is counted ONCE as the
    // base, not re-added on day 25 — otherwise this would be 551+77+551−10.
    expect(await getStock(ids.products.K30._id, '2025-07-25')).toBe(618);
  });
});

// ===========================================================================
// R6 / R8 — THE CODE IS THE COST, and purchase P + sale P stay SEPARATE.
// Owner's worked example: buy code-30 goods at 1,425 → purchase P 75; later sell
// at 1,600 → sale P 100; lifetime 175. Cost stays 1,500 throughout (R6.1).
// ===========================================================================
describe('R6/R8 — code is the cost; purchase 1,425 then sale 1,600 → 75 + 100 = 175', () => {
  it('purchase P is 75, sale P is 100, and the cost never moves off 1,500', async () => {
    // Code 30 → cost = 30 × 50 = 1,500, DERIVED (no costRate stored on the product).
    const k30 = await Product.create({
      code: 'K30',
      name: 'Cloth K30',
      openingStock: 0,
    });
    // COST_MINUS_RATE (the owner-confirmed default) with the multiplier that makes
    // code 30 cost 1,500.
    await settings().insertOne({
      openingCash: 0,
      purchaseProfitFormula: 'COST_MINUS_RATE',
      discountAppliesTo: 'CASH',
      codeMultiplier: 50,
      allowNegativeStock: true,
    });

    // getCostRate is derived from the code, before anything is bought.
    expect(await getCostRate(k30._id, '2025-07-24')).toBe(1500);

    // Buy 1 piece at 1,425 (cash purchase) → purchase P = 1,500 − 1,425 = 75.
    const buyDay = await insertDayBook({
      date: new Date('2025-07-24'),
      status: 'DRAFT',
      discountOnSale: 0,
      sales: [],
      purchases: [{ productId: k30._id, partyId: null, qty: 1, rate: 1425 }],
      receipts: [],
      payments: [],
      expenses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await postDayBook(buyDay);
    const buy = await readDayBook(buyDay);
    expect(buy.purchases[0].profit).toBe(75); // 1,500 − 1,425

    // Buying below cost did NOT move the cost (R6.1) — still 1,500.
    expect(await getCostRate(k30._id, '2025-07-25')).toBe(1500);

    // Sell 1 piece at 1,600 the next day (cash sale) → sale P = 1,600 − 1,500 = 100.
    const sellDay = await insertDayBook({
      date: new Date('2025-07-25'),
      status: 'DRAFT',
      discountOnSale: 0,
      sales: [{ productId: k30._id, partyId: null, qty: 1, rate: 1600 }],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await postDayBook(sellDay);
    const sell = await readDayBook(sellDay);
    expect(sell.sales[0].costRate).toBe(1500); // frozen from the code
    expect(sell.sales[0].profit).toBe(100); // 1,600 − 1,500

    // Lifetime profit on that piece = purchase 75 + sale 100 = 175.
    expect(buy.purchases[0].profit + sell.sales[0].profit).toBe(175);
  });
});

// ===========================================================================
// R7 — a CASH purchase (no party) sends cash OUT and brings stock IN.
// ===========================================================================
describe('R7 — cash purchase (no party)', () => {
  it('stock goes UP by 5 and netCash drops by exactly 10,000', async () => {
    const product = await Product.create({
      code: 'K90',
      name: 'Cloth K90',
      costRate: 2000,
      openingStock: 0,
    });
    await seedSetting(50000); // opening cash 50,000

    const dayId = await insertDayBook({
      date: new Date('2025-07-24'),
      status: 'DRAFT',
      discountOnSale: 0,
      sales: [],
      purchases: [{ productId: product._id, partyId: null, qty: 5, rate: 2000 }], // 5 @2,000 = 10,000
      receipts: [],
      payments: [],
      expenses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await postDayBook(dayId);

    // Stock IN by 5 (opening 0 → 5).
    expect(await getStock(product._id, '2025-07-24')).toBe(5);

    // Cash OUT by exactly the purchase amount.
    const day = await readDayBook(dayId);
    expect(day.totals.cashPurchase).toBe(10000);
    expect(day.totals.netCash).toBe(40000); // 50,000 − 10,000
    expect(await getCashBalance('2025-07-24')).toBe(40000);
  });
});
