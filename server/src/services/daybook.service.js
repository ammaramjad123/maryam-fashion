import DayBook from '../models/DayBook.js';
import ApiError from '../utils/ApiError.js';
import { getCashBalance } from './cash.service.js';
import { postDayBook, unpostDayBook } from './posting.service.js';
import { validateSections } from '../validators/daybook.validator.js';
import { dayStart, nextDayStart, addDays, karachiDay } from '../utils/shopDate.js';
import { isEmptyDay } from '../utils/dayBookEmpty.js';

// Find the (single) DayBook for a shop-local day, if it exists.
function findByDate(ymd) {
  return DayBook.findOne({ date: { $gte: dayStart(ymd), $lt: nextDayStart(ymd) } });
}

// Opening cash for a day = closing cash of the previous day (or Setting.openingCash).
function openingCashFor(ymd) {
  return getCashBalance(addDays(ymd, -1));
}

// docs/07 R9.2 — the small figures across the top of the sheet are the LAST
// posted day's headline totals, reprinted as a reminder. NOT inputs; the system
// fills them from the most recent posted day strictly before this one.
async function previousDayReminders(ymd) {
  const prev = await DayBook.findOne({ status: 'POSTED', date: { $lt: dayStart(ymd) } })
    .sort({ date: -1 })
    .select('date totals')
    .lean();
  if (!prev) return null;
  const t = prev.totals || {};
  return {
    date: karachiDay(prev.date), // 'YYYY-MM-DD' shop-local, not the UTC instant

    totalProfit: t.totalProfit ?? 0, // stripped for non-viewProfit users
    cashSale: t.cashSale ?? 0,
    creditSale: t.creditSale ?? 0,
    totalSale: t.totalSale ?? 0,
    totalExpenses: t.totalExpenses ?? 0,
    netCash: t.netCash ?? 0,
  };
}

// The next bill number to auto-assign (docs/07 R9.1): continue the sequence from
// the highest bill number on any POSTED day. The real book started around 12037.
async function nextBillNo() {
  const posted = await DayBook.find({ status: 'POSTED' }).select('sales.billNo').lean();
  let max = 12036; // so the first-ever bill is 12037
  for (const d of posted) {
    for (const s of d.sales || []) {
      if (typeof s.billNo === 'number' && s.billNo > max) max = s.billNo;
    }
  }
  return max + 1;
}

// Keep only operator-entered fields; the engine computes amount/costRate/profit.
// qty/rate stay as typed (decimals allowed — docs/07 R13, never rounded here).
const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const cleanSaleOrPurchase = (l) => ({
  billNo: num(l.billNo), // docs/07 R9.1 — undefined when blank
  sameBill: !!l.sameBill, // manual bill grouping (sales); ignored on purchases
  partyId: l.partyId || null,
  productId: l.productId,
  qty: Number(l.qty),
  rate: Number(l.rate),
  discount: Number(l.discount) || 0, // per-line discount (sales); reduces profit only
});
const cleanCashLine = (l) => ({
  partyId: l.partyId,
  narration: l.narration || '',
  amount: Number(l.amount),
});
const cleanExpense = (l) => ({
  expenseHeadId: l.expenseHeadId,
  narration: l.narration || '',
  amount: Number(l.amount),
});

// GET — return the day for VIEWING. Never persists: if no day exists yet, we
// return an in-memory empty draft. A DayBook document is only created when the
// user actually saves content (saveDraft). This is what stops "just opening a
// date" from littering empty drafts that then block the next day's post.
export async function getDay(ymd) {
  // The four reads are independent — run them CONCURRENTLY instead of awaiting in
  // series (four sequential round-trips to a remote DB is what made this slow).
  const [day, openingCash, previousDay, nextBill] = await Promise.all([
    findByDate(ymd),
    openingCashFor(ymd),
    previousDayReminders(ymd),
    nextBillNo(),
  ]);
  const dayObj = day
    ? day.toObject()
    : {
        date: dayStart(ymd),
        status: 'DRAFT',
        pageNo: null, // assigned at POST time only (date-ordered), never on view
        sales: [],
        purchases: [],
        receipts: [],
        payments: [],
        expenses: [],
        discountOnSale: 0,
        _transient: true, // not yet saved to the database
      };
  return {
    day: dayObj,
    openingCash,
    previousDay,
    nextBillNo: nextBill, // base for auto-numbering new bills (R9.1)
  };
}

// PUT — replace the whole day's five sections (stays DRAFT). A posted day is locked.
export async function saveDraft(ymd, payload) {
  let day = await findByDate(ymd);
  if (day && day.status === 'POSTED') {
    throw ApiError.conflict(`${ymd} is posted; unpost it before editing`);
  }

  const cleaned = {
    sales: (payload.sales || []).map(cleanSaleOrPurchase),
    purchases: (payload.purchases || []).map(cleanSaleOrPurchase),
    receipts: (payload.receipts || []).map(cleanCashLine),
    payments: (payload.payments || []).map(cleanCashLine),
    expenses: (payload.expenses || []).map(cleanExpense),
  };

  // Never CREATE a document for an empty payload — that's the whole point: no
  // day should exist until it has real content. (An already-existing day may be
  // saved even when emptied, e.g. the user deliberately clears a mistake.)
  if (!day && isEmptyDay(cleaned)) {
    return {
      day: {
        date: dayStart(ymd),
        status: 'DRAFT',
        pageNo: null, // assigned at POST time only
        ...cleaned,
        discountOnSale: Number(payload.discountOnSale) || 0,
        _transient: true,
      },
      openingCash: await openingCashFor(ymd),
    };
  }

  if (!day) day = await DayBook.create({ date: dayStart(ymd), status: 'DRAFT' });

  // pageNo is assigned at post time, but an operator may override it early.
  if (payload.pageNo !== undefined && payload.pageNo !== '' && payload.pageNo !== null) {
    day.pageNo = Number(payload.pageNo);
  }
  day.sales = cleaned.sales;
  day.purchases = cleaned.purchases;
  day.receipts = cleaned.receipts;
  day.payments = cleaned.payments;
  day.expenses = cleaned.expenses;
  day.discountOnSale = Number(payload.discountOnSale) || 0;
  await day.save();

  return { day: day.toObject(), openingCash: await openingCashFor(ymd) };
}

// POST — re-validate the stored day, then hand off to the Phase-4 engine.
export async function postByDate(ymd) {
  const day = await findByDate(ymd);
  if (!day) throw ApiError.notFound(`No day book exists for ${ymd}`);
  validateSections(day.toObject());
  return postDayBook(day._id);
}

// UNPOST — reverse via the Phase-4 engine.
export async function unpostByDate(ymd) {
  const day = await findByDate(ymd);
  if (!day) throw ApiError.notFound(`No day book exists for ${ymd}`);
  return unpostDayBook(day._id);
}

// LIST — days in a date range, with cached totals for a quick overview.
export async function listDays({ from, to, status } = {}) {
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = dayStart(from);
    if (to) filter.date.$lt = nextDayStart(to);
  }
  if (status) filter.status = status;

  const items = await DayBook.find(filter)
    .sort({ date: 1 })
    .select('date status totals openingCash')
    .lean();
  return { items };
}
