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
    </div>
  );
}
