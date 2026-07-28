# 02 — Business Workflow

## Setup (once, before daily use)

1. Admin creates **Products** (code K2, K3, K30 …) with an opening stock quantity and a default sale rate.
2. Admin creates **Parties** (customers, suppliers, employees) with an **Opening Balance** (Dr = they owe us, Cr = we owe them).
3. Admin sets **Opening Cash in hand**.

This is "Day Zero". After this, nothing is ever entered directly into stock/ledger/cash — only vouchers.

## The daily cycle

```
Morning  →  Shop opens. Customers buy garments. Supplier delivers goods.
            Owner pays for tea, receives money from an old debtor, pays salary.
            (Nothing is entered in the software yet — paper slips / memory.)

Evening  →  Operator opens the software and selects TODAY'S DATE.
            He opens the Day Book screen and enters:

              1. Sales           (customer, product, qty, rate, cash or credit)
              2. Purchases       (supplier, product, qty, rate)
              3. Cash Receipts   (party, amount, narration)  — money came IN
              4. Cash Payments   (party, amount, narration)  — money went OUT
              5. Shop Expenses   (expense head, amount)      — money went OUT
              (Credit sales are just Sales with paymentMode = CREDIT)

            He presses POST / SAVE DAY.

System   →  Automatically updates:
              • Stock        (sales reduce, purchases increase)
              • Party ledgers (credit sale = Dr, receipt = Cr, payment = Dr, credit purchase = Cr)
              • Cash book    (cash sale + receipts IN; payments + expenses + cash purchase OUT)

            Automatically generates:
              • Daily Sale & Expense Sheet
              • Daily Stock Report
              • Ledger Book (per party)
```

## Rolling balances

- **Closing Stock of a product on Day N = Opening Stock on Day N+1.**
- **Closing Cash on Day N = Opening Cash on Day N+1.**
- **Closing ledger balance of a party on Day N = Opening on Day N+1.**

These are **never stored as typed values**. They are computed from the transaction history (see `07-business-rules.md`).

## The money flow, in one picture

```
        PURCHASE (from supplier)
                 │
                 ├─ stock ↑
                 └─ cash ↓  (if cash purchase)   OR   supplier ledger Cr ↑ (we owe him)

        SALE (to customer)
                 │
                 ├─ stock ↓
                 ├─ profit = (rate − cost) × qty
                 └─ cash ↑ (if cash sale)        OR   customer ledger Dr ↑ (he owes us)

        CASH RECEIPT (customer pays his udhaar)
                 ├─ cash ↑
                 └─ customer ledger Cr ↑ (his Dr balance goes down)

        CASH PAYMENT (we pay supplier / salary to employee)
                 ├─ cash ↓
                 └─ party ledger Dr ↑ (his Cr balance goes down)

        EXPENSE (rent, tea, electricity …)
                 └─ cash ↓
```

## What the operator never does

- Never types a closing balance.
- Never edits a report.
- Never adjusts stock silently (must use a Stock Adjustment voucher with a reason).
