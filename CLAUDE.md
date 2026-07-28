# CLAUDE.md — Project Context

## What this project is

A **garments shop day-end management system** (MERN). It replaces three paper registers: the **Ledger Book (Khata)**, the **Daily Stock Report**, and the **Daily Sale & Expense Sheet**.

## Before you write ANY code

Read, in order:
`docs/01-business-overview.md`, `docs/02-workflow.md`, `docs/03-modules.md`, `docs/04-database.md`, `docs/05-api.md`, `docs/06-ui.md`, **`docs/07-business-rules.md`**, `docs/08-open-questions.md`, `docs/09-build-plan.md`.

`docs/07-business-rules.md` is authoritative. If any other file contradicts it, it wins.

## Hard constraints

- ❌ This is **NOT a POS**. No real-time billing, no barcode, no receipt printer.
- ❌ This is **NOT a CRM**.
- ❌ Do **not** create separate Customer / Supplier / Employee collections. There is one `Party` with a `type`.
- ❌ Do **not** store `currentStock` on Product or `balance` on Party. **All balances are derived from transactions.**
- ❌ Do **not** invent features. If it is not in `docs/`, ask — and log the question in `docs/08-open-questions.md`.

## The one idea to internalize

> The user enters **vouchers**. The system generates **reports**.
> The user never types a closing balance, and never edits a report.

## The five rules people get wrong (all VERIFIED against the real printed reports)

1. **Cash vs credit is decided by the party name.** Sale line with **no party = CASH**. Sale line **with a party = CREDIT**. There is **no paymentMode field and no dropdown**.
2. **A return is a NEGATIVE QTY on a normal sale/purchase line.** There is **no return voucher**. Never validate `qty > 0` — validate `qty != 0`.
3. **Negative stock is allowed.** Never block a sale for insufficient stock.
4. **⭐ THE PRODUCT CODE IS THE COST: `costRate = codeNumber × 50`.** k30 → 1,500 · k44 → 2,200 · k64 → 3,200. Verified on all ten lines of the real 24/07 sheet. A code is a **price bucket**, not a design name; the letter prefix is decorative. There is **no stored costRate field** — always derive it. The multiplier lives in `Setting.codeMultiplier`. Then `P = amt − (costRate × qty) = (rate − costRate) × qty`. Profit is often **negative**; that is normal, never clamp it.
5. **Salary is an accrual:** a `JV` credits the employee at month-end, a `DV` debits him on payment day. A Cash **Payment** is **not** a Shop **Expense** — they are separate totals.

## Posting table

| Voucher | Party | Cash | Stock |
|---|---|---|---|
| Sale, no party | — | IN | OUT |
| Sale, with party | **Dr** | — | OUT |
| Purchase, no party | — | OUT | IN |
| Purchase, with party | **Cr** | — | IN |
| Cash Receipt (`CV`) | **Cr** | IN | — |
| Cash Payment (`DV`) | **Dr** | OUT | — |
| Shop Expense | — | OUT | — |
| Salary accrual (`JV`) | **Cr** | — | — |

`balance = openingSigned + Σdebit − Σcredit` → `> 0` is **Dr** (they owe us), `< 0` is **Cr** (we owe them).

## Golden test fixtures (from the real 24/07/2025 sheet — write these tests first)

```
Cash sale    = 2,200 + 4,500                                   = 6,700
Credit sale  = 100,000+16,200+27,000−107,800−8,700−5,400−4,200−4,600 = 12,500
Total sale                                                     = 19,200
Total profit                                                   = −6,100
Cash: 260,297 + 0 + 6,700 − 90,000 − 92,840                    = 84,157   (Net Cash)
Stock k30: 551 − (−77)                                         = 628
Ledger farhan malik: 44,118 Cr − 44,000 + 42,666               = 42,784 Cr
```

## Two rules are NOT yet proven — keep them behind a switch, never hard-code

- **Purchase `P`** → `Setting.purchaseProfitFormula` = `'COST_MINUS_RATE'` (default, owner-confirmed) | `'ZERO'`. Formula: `(costRate − purchaseRate) × qty`. Cost stays FIXED on purchase (07 R6.1).
- **Discount** → `Setting.discountAppliesTo` = `'CASH'` (default) | `'TOTAL'`

Both live in `server/services/profit.js`. If you find yourself writing either formula anywhere else, stop.

## Stack

Node + Express + Mongoose + MongoDB · React + Vite + Tailwind + TanStack Query · JWT auth · Zod validation · Vitest/Jest for the engine.

## Working style

- Business logic lives in `server/services/`. Controllers are thin.
- Posting a Day Book is **atomic** (MongoDB session) and **idempotent**.
- Tests for the posting engine are written **before** the engine (see `docs/09-build-plan.md`, Phase 4).
- Roles are enforced **server-side**. An `OPERATOR` must never receive `profit` or `costRate` in any API response.
