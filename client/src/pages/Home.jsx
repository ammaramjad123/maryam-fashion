import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money } from '../lib/format.js';
import { prettyDay, todayYmd } from '../lib/day.js';
import { L } from '../lib/i18n.jsx';

function Tile({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'text-stone-900',
    negative: 'text-red-600',
    good: 'text-emerald-700',
  };
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-400">{sub}</div>}
    </div>
  );
}

function PartyList({ title, sub, rows = [], tone }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-stone-200 px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{title}</span>
        <span className="text-[10px] text-stone-400">{sub}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-stone-400">Nothing outstanding.</div>
      ) : (
        <ul className="max-h-64 divide-y divide-stone-100 overflow-y-auto font-mono text-sm">
          {rows.map((p) => (
            <li key={p.accountCode} className="flex justify-between px-4 py-1.5">
              <span className="truncate">{p.name}</span>
              <span className={`tabular-nums ${tone}`}>{money(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const today = todayYmd();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/dashboard?date=${today}`)
      .then((data) => !cancelled && setD(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [today]);

  const showProfit = d && 'profit' in d; // stripped server-side for non-viewProfit users

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {user?.name}</h1>
          <p className="text-sm text-stone-500">Today · {prettyDay(today)}</p>
        </div>
        <Link
          to={`/daybook/${today}`}
          className="rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          {"Open today's Day Book"}
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-600">{error}</div>
      ) : (
        <>
          {!d.posted && (
            <div className="mb-4 rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500">
              Today is not posted yet — sale, profit and expense show 0 until you post the Day Book.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={<L k="totalSale" />} value={money(d.sale)} />
            {showProfit && (
              <Tile
                label={<L k="profitTile" />}
                value={money(d.profit)}
                tone={d.profit < 0 ? 'negative' : 'good'}
              />
            )}
            <Tile label={<L k="expense" />} value={money(d.expense)} />
            <Tile label={<L k="cashInHand" />} value={money(d.cashInHand)} />
            <Tile label={<L k="creditSale" />} value={money(d.creditSale)} />
            <Tile
              label={<L k="totalReceivable" />}
              value={money(d.totalReceivable)}
              sub="they owe us · Dr"
            />
            <Tile
              label={<L k="totalPayable" />}
              value={money(d.totalPayable)}
              sub="we owe them · Cr"
              tone="negative"
            />
            <Tile label={<L k="lowStock" />} value={d.lowStock.length} />
          </div>

          {/* Parties & Credit (docs/03 Module 2b) — who owes us / whom we owe */}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <PartyList
              title={<L k="whoOwesUs" />}
              sub="jin se lena hai · Dr"
              rows={d.receivables}
              tone="text-emerald-700"
            />
            <PartyList
              title={<L k="whomWeOwe" />}
              sub="jin ko dena hai · Cr"
              rows={d.payables}
              tone="text-red-600"
            />
          </div>

          <div className="mt-4 rounded-lg border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
              Low stock (≤ 10)
            </div>
            {d.lowStock.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-stone-400">
                Nothing low right now.
              </div>
            ) : (
              <ul className="divide-y divide-stone-100 font-mono text-sm">
                {d.lowStock.map((p) => (
                  <li key={p.code} className="flex justify-between px-4 py-1.5">
                    <span>
                      <b>{p.code}</b> · {p.name}
                    </span>
                    <span
                      className={`tabular-nums ${p.stock < 0 ? 'text-red-600' : 'text-stone-700'}`}
                    >
                      {money(p.stock)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {isAdmin && <DayZeroSetup />}
    </div>
  );
}

// ONE-TIME go-live tool (admin). Wipes every day record (keeps products, parties
// and expense heads) and posts a "Day Zero" so the first real day carries the
// owner's opening cash and yesterday figures. Destructive — guarded by a typed
// confirmation. Remove this panel once go-live is done.
function DayZeroSetup() {
  const [open, setOpen] = useState(false);
  const [dayZeroDate, setDayZeroDate] = useState('2026-09-01');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const figures = [
    ['Opening Cash (Day Zero)', 143742],
    ['Cash Sale', 256700],
    ['Cash Sale Less Disc', 258600],
    ['Paid Cash', 110000],
    ['Shop Expense', 71639],
    ['Total Profit', -265455],
    ['Net Cash → Day 1 opening', 220703],
  ];

  async function run() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch('/maintenance/seed-day-zero', {
        method: 'POST',
        body: { dayZeroDate },
      });
      setResult(data);
      setConfirmText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
          ⚙︎ Go-Live: Day-Zero setup (one-time)
        </span>
        <span className="text-xs text-amber-700">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-amber-200 px-4 py-3">
          <p className="mb-3 text-sm text-stone-700">
            This <b>deletes every day record</b> (and its stock/ledger movements) and posts a{' '}
            <b>Day Zero</b> that carries these figures into your first real day. Your products,
            parties (khata) and expense heads are <b>kept</b>.
          </p>

          <div className="mb-3 overflow-hidden rounded border border-stone-200 bg-white">
            <table className="w-full font-mono text-[13px]">
              <tbody>
                {figures.map(([label, value]) => (
                  <tr key={label} className="border-b border-stone-100 last:border-b-0">
                    <td className="px-3 py-1 text-stone-600">{label}</td>
                    <td
                      className={`px-3 py-1 text-right tabular-nums ${
                        value < 0 ? 'text-red-600' : 'text-stone-800'
                      }`}
                    >
                      {money(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-stone-500">
              Day-Zero date (the day BEFORE your first real day)
            </span>
            <input
              type="date"
              value={dayZeroDate}
              onChange={(e) => setDayZeroDate(e.target.value)}
              className="rounded border border-stone-300 px-2 py-1.5 font-mono text-sm"
            />
          </label>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-stone-500">
              Type <b>RESET</b> to confirm this deletes all day records
            </span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              className="rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>

          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {result && (
            <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {result.message ||
                `Day Zero seeded. Deleted ${result.deleted?.dayBooks ?? 0} day book(s).`}{' '}
              Open{' '}
              <Link to={`/daybook/${todayYmd()}`} className="font-semibold underline">
                today&rsquo;s Day Book
              </Link>{' '}
              to see it carry forward.
            </div>
          )}

          <button
            onClick={run}
            disabled={busy || confirmText !== 'RESET'}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Running…' : 'Reset & seed Day Zero'}
          </button>
        </div>
      )}
    </div>
  );
}
