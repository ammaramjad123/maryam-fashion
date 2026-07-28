import DayBook from '../models/DayBook.js';
import Party from '../models/Party.js';
import Product from '../models/Product.js';
import { getPartyBalances } from './ledger.service.js';
import { getStockAll } from './stock.service.js';
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
  // Everything the dashboard needs, fetched CONCURRENTLY. Party balances and
  // product stock are each a SINGLE aggregation (getPartyBalances / getStockAll)
  // instead of one round-trip per party/product — the old per-item loops were an
  // N+1 that turned into ~90 sequential trips to a remote (Atlas) database.
  const [day, cashInHand, balances, stockMap, parties, products] = await Promise.all([
    findPostedDay(ymd),
    getCashBalance(ymd),
    getPartyBalances(ymd),
    getStockAll(ymd),
    // Parties & Credit (docs/03 Module 2b): who owes us (Dr) and whom we owe (Cr).
    // Banks are NOT debtors/creditors — their balance is our own money held at the
    // bank (docs/07 R9.3); they belong only in the Position report, never here.
    Party.find({ isActive: true, type: { $ne: 'BANK' } })
      .select('_id name accountCode type')
      .lean(),
    Product.find({ isActive: true }).select('_id code name').lean(),
  ]);
  const t = day?.totals || {};

  const receivables = []; // Dr — they owe us
  const payables = []; // Cr — we owe them
  let totalReceivable = 0;
  let totalPayable = 0;
  for (const p of parties) {
    const bal = balances.get(String(p._id));
    if (!bal || bal.side === 'NONE') continue;
    const row = { name: p.name, accountCode: p.accountCode, type: p.type, amount: bal.amount };
    if (bal.side === 'DR') {
      totalReceivable += bal.amount;
      receivables.push(row);
    } else {
      totalPayable += bal.amount;
      payables.push(row);
    }
  }
  receivables.sort((a, b) => b.amount - a.amount);
  payables.sort((a, b) => b.amount - a.amount);

  // Current stock per product → low-stock list. (No stale-cost warning any more:
  // cost is derived from the code and never drifts — docs/07 R6.1.)
  const lowStock = [];
  for (const prod of products) {
    const stock = stockMap.get(String(prod._id)) || 0;
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
