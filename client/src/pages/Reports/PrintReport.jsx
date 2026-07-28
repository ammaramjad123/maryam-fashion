import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { DailySaleSheet } from './DailySale.jsx';
import { DailyStockSheet } from './DailyStock.jsx';
import { LedgerSheet } from './Ledger.jsx';
import { CashBookSheet } from './CashBook.jsx';
import { OutstandingSheet } from './Outstanding.jsx';
import { PositionSheet } from './Position.jsx';

// Each report maps to its data endpoint and its SHARED Sheet component — the very
// same component the on-screen report renders, so the PDF cannot drift from it.
const REPORTS = {
  'daily-sale': {
    endpoint: (sp) => `/reports/daily-sale?date=${sp.get('date')}`,
    render: (d, sp) => <DailySaleSheet data={d} date={sp.get('date')} />,
  },
  'daily-stock': {
    endpoint: (sp) => `/reports/daily-stock?date=${sp.get('date')}`,
    render: (d, sp) => <DailyStockSheet data={d} date={sp.get('date')} />,
  },
  ledger: {
    endpoint: (sp) =>
      `/reports/ledger?partyId=${sp.get('partyId')}&from=${sp.get('from')}&to=${sp.get('to')}`,
    render: (d, sp) => <LedgerSheet data={d} from={sp.get('from')} to={sp.get('to')} />,
  },
  cashbook: {
    endpoint: (sp) => `/reports/cashbook?from=${sp.get('from')}&to=${sp.get('to')}`,
    render: (d) => <CashBookSheet data={d} />,
  },
  outstanding: {
    endpoint: () => `/parties/outstanding`,
    render: (d) => <OutstandingSheet data={d} />,
  },
  position: {
    endpoint: (sp) => `/reports/position?from=${sp.get('from')}&to=${sp.get('to')}`,
    render: (d, sp) => <PositionSheet data={d} from={sp.get('from')} to={sp.get('to')} />,
  },
};

/**
 * Bare, chrome-free print page loaded by the PDF renderer (Puppeteer). It fetches
 * the identical report data and renders the identical Sheet. `data-report-ready`
 * flips to "true" once loaded so the renderer knows when to capture the PDF.
 */
export default function PrintReport() {
  const { report } = useParams();
  const [sp] = useSearchParams();
  const cfg = REPORTS[report];
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const qs = sp.toString();

  useEffect(() => {
    if (!cfg) {
      setState({ loading: false, data: null, error: `Unknown report: ${report}` });
      return;
    }
    let cancelled = false;
    apiFetch(cfg.endpoint(sp))
      .then((d) => !cancelled && setState({ loading: false, data: d, error: '' }))
      .catch((e) => !cancelled && setState({ loading: false, data: null, error: e.message }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, qs]);

  return (
    <div
      data-report-ready={state.loading ? 'false' : 'true'}
      className="min-h-screen bg-white text-stone-800"
    >
      <div className="print-area mx-auto max-w-5xl bg-[#FCFBF8] p-4">
        {state.loading ? (
          <div className="p-8 text-center text-sm text-stone-400">Loading…</div>
        ) : state.error ? (
          <div className="p-8 text-center text-sm text-red-600">{state.error}</div>
        ) : (
          cfg.render(state.data, sp)
        )}
      </div>
    </div>
  );
}
