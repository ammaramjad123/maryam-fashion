import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { addDays, prettyDay, isValidYmd } from '../../lib/day.js';
import { num, money } from '../../lib/format.js';
import { lineProfit } from '../../lib/profit.js';
import { assignBillNos, billNumbersForDisplay } from '../../lib/billNo.js';
import LineGrid from './LineGrid.jsx';
import TotalsFooter from './TotalsFooter.jsx';
import PostDialog from './PostDialog.jsx';
import { L } from '../../lib/i18n.jsx';

// --- blank-row templates + helpers ------------------------------------------
const BLANK = {
  goods: () => ({
    billNo: '',
    sameBill: false,
    productId: null,
    productCode: '',
    partyId: null,
    partyName: '',
    qty: '',
    rate: '',
    discount: '',
  }),
  cash: () => ({ partyId: null, partyName: '', narration: '', amount: '' }),
  expense: () => ({ headId: null, headName: '', narration: '', amount: '' }),
};

const isBlank = {
  // A row with a typed (even unresolved) product code is NOT blank — keep it so
  // the "unrecognised code" error stays visible instead of being swept away.
  goods: (r) =>
    !r.productId &&
    !String(r.productCode || '').trim() &&
    !r.partyId &&
    !num(r.qty) &&
    !num(r.rate),
  cash: (r) => !r.partyId && !num(r.amount) && !r.narration,
  expense: (r) => !r.headId && !num(r.amount) && !r.narration,
};

// Keep exactly one trailing blank row so there's always somewhere to type.
function normalize(rows, kind) {
  const blank = isBlank[kind];
  const out = rows.filter((r, i) => !(blank(r) && i !== rows.length - 1));
  if (out.length === 0 || !blank(out[out.length - 1])) out.push(BLANK[kind]());
  return out;
}

const SECTIONS = [
  { key: 'sales', kind: 'goods' },
  { key: 'purchases', kind: 'goods' },
  { key: 'receipts', kind: 'cash' },
  { key: 'payments', kind: 'cash' },
  { key: 'expenses', kind: 'expense' },
];

export default function DayBook() {
  const { date: ymd } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const showProfit = user?.permissions?.viewProfit === true;

  const [status, setStatus] = useState('DRAFT');
  const [openingCash, setOpeningCash] = useState(0);
  const [pageNo, setPageNo] = useState('');
  const [discount, setDiscount] = useState('');
  const [rows, setRows] = useState({
    sales: [BLANK.goods()],
    purchases: [BLANK.goods()],
    receipts: [BLANK.cash()],
    payments: [BLANK.cash()],
    expenses: [BLANK.expense()],
  });
  const [productMeta, setProductMeta] = useState({});
  const [partyMap, setPartyMap] = useState({});
  const [headMap, setHeadMap] = useState({});
  // Latest maps in refs so loadDay can read them WITHOUT depending on them —
  // otherwise the maps loading (async, after mount) would re-run loadDay, flip
  // `loading`, and unmount the grid mid-typing (killing the typeahead dropdown).
  const productMetaRef = useRef(productMeta);
  productMetaRef.current = productMeta;
  const partyMapRef = useRef(partyMap);
  partyMapRef.current = partyMap;
  const headMapRef = useRef(headMap);
  headMapRef.current = headMap;
  const [postedTotals, setPostedTotals] = useState(null);
  const [prevDay, setPrevDay] = useState(null); // previous-day reminders (docs/07 R9.2)
  const [baseBillNo, setBaseBillNo] = useState(1); // next bill number (auto), from the server

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: 'ok'|'err', text }
  const [showPost, setShowPost] = useState(false);

  // Load master maps once (for costRate + display of loaded lines).
  useEffect(() => {
    (async () => {
      try {
        // Reference data — cached for 5 min so revisiting the Day Book is instant
        // (a create/edit anywhere busts the cache automatically). See lib/api.js.
        const [prod, parties, heads] = await Promise.all([
          apiFetch('/products?limit=500', { cacheTtl: 300000 }),
          apiFetch('/parties?limit=500', { cacheTtl: 300000 }),
          apiFetch('/expense-heads?limit=500', { cacheTtl: 300000 }),
        ]);
        setProductMeta(
          Object.fromEntries(
            prod.items.map((p) => [
              p._id,
              { code: p.code, name: p.name, saleRate: p.saleRate, costRate: p.costRate },
            ])
          )
        );
        setPartyMap(Object.fromEntries(parties.items.map((p) => [p._id, p])));
        setHeadMap(Object.fromEntries(heads.items.map((h) => [h._id, h])));
      } catch {
        /* maps are best-effort; typeahead still works via search */
      }
    })();
  }, []);

  const loadDay = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    setPostedTotals(null);
    try {
      const { day, openingCash: oc, previousDay, nextBillNo } = await apiFetch(`/daybook/${ymd}`);
      setStatus(day.status);
      setOpeningCash(oc);
      setPrevDay(previousDay || null);
      setBaseBillNo(nextBillNo || 1);
      setPageNo(day.pageNo != null ? String(day.pageNo) : '');
      setDiscount(day.discountOnSale ? String(day.discountOnSale) : '');
      if (day.status === 'POSTED') setPostedTotals(day.totals || null);

      // Read maps from refs (current values) so map loading doesn't re-run this.
      const pMeta = productMetaRef.current;
      const pMap = partyMapRef.current;
      const hMap = headMapRef.current;
      const toGoods = (l) => ({
        billNo: l.billNo ?? '',
        sameBill: !!l.sameBill,
        productId: l.productId,
        productCode: pMeta[l.productId]?.code || '',
        partyId: l.partyId || null,
        partyName: l.partyId ? pMap[l.partyId]?.name || '' : '',
        qty: l.qty,
        rate: l.rate,
        discount: l.discount ? String(l.discount) : '',
      });
      setRows({
        sales: normalize((day.sales || []).map(toGoods), 'goods'),
        purchases: normalize((day.purchases || []).map(toGoods), 'goods'),
        receipts: normalize(
          (day.receipts || []).map((l) => ({
            partyId: l.partyId,
            partyName: pMap[l.partyId]?.name || '',
            narration: l.narration || '',
            amount: l.amount,
          })),
          'cash'
        ),
        payments: normalize(
          (day.payments || []).map((l) => ({
            partyId: l.partyId,
            partyName: pMap[l.partyId]?.name || '',
            narration: l.narration || '',
            amount: l.amount,
          })),
          'cash'
        ),
        expenses: normalize(
          (day.expenses || []).map((l) => ({
            headId: l.expenseHeadId,
            headName: hMap[l.expenseHeadId]?.name || '',
            narration: l.narration || '',
            amount: l.amount,
          })),
          'expense'
        ),
      });
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Failed to load' });
    } finally {
      setLoading(false);
    }
    // Depends ONLY on the date — NOT the maps (they're read via refs above), so
    // map loading never re-runs this / never flips `loading` / never unmounts.
  }, [ymd]);

  useEffect(() => {
    if (isValidYmd(ymd)) loadDay();
  }, [loadDay, ymd]);

  // When the master maps finish loading, fill in the display names of already-
  // loaded lines (code / party / head) WITHOUT reloading the day or flipping
  // `loading` — so the grid stays mounted and in-progress typing is preserved.
  // Only rows that have an id but no display text are touched; blank rows (the
  // trailing one you type into) return the SAME object reference, so nothing the
  // user is editing is disturbed.
  useEffect(() => {
    const fillGoods = (r) => {
      let out = r;
      if (r.productId && !r.productCode && productMeta[r.productId])
        out = { ...out, productCode: productMeta[r.productId].code || '' };
      if (r.partyId && !r.partyName && partyMap[r.partyId])
        out = { ...out, partyName: partyMap[r.partyId].name || '' };
      return out;
    };
    const fillCash = (r) =>
      r.partyId && !r.partyName && partyMap[r.partyId]
        ? { ...r, partyName: partyMap[r.partyId].name || '' }
        : r;
    const fillExpense = (r) =>
      r.headId && !r.headName && headMap[r.headId]
        ? { ...r, headName: headMap[r.headId].name || '' }
        : r;
    setRows((prev) => ({
      ...prev,
      sales: prev.sales.map(fillGoods),
      purchases: prev.purchases.map(fillGoods),
      receipts: prev.receipts.map(fillCash),
      payments: prev.payments.map(fillCash),
      expenses: prev.expenses.map(fillExpense),
    }));
  }, [productMeta, partyMap, headMap]);

  // --- row editing --------------------------------------------------------
  const editable = status !== 'POSTED';
  const setSection = (key, updater) =>
    setRows((prev) => {
      const kind = SECTIONS.find((s) => s.key === key).kind;
      return { ...prev, [key]: normalize(updater(prev[key]), kind) };
    });
  const onCellChange = (key) => (i, patch) =>
    setSection(key, (rowsK) => rowsK.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const onDeleteRow = (key) => (i) =>
    setSection(key, (rowsK) => rowsK.filter((_, idx) => idx !== i));
  const onCommit = () => {}; // trailing blank is guaranteed by normalize()

  // --- live totals --------------------------------------------------------
  const liveTotals = useMemo(() => {
    let cashSale = 0,
      creditSale = 0,
      saleProfit = 0,
      purchaseProfit = 0,
      totalPurchase = 0,
      cashPurchase = 0;
    // Credit Sale section = credit sale lines grouped by party — accumulated in
    // THIS same loop so it can never disagree with the creditSale total (R2).
    const creditByParty = new Map();
    for (const r of rows.sales) {
      if (!r.productId) continue;
      const a = num(r.qty) * num(r.rate) || 0;
      if (r.partyId) {
        creditSale += a;
        const prev = creditByParty.get(r.partyId) || { partyName: r.partyName || '—', amount: 0 };
        prev.amount += a;
        creditByParty.set(r.partyId, prev);
      } else cashSale += a;
      // Same shared formula as the grid's P cell (lib/profit.js) — the per-line
      // discount reduces profit only (never cashSale/creditSale above).
      saleProfit +=
        lineProfit({
          rate: r.rate,
          qty: r.qty,
          cost: productMeta[r.productId]?.costRate,
          discount: r.discount,
        }) || 0;
    }
    for (const r of rows.purchases) {
      if (!r.productId) continue;
      const a = num(r.qty) * num(r.rate) || 0;
      totalPurchase += a;
      if (!r.partyId) cashPurchase += a;
      purchaseProfit +=
        lineProfit({
          rate: r.rate,
          qty: r.qty,
          cost: productMeta[r.productId]?.costRate,
          kind: 'purchase',
        }) || 0;
    }
    const sum = (arr) => arr.reduce((s, r) => s + (num(r.amount) || 0), 0);
    const totalReceipts = sum(rows.receipts.filter((r) => r.partyId || num(r.amount)));
    const totalPayments = sum(rows.payments.filter((r) => r.partyId || num(r.amount)));
    const totalExpenses = sum(rows.expenses.filter((r) => r.headId || num(r.amount)));
    const disc = num(discount) || 0;
    const totalSale = cashSale + creditSale;
    const cashSaleLessDisc = cashSale - disc;
    const totalCash = openingCash + totalReceipts + cashSaleLessDisc;
    return {
      cashSale,
      creditSale,
      creditSaleByParty: [...creditByParty.values()],
      totalSale,
      discountOnSale: disc,
      totalSaleLessDisc: totalSale - disc,
      cashSaleLessDisc,
      totalProfit: saleProfit + purchaseProfit,
      totalPurchase,
      cashPurchase,
      totalReceipts,
      totalPayments,
      totalExpenses,
      totalCash,
      netCash: totalCash - totalPayments - totalExpenses - cashPurchase,
    };
  }, [rows, discount, openingCash, productMeta]);

  const footerTotals = status === 'POSTED' && postedTotals ? postedTotals : liveTotals;

  // Bill numbers for the sale grid, forward-filled so joined rows display the
  // shared number (auto or override), aligned to rows.sales.
  const saleBillNos = useMemo(
    () => billNumbersForDisplay(rows.sales, baseBillNo),
    [rows.sales, baseBillNo]
  );

  // Reverse index: typed code (case-insensitive) → product, so "k30" resolves to
  // K30 without needing the dropdown.
  const codeIndex = useMemo(() => {
    const idx = {};
    for (const [id, meta] of Object.entries(productMeta)) {
      if (meta?.code) idx[meta.code.toUpperCase()] = { _id: id, code: meta.code, saleRate: meta.saleRate };
    }
    return idx;
  }, [productMeta]);
  const resolveProduct = useCallback((text) => codeIndex[String(text).trim().toUpperCase()] || null, [codeIndex]);

  // Rows with a typed code that didn't resolve to a product → block posting.
  const unresolved = useMemo(
    () =>
      [...rows.sales, ...rows.purchases].filter((r) => !r.productId && String(r.productCode || '').trim())
        .length,
    [rows.sales, rows.purchases]
  );

  const counts = useMemo(
    () => ({
      sales: rows.sales.filter((r) => r.productId).length,
      purchases: rows.purchases.filter((r) => r.productId).length,
      receipts: rows.receipts.filter((r) => r.partyId || num(r.amount)).length,
      payments: rows.payments.filter((r) => r.partyId || num(r.amount)).length,
      expenses: rows.expenses.filter((r) => r.headId || num(r.amount)).length,
    }),
    [rows]
  );

  // --- payload + persistence ---------------------------------------------
  function buildPayload() {
    const realSales = rows.sales.filter((r) => r.productId);
    // Auto/override bill numbers, per bill, continuing from the last posted day.
    const bnos = assignBillNos(realSales, baseBillNo);
    return {
      pageNo: pageNo === '' ? undefined : Number(pageNo),
      discountOnSale: num(discount) || 0,
      sales: realSales.map((r, i) => ({
        // Per-BILL number (docs/07 R9.1): the auto/override number on a bill-start
        // row, nothing on a continuation/joined row (blank on the sheet).
        billNo: bnos[i] == null ? undefined : bnos[i],
        sameBill: !!r.sameBill, // manual bill grouping
        productId: r.productId,
        partyId: r.partyId || null,
        qty: Number(r.qty),
        rate: Number(r.rate),
        discount: Number(r.discount) || 0, // per-line discount (reduces profit only)
      })),
      purchases: rows.purchases
        .filter((r) => r.productId)
        .map((r) => ({
          productId: r.productId,
          partyId: r.partyId || null,
          qty: Number(r.qty),
          rate: Number(r.rate),
        })),
      receipts: rows.receipts
        .filter((r) => r.partyId || num(r.amount))
        .map((r) => ({ partyId: r.partyId, narration: r.narration, amount: Number(r.amount) })),
      payments: rows.payments
        .filter((r) => r.partyId || num(r.amount))
        .map((r) => ({ partyId: r.partyId, narration: r.narration, amount: Number(r.amount) })),
      expenses: rows.expenses
        .filter((r) => r.headId || num(r.amount))
        .map((r) => ({
          expenseHeadId: r.headId,
          narration: r.narration,
          amount: Number(r.amount),
        })),
    };
  }

  async function save() {
    const { openingCash: oc } = await apiFetch(`/daybook/${ymd}`, {
      method: 'PUT',
      body: buildPayload(),
    });
    setOpeningCash(oc);
  }

  async function handleSave() {
    setBusy(true);
    setMsg(null);
    try {
      await save();
      setMsg({ kind: 'ok', text: 'Draft saved.' });
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handlePost() {
    if (unresolved > 0) {
      setShowPost(false);
      setMsg({
        kind: 'err',
        text: `Fix ${unresolved} unrecognised product code${unresolved > 1 ? 's' : ''} before posting (highlighted red).`,
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await save(); // persist edits first
      const { day } = await apiFetch(`/daybook/${ymd}/post`, { method: 'POST' });
      setStatus('POSTED');
      setPostedTotals(day.totals || null);
      setShowPost(false);
      setMsg({ kind: 'ok', text: `Posted. Closing cash ${money(day.totals?.netCash)}.` });
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnpost() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/daybook/${ymd}/unpost`, { method: 'POST' });
      await loadDay();
      setMsg({ kind: 'ok', text: 'Unposted — back to draft.' });
    } catch (e) {
      setMsg({ kind: 'err', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!isValidYmd(ymd)) {
    return <div className="p-4 text-sm text-red-600">Invalid date in the URL. Use YYYY-MM-DD.</div>;
  }

  const goodsCols = (partyLabel, partyOptional, profitCompute, withBill = false, withDiscount = false) => [
    // Bill number precedes the code on sale lines (docs/07 R9.1): "12037 k44".
    ...(withBill
      ? [{ key: 'billNo', type: 'billno', label: <L en="Bill #" ur="بل نمبر" />, width: '96px' }]
      : []),
    { key: 'productCode', type: 'product', label: <L k="product" />, width: '110px' },
    { key: 'partyName', type: 'party', label: partyLabel, width: '180px', optional: partyOptional },
    { key: 'qty', type: 'qty', label: <L k="qty" />, width: '72px', align: 'right' },
    { key: 'rate', type: 'rate', label: <L k="rate" />, width: '84px', align: 'right' },
    { key: 'amount', type: 'amount', label: <L k="amount" />, width: '104px', align: 'right' },
    // Per-line discount (Rs) — reduces PROFIT only; sales only.
    ...(withDiscount
      ? [{ key: 'discount', type: 'discount', label: <L en="Disc" ur="رعایت" />, width: '78px', align: 'right', placeholder: '0' }]
      : []),
    // The P (profit) column only for users who may view profit.
    ...(showProfit
      ? [
          {
            key: 'profit',
            type: 'profit',
            label: <L k="profit" />,
            width: '92px',
            align: 'right',
            compute: profitCompute,
          },
        ]
      : []),
    { key: 'tag', type: 'tag', label: '', width: '70px' },
  ];
  const cashCols = [
    { key: 'partyName', type: 'party', label: <L k="party" />, width: '220px' },
    { key: 'narration', type: 'text', label: <L k="narration" />, placeholder: 'note' },
    { key: 'amount', type: 'money', label: <L k="amount" />, width: '120px', align: 'right' },
  ];
  const expenseCols = [
    { key: 'headName', type: 'head', label: <L k="expenseHead" />, width: '220px' },
    { key: 'narration', type: 'text', label: <L k="narration" />, placeholder: 'note' },
    { key: 'amount', type: 'money', label: <L k="amount" />, width: '120px', align: 'right' },
  ];

  const gridProps = (key) => ({
    rows: rows[key],
    productMeta,
    resolveProduct, // code → product (case-insensitive), for typed-code resolution
    onCellChange: onCellChange(key),
    onCommit,
    onDeleteRow: onDeleteRow(key),
    readOnly: !editable,
  });

  const postClick = () =>
    unresolved > 0
      ? setMsg({
          kind: 'err',
          text: `Fix ${unresolved} unrecognised product code${unresolved > 1 ? 's' : ''} before posting (highlighted red).`,
        })
      : setShowPost(true);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header: date nav + status (primary actions are in the sticky bar) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/daybook/${addDays(ymd, -1)}`)}
            className="rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-100"
            title="Previous day"
          >
            ◀
          </button>
          <div>
            <div className="text-lg font-bold text-stone-800">{prettyDay(ymd)}</div>
            <input
              type="date"
              value={ymd}
              onChange={(e) => e.target.value && navigate(`/daybook/${e.target.value}`)}
              className="text-xs text-stone-500 outline-none"
            />
          </div>
          <button
            onClick={() => navigate(`/daybook/${addDays(ymd, 1)}`)}
            className="rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-100"
            title="Next day"
          >
            ▶
          </button>
          <StatusChip status={status} />
          <label className="ml-2 flex items-center gap-1 text-[11px] uppercase tracking-wide text-stone-500">
            Page No.
            <input
              value={pageNo}
              inputMode="numeric"
              disabled={!editable}
              onChange={(e) => setPageNo(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-16 rounded border border-stone-300 px-2 py-1 text-right font-mono text-sm outline-none focus:bg-amber-50/70 disabled:bg-stone-50"
            />
          </label>
        </div>

        {/* Primary actions live in the sticky action bar at the bottom, so they
            stay reachable while the operator scrolls the long sheet. */}
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

      {/* Previous-day reminders (docs/07 R9.2) — read-only carry-forward, not inputs */}
      {prevDay && <PrevDayStrip prev={prevDay} showProfit={showProfit} />}

      {/* The sheet */}
      <div className="relative rounded-lg border border-stone-300 bg-[#FCFBF8] p-3 shadow-sm">
        {status === 'POSTED' && (
          <div className="pointer-events-none absolute right-6 top-6 -rotate-12 rounded border-2 border-red-400/70 px-3 py-1 text-lg font-black uppercase tracking-widest text-red-500/70">
            Posted
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-stone-400">Loading…</div>
        ) : (
          <>
            <LineGrid
              title={<L k="sale" />}
              accent="border-emerald-400"
              columns={goodsCols(<L en="Name (party)" ur="نام (کھاتہ)" />, true, 'saleProfit', true, true)}
              billNos={saleBillNos}
              {...gridProps('sales')}
            />
            <LineGrid
              title={<L k="purchase" />}
              accent="border-sky-400"
              columns={goodsCols(<L en="Supplier" ur="سپلائر" />, true, 'purchaseProfit')}
              {...gridProps('purchases')}
            />
            <LineGrid
              title={<L k="cashReceipt" />}
              accent="border-teal-400"
              columns={cashCols}
              {...gridProps('receipts')}
            />
            <LineGrid
              title={<L k="cashPayment" />}
              accent="border-orange-400"
              columns={cashCols}
              {...gridProps('payments')}
            />
            <LineGrid
              title={<L k="shopExpense" />}
              accent="border-rose-400"
              columns={expenseCols}
              {...gridProps('expenses')}
            />

            {/* 6th section (docs/07 R2): read-only, auto-generated — credit sale
                lines grouped by party, from the SAME source as creditSale. */}
            <CreditSaleSection
              rows={liveTotals.creditSaleByParty}
              total={liveTotals.creditSale}
            />

            <div className="mb-1 flex items-center justify-end gap-2 text-sm">
              <label className="text-[11px] uppercase tracking-wide text-stone-500">
                Discount on Sale
              </label>
              <input
                value={discount}
                inputMode="decimal"
                disabled={!editable}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-28 rounded border border-stone-300 px-2 py-1 text-right font-mono tabular-nums text-sm outline-none focus:bg-amber-50/70 disabled:bg-stone-50"
              />
            </div>

            <TotalsFooter t={footerTotals} openingCash={openingCash} showProfit={showProfit} />
          </>
        )}
      </div>

      <p className="mt-2 text-center text-[11px] text-stone-400">
        Tab moves across a row · Enter commits a line · Esc clears it · type a code to search
      </p>

      {/* Sticky action bar — the day's bottom line + Save/Post stay in view while
          scrolling the long sheet, so the operator never hunts for them. */}
      {!loading && (
        <div className="sticky bottom-0 z-20 mt-3 rounded-t-xl border border-b-0 border-stone-300 bg-white/95 px-3 py-2 shadow-[0_-6px_16px_-6px_rgba(0,0,0,0.12)] backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 sm:gap-7">
              <BarStat label={<L en="Total Sale" ur="کل فروخت" />} value={footerTotals.totalSale} />
              {showProfit && (
                <BarStat label={<L k="profitTile" />} value={footerTotals.totalProfit} signed />
              )}
              <BarStat
                label={<L en="Net Cash" ur="نقد موجود" />}
                value={footerTotals.netCash}
                strong
                signed
              />
            </div>
            <div className="flex items-center gap-2">
              {editable ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={busy}
                    className="rounded-lg border border-stone-300 px-3.5 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-60"
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={postClick}
                    disabled={busy}
                    className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-700 disabled:opacity-60"
                  >
                    Post day
                  </button>
                </>
              ) : isAdmin ? (
                <button
                  onClick={handleUnpost}
                  disabled={busy}
                  className="rounded-lg border border-red-300 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Unpost
                </button>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                  Posted
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {showPost && (
        <PostDialog
          counts={counts}
          netCash={liveTotals.netCash}
          busy={busy}
          onCancel={() => setShowPost(false)}
          onConfirm={handlePost}
        />
      )}
    </div>
  );
}

// docs/07 R9.2 — yesterday's headline figures, reprinted as a reminder. These
// are computed by the server from the last posted day; the operator never types
// them. Each carries a tick to echo the paper sheet.
function PrevDayStrip({ prev, showProfit }) {
  const items = [
    showProfit && { label: <L k="profitTile" />, value: prev.totalProfit, signed: true },
    { label: <L k="cashSale" />, value: prev.cashSale },
    { label: <L k="creditSale" />, value: prev.creditSale },
    { label: <L en="Shop Expense" ur="دکان خرچ" />, value: prev.totalExpenses },
    { label: <L en="Net Cash" ur="نقد موجود" />, value: prev.netCash },
  ].filter(Boolean);
  return (
    <div className="mb-3 rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
        <L en="Yesterday" ur="گزشتہ دن" /> · {prettyDay(prev.date)} ✓
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[13px]">
        {items.map((it, i) => (
          <div key={i} className="flex items-baseline gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-stone-400">{it.label}</span>
            <span
              className={`tabular-nums ${it.signed && it.value < 0 ? 'text-red-600' : 'text-stone-700'}`}
            >
              {money(it.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The paper's 6th section: Credit Sale — auto-generated (docs/07 R2), NOT an
// entry grid. Credit sale lines grouped by party, read-only. Its total equals
// the footer's Credit Sale (same source: liveTotals).
function CreditSaleSection({ rows, total }) {
  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 border-l-4 border-amber-400 bg-stone-100 px-2 py-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-stone-600">
          <L en="Credit Sale (by party)" ur="ادھار فروخت" />
        </h3>
        <span className="text-[10px] text-stone-400">auto · read-only</span>
      </div>
      <div className="overflow-x-auto border border-t-0 border-stone-200">
        <table className="w-full border-collapse font-mono">
          <thead>
            <tr className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-400">
              <th className="border-b border-stone-200 px-1.5 py-1 text-left font-medium">
                <L k="name" />
              </th>
              <th className="w-40 border-b border-stone-200 px-1.5 py-1 text-right font-medium">
                <L k="amount" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-1.5 py-2 text-center text-[13px] text-stone-400">
                  No credit sales — a sale line with a party name appears here.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-b border-stone-100 last:border-b-0">
                  <td className="px-1.5 py-1 text-[13px]">{r.partyName}</td>
                  <td
                    className={`px-1.5 py-1 text-right text-[13px] tabular-nums ${
                      r.amount < 0 ? 'text-red-600' : 'text-stone-700'
                    }`}
                  >
                    {money(r.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="font-mono">
              <tr className="border-t-2 border-stone-300 bg-stone-50 text-[13px] font-bold">
                <td className="px-1.5 py-1">Total</td>
                <td
                  className={`px-1.5 py-1 text-right tabular-nums ${
                    total < 0 ? 'text-red-600' : 'text-stone-800'
                  }`}
                >
                  {money(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// One figure in the sticky action bar. `strong` enlarges (Net Cash); `signed`
// turns negatives red (profit / net cash may go negative — that's normal).
function BarStat({ label, value, strong, signed }) {
  const neg = signed && value < 0;
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] font-medium uppercase tracking-wide text-stone-400">{label}</span>
      <span
        className={`font-mono tabular-nums ${strong ? 'text-base font-bold' : 'text-sm font-semibold'} ${
          neg ? 'text-red-600' : 'text-stone-800'
        }`}
      >
        {money(value)}
      </span>
    </div>
  );
}

function StatusChip({ status }) {
  const posted = status === 'POSTED';
  return (
    <span
      className={`ml-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        posted ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {status}
    </span>
  );
}

function errorText(e) {
  if (e instanceof ApiError && e.status === 400)
    return e.message + ' — check the highlighted lines.';
  return e.message || 'Something went wrong.';
}
