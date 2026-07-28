import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { downloadCsv } from '../../lib/csv.js';
import { fmt, money } from '../../lib/format.js';
import { addDays, todayYmd, ymdOf } from '../../lib/day.js';
import ReportShell from './ReportShell.jsx';
import PageSize from './PageSize.jsx';
import { ReportTable, Num } from './parts.jsx';

// Shop-local day of a stored timestamp (never a raw UTC slice — see day.js).
const D = (v) => ymdOf(v);

export function CashBookSheet({ data }) {
  return (
    <>
      <PageSize orientation="portrait" />
      <div className="mb-3 flex justify-between font-mono text-sm">
        <span className="text-stone-500">
          Opening cash: <span className="font-bold text-stone-800">{money(data.openingCash)}</span>
        </span>
        <span className="text-stone-500">
          Closing cash: <span className="font-bold text-stone-800">{money(data.closingCash)}</span>
        </span>
      </div>
      <ReportTable
        rows={data.rows}
        columns={[
          { key: 'date', label: 'Date', render: (r) => D(r.date) },
          { key: 'opening', label: 'Opening', align: 'right', render: (r) => fmt(r.opening) },
          { key: 'cashIn', label: 'Cash In', align: 'right', render: (r) => fmt(r.cashIn) },
          { key: 'cashOut', label: 'Cash Out', align: 'right', render: (r) => fmt(r.cashOut) },
          {
            key: 'closing',
            label: 'Closing',
            align: 'right',
            render: (r) => <Num v={r.closing} />,
          },
        ]}
      />
    </>
  );
}

export default function CashBook() {
  const [params, setParams] = useSearchParams();
  const to = params.get('to') || todayYmd();
  const from = params.get('from') || addDays(to, -30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setParam = (patch) => setParams({ from, to, ...patch });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch(`/reports/cashbook?from=${from}&to=${to}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  function exportCsv() {
    const rows = [
      ['Cash Book', `From ${from}`, `To ${to}`],
      [],
      ['Date', 'Opening', 'Cash In', 'Cash Out', 'Closing'],
    ];
    data.rows.forEach((r) => rows.push([D(r.date), r.opening, r.cashIn, r.cashOut, r.closing]));
    rows.push([], ['Opening cash', data.openingCash], ['Closing cash', data.closingCash]);
    downloadCsv(`cashbook-${from}_${to}.csv`, rows);
  }

  const controls = (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) => setParam({ from: e.target.value })}
        className="rounded border border-stone-300 px-2 py-1.5 text-sm"
      />
      <span className="text-stone-400">→</span>
      <input
        type="date"
        value={to}
        onChange={(e) => setParam({ to: e.target.value })}
        className="rounded border border-stone-300 px-2 py-1.5 text-sm"
      />
    </div>
  );

  return (
    <ReportShell
      title="Cash Book"
      subtitle={`${from} → ${to}`}
      controls={controls}
      onExport={data && data.rows.length ? exportCsv : undefined}
      xlsx={
        data
          ? {
              path: `/reports/cashbook.xlsx?from=${from}&to=${to}`,
              filename: `cashbook-${from}_${to}.xlsx`,
            }
          : undefined
      }
      pdf={
        data
          ? {
              path: `/reports/cashbook.pdf?from=${from}&to=${to}`,
              filename: `cashbook-${from}_${to}.pdf`,
            }
          : undefined
      }
    >
      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-600">{error}</div>
      ) : (
        <CashBookSheet data={data} />
      )}
    </ReportShell>
  );
}
