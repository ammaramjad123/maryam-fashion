import DayBook from '../models/DayBook.js';
import { dayStart } from '../utils/shopDate.js';

// Month-to-date CARRIED totals — the running Profit / Cash Sale / Credit Sale /
// Shop Exp that RESET at each calendar-month start (owner: "close month-wise").
// Sums the frozen daily totals of POSTED days in the SAME shop-local month,
// STRICTLY BEFORE `ymd`, so the first sheet of a month carries 0.
//
// Cash is deliberately NOT here: the cash chain (Opening / Net Cash) is real
// money and carries across months untouched.
export async function monthCarried(ymd) {
  const monthStart = dayStart(`${String(ymd).slice(0, 7)}-01`);
  const days = await DayBook.find({
    status: 'POSTED',
    date: { $gte: monthStart, $lt: dayStart(ymd) },
  })
    .select('totals')
    .lean();

  const acc = { profit: 0, cashSale: 0, creditSale: 0, expenses: 0 };
  for (const d of days) {
    const t = d.totals || {};
    acc.profit += t.totalProfit || 0;
    acc.cashSale += t.cashSale || 0;
    acc.creditSale += t.creditSale || 0;
    acc.expenses += t.totalExpenses || 0;
  }
  return acc;
}
