import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { downloadCsv } from '../../lib/csv.js';
import { fmt } from '../../lib/format.js';
import { prettyDay, todayYmd, isValidYmd } from '../../lib/day.js';
import ReportShell from './ReportShell.jsx';
import PageSize from './PageSize.jsx';

// '2025-07-24' -> 'Thursday, July 24, 2025' (zone-agnostic string math).
const WEEKDAY = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
function longDate(ymd) {
  if (!isValidYmd(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAY[dt.getUTCDay()]}, ${MONTH[m - 1]} ${d}, ${y}`;
}

// Negatives print RED on screen and BLACK on paper (the @media print rule in
// index.css maps `.paper .text-red-600` → black).
const N = (v, blank = false) => {
  const neg = Number(v) < 0;
  return <span className={neg ? 'text-red-600' : ''}>{fmt(v, { blankZero: blank })}</span>;
};

// The Name cell of a sale line: billNo (tiny) · code · party (blank = cash).
function SaleName({ l }) {
  return (
    <span>
      {l.billNo != null && <sup className="mr-1 text-[9px] font-normal">{l.billNo}</sup>}
      <b>{l.productCode}</b>
      {l.partyName ? ` ${l.partyName}` : ''}
    </span>
  );
}

/**
 * The Daily Sale & Expenses Sheet — a 1:1 reproduction of the printed paper:
 * a top band, six sections laid ACROSS in one full-ruled grid, a four-column
 * summary box, and blank space for the owner's signature. Rendered identically
 * on screen, on Ctrl+P and in the PDF (one layout).
 */
export function DailySaleSheet({ data, date }) {
  const t = data.totals || {};
  // Profit columns/rows only when the server did not strip profit (viewProfit).
  const showProfit = !!(data.totals && 'totalProfit' in data.totals);
  const goodsWidth = showProfit ? 5 : 4; // Name|Qty|@|Amt(|P)

  const sales = data.sales || [];
  const purchases = data.purchases || [];
  const receipts = data.receipts || [];
  const payments = data.payments || [];
  const expenses = data.expenses || [];
  const credit = data.creditSaleByParty || [];
  const maxRows = Math.max(
    sales.length,
    purchases.length,
    receipts.length,
    payments.length,
    expenses.length,
    credit.length,
    1
  );

  const sum = (arr, k) => arr.reduce((s, r) => s + Number(r[k] || 0), 0);
  const saleQty = sum(sales, 'qty');
  const saleProfit = sum(sales, 'profit');
  const purQty = sum(purchases, 'qty');
  const purAmt = sum(purchases, 'amount');
  const purProfit = sum(purchases, 'profit');

  // --- cell builders (keys are prefixed so a whole <tr> stays unique) ---------
  const empties = (n, p) => Array.from({ length: n }).map((_, k) => <td key={p + k} />);
  function saleCells(l, p) {
    if (!l) return empties(goodsWidth, p);
    return [
      <td key={p + 'n'}>
        <SaleName l={l} />
      </td>,
      <td key={p + 'q'} className="paper-num">
        {N(l.qty)}
      </td>,
      <td key={p + 'r'} className="paper-num">
        {N(l.rate)}
      </td>,
      <td key={p + 'a'} className="paper-num">
        {N(l.amount)}
      </td>,
      ...(showProfit
        ? [
            <td key={p + 'p'} className="paper-num">
              {N(l.profit)}
            </td>,
          ]
        : []),
    ];
  }
  function amtCells(l, nameKey, p) {
    if (!l) return empties(2, p);
    return [
      <td key={p + 'n'}>{l[nameKey]}</td>,
      <td key={p + 'a'} className="paper-num">
        {N(l.amount)}
      </td>,
    ];
  }

  // Purchase Name should carry the supplier too — fold it into the code cell.
  function PurName({ l }) {
    return (
      <span>
        <b>{l.productCode}</b>
        {l.partyName ? ` ${l.partyName}` : ''}
      </span>
    );
  }
  function purCells(l, p) {
    if (!l) return empties(goodsWidth, p);
    return [
      <td key={p + 'n'}>
        <PurName l={l} />
      </td>,
      <td key={p + 'q'} className="paper-num">
        {N(l.qty)}
      </td>,
      <td key={p + 'r'} className="paper-num">
        {N(l.rate)}
      </td>,
      <td key={p + 'a'} className="paper-num">
        {N(l.amount)}
      </td>,
      ...(showProfit
        ? [
            <td key={p + 'p'} className="paper-num">
              {N(l.profit)}
            </td>,
          ]
        : []),
    ];
  }

  // Previous-day reminder figures (docs/07 R9.2) — zeros with ticks when absent.
  const pd = data.previousDay;
  const reminders = [
    ['Profit', pd?.totalProfit ?? 0],
    ['Cash Sale', pd?.cashSale ?? 0],
    ['Shop Exp', pd?.totalExpenses ?? 0],
  ];

  // Bottom summary box — four columns, exact labels/order of the paper.
  const col1 = [
    ['Credit Sale', N(t.creditSale)],
    ['Cash Sale', N(t.cashSale)],
    ['Total Sale', N(t.totalSale)],
    ['Discount on Sale', N(t.discountOnSale || 0)],
  ];
  const col2 = [
    ...(showProfit
      ? [
          ['Profit Sale/Pur', N(t.totalProfit)],
          ['Total Profit', N(t.totalProfit)],
        ]
      : []),
    ['Total Sale Less Disc', N(t.totalSaleLessDisc)],
  ];
  const col3 = [
    ['Opening Cash', N(data.openingCash)],
    ['Cash Rec', N(t.totalReceipts)],
    ['Cash Sale Less Disc', N(t.cashSaleLessDisc)],
    ['Total Cash', N(t.totalCash)],
  ];
  const col4 = [
    ['Total Cash', N(t.totalCash)],
    ['Paid Cash', N(t.totalPayments)],
    ['Shop Exp', N(t.totalExpenses)],
    ['Net Cash', N(t.netCash)],
  ];

  return (
    <div className="paper">
      <PageSize orientation="landscape" />

      {/* TOP BAND: title/date · previous-day reminders · opening cash / page */}
      <div className="mb-2 flex items-start justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <div className="text-[15px] font-bold">Daily Sale And Expenses Sheet</div>
          <div className="text-[12px]">Date: {longDate(date)}</div>
        </div>
        <div className="text-[10px] leading-tight">
          {reminders.map(([label, val], i) => (
            <div key={i}>
              {label} {N(val)} <span>✓</span>
            </div>
          ))}
        </div>
        <div className="text-right text-[12px] leading-tight">
          <div>
            Opening Cash In&nbsp;&nbsp;<b>{N(data.openingCash)}</b>
          </div>
          {data.pageNo != null && (
            <div>
              No.&nbsp;<b>{data.pageNo}</b>
            </div>
          )}
          <div>Page 1 of 1</div>
        </div>
      </div>

      {/* SIX SECTIONS ACROSS — one full-ruled grid */}
      <div className="overflow-x-auto">
        <table className="paper-grid w-full text-[12px]">
          <thead>
            <tr>
              <th colSpan={goodsWidth} className="paper-caps">
                S A L E
              </th>
              <th colSpan={goodsWidth} className="paper-caps">
                P U R C H A S E
              </th>
              <th colSpan={2}>Cash Receipt</th>
              <th colSpan={2}>Cash Payment</th>
              <th colSpan={2}>Shop Exp.</th>
              <th colSpan={2}>Credit Sale</th>
            </tr>
            <tr>
              <th className="text-left">Name</th>
              <th className="paper-num">Qty</th>
              <th className="paper-num">@</th>
              <th className="paper-num">Amt</th>
              {showProfit && <th className="paper-num">P</th>}
              <th className="text-left">Name</th>
              <th className="paper-num">Qty</th>
              <th className="paper-num">@</th>
              <th className="paper-num">Amt</th>
              {showProfit && <th className="paper-num">P</th>}
              <th className="text-left">Name</th>
              <th className="paper-num">Amt</th>
              <th className="text-left">Name</th>
              <th className="paper-num">Amt</th>
              <th className="text-left">Name</th>
              <th className="paper-num">Amt</th>
              <th className="text-left">Name</th>
              <th className="paper-num">Amt</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, i) => (
              <tr key={i}>
                {saleCells(sales[i], `s${i}`)}
                {purCells(purchases[i], `p${i}`)}
                {amtCells(receipts[i], 'partyName', `r${i}`)}
                {amtCells(payments[i], 'partyName', `y${i}`)}
                {amtCells(expenses[i], 'headName', `e${i}`)}
                {amtCells(credit[i], 'partyName', `c${i}`)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td>Total</td>
              <td className="paper-num">{N(saleQty)}</td>
              <td />
              <td className="paper-num">{N(t.totalSale)}</td>
              {showProfit && <td className="paper-num">{N(saleProfit)}</td>}
              <td />
              <td className="paper-num">{purchases.length ? N(purQty) : ''}</td>
              <td />
              <td className="paper-num">{purchases.length ? N(purAmt) : ''}</td>
              {showProfit && (
                <td className="paper-num">{purchases.length ? N(purProfit) : ''}</td>
              )}
              <td>Total</td>
              <td className="paper-num">{N(t.totalReceipts, true)}</td>
              <td>Total</td>
              <td className="paper-num">{N(t.totalPayments)}</td>
              <td>Total</td>
              <td className="paper-num">{N(t.totalExpenses)}</td>
              <td>Total</td>
              <td className="paper-num">{N(t.creditSale)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* BOTTOM SUMMARY BOX — four columns */}
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <SummaryCol rows={col1} />
        <SummaryCol rows={col2} />
        <SummaryCol rows={col3} />
        <SummaryCol rows={col4} />
      </div>
      <div className="mt-1 flex gap-10 text-[12px] font-bold">
        <span>Total Sale Bank {N(t.cashSaleLessDisc)}</span>
        <span>Total Exp {N(t.totalExpenses)}</span>
      </div>

      {/* Blank space for the owner's hand-written signature and date. */}
      <div className="mt-8 flex justify-between text-[12px]">
        <div>Signature:&nbsp;<span className="inline-block w-56 border-b border-black" /></div>
        <div>Date:&nbsp;<span className="inline-block w-40 border-b border-black" /></div>
      </div>
    </div>
  );
}

function SummaryCol({ rows }) {
  if (!rows.length) return null;
  return (
    <table className="paper-grid w-auto text-[12px]">
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={i}>
            <td className="pr-6">{label}</td>
            <td className="paper-num">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DailySale() {
  const [params, setParams] = useSearchParams();
  const date =
    params.get('date') && isValidYmd(params.get('date')) ? params.get('date') : todayYmd();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch(`/reports/daily-sale?date=${date}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  function exportCsv() {
    const rows = [['Daily Sale & Expense Sheet', prettyDay(date)], []];
    rows.push(['SALE'], ['Bill', 'Product', 'Party', 'Qty', 'Rate', 'Amount', 'Profit']);
    data.sales.forEach((s) =>
      rows.push([s.billNo ?? '', s.productCode, s.partyName || 'Cash', s.qty, s.rate, s.amount, s.profit])
    );
    rows.push([], ['PURCHASE'], ['Product', 'Supplier', 'Qty', 'Rate', 'Amount', 'Profit']);
    data.purchases.forEach((p) =>
      rows.push([p.productCode, p.partyName || '', p.qty, p.rate, p.amount, p.profit])
    );
    rows.push([], ['CASH RECEIPT'], ['Party', 'Narration', 'Amount']);
    data.receipts.forEach((r) => rows.push([r.partyName, r.narration, r.amount]));
    rows.push([], ['CASH PAYMENT'], ['Party', 'Narration', 'Amount']);
    data.payments.forEach((r) => rows.push([r.partyName, r.narration, r.amount]));
    rows.push([], ['SHOP EXPENSE'], ['Head', 'Narration', 'Amount']);
    data.expenses.forEach((r) => rows.push([r.headName, r.narration, r.amount]));
    const t = data.totals || {};
    rows.push(
      [],
      ['SUMMARY'],
      ['Cash Sale', t.cashSale],
      ['Credit Sale', t.creditSale],
      ['Total Sale', t.totalSale],
      ['Total Profit', t.totalProfit],
      ['Opening Cash', data.openingCash],
      ['Paid Cash', t.totalPayments],
      ['Shop Exp', t.totalExpenses],
      ['Net Cash', t.netCash]
    );
    downloadCsv(`daily-sale-${date}.csv`, rows);
  }

  const controls = (
    <input
      type="date"
      value={date}
      onChange={(e) => e.target.value && setParams({ date: e.target.value })}
      className="rounded border border-stone-300 px-2 py-1.5 text-sm"
    />
  );

  const ready = data && data.status !== 'NONE';

  return (
    <ReportShell
      title="Daily Sale & Expense Sheet"
      subtitle={prettyDay(date)}
      controls={controls}
      onExport={ready ? exportCsv : undefined}
      pdf={
        ready
          ? { path: `/reports/daily-sale.pdf?date=${date}`, filename: `daily-sale-${date}.pdf` }
          : undefined
      }
      xlsx={
        ready
          ? { path: `/reports/daily-sale.xlsx?date=${date}`, filename: `daily-sale-${date}.xlsx` }
          : undefined
      }
    >
      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-600">{error}</div>
      ) : data.status === 'NONE' ? (
        <div className="py-16 text-center text-sm text-stone-500">
          No day book exists for {prettyDay(date)} yet.
        </div>
      ) : (
        <DailySaleSheet data={data} date={date} />
      )}
    </ReportShell>
  );
}
