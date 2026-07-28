import { fmt, money } from '../../lib/format.js';

// A signed number: accounting-red when negative, blank for zero when asked.
export function Num({ v, blankZero = false }) {
  const n = Number(v);
  return <span className={n < 0 ? 'text-red-600' : ''}>{fmt(v, { blankZero })}</span>;
}

// A ledger balance with its Dr/Cr suffix. Cr (we owe) shows red; 0 is plain "0".
export function DrCr({ bal }) {
  if (!bal || bal.side === 'NONE' || !bal.amount) return <span>0</span>;
  return (
    <span className={bal.side === 'CR' ? 'text-red-600' : ''}>
      {money(bal.amount)} {bal.side}
    </span>
  );
}

// A titled, read-only ledger-style table. `columns`: { key, label, align, render }.
// `paper` switches to the printed-sheet look: a full black-ruled grid with black
// tabular figures (used by the Daily Stock and Ledger paper reproductions).
export function ReportTable({ title, columns, rows, foot, paper = false }) {
  if (paper) {
    return (
      <section className="paper mb-3">
        {title && <div className="mb-1 text-[13px] font-bold">{title}</div>}
        <div className="overflow-x-auto">
          <table className="paper-grid w-full font-mono text-[12px]">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === 'right' ? 'paper-num' : 'text-left'}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center">
                    No entries
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className={c.align === 'right' ? 'paper-num' : ''}>
                        {c.render ? c.render(r) : (r[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {foot && (
              <tfoot>
                <tr className="font-bold">
                  {foot.map((cell, i) => (
                    <td key={i} className={cell.align === 'right' ? 'paper-num' : ''}>
                      {cell.node}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-4">
      {title && (
        <div className="border-l-4 border-stone-400 bg-stone-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-stone-600">
          {title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border border-t-0 border-stone-200 font-mono text-[13px]">
          <thead>
            <tr className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-400">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-2 py-1 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-2 py-3 text-center text-stone-400">
                  No entries
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-t border-stone-100">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 py-1 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                    >
                      {c.render ? c.render(r) : (r[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {foot && (
            <tfoot>
              <tr className="border-t-2 border-stone-300 bg-stone-50 font-bold">
                {foot.map((cell, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1 ${cell.align === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {cell.node}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
