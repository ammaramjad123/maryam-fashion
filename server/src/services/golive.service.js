import Party from '../models/Party.js';
import Product from '../models/Product.js';
import ExpenseHead from '../models/ExpenseHead.js';
import DayBook from '../models/DayBook.js';
import LedgerEntry from '../models/LedgerEntry.js';
import StockTransaction from '../models/StockTransaction.js';
import Setting from '../models/Setting.js';
import { getPartyBalance } from './ledger.service.js';
import { saveDraft } from './daybook.service.js';
import { karachiDay, dayStart } from '../utils/shopDate.js';
import { parseCodeNumber } from '../utils/productCode.js';

// Go-Live ("Day Zero") helpers. resetForGoLive wipes all transactional data and
// the demo masters so the shop can start clean; goLiveSummary reads the current
// opening position back so the owner can confirm it against his physical count.
// User accounts are NEVER touched — the admin can still log in after a reset.

// Wipe transactional data + demo masters. Keeps Users. Resets openingCash to 0
// but preserves the tuning fields (codeMultiplier, purchaseProfitFormula, …).
export async function resetForGoLive() {
  const counts = {
    dayBooks: (await DayBook.deleteMany({})).deletedCount,
    ledgerEntries: (await LedgerEntry.deleteMany({})).deletedCount,
    stockTransactions: (await StockTransaction.deleteMany({})).deletedCount,
    products: (await Product.deleteMany({})).deletedCount,
    parties: (await Party.deleteMany({})).deletedCount,
    expenseHeads: (await ExpenseHead.deleteMany({})).deletedCount,
  };
  await Setting.updateOne({}, { $set: { openingCash: 0 } }, { upsert: true });
  return counts;
}

// Reset for go-live but KEEP the parties (and banks) exactly as they are —
// their opening balances live as OPENING ledger entries, which we preserve.
// Everything else goes to zero:
//   • all day books deleted
//   • all POSTED (non-opening) ledger entries deleted — party/bank openings stay
//   • all stock transactions deleted
//   • every product's openingStock → 0 (products themselves are kept; prune the
//     dead ones by hand with the Delete button on the Products screen)
//   • openingCash → 0
// Expense heads, Setting tuning (codeMultiplier, purchaseProfitFormula) and User
// logins are untouched.
export async function resetKeepParties() {
  const counts = {
    dayBooks: (await DayBook.deleteMany({})).deletedCount,
    postedLedgerEntries: (await LedgerEntry.deleteMany({ sourceType: { $ne: 'OPENING' } }))
      .deletedCount,
    stockTransactions: (await StockTransaction.deleteMany({})).deletedCount,
  };
  const stockCleared = (await Product.updateMany({}, { $set: { openingStock: 0 } })).modifiedCount;
  await Setting.updateOne({}, { $set: { openingCash: 0 } }, { upsert: true });

  counts.productsStockZeroed = stockCleared;
  counts.partiesKept = await Party.countDocuments({});
  counts.openingLedgerEntriesKept = await LedgerEntry.countDocuments({ sourceType: 'OPENING' });
  return counts;
}

// Zero the bank accounts: drop their OPENING ledger entries and set openingBalance
// to 0, so each bank's derived balance becomes 0. Banks are kept (they stay in the
// list) — only their opening money is cleared. Safe to run any time; after a
// go-live reset banks hold only their OPENING row, so this simply removes it.
export async function zeroBankOpenings() {
  const banks = await Party.find({ type: 'BANK' }).select('_id name').lean();
  const ids = banks.map((b) => b._id);
  const openingEntriesRemoved = (
    await LedgerEntry.deleteMany({ partyId: { $in: ids }, sourceType: 'OPENING' })
  ).deletedCount;
  await Party.updateMany({ type: 'BANK' }, { $set: { openingBalance: 0 } });
  return { banks: banks.length, openingEntriesRemoved };
}

// HARD delete every bank account (type BANK) so the owner can add his own from
// scratch. Guarded: refuses if any bank still has a ledger entry (run zeroBanks
// first) — deleting a bank with history would orphan those rows. Returns the
// removed names.
export async function deleteAllBanks() {
  const banks = await Party.find({ type: 'BANK' }).select('_id name').lean();
  const ids = banks.map((b) => b._id);
  const withEntries = await LedgerEntry.distinct('partyId', { partyId: { $in: ids } });
  if (withEntries.length) {
    throw new Error(
      `Refusing: ${withEntries.length} bank(s) still have ledger entries. Run zero:banks first.`
    );
  }
  const removed = (await Party.deleteMany({ _id: { $in: ids } })).deletedCount;
  return { removed, names: banks.map((b) => b.name) };
}

// Re-derive every product's stored codeNumber from its code (docs/07 R6). The
// codeNumber is denormalised and only refreshed when the code changes, so a
// product entered before parseCodeNumber learned to keep the decimal point (e.g.
// 'K24.50' → 2450 instead of 24.5) carries a stale value that 50×'s its cost.
// This recomputes them all and reports what moved. Idempotent — safe to re-run.
export async function recomputeCodeNumbers() {
  const products = await Product.find({}).select('code codeNumber').lean();
  const fixed = [];
  for (const p of products) {
    const correct = parseCodeNumber(p.code);
    if (correct !== p.codeNumber) {
      await Product.updateOne({ _id: p._id }, { $set: { codeNumber: correct } });
      fixed.push({ code: p.code, was: p.codeNumber, now: correct });
    }
  }
  return { scanned: products.length, changed: fixed.length, fixed };
}

// One-time go-live seed. Wipes every DAY record (day books + the stock/ledger
// movements they posted) but KEEPS master data — products (with their opening
// stock), parties/banks and their OPENING ledger balances, expense heads, and
// the Setting tuning. Then sets the opening cash and posts a single "Day Zero"
// whose cached `totals` carry into the first real day:
//   • Day 1's Opening Cash = getCashBalance(Day Zero) = openingCash + Day Zero's
//     net cash movement (from totals). With the owner's figures that is 220,703.
//   • Day 1's "Yesterday" reminder strip = Day Zero's totals.
// Day Zero has NO line items — it is a summary snapshot, not real vouchers, so
// stock and party ledgers are untouched. Idempotent: re-running wipes and
// re-seeds cleanly.
export async function seedDayZero({ dayZeroDate, openingCash, totals, reportOverride }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayZeroDate || ''))) {
    throw new Error('dayZeroDate must be a YYYY-MM-DD date');
  }
  if (!(Number(openingCash) >= 0)) throw new Error('openingCash must be a number >= 0');

  const deleted = {
    dayBooks: (await DayBook.deleteMany({})).deletedCount,
    stockTransactions: (await StockTransaction.deleteMany({})).deletedCount,
    // Keep party/bank OPENING rows; drop only the day-book-derived entries.
    ledgerFromDayBooks: (await LedgerEntry.deleteMany({ sourceType: { $ne: 'OPENING' } }))
      .deletedCount,
  };

  await Setting.updateOne({}, { $set: { openingCash: Number(openingCash) } }, { upsert: true });

  await DayBook.create({
    date: dayStart(dayZeroDate),
    status: 'POSTED',
    openingCash: Number(openingCash),
    pageNo: 219, // so the first real day auto-numbers to 220 (the real book's start)
    sales: [],
    purchases: [],
    receipts: [],
    payments: [],
    expenses: [],
    discountOnSale: 0,
    totals,
    reportOverride, // display-only figures for the report (undefined = none)
    postedAt: new Date(),
  });

  return { deleted, openingCash: Number(openingCash), dayZero: { date: dayZeroDate, totals } };
}

// Canonical Day-Zero DISPLAY figures (the go-live snapshot). Only the Daily Sale
// report reads these; the cash chain uses cashSaleLessDisc / payments / expenses
// (→ Net Cash 220,703) and is independent of the profit/sale display values.
// Tweak here + redeploy + re-run updateDayZeroFigures to change what prints.
const DAY_ZERO_TOTALS = {
  creditSale: 0,
  cashSale: 0,
  totalSale: 0,
  discountOnSale: 0,
  totalSaleLessDisc: 0,
  cashSaleLessDisc: 258600, // drives the cash chain
  totalProfit: -643804, // "Total Profit" (col 2)
  totalPurchase: 0,
  cashPurchase: 0,
  totalReceipts: 0,
  totalPayments: 110000,
  totalExpenses: 71639,
  totalCash: 402342,
  netCash: 220703,
};
const DAY_ZERO_REPORT_OVERRIDE = {
  totals: { profitSalePur: 27500, totalSaleBank: 515300, totalExp: 378349 },
  previousDay: { totalProfit: -292955, cashSale: 256700, totalExpenses: 306710 },
};

// Re-apply the canonical display figures to the existing Day-Zero record (the one
// posted day carrying a reportOverride). Display-only: cash and every other day
// are untouched.
export async function updateDayZeroFigures() {
  const r = await DayBook.updateOne(
    { reportOverride: { $ne: null } },
    { $set: { totals: DAY_ZERO_TOTALS, reportOverride: DAY_ZERO_REPORT_OVERRIDE } }
  );
  if (r.matchedCount === 0) {
    throw new Error('No Day Zero record found (nothing carries a report override).');
  }
  return { matched: r.matchedCount, modified: r.modifiedCount, totalProfit: DAY_ZERO_TOTALS.totalProfit };
}

// The current opening position + any problems, for the Day-Zero confirmation.
export async function goLiveSummary() {
  const today = karachiDay(new Date());

  const products = await Product.find({ isActive: true }).select('code openingStock').lean();
  const openingStockTotal = products.reduce((s, p) => s + (p.openingStock || 0), 0);

  const setting = await Setting.findOne().lean();
  const openingCash = setting?.openingCash || 0;

  const parties = await Party.find({ isActive: true })
    .select('name accountCode type openingBalance openingType openingDate')
    .sort({ type: 1, name: 1 })
    .lean();

  const mapParty = async (p) => {
    const bal = await getPartyBalance(p._id, today);
    return {
      name: p.name,
      accountCode: p.accountCode,
      type: p.type,
      openingBalance: p.openingBalance || 0,
      openingType: p.openingType,
      openingDate: p.openingDate ? karachiDay(p.openingDate) : null,
      amount: bal.amount,
      side: bal.side,
    };
  };
  const bankRows = [];
  const partyRows = [];
  for (const p of parties) {
    const row = await mapParty(p);
    (p.type === 'BANK' ? bankRows : partyRows).push(row);
  }

  // Whether any real (non-opening) transaction exists yet.
  const dayBooks = await DayBook.countDocuments({});
  const postedEntries = await LedgerEntry.countDocuments({ sourceType: { $ne: 'OPENING' } });
  const stockTx = await StockTransaction.countDocuments({});

  const warnings = [];
  if (dayBooks || postedEntries || stockTx) {
    warnings.push(
      `Not a clean slate: ${dayBooks} day book(s), ${postedEntries} non-opening ledger entrie(s), ${stockTx} stock transaction(s) already exist. Run reset:golive first if this is a fresh go-live.`
    );
  }
  if (openingCash === 0) warnings.push('Opening cash is 0 — set it during Day-Zero setup.');
  if (products.length === 0) warnings.push('No products yet — add your codes with their opening stock.');
  for (const p of [...partyRows, ...bankRows]) {
    if (p.openingBalance > 0 && !p.openingDate) {
      warnings.push(`${p.name} (${p.accountCode}) has an opening balance but no opening date.`);
    }
  }

  return {
    date: today,
    counts: {
      products: products.length,
      parties: partyRows.length,
      banks: bankRows.length,
      expenseHeads: await ExpenseHead.countDocuments({ isActive: true }),
    },
    openingStockTotal,
    openingCash,
    parties: partyRows,
    banks: bankRows,
    warnings,
  };
}

// Set the opening cash (Day-Zero). Kept here so scripts stay thin.
export async function setOpeningCash(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new Error('Opening cash must be a number >= 0');
  await Setting.updateOne({}, { $set: { openingCash: value } }, { upsert: true });
  return value;
}

// ── ONE-OFF: restore the 31 Aug 2026 day book that was lost to the (now-fixed)
// save error. Re-enters the operator's exact lines (from his screenshots) as a
// DRAFT — it does NOT post. The cousin reviews and posts himself. Codes/names
// are resolved to ids here so the raw data stays human-readable. Remove this
// (and its endpoint/button) once the draft is confirmed.
//
// Sale row: [billNo, code, party|null (null = cash), qty, rate, discount]
const AUG31_SALES = [
  [12037, 'K34', null, 1, 2000, 0],
  [12038, 'K30', null, 4, 1700, 0],
  [12038, 'K34', null, -2, 1800, 0],
  [12038, 'K30', null, -1, 1700, 0],
  [12039, 'K62', null, 2, 3400, 0],
  [12039, 'K61', null, 6, 3400, 200],
  [12040, 'K27', null, 12, 1550, 0],
  [12040, 'K33', null, 16, 1850, 0],
  [12040, 'K38', null, 3, 2300, 0],
  [12041, 'K56', null, 2, 3200, 0],
  [12041, 'K30', null, 1, 1600, 0],
  [12042, 'K31', null, 32, 1650, 0],
  [12042, 'K30', null, 4, 1600, 100],
  [12042, 'K30', null, -1, 1600, 0],
  [12043, 'K22', null, 40, 1225, 0],
  [12043, 'K56', null, 6, 3000, 1000],
  [12044, 'K56', null, 1, 3500, 0],
  [12045, 'K30', null, 2, 1500, 0],
  [12046, 'K30', null, 1, 1700, 0],
  [12047, 'K24', null, 12, 1400, 0],
  [12048, 'K34', null, 22, 1900, 0],
  [12048, 'K36', null, 16, 2100, 0],
  [12048, 'K30', null, 19, 1700, 700],
  [12049, 'K62', null, 1, 3500, 0],
  [12049, 'K68', null, 1, 3600, 0],
  [12050, 'K30', null, 8, 1700, 0],
  [12051, 'K61', null, 1, 3300, 0],
  [12052, 'K60', null, 1, 3300, 0],
  [12053, 'K23', null, 2, 1350, 0],
  [12053, 'K32', null, 1, 1600, 0],
  [12054, 'K68', null, 1, 3500, 0],
  [12055, 'K62', null, 2, 3500, 0],
  [12055, 'K61', null, 2, 3450, 100],
  [12056, 'K33', null, 1, 1800, 0],
  [12057, 'K34', null, 4, 1900, 0],
  [12057, 'K30', null, 12, 1700, 0],
  [12057, 'K22', null, 12, 1200, 100],
  [12058, 'K60', null, 3, 3400, 0],
  [12058, 'K21', null, 12, 1150, 0],
  [12059, 'K32', null, 8, 1850, 0],
  [12059, 'K30', null, 4, 1750, 0],
  [12059, 'K33', null, 4, 1850, 0],
  [12059, 'K33', null, -16, 1850, 0],
  [12060, 'K62', null, 1, 3250, 0],
  [12061, 'K22', null, 1, 1000, 0],
  [12061, 'K24', null, 1, 1900, 0],
  [12062, 'K24', null, 1, 1900, 0],
  [12063, 'K32', null, 1, 1800, 0],
  [12064, 'K62', null, 1, 3300, 0],
  [12065, 'K22', null, 1, 700, 0],
  [12065, 'K22', null, 1, 1300, 0],
  [12066, 'K30', null, 1, 1500, 0],
  [12067, 'K56', null, 1, 3400, 0],
  [12067, 'K32', null, 1, 1800, 0],
  [12067, 'K30', null, 1, 1500, 0],
  [12068, 'K32', null, 4, 1800, 0],
  [12068, 'K34', null, 4, 1950, 0],
  [12069, 'K60', 'Rashid Unit', 21, 3000, 0],
  [12069, 'K70', 'Rashid Unit', 15, 3500, 0],
  [12070, 'K23', 'SY Collection', 164, 1150, 0],
  [12070, 'K22', 'SY Collection', 56, 1100, 0],
  [12070, 'K27', 'SY Collection', 92, 1350, 0],
  [12070, 'K36', 'SY Collection', 156, 1800, 0],
  [12070, 'K34', 'SY Collection', 104, 1700, 0],
  [12070, 'K33', 'SY Collection', 14, 1650, 0],
];
// Purchase row: [code, supplier, qty, rate]  (all credit)
const AUG31_PURCHASES = [
  ['K24', 'Haji Riyaz', 32, 1200],
  ['K34', 'Haji Riyaz', 12, 1700],
  ['K68', 'Haji Riyaz', 4, 3400],
  ['K22', 'Haji Riyaz', 32, 1100],
  ['K36', 'SY Collection', 128, 1800],
  ['K24', 'SY Collection', 168, 1200],
  ['K65', 'SY Collection', 21, 3250],
];
// Payment row: [party, amount]
const AUG31_PAYMENTS = [
  ['Rana Akhter', 30000],
  ['Bebe Hafizabad', 16200],
  ['Bebe Hafizabad', 8100],
  ['Rashid Unit', 5000],
  ['Rana Akhter', 30000],
  ['Shehbaz Unit', 20000],
];

export async function restoreAug31Draft() {
  const date = '2026-08-31';
  const products = await Product.find({}).select('code').lean();
  const byCode = new Map(products.map((p) => [String(p.code).toUpperCase(), p._id]));
  const parties = await Party.find({}).select('name').lean();
  const byName = new Map(parties.map((p) => [String(p.name).trim().toLowerCase(), p._id]));

  const unresolved = new Set();
  const prod = (code) => {
    const id = byCode.get(String(code).toUpperCase());
    if (!id) unresolved.add(`product code "${code}"`);
    return id;
  };
  const pty = (name) => {
    if (!name) return null;
    const id = byName.get(String(name).trim().toLowerCase());
    if (!id) unresolved.add(`party "${name}"`);
    return id;
  };

  const sales = AUG31_SALES.map((row, i) => {
    const [billNo, code, party, qty, rate, discount] = row;
    const sameBill = i > 0 && AUG31_SALES[i - 1][0] === billNo;
    return {
      billNo: sameBill ? undefined : billNo, // number on the bill's first row only
      sameBill,
      productId: prod(code),
      partyId: pty(party),
      qty,
      rate,
      discount,
    };
  });
  const purchases = AUG31_PURCHASES.map(([code, supplier, qty, rate]) => ({
    productId: prod(code),
    partyId: pty(supplier),
    qty,
    rate,
    discount: 0,
  }));
  const payments = AUG31_PAYMENTS.map(([party, amount]) => ({
    partyId: pty(party),
    narration: '',
    amount,
  }));

  if (unresolved.size) {
    throw new Error(
      `Cannot restore — these are not in the system: ${[...unresolved].join(', ')}. ` +
        `Add them first, then retry.`
    );
  }

  // Save as DRAFT only (NEVER post) — the cousin reviews and posts himself.
  const { day } = await saveDraft(date, {
    sales,
    purchases,
    receipts: [],
    payments,
    expenses: [],
    discountOnSale: 0,
  });

  return {
    date,
    status: day.status, // 'DRAFT'
    saved: { sales: sales.length, purchases: purchases.length, payments: payments.length },
  };
}
