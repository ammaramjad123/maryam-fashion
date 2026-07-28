import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { downloadCsv } from '../../lib/csv.js';
import { money } from '../../lib/format.js';
import ReportShell from './ReportShell.jsx';
import PageSize from './PageSize.jsx';
import { ReportTable } from './parts.jsx';
import { L } from '../../lib/i18n.jsx';

const cols = (suffix) => [
  { key: 'accountCode', label: 'Account' },
  { key: 'name', label: <L k="name" /> },
  { key: 'type', label: 'Type' },
  {
    key: 'amount',
    label: (
      <span>
        Amount {suffix}{' '}
        <bdi dir="rtl" lang="ur" className="font-urdu">
          ({suffix === 'Cr' ? 'جمع' : 'نامے'})
        </bdi>
      </span>
    ),
    align: 'right',
    render: (r) => (
      <span className={suffix === 'Cr' ? 'text-red-600' : ''}>
        {money(r.amount)} {suffix}
      </span>
    ),
  },
];

export function OutstandingSheet({ data }) {
  return (
    <>
      <PageSize orientation="portrait" />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <ReportTable
            title={<L en="Who owes us" ur="جن سے لینا ہے" />}
            rows={data.receivables}
            columns={cols('Dr')}
          />
          <div className="px-2 text-right font-mono text-sm font-bold">
            <L en="Total receivable" ur="کل وصول طلب" />: {money(data.totalReceivable)} Dr
          </div>
        </div>
        <div>
          <ReportTable
            title={<L en="Whom we owe" ur="جن کو دینا ہے" />}
            rows={data.payables}
            columns={cols('Cr')}
          />
          <div className="px-2 text-right font-mono text-sm font-bold text-red-600">
            <L en="Total payable" ur="کل واجب الادا" />: {money(data.totalPayable)} Cr
          </div>
        </div>
      </div>
    </>
  );
}

export default function Outstanding() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/parties/outstanding')
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function exportCsv() {
    const rows = [
      ['Outstanding Report'],
      [],
      ['Receivable (they owe us)'],
      ['Account', 'Name', 'Type', 'Amount Dr'],
    ];
    data.receivables.forEach((p) => rows.push([p.accountCode, p.name, p.type, p.amount]));
    rows.push(['', '', 'Total', data.totalReceivable]);
    rows.push([], ['Payable (we owe them)'], ['Account', 'Name', 'Type', 'Amount Cr']);
    data.payables.forEach((p) => rows.push([p.accountCode, p.name, p.type, p.amount]));
    rows.push(['', '', 'Total', data.totalPayable]);
    downloadCsv('outstanding.csv', rows);
  }

  return (
    <ReportShell
      title="Outstanding"
      subtitle="Who owes us · whom we owe"
      onExport={data ? exportCsv : undefined}
      pdf={data ? { path: '/reports/outstanding.pdf', filename: 'outstanding.pdf' } : undefined}
      xlsx={data ? { path: '/reports/outstanding.xlsx', filename: 'outstanding.xlsx' } : undefined}
    >
      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-600">{error}</div>
      ) : (
        <OutstandingSheet data={data} />
      )}
    </ReportShell>
  );
}
