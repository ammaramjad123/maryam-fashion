import DayBook from '../models/DayBook.js';
import { getSetting } from './setting.service.js';
import { nextDayStart } from '../utils/shopDate.js';

/**
 * Closing (net) cash as of the WHOLE shop-local day `uptoDate`.
 *
 *   cash = openingCash + Σreceipts + ΣcashSaleLessDisc − Σpayments − Σexpenses
 *
 * A cash PAYMENT is subtracted separately from a shop EXPENSE — they are never
 * the same total (docs/07 R7).
 */
export async function getCashBalance(uptoDate) {
  const setting = await getSetting();
  const upper = nextDayStart(uptoDate);

  const days = await DayBook.find({ status: 'POSTED', date: { $lt: upper } })
    .select('totals')
    .lean();

  let cash = setting.openingCash || 0;
  for (const d of days) {
    const t = d.totals || {};
    cash +=
      (t.totalReceipts || 0) +
      (t.cashSaleLessDisc || 0) -
      (t.totalPayments || 0) -
      (t.totalExpenses || 0) -
      (t.cashPurchase || 0); // cash purchase = cash OUT
  }
  return cash;
}
