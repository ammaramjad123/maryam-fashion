import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ymdOf } from '../lib/day.js';

// Stored timestamp -> shop-local yyyy-mm-dd for <input type="date"> (never a raw
// UTC slice, which drifts a day for Karachi day-starts — see day.js).
function toDateInput(value) {
  return ymdOf(value);
}

function blankForm(fields) {
  return Object.fromEntries(fields.map((f) => [f.name, f.default ?? '']));
}

/**
 * Generic master CRUD screen: paginated + searchable list, create/edit form,
 * and soft-delete. Driven entirely by `config` so Party/Product/ExpenseHead
 * share one implementation.
 */
export default function MasterPage({ config }) {
  const { basePath, title, fields, searchPlaceholder = 'Search…' } = config;
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN';
  const canViewProfit = user?.permissions?.viewProfit === true;

  // Hide profit/cost-sensitive columns (e.g. Cost Rate) from users without the
  // permission — the data is already stripped server-side; this avoids blanks.
  const columns = config.columns.filter((c) => !c.sensitive || canViewProfit);

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');

  const [form, setForm] = useState(null); // null = closed; object = editing/creating
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim()) params.set('search', search.trim());
      const data = await apiFetch(`${basePath}?${params.toString()}`);
      setItems(data.items);
      setMeta({ total: data.total, page: data.page, totalPages: data.totalPages });
    } catch (err) {
      setListError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [basePath, page, search]);

  // Debounce search; reset to page 1 whenever the query changes.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setFormError('');
    setForm({ ...blankForm(fields), _id: null });
  }

  function openEdit(item) {
    setFormError('');
    const next = { _id: item._id };
    for (const f of fields) {
      next[f.name] = f.type === 'date' ? toDateInput(item[f.name]) : (item[f.name] ?? '');
    }
    setForm(next);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {};
      for (const f of fields) payload[f.name] = form[f.name];
      if (form._id) {
        await apiFetch(`${basePath}/${form._id}`, { method: 'PATCH', body: payload });
      } else {
        await apiFetch(basePath, { method: 'POST', body: payload });
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item) {
    try {
      await apiFetch(`${basePath}/${item._id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setListError(err.message || 'Deactivate failed');
    }
  }

  const showActions = canWrite;
  const colCount = columns.length + (showActions ? 1 : 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        {canWrite && (
          <button
            onClick={openCreate}
            className="rounded bg-slate-800 text-white text-sm px-3 py-1.5 hover:bg-slate-700"
          >
            + New
          </button>
        )}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
        placeholder={searchPlaceholder}
        className="w-full sm:w-72 mb-3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

      {listError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
          {listError}
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              {showActions && <th className="px-3 py-2 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-slate-400">
                  No records.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item._id}
                  className={`border-t border-slate-100 ${item.isActive ? '' : 'opacity-50'}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 whitespace-nowrap">
                      {c.render ? c.render(item) : (item[c.key] ?? '—')}
                    </td>
                  ))}
                  {showActions && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-slate-600 hover:text-slate-900 px-2"
                      >
                        Edit
                      </button>
                      {item.isActive && (
                        <button
                          onClick={() => deactivate(item)}
                          className="text-red-600 hover:text-red-800 px-2"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-slate-500">
        <span>{meta.total} record(s)</span>
        <div className="flex items-center gap-2">
          <button
            disabled={meta.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {meta.page} / {meta.totalPages}
          </span>
          <button
            disabled={meta.page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {form && (
        <FormPanel
          title={form._id ? `Edit ${title}` : `New ${title}`}
          fields={fields}
          form={form}
          setForm={setForm}
          onSubmit={save}
          onClose={() => setForm(null)}
          saving={saving}
          error={formError}
        />
      )}
    </div>
  );
}

function FormPanel({ title, fields, form, setForm, onSubmit, onClose, saving, error }) {
  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center bg-black/30 p-4 overflow-y-auto">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg bg-white rounded-lg shadow-lg border border-slate-200 p-5 mt-10 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.name} className={`block text-sm ${f.full ? 'sm:col-span-2' : ''}`}>
              <span className="text-slate-600">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              {f.type === 'select' ? (
                <select
                  value={form[f.name]}
                  onChange={(e) => setField(f.name, e.target.value)}
                  required={f.required}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">Select…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type || 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  value={form[f.name]}
                  onChange={(e) => setField(f.name, e.target.value)}
                  required={f.required}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              )}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-slate-800 text-white px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export { toDateInput };
