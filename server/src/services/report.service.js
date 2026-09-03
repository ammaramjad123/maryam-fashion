import DayBook from '../models/DayBook.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Party from '../models/Party.js';
import Product from '../models/Product.js';
import ExpenseHead from '../models/ExpenseHead.js';
import ApiError from '../utils/ApiError.js';
import { getPartyBalance, getPartyBalances } from './ledger.service.js';
import { getStockAll } from './stock.service.js';
import { getCashBalance } from './cash.service.js';
import { dayStart, nextDayStart, addDays, karachiDay } from '../utils/shopDate.js';
import { displayBillNos } from '../utils/billNo.js';

// Reports NEVER recompute business numbers. Totals come from the posted
// DayBook.totals; balances/stock/cash come from the Phase-4 engine services.
// Everything here is name resolution, ordering, and presentation grouping.

function sideOf(signed) {
  const side = signed > 0 ? 'DR' : signed < 0 ? 'CR' : 'NONE';
  return { signedBalance: signed, side, amount: Math.abs(signed) };
}

function findByDate(ymd) {
  return DayBook.findOne({ date: { $gte: dayStart(ymd), $lt: nextDayStart(ymd) } }).lean();
}

// Resolve the product / party / expense-head ids referenced by a day into names.
async function nameMaps(day) {
  const productIds = new Set();
  const partyIds = new Set();
  const headIds = new Set();
  for (const l of [...(day.sales || []), ...(day.purchases || [])]) {
    if (l.productId) productIds.add(String(l.productId));
    if (l.partyId) partyIds.add(String(l.partyId));
  }
  for (const l of [...(day.receipts || []), ...(day.payments || [])]) {
    if (l.partyId) partyIds.add(String(l.partyId));
  }
  for (const l of day.expenses || []) if (l.expenseHeadId) headIds.add(String(l.expenseHeadId));

  const [products, parties, heads] = await Promise.all([
    Product.find({ _id: { $in: [...productIds] } })
      .select('code name')
      .lean(),
    Party.find({ _id: { $in: [...partyIds] } })
      .select('name accountCode')
      .lean(),
    ExpenseHead.find({ _id: { $in: [...headIds] } })
      .select('name')
      .lean(),
  ]);
  return {
    product: Object.fromEntries(products.map((p) => [String(p._id), p])),
    party: Object.fromEntries(parties.map((p) => [String(p._id), p])),
    head: Object.fromEntries(heads.map((h) => [String(h._id), h])),
  };
}

// 1. Daily Sale & Expense Sheet — the flagship paper reproduction.
export async function getDailySale(ymd) {
  const day = await findByDate(ymd);
  if (!day) {
    return {
      date: ymd,
      status: 'NONE',
      pageNo: null,
      openingCash: 0,
      discountOnSale: 0,
      sales: [],
      purchases: [],
      receipts: [],
      payments: [],
      expenses: [],
      creditSaleByParty: [],
      totals: null,
    };
  }
  const m = await nameMaps(day);
  const pcode = (id) => m.product[String(id)]?.code || '?';
  const pname = (id) => (id ? m.party[String(id)]?.name || '?' : null);

  // Bill number is per-BILL (docs/07 R9.1): it prints only on the first row of
  // each bill, blank on continuation rows of the same credit party.
  const billNos = displayBillNos(day.sales || []);
  const sales = (day.sales || []).map((l, i) => ({
    billNo: billNos[i], // null on continuation rows → blank on the sheet
    productCode: pcode(l.productId),
    partyName: pname(l.partyId),
    isCash: !l.partyId,
    qty: l.qty,
    rate: l.rate,
    discount: l.discount || 0, // per-line discount (already folded into profit)
    amount: l.amount,
    profit: l.profit,
  }));
  const purchases = (day.purchases || []).map((l) => ({
    productCode: pcode(l.productId),
    partyName: pname(l.partyId),
    qty: l.qty,
    rate: l.rate,
    amount: l.amount,
    profit: l.profit,
  }));
  const receipts = (day.receipts || []).map((l) => ({
    partyName: pname(l.partyId),
    narration: l.narration,
    amount: l.amount,
  }));
  const payments = (day.payments || []).map((l) => ({
    partyName: pname(l.partyId),
    narration: l.narration,
    amount: l.amount,
  }));
  const expenses = (day.expenses || []).map((l) => ({
    headName: m.head[String(l.expenseHeadId)]?.name || '?',
    narration: l.narration,
    amount: l.amount,
  }));

  // The paper's "Credit Sale" column: credit lines grouped by party.
  const grouped = new Map();
  for (const l of day.sales || []) {
    if (!l.partyId) continue;
    const id = String(l.partyId);
    grouped.set(id, (grouped.get(id) || 0) + l.amount);
  }
  const creditSaleByParty = [...grouped.entries()].map(([id, amount]) => ({
    partyName: m.party[id]?.name || '?',
    amount,
  }));

  // Previous-day reminder figures printed small across the top band (docs/07
  // R9.2) — the last posted day strictly before this one; null → the sheet shows
  // zeros with ticks (as the real 24/07 sheet did).
  const prev = await DayBook.findOne({ status: 'POSTED', date: { $lt: dayStart(ymd) } })
    .sort({ date: -1 })
    .select('date totals')
    .lean();
  const pt = prev?.totals || {};
  const previousDay = prev
    ? {
        date: karachiDay(prev.date),
        // Top-band "Profit" = the previous day's running Total Profit (cumulative),
        // which today's Total Profit builds on. Falls back to its day-profit.
        totalProfit: pt.cumulativeProfit ?? pt.totalProfit ?? 0,
        cashSale: pt.cashSale ?? 0,
        creditSale: pt.creditSale ?? 0,
        totalSale: pt.totalSale ?? 0,
        totalExpenses: pt.totalExpenses ?? 0,
        netCash: pt.netCash ?? 0,
      }
    : null;

  // A seeded "Day Zero" go-live record may carry display-only overrides for
  // figures the per-day model doesn't derive (running Total Profit/Exp/Sale Bank
  // and the top-band reminder). Apply them for THIS record only; every normal
  // day has no override and is unaffected.
  const ov = day.reportOverride;
  const totalsOut = ov?.totals ? { ...(day.totals || {}), ...ov.totals } : day.totals || null;
  const previousDayOut = ov?.previousDay
    ? { date: previousDay?.date ?? null, ...ov.previousDay }
    : previousDay;

  return {
    date: ymd,
    status: day.status,
    pageNo: day.pageNo ?? null,
    openingCash: day.openingCash,
    discountOnSale: day.discountOnSale || 0,
    sales,
    purchases,
    receipts,
    payments,
    expenses,
    creditSaleByParty,
    previousDay: previousDayOut,
    totals: totalsOut,
  };
}

// 2. Daily Stock Report — Name|Opening|Purchase|Amount|Total|Sale|Amount|P|Closing.
export async function getDailyStock(ymd) {
  const day = await findByDate(ymd);
  if (!day || day.status !== 'POSTED') {
    return { date: ymd, status: day?.status || 'NONE', rows: [], totals: null };
  }

  const per = new Map();
  const get = (id) => {
    const k = String(id);
    if (!per.has(k))
      per.set(k, { purchaseQty: 0, purchaseAmount: 0, saleQty: 0, saleAmount: 0, profit: 0 });
    return per.get(k);
  };
  for (const l of day.sales || []) {
    const a = get(l.productId);
    a.saleQty += l.qty;
    a.saleAmount += l.amount;
    a.profit += l.profit || 0;
  }
  for (const l of day.purchases || []) {
    const a = get(l.productId);
    a.purchaseQty += l.qty;
    a.purchaseAmount += l.amount;
    a.profit += l.profit || 0;
  }

  // List EVERY active product that has opening stock or moved today — so the
  // report totals reflect the whole inventory (Opening 2,804 on the real sheet),
  // not just the handful of codes that happened to sell that day.
  const products = await Product.find({ isActive: true }).select('code name codeNumber').lean();
  products.sort((a, b) => (a.codeNumber ?? 0) - (b.codeNumber ?? 0) || a.code.localeCompare(b.code));
  const prev = addDays(ymd, -1);
  const ZERO = { purchaseQty: 0, purchaseAmount: 0, saleQty: 0, saleAmount: 0, profit: 0 };

  const totals = {
    opening: 0,
    purchaseQty: 0,
    purchaseAmount: 0,
    total: 0, // Σ (opening + purchaseQty) — the "Total" column footer
    saleQty: 0,
    saleAmount: 0,
    profit: 0,
    closing: 0,
  };
  // ALL products' opening (prev) and closing (ymd) stock in TWO aggregations,
  // not two getStock round-trips per product (was ~4×N trips to a remote DB).
  const [openingMap, closingMap] = await Promise.all([getStockAll(prev), getStockAll(ymd)]);

  const rows = [];
  for (const p of products) {
    const id = String(p._id);
    const a = per.get(id) || ZERO;
    const opening = openingMap.get(id) || 0; // engine (batched)
    const closing = closingMap.get(id) || 0; // engine (batched)
    const moved = a.saleQty !== 0 || a.purchaseQty !== 0 || a.saleAmount !== 0;
    if (opening === 0 && closing === 0 && !moved) continue; // skip never-stocked codes
    rows.push({
      code: p.code,
      name: p.name,
      opening,
      purchaseQty: a.purchaseQty,
      purchaseAmount: a.purchaseAmount,
      total: opening + a.purchaseQty,
      saleQty: a.saleQty,
      saleAmount: a.saleAmount,
      profit: a.profit,
      closing,
    });
    totals.opening += opening;
    totals.purchaseQty += a.purchaseQty;
    totals.purchaseAmount += a.purchaseAmount;
    totals.total += opening + a.purchaseQty;
    totals.saleQty += a.saleQty;
    totals.saleAmount += a.saleAmount;
    totals.profit += a.profit;
    totals.closing += closing;
  }
  return { date: ymd, status: 'POSTED', rows, totals };
}

// 3. Ledger Book (Khata) — OP/DV/CV/JV with a running Dr/Cr balance.
export async function getLedger(partyId, from, to) {
  const party = await Party.findById(partyId).select('name accountCode type').lean();
  if (!party) throw ApiError.notFound('Party not found');

  const opening = await getPartyBalance(partyId, addDays(from, -1)); // engine
  const entries = await LedgerEntry.find({
    partyId,
    date: { $gte: dayStart(from), $lt: nextDayStart(to) },
  })
    .sort({ date: 1, createdAt: 1, _id: 1 })
    .lean();

  let running = opening.signedBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = entries.map((e) => {
    running += (e.debit || 0) - (e.credit || 0);
    const isOpening = e.voucherType === 'OP';
    if (!isOpening) {
      totalDebit += e.debit || 0;
      totalCredit += e.credit || 0;
    }
    return {
      voucherNo: e.voucherNo,
      type: e.voucherType,
      date: karachiDay(e.date), // shop-local 'YYYY-MM-DD', not the raw UTC instant
      narration: e.narration,
      // The OP line shows its amount only in the Balance column (matches the paper).
      debit: isOpening ? null : e.debit || 0,
      credit: isOpening ? null : e.credit || 0,
      balance: sideOf(running),
    };
  });

  const closing = await getPartyBalance(partyId, to); // engine
  return {
    party,
    from,
    to,
    opening: sideOf(opening.signedBalance),
    rows,
    totalDebit,
    totalCredit,
    closing: sideOf(closing.signedBalance),
  };
}

// 4. Cash Book — per posted day: opening + in − out = closing.
export async function getCashBook(from, to) {
  const days = await DayBook.find({
    status: 'POSTED',
    date: { $gte: dayStart(from), $lt: nextDayStart(to) },
  })
    .sort({ date: 1 })
    .lean();

  const rows = days.map((d) => {
    const t = d.totals || {};
    const cashIn = (t.totalReceipts || 0) + (t.cashSaleLessDisc || 0);
    const cashOut = (t.totalPayments || 0) + (t.totalExpenses || 0) + (t.cashPurchase || 0);
    return {
      date: karachiDay(d.date), // shop-local 'YYYY-MM-DD'
      opening: d.openingCash || 0,
      cashIn,
      cashOut,
      closing: t.netCash || 0,
    };
  });

  return {
    from,
    to,
    openingCash: await getCashBalance(addDays(from, -1)), // engine
    rows,
    closingCash: await getCashBalance(to), // engine
  };
}

// 6. Profit report (Admin / viewProfit only) — per-day profit over a range.
export async function getProfitReport(from, to) {
  const days = await DayBook.find({
    status: 'POSTED',
    date: { $gte: dayStart(from), $lt: nextDayStart(to) },
  })
    .sort({ date: 1 })
    .lean();

  const rows = days.map((d) => ({
    date: karachiDay(d.date), // shop-local 'YYYY-MM-DD'
    sale: d.totals?.totalSale || 0,
    profit: d.totals?.totalProfit || 0,
  }));
  return {
    from,
    to,
    rows,
    totalSale: rows.reduce((s, r) => s + r.sale, 0),
    totalProfit: rows.reduce((s, r) => s + r.profit, 0),
  };
}

// 7. Position — every BANK account with its balance and debit/credit history
// over [from, to] (docs/07 R9.3). Pure reuse of getLedger — no new math, and
// nothing here touches the Day Book or shop cash.
export async function getPosition(from, to) {
  const banks = await Party.find({ type: 'BANK', isActive: true })
    .select('_id')
    .sort({ name: 1 })
    .lean();
  // Each bank's ledger concurrently (was sequential, one round-trip chain each).
  const accounts = await Promise.all(banks.map((b) => getLedger(b._id, from, to)));
  // Grand total = the SUM of every bank's closing balance (same per-account
  // balances already shown), as one figure.
  const grandSigned = accounts.reduce((s, a) => s + a.closing.signedBalance, 0);
  return {
    from,
    to,
    accounts,
    grandDebit: accounts.reduce((s, a) => s + a.totalDebit, 0),
    grandCredit: accounts.reduce((s, a) => s + a.totalCredit, 0),
    grandTotal: sideOf(grandSigned), // { signedBalance, side, amount }
  };
}

// 5. Outstanding — who owes us (Dr) / whom we owe (Cr), as of today.
export async function getOutstanding() {
  // Exclude BANK parties — a bank is not a debtor/creditor (docs/07 R9.3); its
  // balance is our own money and lives only in the Position report.
  const parties = await Party.find({ isActive: true, type: { $ne: 'BANK' } })
    .select('name accountCode type')
    .lean();
  const today = karachiDay(new Date());
  const balances = await getPartyBalances(today); // one aggregation, not N

  const receivables = [];
  const payables = [];
  for (const p of parties) {
    const bal = balances.get(String(p._id));
    if (!bal) continue;
    if (bal.side === 'DR') receivables.push({ ...p, amount: bal.amount });
    else if (bal.side === 'CR') payables.push({ ...p, amount: bal.amount });
  }
  receivables.sort((a, b) => b.amount - a.amount);
  payables.sort((a, b) => b.amount - a.amount);

  return {
    receivables,
    payables,
    totalReceivable: receivables.reduce((s, p) => s + p.amount, 0),
    totalPayable: payables.reduce((s, p) => s + p.amount, 0),
  };
}
