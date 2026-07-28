import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { downloadFile } from '../../lib/api.js';

const TABS = [
  { to: '/reports/daily-sale', label: 'Daily Sale' },
  { to: '/reports/daily-stock', label: 'Daily Stock' },
  { to: '/reports/ledger', label: 'Ledger' },
  { to: '/reports/cashbook', label: 'Cash Book' },
  { to: '/reports/outstanding', label: 'Outstanding' },
  { to: '/reports/position', label: 'Position' },
];

/**
 * Frame shared by every report: a screen-only header (report tabs, filters,
 * Export CSV, Download PDF, Print) and a print-area sheet that mirrors the paper.
 * The PDF is rendered from the matching /print route + the same @media print CSS.
 */
export default function ReportShell({ title, subtitle, controls, onExport, pdf, xlsx, children }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState('');

  async function downloadPdf() {
    if (!pdf) return;
    setPdfBusy(true);
    setPdfErr('');
    try {
      await downloadFile(pdf.path, pdf.filename);
    } catch (e) {
      setPdfErr(e.message || 'Could not generate the PDF.');
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadXlsx() {
    if (!xlsx) return;
    setXlsxBusy(true);
    setPdfErr('');
    try {
      await downloadFile(xlsx.path, xlsx.filename);
    } catch (e) {
      setPdfErr(e.message || 'Could not generate the Excel file.');
    } finally {
      setXlsxBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="no-print mb-3 flex flex-wrap gap-1 text-sm">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `rounded px-3 py-1.5 ${isActive ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-stone-800">{title}</h1>
          {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          {onExport && (
            <button
              onClick={onExport}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              Export CSV
            </button>
          )}
          {xlsx && (
            <button
              onClick={downloadXlsx}
              disabled={xlsxBusy}
              className="rounded border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              {xlsxBusy ? 'Preparing…' : 'Download Excel'}
            </button>
          )}
          {pdf && (
            <button
              onClick={downloadPdf}
              disabled={pdfBusy}
              className="rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
            >
              {pdfBusy ? 'Preparing…' : 'Download PDF'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            title="Or press Ctrl/Cmd + P"
          >
            Print
          </button>
        </div>
      </div>

      {pdfErr && (
        <div className="no-print mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {pdfErr}
        </div>
      )}

      <div className="print-area rounded-lg border border-stone-300 bg-[#FCFBF8] p-4 shadow-sm">
        {children}
      </div>
    </div>
  );
}
