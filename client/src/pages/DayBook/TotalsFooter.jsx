import { money } from '../../lib/format.js';

// One label/value pair. Values are right-aligned tabular figures like the sheet.
function Cell({ label, value, strong, negative }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-stone-200 py-1">
      <span
        className={`text-[11px] uppercase tracking-wide ${strong ? 'text-stone-700' : 'text-stone-500'}`}
      >
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${strong ? 'text-base font-bold' : 'text-[13px]'} ${
          negative ? 'text-red-600' : 'text-stone-800'
        }`}
      >
        {money(value)}
      </span>
    </div>
  );
}

/**
 * The Daily Sale & Expense Sheet footer — the exact four-column summary block
 * from the paper. `t` is the live/authoritative totals object. When `showProfit`
 * is false (a user without viewProfit) the two profit rows are hidden.
 */
export default function TotalsFooter({ t, openingCash, showProfit = true }) {
  return (
    <div className="mt-2 border border-stone-300 bg-[#FCFBF8]">
      <div className="border-b border-stone-300 bg-stone-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-stone-600">
        Day Summary
      </div>
      <div className="grid grid-cols-1 gap-x-8 px-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Cell label="Credit Sale" value={t.creditSale} />
          <Cell label="Cash Sale" value={t.cashSale} />
          <Cell label="Total Sale" value={t.totalSale} strong />
          <Cell label="Discount on Sale" value={t.discountOnSale} />
        </div>
        <div>
          {showProfit && (
            <>
              <Cell label="Profit Sale/Pur" value={t.totalProfit} negative={t.totalProfit < 0} />
              <Cell
                label="Total Profit"
                value={t.totalProfit}
                strong
                negative={t.totalProfit < 0}
              />
            </>
          )}
          <Cell label="Total Purchase" value={t.totalPurchase} />
          <Cell label="Total Sale Less Disc" value={t.totalSaleLessDisc} />
        </div>
        <div>
          <Cell label="Opening Cash" value={openingCash} />
          <Cell label="Cash Rec" value={t.totalReceipts} />
          <Cell label="Cash Sale L/D" value={t.cashSaleLessDisc} />
          <Cell label="Cash Purchase" value={t.cashPurchase} />
        </div>
        <div>
          <Cell label="Total Cash" value={t.totalCash} />
          <Cell label="Paid Cash" value={t.totalPayments} />
          <Cell label="Shop Exp" value={t.totalExpenses} />
          <Cell label="Net Cash" value={t.netCash} strong negative={t.netCash < 0} />
        </div>
      </div>
    </div>
  );
}
