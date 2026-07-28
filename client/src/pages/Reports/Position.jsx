import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { ymdOf } from '../../lib/day.js';
import ReportShell from './ReportShell.jsx';
import PageSize from './PageSize.jsx';
import { ReportTable } from './parts.jsx';

const d2 = (v) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d2b = (v) => (v == null || Number(v) === 0 ? '' : d2(v));
const ddmmyyyy = (v) => {
  const ymd = ymdOf(v) || String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

// A bank is a plain running balance — a positive number is money we have. Show
// the plain signed amount (negative = overdraft, red on screen / black in print).
function Bal({ b }) {
  const v = b?.signedBalance || 0;
  return <span className={v < 0 ? 'text-red-600' : ''}>{d2(v)}</span>;
}

// The Position sheet — one Naration|Debit|Credit|Balance block per bank account.
export function PositionSheet({ data, from, to }) {
  return (
    <div className="paper">
      <PageSize orientation="portrait" />
      <div className="mb-2 border-b-2 border-black pb-2">
        <div className="text-center text-[16px] font-bold">Position</div>
        <div className="mt-1 flex items-baseline justify-between text-[12px]">
          <span>
            Date From : {ddmmyyyy(from)}&nbsp;&nbsp;&nbsp;&nbsp;To : {ddmmyyyy(to)}
          </span>
          <span>Page 1 of 1</span>
        </div>
      </div>

      {data.accounts.length === 0 ? (
        <div className="py-10 text-center text-[13px]">No bank accounts yet.</div>
      ) : (
        data.accounts.map((acc) => (
          <div key={acc.party.accountCode} className="mb-4">
            <div className="flex items-baseline justify-between text-[13px] font-bold">
              <span>{acc.party.name}</span>
              <span>
                Balance:{' '}
                <Bal b={acc.closing} />
              </span>
            </div>
            <ReportTable
              paper
              rows={acc.rows}
              columns={[
                { key: 'narration', label: 'Naration' },
                {
                  key: 'debit',
                  label: 'Debit',
                  align: 'right',
                  render: (r) => d2b(r.debit),
                },
                {
                  key: 'credit',
                  label: 'Credit',
                  align: 'right',
                  render: (r) => d2b(r.credit),
                },
                { key: 'balance', label: 'Balance', align: 'right', render: (r) => <Bal b={r.balance} /> },
              ]}
              foot={[
                { node: 'Total' },
                { node: d2(acc.totalDebit), align: 'right' },
                { node: d2(acc.totalCredit), align: 'right' },
                { node: <Bal b={acc.closing} />, align: 'right' },
              ]}
            />
          </div>
        ))
      )}

      {data.accounts.length > 0 && (
        <div className="mt-2 flex items-baseline justify-between border-t-2 border-black py-1 text-[13px] font-bold">
          <span>GRAND TOTAL (all banks)</span>
          <span className="tabular-nums">
            <Bal b={data.grandTotal} />
          </span>
        </div>
      )}

      <div className="mt-8 text-[12px]">
        Signature:&nbsp;<span className="inline-block w-56 border-b border-black" />
      </div>
    </div>
  );
}

export default function Position() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || '2025-04-01';
  const to = params.get('to') || '2025-12-31';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setParam = (patch) => setParams({ from, to, ...patch });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch(`/reports/position?from=${from}&to=${to}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
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
      title="Position (Bank Accounts)"
      subtitle={`${from} → ${to}`}
      controls={controls}
      pdf={data ? { path: `/reports/position.pdf?from=${from}&to=${to}`, filename: `position-${from}_${to}.pdf` } : undefined}
      xlsx={data ? { path: `/reports/position.xlsx?from=${from}&to=${to}`, filename: `position-${from}_${to}.xlsx` } : undefined}
    >
      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-600">{error}</div>
      ) : (
        <PositionSheet data={data} from={from} to={to} />
      )}
    </ReportShell>
  );
}
