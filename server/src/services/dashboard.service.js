import DayBook from '../models/DayBook.js';
import Party from '../models/Party.js';
import Product from '../models/Product.js';
import { getPartyBalance } from './ledger.service.js';
import { getStock } from './stock.service.js';
import { getCashBalance } from './cash.service.js';
import { dayStart, nextDayStart } from '../utils/shopDate.js';

const LOW_STOCK_THRESHOLD = 10;

function findPostedDay(ymd) {
  return DayBook.findOne({
    status: 'POSTED',
    date: { $gte: dayStart(ymd), $lt: nextDayStart(ymd) },
  }).lean();
}

/**
 * Today's figures for the dashboard. Sale/profit/expense/creditSale come from
 * the posted day's cached totals; cash/receivable/payable/stock come from the
 * Phase-4 engine. Profit and the stale-cost warning are stripped for users
 * without viewProfit by the central profitFilter.
 */
export async function getDashboard(ymd) {
  const day = await findPostedDay(ymd);
  const t = day?.totals || {};

  const cashInHand = await getCashBalance(ymd);

  // Parties & Credit (docs/03 Module 2b): who owes us (jin se lena hai → Dr) and
  // whom we owe (jin ko dena hai → Cr), per party, all from the engine balance.
  // Banks are NOT debtors/creditors — their balance is our own money held at the
  // bank (docs/07 R9.3). They belong only in the Position report, never here.
  const parties = await Party.find({ isActive: true, type: { $ne: 'BANK' } })
    .select('_id name accountCode type')
    .lean();
  const receivables = []; // Dr — they owe us
  const payables = []; // Cr — we owe them
  let totalReceivable = 0;
  let totalPayable = 0;
  for (const p of parties) {
    const bal = await getPartyBalance(p._id, ymd);
    const row = { name: p.name, accountCode: p.accountCode, type: p.type, amount: bal.amount };
    if (bal.side === 'DR') {
      totalReceivable += bal.amount;
      receivables.push(row);
    } else if (bal.side === 'CR') {
      totalPayable += bal.amount;
      payables.push(row);
    }
  }
  receivables.sort((a, b) => b.amount - a.amount);
  payables.sort((a, b) => b.amount - a.amount);

  // Current stock per product → low-stock list. (No stale-cost warning any more:
  // cost is derived from the code and never drifts — docs/07 R6.1.)
  const products = await Product.find({ isActive: true }).select('code name').lean();
  const lowStock = [];
  for (const prod of products) {
    const stock = await getStock(prod._id, ymd);
    if (stock <= LOW_STOCK_THRESHOLD) lowStock.push({ code: prod.code, name: prod.name, stock });
  }
  lowStock.sort((a, b) => a.stock - b.stock);

  return {
    date: ymd,
    posted: day?.status === 'POSTED',
    sale: t.totalSale || 0,
    profit: t.totalProfit || 0, // stripped for non-viewProfit users
    expense: t.totalExpenses || 0,
    creditSale: t.creditSale || 0,
    cashInHand,
    totalReceivable,
    totalPayable,
    receivables,
    payables,
    lowStock,
  };
}
