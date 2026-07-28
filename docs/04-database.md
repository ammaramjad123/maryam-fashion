# 04 — Database Design (MongoDB / Mongoose)

## Design principle

**Vouchers are the source of truth. Balances are derived.**

We store what *happened* (a sale, a payment). We never store a "current balance" as a typed, editable field. Stock, ledger balance and cash balance are all computed by aggregating transactions.

Two derived collections — `StockTransaction` and `LedgerEntry` — are written automatically by the system when a voucher is **posted**, and deleted when it is **unposted**. They exist for fast reporting, but they are *never* edited by a user.

---

## Collections

### 1. `User`
```js
{
  name, email, passwordHash,
  role: 'ADMIN' | 'OPERATOR',
  permissions: {
    viewProfit: Boolean       // ADMIN: true   OPERATOR: false (default)
  },
  isActive: Boolean,
  timestamps
}
```
`viewProfit: false` ⇒ the server **strips** `profit`, `costRate` and the report `P` column from every
response, and returns 403 on `/reports/profit`. See `08-open-questions.md` Q6.

### 2. `Party`
```js
{
  accountCode: String,        // "2201001" — unique, chart-of-accounts style (seen on the real ledger)
  name,                       // "farhan malik account"
  type: 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'BANK' | 'OTHER',
  phone, address,
  openingBalance: Number,     // always positive
  openingType: 'DR' | 'CR',   // DR = party owes shop, CR = shop owes party
  openingDate: Date,
  isActive: Boolean,
  timestamps
}
```

### 3. `Product` — a PRICE BUCKET, not a design
```js
{
  code: String,               // "k30", "K40", "M100" — unique. Letter prefix is decorative.
  codeNumber: Number,         // 30 — parsed from the code. THIS DEFINES THE COST.
  name: String,               // optional label; the code itself is the identity
  unit: String,
  openingStock: Number,
  openingDate: Date,
  isActive: Boolean,
  timestamps
}
```
⚠️ **There is NO `costRate` field.** Cost is derived every time:
`costRate = codeNumber × Setting.codeMultiplier` (= 30 × 50 = 1,500). See `07-business-rules.md` R6.
Storing it would let it drift out of sync with the code. Expose it as a virtual/computed value only.

The owner assigns goods to a bucket at purchase time; that choice *is* the cost decision.

### 4. `ExpenseHead`
```js
{ name, isActive }            // Rent, Tea, Electricity, Salary, Misc...
```

### 5. `DayBook`  ⭐ the main document
```js
{
  date: Date,                 // unique — one DayBook per date
  status: 'DRAFT' | 'POSTED',
  openingCash: Number,        // snapshot at post time

  sales: [{
    billNo,                   // small number printed before the code (e.g. 12037), from the bill book
    partyId,                  // ⭐ null  = CASH sale  (cash in immediately)
                              // ⭐ set   = CREDIT sale (this party's ledger is debited)
                              //    There is NO paymentMode field. The party decides it.
    productId,
    qty,                      // ⭐ MAY BE NEGATIVE — a negative qty is a RETURN
    rate,
    amount,                   // qty * rate            (signed)
    costRate,                 // frozen at post time from Product.costRate
    profit,                   // (rate - costRate) * qty   (signed, may be negative)
    voucherNo
  }],

  purchases: [{
    partyId,                  // null = cash purchase, set = credit purchase
    productId,
    qty,                      // may be negative (return to supplier)
    rate, amount,
    profit,                   // the "P" column on the purchase section — see 08 Q1
    voucherNo
  }],

  receipts: [{ partyId, narration, amount }],   // cash IN
  payments: [{ partyId, narration, amount }],   // cash OUT
  expenses: [{ expenseHeadId, narration, amount }],

  discountOnSale: Number,     // day-level discount (see 07 R8)

  totals: {                   // computed at post time, cached for fast reports
    cashSale,                 // Σ sale lines with NO party
    creditSale,               // Σ sale lines WITH a party
    totalSale,                // cashSale + creditSale
    discountOnSale,
    totalSaleLessDisc,
    cashSaleLessDisc,
    totalProfit,              // Σ line P (sales + purchases) — may be NEGATIVE
    totalPurchase,
    totalReceipts,            // "Cash Rec"
    totalPayments,            // "Paid Cash"  — NOT an expense
    totalExpenses,            // "Shop Exp"
    totalCash,                // openingCash + receipts + cashSaleLessDisc
    netCash                   // totalCash - payments - expenses  = closing cash
  },

  postedAt, postedBy, createdBy, timestamps
}
```

### 6. `StockTransaction` (derived — system-written only)
```js
{
  date, productId,
  type: 'OPENING' | 'PURCHASE' | 'SALE' | 'ADJUSTMENT',
                              // ❌ no SALE_RETURN / PURCHASE_RETURN — a return is a
                              //    negative-qty SALE / PURCHASE line
  qty: Number,                // SIGNED. Sale = outward, so store the sale qty and
                              // subtract it: closing = opening + purchase - sale
  rate: Number,
  sourceType: 'DAYBOOK' | 'ADJUSTMENT' | 'OPENING',
  sourceId,                   // DayBook._id
  narration
}
```
Index: `{ productId: 1, date: 1 }`

### 7. `LedgerEntry` (derived — system-written only)
```js
{
  date, partyId,
  voucherType: 'OP' | 'DV' | 'CV' | 'JV' | 'SALE' | 'PURCHASE',
                              // OP = opening, DV = payment (debit), CV = receipt (credit),
                              // JV = journal/accrual (e.g. month-end salary payable)
  voucherNo: Number,          // e.g. 3890, 82, 12037  (as printed on the real ledger)
  narration,
  debit: Number,              // 0 if not applicable
  credit: Number,             // 0 if not applicable
  sourceType: 'DAYBOOK' | 'OPENING' | 'JOURNAL',
  sourceId
}
```
Index: `{ partyId: 1, date: 1 }`
**Note:** the running `balance` column is NOT stored. It is computed while reading the ledger (opening + cumulative debit − credit), so it can never go stale.

### 8. `StockAdjustment` (standalone voucher)
```js
{ date, productId, qty, direction: 'IN' | 'OUT', reason, createdBy }
```

### 8b. `JournalVoucher` (JV — non-cash accrual, e.g. month-end salary)
```js
{
  date, voucherNo,
  lines: [{ partyId, narration, debit, credit }],   // must balance
  createdBy, postedAt
}
```
This is how salary becomes payable before it is paid. Required — the real ledger proves it.

### 9. `CostRateHistory`
```js
{ productId, oldRate, newRate, changedBy, changedAt, note }
```
Because the cost rate is edited by hand, every change must be logged. Never overwrite silently.
(Old profits are still safe regardless — `costRate` is frozen onto each sale line at post time.)

### 10. `Setting`
```js
{
  openingCash: Number,
  shopName, currency: 'PKR',
  codeMultiplier: Number,                             // 50 — cost = codeNumber × this. See 07 R6.
  purchaseProfitFormula: 'COST_MINUS_RATE' | 'ZERO',   // default 'COST_MINUS_RATE' — see 07 R8
  discountAppliesTo:     'CASH' | 'TOTAL',             // default 'CASH'  — see 07 R9
  allowNegativeStock: true                             // ALWAYS true — see 07 R4
}
```
The two unproven business rules live here as switches, not as hard-coded logic.

---

## Relationships

```
User ──creates──> DayBook
DayBook ──contains──> sales / purchases / receipts / payments / expenses
DayBook ──generates──> StockTransaction[]   (goods lines)
DayBook ──generates──> LedgerEntry[]        (party lines)
Party  ──has one──> Ledger  (= all LedgerEntry of that partyId)
Product ──has one──> Stock Card (= all StockTransaction of that productId)
```

## Not in this design (deliberately)

- ❌ No `Customer`, `Supplier`, `Employee` collections → use `Party.type`.
- ❌ No `currentStock` field on Product → derive it.
- ❌ No `balance` field on Party → derive it.
- ❌ No `Invoice` collection → this is not an invoicing system.
- ❌ No `paymentMode` field on a sale/purchase line → **the presence of a party decides cash vs credit**.
- ❌ No return voucher types → **a negative qty is the return**.
- ❌ No stock-availability check → **negative stock is allowed** (proven: k50 opening 0, closing 2).
