import { useEffect, useRef, useState } from 'react';
import TypeaheadInput from './TypeaheadInput.jsx';
import { fmt, num } from '../../lib/format.js';
import { lineProfit } from '../../lib/profit.js';
import { isBillStart } from '../../lib/billNo.js';

// Editable column types the grid knows how to render.
const EDITABLE = new Set(['product', 'party', 'head', 'qty', 'rate', 'money', 'text', 'billno']);

export default function LineGrid({
  title,
  accent, // left-border accent color class
  columns,
  rows,
  productMeta, // id -> { costRate, saleRate, code }
  resolveProduct, // (text) => product | null  (case-insensitive code lookup)
  billNos, // effective bill numbers per sale row (auto/override), or undefined
  onCellChange, // (rowIndex, patch) => void
  onCommit, // (rowIndex) => void
  onDeleteRow, // (rowIndex) => void
  readOnly = false,
}) {
  const cellRefs = useRef({});
  const [pendingFocus, setPendingFocus] = useState(null);

  const editableCols = columns.filter((c) => EDITABLE.has(c.type));
  const editableKeys = editableCols.map((c) => c.key);
  const firstKey = editableKeys[0];

  // Always read the latest rows at Enter time (avoids a stale closure when the
  // user types the last value and presses Enter in one motion).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const key = (r, c) => `${r}:${c}`;
  const focusCell = (r, c) => cellRefs.current[key(r, c)]?.focus();

  useEffect(() => {
    if (!pendingFocus) return;
    const el = cellRefs.current[key(pendingFocus.r, pendingFocus.c)];
    if (el) {
      el.focus();
      if (el.select) el.select();
      setPendingFocus(null);
    }
  }, [rows, pendingFocus]);

  // Is a required cell filled? Optional cells (a cash sale's party, a narration)
  // never block completion.
  function cellFilled(row, col) {
    switch (col.type) {
      case 'product':
        return !!row.productId;
      case 'head':
        return !!row.headId;
      case 'party':
        return col.optional ? true : !!row.partyId;
      case 'qty': {
        const n = num(row.qty);
        return !Number.isNaN(n) && n !== 0; // qty present and non-zero (negatives ok)
      }
      case 'rate': {
        const n = num(row.rate);
        return !Number.isNaN(n) && n >= 0; // rate present and >= 0
      }
      case 'money':
        return num(row.amount) > 0;
      case 'text':
        return true; // narration is optional
      default:
        return true;
    }
  }

  const firstUnfilledKey = (row) => editableCols.find((c) => !cellFilled(row, c))?.key ?? null;

  // Enter: only commit + open a new line when the line is COMPLETE. If it is
  // half-filled, move to the first still-empty required cell in the SAME line
  // (never leave a committed, incomplete line behind).
  function commit(rowIndex) {
    onCommit(rowIndex);
    const row = rowsRef.current[rowIndex];
    const missing = firstUnfilledKey(row);
    if (missing) {
      setPendingFocus({ r: rowIndex, c: missing });
    } else {
      setPendingFocus({ r: rowIndex + 1, c: firstKey });
    }
  }

  function nextEditable(colKey) {
    const i = editableKeys.indexOf(colKey);
    return editableKeys[i + 1];
  }

  function amountOf(row) {
    return num(row.qty) * num(row.rate);
  }

  function profitOf(row, col) {
    const meta = productMeta[row.productId];
    // null until the product (and its code-derived cost) is resolved — render a
    // placeholder, never a wrong number and never the CASH/CREDIT text.
    return lineProfit({
      rate: row.rate,
      qty: row.qty,
      cost: meta?.costRate,
      kind: col.compute === 'purchaseProfit' ? 'purchase' : 'sale',
    });
  }

  function renderCell(row, rowIndex, col) {
    const setRef = (el) => {
      if (el) cellRefs.current[key(rowIndex, col.key)] = el;
    };
    const onEnter = () => commit(rowIndex);
    const onEsc = () => onDeleteRow(rowIndex);

    switch (col.type) {
      case 'product': {
        const select = (it) =>
          onCellChange(rowIndex, {
            productId: it._id,
            productCode: it.code,
            rate: num(row.rate) ? row.rate : it.saleRate,
            productError: false,
          });
        const badCode = !!row.productError;
        return (
          <div className={badCode ? 'rounded bg-red-50 ring-1 ring-red-400' : ''}>
            <TypeaheadInput
              inputRef={setRef}
              value={row.productCode || ''}
              endpoint="/products/search"
              placeholder="code"
              uppercase
              title={badCode ? 'No product with this code — pick from the list' : undefined}
              renderItem={(it) => (
                <span>
                  <b>{it.code}</b> · {it.name}
                </span>
              )}
              onSelect={select}
              onClear={() => onCellChange(rowIndex, { productId: null, productCode: '', productError: false })}
              // Typed a code and left the cell (Tab/blur/Enter): resolve it against
              // known codes without needing the dropdown; flag if it doesn't match.
              onResolveText={(text) => {
                const t = String(text).trim();
                if (!t) {
                  onCellChange(rowIndex, { productId: null, productCode: '', productError: false });
                  return;
                }
                const hit = resolveProduct && resolveProduct(t);
                if (hit) select(hit);
                else onCellChange(rowIndex, { productId: null, productCode: t.toUpperCase(), productError: true });
              }}
              onEnterCommit={onEnter}
              onEsc={onEsc}
              onAfterSelect={() => focusCell(rowIndex, nextEditable(col.key))}
            />
          </div>
        );
      }
      case 'party':
        return (
          <TypeaheadInput
            inputRef={setRef}
            value={row.partyName || ''}
            endpoint="/parties/search"
            placeholder={col.optional ? 'blank = cash' : 'party'}
            allowEmpty={col.optional}
            renderItem={(it) => (
              <span>
                {it.name} <span className="text-stone-400">· {it.type?.toLowerCase()}</span>
              </span>
            )}
            onSelect={(it) => onCellChange(rowIndex, { partyId: it._id, partyName: it.name })}
            onClear={() => onCellChange(rowIndex, { partyId: null, partyName: '' })}
            onEnterCommit={onEnter}
            onEsc={onEsc}
            onAfterSelect={() => focusCell(rowIndex, nextEditable(col.key))}
          />
        );
      case 'head':
        return (
          <TypeaheadInput
            inputRef={setRef}
            value={row.headName || ''}
            endpoint="/expense-heads"
            buildQuery={(q) => `search=${encodeURIComponent(q)}`}
            placeholder="expense head"
            renderItem={(it) => it.name}
            onSelect={(it) => onCellChange(rowIndex, { headId: it._id, headName: it.name })}
            onClear={() => onCellChange(rowIndex, { headId: null, headName: '' })}
            onEnterCommit={onEnter}
            onEsc={onEsc}
            onAfterSelect={() => focusCell(rowIndex, nextEditable(col.key))}
          />
        );
      case 'qty':
      case 'rate':
      case 'money':
      case 'text': {
        const isNumeric = col.type !== 'text';
        return (
          <input
            ref={setRef}
            value={row[col.key] ?? ''}
            inputMode={isNumeric ? 'decimal' : 'text'}
            placeholder={col.placeholder || ''}
            onChange={(e) => onCellChange(rowIndex, { [col.key]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit(rowIndex);
              } else if (e.key === 'Escape') {
                onDeleteRow(rowIndex);
              }
            }}
            className={`w-full bg-transparent px-1.5 py-1 text-[13px] outline-none focus:bg-amber-50/70 ${
              isNumeric ? 'text-right tabular-nums' : ''
            }`}
            autoComplete="off"
          />
        );
      }
      case 'billno': {
        // Per-bill, not per-line (docs/07 R9.1). The number is AUTO-generated for
        // each bill start; continuation rows (same credit party) show blank. The
        // shown value is the operator override if typed, else the auto number.
        const start = isBillStart(row, rows[rowIndex - 1]);
        const auto = billNos ? billNos[rowIndex] : null;
        const typed = row.billNo !== '' && row.billNo != null;
        const shown = typed ? row.billNo : start && auto != null ? String(auto) : '';
        return (
          <input
            ref={setRef}
            value={shown}
            inputMode="numeric"
            placeholder={start ? 'auto' : '↳'}
            title={start ? 'Bill number (auto — editable to override)' : 'Same bill as the row above'}
            onChange={(e) => onCellChange(rowIndex, { billNo: e.target.value.replace(/[^0-9]/g, '') })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit(rowIndex);
              } else if (e.key === 'Escape') {
                onDeleteRow(rowIndex);
              }
            }}
            className={`w-full bg-transparent px-1.5 py-1 text-[13px] outline-none focus:bg-amber-50/70 ${
              start ? (typed ? '' : 'text-stone-400') : 'text-stone-300 placeholder:text-stone-300'
            }`}
            autoComplete="off"
          />
        );
      }
      case 'amount': {
        const a = amountOf(row);
        return (
          <div
            className={`px-1.5 py-1 text-right tabular-nums ${a < 0 ? 'text-red-600' : 'text-stone-700'}`}
          >
            {fmt(a, { blankZero: !row.productId && !row.qty })}
          </div>
        );
      }
      case 'profit': {
        const p = profitOf(row, col);
        return (
          <div
            className={`px-1.5 py-1 text-right tabular-nums ${
              p === null ? 'text-stone-300' : p < 0 ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {p === null ? '·' : fmt(p, { blankZero: !row.productId })}
          </div>
        );
      }
      case 'tag': {
        if (!row.productId && !num(row.qty)) return <span />;
        const credit = !!row.partyId;
        return (
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              credit ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {credit ? 'Credit' : 'Cash'}
          </span>
        );
      }
      default:
        return null;
    }
  }

  // Per-section totals (live), using the SAME amount/profit helpers as the cells
  // (amountOf, profitOf → lib/profit.js) so the row can never disagree with the
  // cells, the footer summary, or the posted totals. Blank/half rows sum to 0.
  const hasRealLine = rows.some(
    (r) => r.productId || r.headId || r.partyId || num(r.amount) || num(r.qty)
  );
  function columnTotal(col) {
    switch (col.type) {
      case 'qty':
        return rows.reduce((s, r) => s + (num(r.qty) || 0), 0);
      case 'amount':
        return rows.reduce((s, r) => s + (amountOf(r) || 0), 0);
      case 'money':
        return rows.reduce((s, r) => s + (num(r.amount) || 0), 0);
      case 'profit':
        return rows.reduce((s, r) => s + (profitOf(r, col) || 0), 0);
      default:
        return null; // no total for code/name/rate/tag columns
    }
  }

  return (
    <section className="mb-5">
      <div className={`flex items-center gap-2 border-l-4 ${accent} bg-stone-100 px-2 py-1`}>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-stone-600">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto border border-t-0 border-stone-200">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-400">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`border-b border-stone-200 px-1.5 py-1 font-medium ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
              {!readOnly && <th className="w-8 border-b border-stone-200" />}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-stone-100 last:border-b-0">
                {columns.map((c) => (
                  <td key={c.key} className="align-middle">
                    {readOnly ? (
                      <ReadOnlyCell
                        row={row}
                        col={c}
                        prevRow={rows[rowIndex - 1]}
                        amountOf={amountOf}
                        profitOf={profitOf}
                      />
                    ) : (
                      renderCell(row, rowIndex, c)
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className="text-center">
                    <button
                      tabIndex={-1}
                      onClick={() => onDeleteRow(rowIndex)}
                      className="px-1 text-stone-300 hover:text-red-500"
                      title="Delete line (Esc)"
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {hasRealLine && (
            <tfoot className="font-mono">
              <tr className="border-t-2 border-stone-300 bg-stone-50 text-[13px] font-bold">
                {columns.map((c, i) => {
                  const total = columnTotal(c);
                  const cls =
                    total < 0
                      ? 'text-red-600'
                      : c.type === 'profit'
                        ? 'text-emerald-700'
                        : 'text-stone-800';
                  return (
                    <td
                      key={c.key}
                      className={`px-1.5 py-1 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {total !== null ? (
                        <span className={`tabular-nums ${cls}`}>{fmt(total)}</span>
                      ) : i === 0 ? (
                        'Total'
                      ) : null}
                    </td>
                  );
                })}
                {!readOnly && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// Static render for a POSTED (locked) day.
function ReadOnlyCell({ row, col, prevRow, amountOf, profitOf }) {
  const base = 'px-1.5 py-1 text-[13px]';
  switch (col.type) {
    case 'product':
      return <div className={base}>{row.productCode || '—'}</div>;
    case 'party':
      return (
        <div className={base}>{row.partyName || <span className="text-stone-400">cash</span>}</div>
      );
    case 'head':
      return <div className={base}>{row.headName || '—'}</div>;
    case 'text':
      return <div className={base}>{row[col.key] || ''}</div>;
    case 'billno':
      // Per-bill: show the number only on a bill-start row (blank on continuation),
      // robust even if legacy data stored a number on every line.
      return <div className={base}>{isBillStart(row, prevRow) ? (row.billNo ?? '') : ''}</div>;
    case 'qty':
    case 'rate':
    case 'money': {
      const v = num(row[col.key]);
      return (
        <div className={`${base} text-right tabular-nums ${v < 0 ? 'text-red-600' : ''}`}>
          {fmt(row[col.key])}
        </div>
      );
    }
    case 'amount': {
      const a = amountOf(row);
      return (
        <div className={`${base} text-right tabular-nums ${a < 0 ? 'text-red-600' : ''}`}>
          {fmt(a)}
        </div>
      );
    }
    case 'profit': {
      const p = profitOf(row, col);
      return (
        <div
          className={`${base} text-right tabular-nums ${p < 0 ? 'text-red-600' : 'text-emerald-700'}`}
        >
          {p === null ? '·' : fmt(p)}
        </div>
      );
    }
    case 'tag': {
      const credit = !!row.partyId;
      return (
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            credit ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {credit ? 'Credit' : 'Cash'}
        </span>
      );
    }
    default:
      return null;
  }
}
