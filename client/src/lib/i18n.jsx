// Single label map (docs/06 requires labels here, not hardcoded). Each entry
// carries the English string and a supplementary Urdu (Nastaliq) translation.
export const labels = {
  // Day Book sections
  sale: { en: 'Sale', ur: 'فروخت' },
  purchase: { en: 'Purchase', ur: 'خرید' },
  cashReceipt: { en: 'Cash Receipt', ur: 'نقد وصولی' },
  cashPayment: { en: 'Cash Payment', ur: 'نقد ادائیگی' },
  shopExpense: { en: 'Shop Expense', ur: 'دکان خرچ' },

  // Grid / table columns
  product: { en: 'Product', ur: 'مال' },
  party: { en: 'Name (party)', ur: 'نام (کھاتہ)' },
  supplier: { en: 'Supplier', ur: 'سپلائر' },
  qty: { en: 'Qty', ur: 'تعداد' },
  rate: { en: '@', ur: 'ریٹ' },
  amount: { en: 'Amt', ur: 'رقم' },
  amountFull: { en: 'Amount', ur: 'رقم' },
  profit: { en: 'P', ur: 'نفع' },
  narration: { en: 'Narration', ur: 'تفصیل' },
  head: { en: 'Head', ur: 'مد' },
  expenseHead: { en: 'Expense head', ur: 'خرچ کی مد' },
  name: { en: 'Name', ur: 'نام' },

  // Stock report columns
  opening: { en: 'Opening', ur: 'ابتدائی' },
  total: { en: 'Total', ur: 'کل' },
  closingStock: { en: 'Closing Stock', ur: 'اختتامی مال' },

  // Ledger
  debit: { en: 'Debit', ur: 'نامے' },
  credit: { en: 'Credit', ur: 'جمع' },
  balance: { en: 'Balance', ur: 'بقایا' },

  // Dashboard tiles
  totalSale: { en: 'Total Sale', ur: 'کل فروخت' },
  profitTile: { en: 'Profit', ur: 'نفع' },
  expense: { en: 'Expense', ur: 'خرچ' },
  cashInHand: { en: 'Cash in Hand', ur: 'نقد موجود' },
  cashSale: { en: 'Cash Sale', ur: 'نقد فروخت' },
  creditSale: { en: 'Credit Sale', ur: 'ادھار فروخت' },
  totalReceivable: { en: 'Total Receivable', ur: 'کل وصول طلب' },
  totalPayable: { en: 'Total Payable', ur: 'کل واجب الادا' },
  lowStock: { en: 'Low-stock items', ur: 'کم اسٹاک' },

  // Outstanding
  whoOwesUs: { en: 'Who owes us', ur: 'جن سے لینا ہے' },
  whomWeOwe: { en: 'Whom we owe', ur: 'جن کو دینا ہے' },
};

/**
 * Bilingual label: "English (اردو)". The English stays in the normal LTR flow;
 * only the Urdu is wrapped in a bidi-isolated RTL span with the Nastaliq font so
 * the script shapes and sits correctly. `k` looks up the map; `en`/`ur` override.
 */
export function L({ k, en, ur }) {
  const entry = k ? labels[k] : null;
  const english = en ?? entry?.en ?? k ?? '';
  const urdu = ur ?? entry?.ur;
  if (!urdu) return <>{english}</>;
  return (
    <>
      {english}{' '}
      <bdi dir="rtl" lang="ur" className="font-urdu">
        ({urdu})
      </bdi>
    </>
  );
}
