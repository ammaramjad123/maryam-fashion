import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { money } from '../lib/format.js';
import { todayYmd, ymdOf } from '../lib/day.js';

// A bank is a plain running balance — show the plain signed amount (a positive
// number is money we have; negative = overdraft, shown red).
const plain = (b) => money(b?.signedBalance || 0);
const isNeg = (b) => (b?.signedBalance || 0) < 0;
const ddmmyyyy = (v) => {
  const ymd = ymdOf(v) || String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

// Bank accounts (docs/07 R9.3): a separate running ledger, entered directly and
// never through the Day Book. Reuses the party ledger for the running balance.
export default function BankAccounts() {
  const [banks, setBanks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadBanks = useCallback(async () => {
    const { items } = await apiFetch('/banks');
    setBanks(items);
    return items;
  }, []);

  useEffect(() => {
    loadBanks().catch((e) => setMsg({ kind: 'err', text: e.message }));
  }, [loadBanks]);

  const loadLedger = useCallback(async (bank) => {
    if (!bank) return setLedger(null);
    const d = await apiFetch(`/reports/ledger?partyId=${bank._id}&from=2000-01-01&to=${todayYmd()}`);
    setLedger(d);
  }, []);

  useEffect(() => {
    loadLedger(selected).catch((e) => setMsg({ kind: 'err', text: e.message }));
  }, [selected, loadLedger]);

  async function refresh() {
    const items = await loadBanks();
    if (selected) {
      setSelected(items.find((b) => b._id === selected._id) || null);
      await loadLedger(selected);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Bank Accounts</h1>
        <p className="text-sm text-stone-500">
          A separate ledger — never touches the Day Book or shop cash.
        </p>
      </div>

      {msg && (
        <div
          className={`mb-3 rounded border px-3 py-2 text-sm ${
            msg.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Bank list + create */}
        <div className="space-y-4">
          <div className="rounded-lg border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
              Accounts
            </div>
            {banks.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-stone-400">No bank accounts yet.</div>
            ) : (
              <ul className="divide-y divide-stone-100 font-mono text-sm">
                {banks.map((b) => (
                  <li key={b._id}>
                    <button
                      onClick={() => setSelected(b)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left hover:bg-stone-50 ${
                        selected?._id === b._id ? 'bg-stone-100' : ''
                      }`}
                    >
                      <span>{b.name}</span>
                      <span className={`tabular-nums ${isNeg(b.balance) ? 'text-red-600' : 'text-stone-800'}`}>
                        {plain(b.balance)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {banks.length > 0 && (
              <div className="flex items-center justify-between border-t-2 border-stone-300 px-4 py-2 font-mono text-sm font-bold">
                <span className="text-[11px] uppercase tracking-wide text-stone-500">Total in banks</span>
                <span className="tabular-nums">
                  {money(banks.reduce((s, b) => s + (b.balance?.signedBalance || 0), 0))}
                </span>
              </div>
            )}
          </div>
          <NewBankForm onDone={refresh} setMsg={setMsg} />
        </div>

        {/* Selected bank: running ledger + add entry */}
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          {!selected ? (
            <div className="py-16 text-center text-sm text-stone-400">
              Pick a bank account to view its ledger and add entries.
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <div className="font-mono text-base font-bold">{selected.name}</div>
                <div className="text-sm">
                  Balance:{' '}
                  <span className={`font-bold ${isNeg(selected.balance) ? 'text-red-600' : ''}`}>
                    {plain(selected.balance)}
                  </span>
                </div>
              </div>

              <AddEntryForm
                bank={selected}
                onDone={async () => {
                  setMsg({ kind: 'ok', text: 'Entry added.' });
                  await refresh();
                }}
                setMsg={setMsg}
                busy={busy}
                setBusy={setBusy}
              />

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border border-stone-200 font-mono text-[13px]">
                  <thead>
                    <tr className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-left">Narration</th>
                      <th className="px-2 py-1 text-right">Debit</th>
                      <th className="px-2 py-1 text-right">Credit</th>
                      <th className="px-2 py-1 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger?.rows?.length ? (
                      ledger.rows.map((r, i) => (
                        <tr key={i} className="border-t border-stone-100">
                          <td className="px-2 py-1">{ddmmyyyy(r.date)}</td>
                          <td className="px-2 py-1">{r.narration}</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {r.debit ? money(r.debit) : ''}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {r.credit ? money(r.credit) : ''}
                          </td>
                          <td className={`px-2 py-1 text-right tabular-nums ${isNeg(r.balance) ? 'text-red-600' : ''}`}>
                            {plain(r.balance)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-2 py-4 text-center text-stone-400">
                          No entries yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NewBankForm({ onDone, setMsg }) {
  const [f, setF] = useState({
    name: '',
    openingBalance: '',
    openingDate: todayYmd(),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      // A bank opens with a plain starting amount — no Dr/Cr. The server always
      // treats a bank opening as Debit-side (money we have); the balance then
      // moves via the Debit/Credit entries added afterward.
      await apiFetch('/parties', {
        method: 'POST',
        body: {
          name: f.name.trim(),
          type: 'BANK',
          openingBalance: Number(f.openingBalance) || 0,
          openingDate: f.openingDate || undefined,
        },
      });
      setMsg({ kind: 'ok', text: `Bank ${f.name} created.` });
      setF({ name: '', openingBalance: '', openingDate: todayYmd() });
      await onDone();
    } catch (err) {
      setMsg({ kind: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded border border-stone-300 px-2 py-1.5 text-sm outline-none focus:bg-amber-50/60';
  return (
    <form onSubmit={submit} className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
        Add bank account
      </div>
      <div className="space-y-2">
        <input className={input} placeholder="Bank name" value={f.name} onChange={set('name')} required />
        <input className={input} inputMode="decimal" placeholder="Opening balance (amount)" value={f.openingBalance} onChange={set('openingBalance')} />
        <label className="block text-[11px] uppercase tracking-wide text-stone-500">
          Opening date (required with a balance)
          <input type="date" className={input} value={f.openingDate} onChange={set('openingDate')} />
        </label>
        <button
          disabled={busy}
          className="w-full rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Create bank account'}
        </button>
      </div>
    </form>
  );
}

function AddEntryForm({ bank, onDone, setMsg, busy, setBusy }) {
  const [f, setF] = useState({ date: todayYmd(), narration: '', direction: 'DR', amount: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/banks/${bank._id}/entries`, {
        method: 'POST',
        body: {
          date: f.date,
          narration: f.narration,
          direction: f.direction,
          amount: Number(f.amount) || 0,
        },
      });
      setF({ date: todayYmd(), narration: '', direction: 'DR', amount: '' });
      await onDone();
    } catch (err) {
      setMsg({ kind: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const input = 'rounded border border-stone-300 px-2 py-1.5 text-sm outline-none focus:bg-amber-50/60';
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded border border-stone-200 bg-stone-50/60 p-3">
      <label className="text-[11px] uppercase tracking-wide text-stone-500">
        Date
        <input type="date" className={`${input} block`} value={f.date} onChange={set('date')} required />
      </label>
      <label className="flex-1 text-[11px] uppercase tracking-wide text-stone-500">
        Narration
        <input className={`${input} block w-full`} placeholder="note" value={f.narration} onChange={set('narration')} />
      </label>
      <label className="text-[11px] uppercase tracking-wide text-stone-500">
        Dr / Cr
        <select className={`${input} block`} value={f.direction} onChange={set('direction')}>
          <option value="DR">Debit</option>
          <option value="CR">Credit</option>
        </select>
      </label>
      <label className="text-[11px] uppercase tracking-wide text-stone-500">
        Amount
        <input className={`${input} block w-28 text-right`} inputMode="decimal" placeholder="0" value={f.amount} onChange={set('amount')} required />
      </label>
      <button
        disabled={busy}
        className="rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        Add entry
      </button>
    </form>
  );
}
