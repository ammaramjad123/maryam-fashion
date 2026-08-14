import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money } from '../lib/format.js';
import { todayYmd } from '../lib/day.js';

/**
 * Products & Stock — one screen (they are the same thing). Shows every code with
 * its DERIVED cost (codeNumber × 50, admin only) and DERIVED current stock
 * (getStock — never the stored openingStock). Stock is read-only here: it moves
 * only through posted Day Books and the admin Stock Adjustment voucher (which
 * needs a reason and leaves an audit trail).
 */
export default function Products() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const showCost = user?.permissions?.viewProfit === true;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState(null); // 'adjust' | 'add' | null
  const [confirmId, setConfirmId] = useState(null); // row awaiting a 2nd click to delete
  const [deletingId, setDeletingId] = useState(null); // delete in flight

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/stock/current');
      setRows(data.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // HARD delete (?hard=true) — physically removes the code. The server refuses if
  // the code has any stock movement, so this only ever removes unused codes.
  const remove = useCallback(
    async (row) => {
      setError('');
      setDeletingId(row.productId);
      try {
        await apiFetch(`/products/${row.productId}?hard=true`, { method: 'DELETE' });
        setMsg(`Deleted code ${row.code}.`);
        setConfirmId(null);
        await load();
      } catch (e) {
        setError(e.message);
      } finally {
        setDeletingId(null);
      }
    },
    [load]
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.code.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-stone-800">Products &amp; Stock</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setPanel(panel === 'adjust' ? null : 'adjust')}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              Stock Adjustment
            </button>
            <button
              onClick={() => setPanel(panel === 'add' ? null : 'add')}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              Add code
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      {isAdmin && panel === 'adjust' && (
        <AdjustForm
          rows={rows}
          onDone={async (text) => {
            setMsg(text);
            setPanel(null);
            await load();
          }}
        />
      )}
      {isAdmin && panel === 'add' && (
        <AddCodeForm
          onDone={async (text) => {
            setMsg(text);
            setPanel(null);
            await load();
          }}
        />
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by code…"
        className="mb-3 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:bg-amber-50/50"
      />

      <div className="rounded-lg border border-stone-200 bg-white">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">Loading…</div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">No matching codes.</div>
        ) : (
          <table className="w-full font-mono text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-stone-500">
                <th className="px-4 py-2 font-medium">Code</th>
                {showCost && <th className="px-4 py-2 text-right font-medium">Cost</th>}
                <th className="px-4 py-2 text-right font-medium">Stock</th>
                {isAdmin && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.productId} className="border-t border-stone-100">
                  <td className="px-4 py-1.5">
                    <span className="font-bold">{r.code}</span>{' '}
                    <span className="text-stone-400">· {r.name}</span>
                  </td>
                  {showCost && (
                    <td className="px-4 py-1.5 text-right tabular-nums text-stone-600">
                      {r.costRate == null ? '—' : money(r.costRate)}
                    </td>
                  )}
                  <td
                    className={`px-4 py-1.5 text-right tabular-nums ${r.stock < 0 ? 'text-red-600' : ''}`}
                  >
                    {money(r.stock)}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">
                      {confirmId === r.productId ? (
                        <>
                          <button
                            onClick={() => remove(r)}
                            disabled={deletingId === r.productId}
                            className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {deletingId === r.productId ? 'Deleting…' : 'Confirm'}
                          </button>{' '}
                          <button
                            onClick={() => setConfirmId(null)}
                            disabled={deletingId === r.productId}
                            className="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmId(r.productId);
                            setError('');
                          }}
                          className="rounded border border-stone-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-2 text-center text-[11px] text-stone-400">
        Stock is derived — it changes only through posted Day Books and Stock Adjustment vouchers.
      </p>
    </div>
  );
}

// Admin: the audit-tracked correction path (a reason is mandatory).
function AdjustForm({ rows, onDone }) {
  const [form, setForm] = useState({ productId: '', direction: 'IN', qty: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const res = await apiFetch('/stock/adjustment', {
        method: 'POST',
        body: {
          productId: form.productId,
          direction: form.direction,
          qty: Number(form.qty),
          reason: form.reason,
        },
      });
      onDone(`Stock adjusted — ${res.code} is now ${money(res.stock)}.`);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  const input = 'rounded border border-stone-300 px-2 py-1.5 text-sm';
  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
        Stock adjustment (voucher · reason required)
      </div>
      {err && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        <select value={form.productId} onChange={set('productId')} required className={`${input} sm:col-span-2`}>
          <option value="">Product…</option>
          {rows.map((r) => (
            <option key={r.productId} value={r.productId}>
              {r.code} · {r.name}
            </option>
          ))}
        </select>
        <select value={form.direction} onChange={set('direction')} className={input}>
          <option value="IN">IN (+)</option>
          <option value="OUT">OUT (−)</option>
        </select>
        <input
          value={form.qty}
          onChange={set('qty')}
          inputMode="decimal"
          placeholder="Qty"
          required
          className={`${input} text-right font-mono`}
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Adjust'}
        </button>
      </div>
      <input
        value={form.reason}
        onChange={set('reason')}
        placeholder="Reason (required) — e.g. damage, counting correction"
        required
        className={`${input} mt-2 w-full`}
      />
    </form>
  );
}

// Admin: add a NEW code with its opening stock (the Day-Zero seed for that code).
function AddCodeForm({ onDone }) {
  const [form, setForm] = useState({ code: '', name: '', openingStock: '', openingDate: todayYmd() });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await apiFetch('/products', {
        method: 'POST',
        body: {
          code: form.code.trim(),
          name: form.name.trim() || `Cloth ${form.code.trim().toUpperCase()}`,
          openingStock: Number(form.openingStock) || 0,
          openingDate: form.openingDate || undefined,
        },
      });
      onDone(`Added code ${form.code.trim().toUpperCase()}.`);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  const input = 'rounded border border-stone-300 px-2 py-1.5 text-sm';
  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
        Add product code (cost = code number × 50)
      </div>
      {err && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input value={form.code} onChange={set('code')} placeholder="Code (e.g. K72)" required className={input} />
        <input value={form.name} onChange={set('name')} placeholder="Name (optional)" className={input} />
        <input
          value={form.openingStock}
          onChange={set('openingStock')}
          inputMode="decimal"
          placeholder="Opening stock"
          className={`${input} text-right font-mono`}
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
      <label className="mt-2 block text-[11px] uppercase tracking-wide text-stone-500">
        Opening date (required if opening stock &gt; 0)
        <input type="date" value={form.openingDate} onChange={set('openingDate')} className={`${input} mt-1 block`} />
      </label>
    </form>
  );
}
