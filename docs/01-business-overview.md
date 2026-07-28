# 01 — Business Overview

## The business

A **garments (cloth) shop**. It buys cloth/garments from suppliers and sells to customers, in cash and on credit (udhaar). It has employees who are paid salary. It pays shop expenses (rent, electricity, tea, water, hall rent, repairs, etc.).

Today the whole business is tracked on paper / an old desktop program in **three registers**:

1. **Ledger Book (Khata)** — one account per party, with Opening Balance, Debit, Credit, Closing Balance.
2. **Daily Stock Report** — per product code (K2, K3, K30, K64 …): Opening → Purchase → Sale → Closing.
3. **Daily Sale & Expense Sheet** — the whole day summarized on one page: Sales, Purchases, Cash Receipts, Cash Payments, Shop Expenses, Credit Sales, and totals (Cash, Expenses, Profit, Net Cash, Credit Sale, Total Sale).

The new system must reproduce these three outputs **exactly in spirit**, and generate them automatically.

## What this software IS

- A **day-end accounting + inventory + party-ledger system**.
- **Entry-based**, not invoice-based. The operator sits down at closing time and enters the day's totals/lines.
- Reports (stock report, ledger, daily sheet) are **derived**, never hand-written.

## What this software is NOT

- ❌ Not a real-time POS / cash register. Sales are **not** rung up one-by-one during the day.
- ❌ Not a CRM. There is no lead pipeline, no marketing, no follow-ups.
- ❌ Not an e-commerce store.
- ❌ No barcode scanning, no thermal receipt printing — **unless** confirmed in `08-open-questions.md`.

## Core concept: PARTY

There is no separate "customer table", "supplier table", "employee table".

There is **one `Party` collection**. A party has a `type` (Customer / Supplier / Employee / Other), and **every party has exactly one ledger**.

Why: in a real shop the same person is often a supplier this month and a customer next month; an employee may also take goods on credit. One party + one ledger = zero redesign later.

## Core concept: VOUCHER → AUTOMATIC POSTING

The operator only creates **vouchers** (Sale, Purchase, Receipt, Payment, Expense).
The system automatically posts the effects of each voucher to:

- **Stock** (if goods moved)
- **Party ledger** (if a party is involved)
- **Cash book** (if cash moved)

The operator **never** edits stock balances, ledger balances, or cash balances by hand. The only exception is an explicit **Stock Adjustment** voucher (for damage/loss/counting error), which is itself a voucher and leaves an audit trail.

## Users

Small shop. Expected roles: **Admin** (owner — sees profit, can edit/delete, can see all reports) and possibly **Operator/Cashier** (can only make entries). Exact roles → see `08-open-questions.md`.
