import mongoose from 'mongoose';

const { Schema } = mongoose;
const oid = Schema.Types.ObjectId;

// A sale line: the operator enters { billNo, partyId, productId, qty, rate };
// the engine freezes costRate and computes amount/profit at post time.
const saleSchema = new Schema(
  {
    billNo: Number, // physical bill-book number (docs/07 R9.1); operator-entered
    // Operator marks this line as belonging to the SAME bill as the row above,
    // regardless of party. Lets several cash lines share one bill number.
    sameBill: { type: Boolean, default: false },
    partyId: { type: oid, ref: 'Party', default: null }, // null = CASH sale
    productId: { type: oid, ref: 'Product' },
    qty: Number, // MAY be negative (a return)
    rate: Number,
    discount: { type: Number, default: 0 }, // per-line discount (Rs) — reduces PROFIT only
    amount: Number, // qty * rate (signed) — set at post time
    costRate: Number, // frozen at post time — DERIVED from the code (R6)
    profit: Number, // (rate − costRate) * qty − discount (signed) — set at post time
    voucherNo: Number,
  },
  { _id: false }
);

const purchaseSchema = new Schema(
  {
    partyId: { type: oid, ref: 'Party', default: null }, // null = CASH purchase
    productId: { type: oid, ref: 'Product' },
    qty: Number,
    rate: Number,
    amount: Number,
    profit: Number, // per Setting.purchaseProfitFormula (default 0)
    voucherNo: Number,
  },
  { _id: false }
);

const receiptSchema = new Schema(
  { partyId: { type: oid, ref: 'Party' }, narration: String, amount: Number },
  { _id: false }
);
const paymentSchema = receiptSchema;
const expenseSchema = new Schema(
  { expenseHeadId: { type: oid, ref: 'ExpenseHead' }, narration: String, amount: Number },
  { _id: false }
);

const totalsSchema = new Schema(
  {
    cashSale: Number,
    creditSale: Number,
    totalSale: Number,
    discountOnSale: Number,
    totalSaleLessDisc: Number,
    cashSaleLessDisc: Number,
    totalProfit: Number,
    totalPurchase: Number, // all purchases (cash + credit)
    cashPurchase: Number, // purchases with NO party → cash OUT
    totalReceipts: Number,
    totalPayments: Number, // "Paid Cash" — NOT an expense
    totalExpenses: Number, // "Shop Exp"
    totalCash: Number,
    netCash: Number, // closing cash
  },
  { _id: false }
);

const dayBookSchema = new Schema(
  {
    date: { type: Date, required: true, unique: true }, // one DayBook per date
    status: { type: String, enum: ['DRAFT', 'POSTED'], default: 'DRAFT' },
    pageNo: { type: Number }, // register page (docs/07) — auto-incremented, editable
    openingCash: { type: Number, default: 0 }, // snapshot at post time
    sales: [saleSchema],
    purchases: [purchaseSchema],
    receipts: [receiptSchema],
    payments: [paymentSchema],
    expenses: [expenseSchema],
    discountOnSale: { type: Number, default: 0 },
    totals: totalsSchema,
    // One-off DISPLAY override for a seeded "Day Zero" go-live record: lets the
    // Daily Sale report print exact paper figures (e.g. running Total Profit /
    // Total Exp / Total Sale Bank, and the top-band reminder) that the normal
    // per-day model does not derive. Ignored by every calculation — only the
    // report reads it, and only when present. Shape: { totals?, previousDay? }.
    reportOverride: { type: mongoose.Schema.Types.Mixed, default: undefined },
    postedAt: Date,
    postedBy: { type: oid, ref: 'User' },
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('DayBook', dayBookSchema);
