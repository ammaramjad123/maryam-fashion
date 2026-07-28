import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { downloadCsv } from '../../lib/csv.js';
import { ymdOf } from '../../lib/day.js';
import TypeaheadInput from '../DayBook/TypeaheadInput.jsx';
import ReportShell from './ReportShell.jsx';
import PageSize from './PageSize.jsx';
import { ReportTable } from './parts.jsx';

// Two-decimal money with thousand separators — the ledger prints 44,000.00.
const d2 = (v) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Blank for an empty (OP) or zero cell, else the 2-dp amount.
const d2b = (v) => (v == null || Number(v) === 0 ? '' : d2(v));

// DD/MM/YYYY from a stored day (server sends 'YYYY-MM-DD'; guard instants too).
const ddmmyyyy = (v) => {
  const ymd = ymdOf(v) || String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

// A ledger balance. Cr (money we owe) is RED on screen, BLACK in print (the
// @media print rule maps `.paper .text-red-600` → black). Grid cells show the
// absolute amount + side (44,118.00 Cr); the header shows the SIGNED figure
// (-42,784.00 Cr) — both exactly as the paper prints them.
function Bal({ b, signed = false }) {
  if (!b || b.side === 'NONE' || !b.amount) return <span>0.00</span>;
  const text = `${d2(signed ? b.signedBalance : b.amount)} ${b.side}`;
  return <span className={b.side === 'CR' ? 'text-red-600' : ''}>{text}</span>;
}

export function LedgerSheet({ data, from, to }) {
  return (
    <div className="paper">
      <PageSize orientation="portrait" />

      {/* Three-line header, laid out as on the paper. */}
      <div className="mb-2 border-b-2 border-black pb-2">
        <div className="text-center text-[16px] font-bold">Ledger Book</div>
        <div className="mt-1 flex items-baseline justify-between text-[12px]">
          <span>
            Date From : {ddmmyyyy(from)}&nbsp;&nbsp;&nbsp;&nbsp;To : {ddmmyyyy(to)}
          </span>
          <span>
            Closing Balance&nbsp;&nbsp;&nbsp;&nbsp;
            <b>
              <Bal b={data.closing} signed />
            </b>
          </span>
        </div>
        <div className="flex items-baseline justify-between text-[12px]">
          <span>
            Party Code : {data.party.accountCode}&nbsp;&nbsp;&nbsp;&nbsp;Name : {data.party.name}
          </span>
          <span>Page 1 of 1</span>
        </div>
      </div>

      {/* Small label the original prints above the leading columns. */}
      <div className="text-[11px] font-semibold">Contract No</div>

      <ReportTable
        paper
        rows={data.rows}
        columns={[
          { key: 'voucherNo', label: 'Voucher No', render: (r) => r.voucherNo },
          { key: 'type', label: 'Type' },
          { key: 'date', label: 'Date', render: (r) => ddmmyyyy(r.date) },
          { key: 'narration', label: 'Narration' },
          // The OP row keeps Debit & Credit BLANK — only its Balance shows.
          { key: 'debit', label: 'Debit', align: 'right', render: (r) => d2b(r.debit) },
          { key: 'credit', label: 'Credit', align: 'right', render: (r) => d2b(r.credit) },
          { key: 'balance', label: 'Balance', align: 'right', render: (r) => <Bal b={r.balance} /> },
        ]}
        foot={[
          { node: '' },
          { node: '' },
          { node: '' },
          { node: 'Total' },
          { node: d2(data.totalDebit), align: 'right' },
          { node: d2(data.totalCredit), align: 'right' },
          { node: <Bal b={data.closing} />, align: 'right' },
        ]}
      />

      {/* Blank space for the owner's hand-written signature. */}
      <div className="mt-8 text-[12px]">
        Signature:&nbsp;<span className="inline-block w-56 border-b border-black" />
      </div>
    </div>
  );
}

export default function Ledger() {
  const [params, setParams] = useSearchParams();
  const partyId = params.get('partyId') || '';
  const from = params.get('from') || '2025-04-01';
  const to = params.get('to') || '2025-04-30';

  const [partyName, setPartyName] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setParam = (patch) => setParams({ partyId, from, to, ...patch });

  useEffect(() => {
    if (!partyId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch(`/reports/ledger?partyId=${partyId}&from=${from}&to=${to}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setPartyName(d.party?.name || '');
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [partyId, from, to]);

  function exportCsv() {
    const rows = [
      ['Ledger Book', data.party.name, `${data.party.accountCode}`],
      [`From ${ddmmyyyy(from)}`, `To ${ddmmyyyy(to)}`],
      [],
      ['Voucher No', 'Type', 'Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ];
    data.rows.forEach((r) =>
      rows.push([
        r.voucherNo,
        r.type,
        ddmmyyyy(r.date),
        r.narration,
        r.debit == null ? '' : d2(r.debit),
        r.credit == null ? '' : d2(r.credit),
        `${d2(r.balance.amount)} ${r.balance.side === 'NONE' ? '' : r.balance.side}`.trim(),
      ])
    );
    rows.push([
      '',
      '',
      '',
      'Total',
      d2(data.totalDebit),
      d2(data.totalCredit),
      `${d2(data.closing.amount)} ${data.closing.side === 'NONE' ? '' : data.closing.side}`.trim(),
    ]);
    downloadCsv(`ledger-${data.party.accountCode}-${from}_${to}.csv`, rows);
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-56 rounded border border-stone-300 bg-white px-1">
        <TypeaheadInput
          value={partyName}
          endpoint="/parties/search"
          placeholder="Search party…"
          renderItem={(it) => (
            <span>
              {it.name} <span className="text-stone-400">· {it.type?.toLowerCase()}</span>
            </span>
          )}
          onSelect={(it) => {
            setPartyName(it.name);
            setParam({ partyId: it._id });
          }}
          onClear={() => setPartyName('')}
        />
      </div>
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
      title="Ledger Book (Khata)"
      controls={controls}
      onExport={data ? exportCsv : undefined}
      pdf={
        data
          ? {
              path: `/reports/ledger.pdf?partyId=${partyId}&from=${from}&to=${to}`,
              filename: `ledger-${data.party.accountCode}-${from}_${to}.pdf`,
            }
          : undefined
      }
      xlsx={
        data
          ? {
              path: `/reports/ledger.xlsx?partyId=${partyId}&from=${from}&to=${to}`,
              filename: `ledger-${data.party.accountCode}-${from}_${to}.xlsx`,
            }
          : undefined
      }
    >
      {!partyId ? (
        <div className="py-16 text-center text-sm text-stone-500">
          Pick a party to view its ledger.
        </div>
      ) : loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-600">{error}</div>
      ) : !data ? (
        // partyId is set but the fetch hasn't resolved yet (e.g. a direct URL
        // load) — never render the sheet with null data.
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : (
        <LedgerSheet data={data} from={from} to={to} />
      )}
    </ReportShell>
  );
}
