import mongoose from 'mongoose';
import DayBook from '../models/DayBook.js';
import LedgerEntry from '../models/LedgerEntry.js';
import StockTransaction from '../models/StockTransaction.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import { getSetting } from './setting.service.js';
import { getCashBalance } from './cash.service.js';
import { calcPurchaseProfit, costRateForProduct } from './profit.js';
import { dayStart, nextDayStart, karachiDay, addDays } from '../utils/shopDate.js';
import { isEmptyDay } from '../utils/dayBookEmpty.js';

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// A ledger row from a signed amount: > 0 ⇒ debit, < 0 ⇒ credit.
function ledgerRow(partyId, date, voucherType, voucherNo, narration, signedAmount, sourceId) {
  return {
    partyId,
    date,
    voucherType,
    voucherNo,
    narration,
    debit: signedAmount > 0 ? signedAmount : 0,
    credit: signedAmount < 0 ? -signedAmount : 0,
    sourceType: 'DAYBOOK',
    sourceId,
  };
}

// The register page number follows DATE order, not browse/creation order: it is
// assigned at POST time only, as the next number after the highest POSTED day's
// page (the real book started at 220). Because the no-gap rule forces posting to
// move forward in date order, "highest posted + 1" is date-ordered. An operator
// override already stored on the day is respected.
async function nextPostedPageNo() {
  const last = await DayBook.findOne({ status: 'POSTED', pageNo: { $ne: null } })
    .sort({ pageNo: -1 })
    .select('pageNo')
    .lean();
  return (last?.pageNo ?? 219) + 1;
}

// The posted days form an in-order chain: each day's opening cash/stock/balances
// carry from the previous posted day and are FROZEN at post time. So a day may
// only be posted/unposted at the END of the chain — never behind an already
// posted later day, which would leave that later day's frozen opening stale.
async function assertNoLaterPostedDay(dayBook, action) {
  const ymd = karachiDay(dayBook.date);
  const later = await DayBook.findOne({
    _id: { $ne: dayBook._id },
    status: 'POSTED',
    date: { $gte: nextDayStart(ymd) }, // strictly after this day
  })
    .select('date')
    .sort({ date: 1 })
    .lean();
  if (later) {
    throw ApiError.badRequest(
      `Cannot ${action} ${ymd}: a later day (${karachiDay(later.date)}) is already posted — ` +
        `unpost the later day(s) first`
    );
  }
}

// No gaps in the cash chain: a day posts only if the previous calendar day is
// posted, absent, or EMPTY (docs/07 R11). An empty draft (no lines in any of the
// five sections) is treated as if it doesn't exist — it holds no cash and must
// never block the next day, otherwise merely viewing a date could trap the user.
async function assertPreviousDayPosted(dayBook) {
  const ymd = karachiDay(dayBook.date);
  const prev = addDays(ymd, -1);
  const prevDay = await DayBook.findOne({
    _id: { $ne: dayBook._id },
    date: { $gte: dayStart(prev), $lt: nextDayStart(prev) },
  }).lean();

  if (prevDay && prevDay.status !== 'POSTED' && !isEmptyDay(prevDay)) {
    throw ApiError.badRequest(
      `Cannot post ${ymd}: the previous day (${prev}) has unposted entries`
    );
  }
}

/**
 * Post a DayBook: validate → freeze costRate & compute profit/amounts → write
 * StockTransaction[] + LedgerEntry[] → cache totals → status POSTED.
 * Atomic (one Mongo transaction) and idempotent (a POSTED day is a no-op).
 */
export async function postDayBook(dayBookId) {
  const dayBook = await DayBook.findById(dayBookId).lean();
  if (!dayBook) throw ApiError.notFound('Day book not found');
  if (dayBook.status === 'POSTED') return dayBook; // idempotent

  await assertPreviousDayPosted(dayBook);
  await assertNoLaterPostedDay(dayBook, 'post'); // keep the frozen cash chain in order

  const setting = await getSetting();

  // Load every referenced product up front. A missing product aborts the post
  // before anything is written (this is what makes the post atomic).
  const goodsLines = [...(dayBook.sales || []), ...(dayBook.purchases || [])];
  const productIds = [...new Set(goodsLines.map((l) => String(l.productId)))];
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  for (const id of productIds) {
    if (!productById.has(id)) {
      throw ApiError.badRequest(`Line references unknown product ${id}`);
    }
  }

  const ymd = karachiDay(dayBook.date);
  const openingCash = await getCashBalance(addDays(ymd, -1));

  // Freeze each sale line: costRate DERIVED from the code (R6), amount and
  // (unclamped) profit. The frozen cost is what makes a posted line immutable.
  const sales = (dayBook.sales || []).map((l, i) => {
    const product = productById.get(String(l.productId));
    const costRate = costRateForProduct(product, setting);
    const discount = l.discount || 0; // per-line discount (Rs) — reduces profit only
    return {
      ...l,
      discount,
      amount: l.qty * l.rate, // gross sale — discount does NOT touch amount/cash
      costRate,
      // Discount is subtracted from profit only (owner-chosen): profit falls by
      // the discount while cash and the ledger stay at the full amount.
      profit: (l.rate - costRate) * l.qty - discount, // signed; never clamped
      voucherNo: l.voucherNo ?? 12000 + i,
    };
  });

  const purchases = (dayBook.purchases || []).map((l, i) => {
    const product = productById.get(String(l.productId));
    return {
      ...l,
      amount: l.qty * l.rate,
      profit: calcPurchaseProfit(l, product, setting),
      voucherNo: l.voucherNo ?? 13000 + i,
    };
  });

  const receipts = dayBook.receipts || [];
  const payments = dayBook.payments || [];
  const expenses = dayBook.expenses || [];

  // --- totals (docs/07 R2, R6, R7, R10) ---
  const cashSale = sum(sales.filter((s) => !s.partyId).map((s) => s.amount)); // no party = cash IN
  const creditSale = sum(sales.filter((s) => s.partyId).map((s) => s.amount));
  const totalSale = cashSale + creditSale;
  const cashPurchase = sum(purchases.filter((p) => !p.partyId).map((p) => p.amount)); // no party = cash OUT
  const discountOnSale = dayBook.discountOnSale || 0;
  const cashSaleLessDisc =
    setting.discountAppliesTo === 'CASH' ? cashSale - discountOnSale : cashSale;
  const totalReceipts = sum(receipts.map((r) => r.amount));
  const totalPayments = sum(payments.map((p) => p.amount)); // Paid Cash — not an expense
  const totalExpenses = sum(expenses.map((e) => e.amount)); // Shop Exp
  const totalCash = openingCash + totalReceipts + cashSaleLessDisc;

  const totals = {
    cashSale,
    creditSale,
    totalSale,
    discountOnSale,
    totalSaleLessDisc: totalSale - discountOnSale,
    cashSaleLessDisc,
    totalProfit: sum(sales.map((s) => s.profit)) + sum(purchases.map((p) => p.profit)),
    totalPurchase: sum(purchases.map((p) => p.amount)),
    cashPurchase,
    totalReceipts,
    totalPayments,
    totalExpenses,
    totalCash,
    // Cash out = payments + shop expenses + cash purchases (credit purchases hit the ledger, not cash).
    netCash: totalCash - totalPayments - totalExpenses - cashPurchase,
  };

  // --- derived rows ---
  const stockDocs = [
    ...sales.map((s) => ({
      date: dayBook.date,
      productId: s.productId,
      type: 'SALE',
      qty: s.qty,
      rate: s.rate,
      sourceType: 'DAYBOOK',
      sourceId: dayBook._id,
      narration: 'Sale',
    })),
    ...purchases.map((p) => ({
      date: dayBook.date,
      productId: p.productId,
      type: 'PURCHASE',
      qty: p.qty,
      rate: p.rate,
      sourceType: 'DAYBOOK',
      sourceId: dayBook._id,
      narration: 'Purchase',
    })),
  ];

  const ledgerDocs = [];
  for (const s of sales) {
    if (!s.partyId) continue; // cash sale → cash only, no ledger
    ledgerDocs.push(
      ledgerRow(s.partyId, dayBook.date, 'SALE', s.voucherNo, 'Sale', s.amount, dayBook._id)
    );
  }
  for (const p of purchases) {
    if (!p.partyId) continue; // cash purchase → cash only, no ledger
    // Credit purchase → party CREDIT (we owe them): pass negative.
    ledgerDocs.push(
      ledgerRow(
        p.partyId,
        dayBook.date,
        'PURCHASE',
        p.voucherNo,
        'Purchase',
        -p.amount,
        dayBook._id
      )
    );
  }
  for (const r of receipts) {
    // Cash Receipt (CV) → party CREDIT.
    ledgerDocs.push(
      ledgerRow(r.partyId, dayBook.date, 'CV', 0, r.narration || 'Receipt', -r.amount, dayBook._id)
    );
  }
  for (const p of payments) {
    // Cash Payment (DV) → party DEBIT.
    ledgerDocs.push(
      ledgerRow(p.partyId, dayBook.date, 'DV', 0, p.narration || 'Payment', p.amount, dayBook._id)
    );
  }

  // Assign the register page at post time (date-ordered). Respect an operator
  // override already on the day; otherwise take the next after the highest posted.
  const pageNo = dayBook.pageNo != null ? dayBook.pageNo : await nextPostedPageNo();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (stockDocs.length) await StockTransaction.insertMany(stockDocs, { session });
      if (ledgerDocs.length) await LedgerEntry.insertMany(ledgerDocs, { session });
      await DayBook.updateOne(
        { _id: dayBook._id },
        {
          $set: { sales, purchases, totals, openingCash, pageNo, status: 'POSTED', postedAt: new Date() },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return DayBook.findById(dayBook._id).lean();
}

/**
 * Reverse a posted day: delete exactly the derived rows keyed by this day's
 * sourceId and return it to DRAFT. Atomic; other days are untouched.
 */
export async function unpostDayBook(dayBookId) {
  const dayBook = await DayBook.findById(dayBookId).lean();
  if (!dayBook) throw ApiError.notFound('Day book not found');
  if (dayBook.status !== 'POSTED') return dayBook; // nothing to reverse

  // Only the LATEST posted day may be unposted — otherwise a later posted day's
  // frozen opening cash would be left stale (it carried from this day).
  await assertNoLaterPostedDay(dayBook, 'unpost');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await LedgerEntry.deleteMany({ sourceId: dayBook._id }, { session });
      await StockTransaction.deleteMany({ sourceId: dayBook._id }, { session });
      await DayBook.updateOne(
        { _id: dayBook._id },
        { $set: { status: 'DRAFT' }, $unset: { postedAt: '', totals: '' } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return DayBook.findById(dayBook._id).lean();
}
