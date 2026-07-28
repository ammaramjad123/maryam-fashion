import Party from '../models/Party.js';
import Product from '../models/Product.js';
import ExpenseHead from '../models/ExpenseHead.js';
import DayBook from '../models/DayBook.js';
import LedgerEntry from '../models/LedgerEntry.js';
import StockTransaction from '../models/StockTransaction.js';
import Setting from '../models/Setting.js';
import { getPartyBalance } from './ledger.service.js';
import { karachiDay } from '../utils/shopDate.js';

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
