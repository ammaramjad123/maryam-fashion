import Party from '../models/Party.js';
import Product from '../models/Product.js';
import ExpenseHead from '../models/ExpenseHead.js';
import DayBook from '../models/DayBook.js';
import LedgerEntry from '../models/LedgerEntry.js';
import StockTransaction from '../models/StockTransaction.js';
import Setting from '../models/Setting.js';
import { getPartyBalance } from './ledger.service.js';
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
