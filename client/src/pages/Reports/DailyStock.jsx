import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { downloadCsv } from '../../lib/csv.js';
import { prettyDay, todayYmd, isValidYmd } from '../../lib/day.js';
import ReportShell from './ReportShell.jsx';
import PageSize from './PageSize.jsx';
import { ReportTable, Num } from './parts.jsx';

// English column headers matching the printed Daily Stock Report exactly.
export function DailyStockSheet({ data, date }) {
  const t = data.totals;
  // Profit ('P') is present only when the server didn't strip it (viewProfit).
  const showProfit = !!(t && 'profit' in t);
  const pCol = { key: 'profit', label: 'P', align: 'right', render: (r) => <Num v={r.profit} /> };

  const columns = [
    { key: 'code', label: 'Name' },
    { key: 'opening', label: 'Opening', align: 'right', render: (r) => <Num v={r.opening} /> },
    {
      key: 'purchaseQty',
      label: 'Purchase',
      align: 'right',
      render: (r) => <Num v={r.purchaseQty} blankZero />,
    },
    {
      key: 'purchaseAmount',
      label: 'Amount',
      align: 'right',
      render: (r) => <Num v={r.purchaseAmount} blankZero />,
    },
    { key: 'total', label: 'Total', align: 'right', render: (r) => <Num v={r.total} /> },
    { key: 'saleQty', label: 'Sale', align: 'right', render: (r) => <Num v={r.saleQty} /> },
    {
      key: 'saleAmount',
      label: 'Amount',
      align: 'right',
      render: (r) => <Num v={r.saleAmount} />,
    },
    ...(showProfit ? [pCol] : []),
    {
      key: 'closing',
      label: 'Closing Stock',
      align: 'right',
      render: (r) => <Num v={r.closing} />,
    },
  ];

  const foot = t
    ? [
        { node: 'Total' },
        { node: <Num v={t.opening} />, align: 'right' },
        // Purchase QTY stays blank (as the paper); its AMOUNT prints 0, not blank.
        { node: <Num v={t.purchaseQty} blankZero />, align: 'right' },
        { node: <Num v={t.purchaseAmount} />, align: 'right' },
        { node: <Num v={t.total} />, align: 'right' }, // Total = Opening + Purchase
        { node: <Num v={t.saleQty} />, align: 'right' },
        { node: <Num v={t.saleAmount} />, align: 'right' },
        ...(showProfit ? [{ node: <Num v={t.profit} />, align: 'right' }] : []),
        { node: <Num v={t.closing} />, align: 'right' },
      ]
    : null;

  return (
    <div className="paper">
      <PageSize orientation="portrait" />
      <div className="mb-2 border-b-2 border-black pb-2">
        <div className="text-[15px] font-bold">Daily Stock Report</div>
        <div className="text-[12px]">Date: {prettyDay(date)}</div>
      </div>
      <ReportTable paper rows={data.rows} columns={columns} foot={foot} />
      <div className="mt-8 text-[12px]">
        Signature:&nbsp;<span className="inline-block w-56 border-b border-black" />
      </div>
    </div>
  );
}

export default function DailyStock() {
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
    apiFetch(`/reports/daily-stock?date=${date}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  function exportCsv() {
    const header = [
      'Name',
      'Opening',
      'Purchase',
      'Amount',
      'Total',
      'Sale',
      'Amount',
      'P',
      'Closing',
    ];
    const rows = [['Daily Stock Report', prettyDay(date)], [], header];
    data.rows.forEach((r) =>
      rows.push([
        r.code,
        r.opening,
        r.purchaseQty,
        r.purchaseAmount,
        r.total,
        r.saleQty,
        r.saleAmount,
        r.profit,
        r.closing,
      ])
    );
    const t = data.totals || {};
    rows.push([
      'Total',
      t.opening,
      t.purchaseQty,
      t.purchaseAmount,
      '',
      t.saleQty,
      t.saleAmount,
      t.profit,
      t.closing,
    ]);
    downloadCsv(`daily-stock-${date}.csv`, rows);
  }

  const controls = (
    <input
      type="date"
      value={date}
      onChange={(e) => e.target.value && setParams({ date: e.target.value })}
      className="rounded border border-stone-300 px-2 py-1.5 text-sm"
    />
  );

  const ready = data && data.status === 'POSTED';

  return (
    <ReportShell
      title="Daily Stock Report"
      subtitle={prettyDay(date)}
      controls={controls}
      onExport={ready ? exportCsv : undefined}
      pdf={
        ready
          ? { path: `/reports/daily-stock.pdf?date=${date}`, filename: `daily-stock-${date}.pdf` }
          : undefined
      }
      xlsx={
        ready
          ? { path: `/reports/daily-stock.xlsx?date=${date}`, filename: `daily-stock-${date}.xlsx` }
          : undefined
      }
    >
      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-600">{error}</div>
      ) : data.status !== 'POSTED' ? (
        <div className="py-16 text-center text-sm text-stone-500">
          {prettyDay(date)} is not posted — the stock movement is available once the day is posted.
        </div>
      ) : (
        <DailyStockSheet data={data} date={date} />
      )}
    </ReportShell>
  );
}
