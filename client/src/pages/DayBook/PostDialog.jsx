import { money } from '../../lib/format.js';

// Confirmation summary shown before POST. Posting is a real event (docs/06 R8).
export default function PostDialog({ counts, netCash, onConfirm, onCancel, busy }) {
  const parts = [];
  if (counts.sales) parts.push(`${counts.sales} sale${counts.sales > 1 ? 's' : ''}`);
  if (counts.purchases)
    parts.push(`${counts.purchases} purchase${counts.purchases > 1 ? 's' : ''}`);
  if (counts.receipts) parts.push(`${counts.receipts} receipt${counts.receipts > 1 ? 's' : ''}`);
  if (counts.payments) parts.push(`${counts.payments} payment${counts.payments > 1 ? 's' : ''}`);
  if (counts.expenses) parts.push(`${counts.expenses} expense${counts.expenses > 1 ? 's' : ''}`);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
        <h2 className="text-base font-bold text-stone-800">Post this day?</h2>
        <p className="mt-2 text-sm text-stone-600">
          Posting{' '}
          <span className="font-medium text-stone-800">
            {parts.length ? parts.join(', ') : 'an empty day'}
          </span>
          . Closing cash will be{' '}
          <span className="font-mono font-bold tabular-nums text-stone-900">{money(netCash)}</span>.
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Posting writes the stock, ledger and cash entries for the day. An admin can unpost it
          later to correct it.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
          >
            {busy ? 'Posting…' : 'Post day'}
          </button>
        </div>
      </div>
    </div>
  );
}
