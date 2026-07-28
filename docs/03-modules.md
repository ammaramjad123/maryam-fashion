# 03 — Modules

## Module 1 — Day Book (Daily Entry)  ⭐ MAIN SCREEN

**Purpose:** the single screen where the whole day is entered. Everything else in the system is a consequence of this screen.

One Day Book per **date**. It has 5 sections, each an editable line-grid:

The real sheet has these columns, in this order:

| Section | Columns |
|---|---|
| **SALE** | Name = **billNo · productCode · party** *(party blank = cash sale)*, Qty *(negative = return)*, @ *(rate)*, Amt *(auto = @ × qty)*, P *(auto = amt − codeCost × qty)* |
| **PURCHASE** | Name *(supplier)*, Qty, @, Amt, P |
| **CASH RECEIPT** | Name, Amt |
| **CASH PAYMENT** | Name, Amt |
| **SHOP EXP.** | Name *(expense head)*, Amt |
| **CREDIT SALE** | Name, Amt — ⚠️ **READ-ONLY, AUTO-GENERATED** (credit sale lines grouped by party) |

⭐ There is **no cash/credit toggle**. Blank name = cash sale. Name filled = credit sale.
⭐ Qty may be **negative** — that is how a return is entered.

**Footer summary block (all auto, read-only), exactly as on the paper:**

```
Credit Sale        12,500        Profit Sale/Pur    -6,100      Opening Cash   260,297     Total Cash   266,997
Cash Sale           6,700        Total Profit       -6,100      Cash Rec             0      Paid Cash     90,000
Total Sale         19,200                                       Cash Sale L/D    6,700      Shop Exp      92,840
Discount on Sale        0        Total Sale Less Disc 19,200    Total Cash     266,997      Net Cash      84,157
```

**States:** `DRAFT` (editable, not posted) → `POSTED` (affects stock/ledger/cash).
Only an Admin can **unpost** a day to correct it. Unposting reverses all its postings.

---

## Module 2 — Products (price buckets)

A product code is a **price bucket**, not a design name. `k30` means "cost 1,500"
(`codeNumber 30 × Setting.codeMultiplier 50`). See `07-business-rules.md` R6.

Fields: `code` (k30, K40, M100 — any letters, unique), `codeNumber` (parsed from the code),
optional `name`, `unit`, `openingStock`, `isActive`.

**No stored cost field** — cost is always computed from the code. The product list should display
the derived cost so the owner can see the ladder: k1=50, k2=100 … k30=1,500 … k180=9,000.

Screens: product list (code · derived cost · current stock), add/edit, stock card.

---

## Module 2b — Dashboard: Parties & Credit ⭐ (owner requested)

A dedicated section on the dashboard, clickable into tabs, showing every party's position:

- **Jin se lena hai (receivable)** — parties with a Dr balance, and how much
- **Jin ko dena hai (payable)** — parties with a Cr balance, and how much
- Per party: total credit sales, total cash received, what's left

All figures come from `getPartyBalance` — nothing recomputed.

---

## Module 3 — Stock / Inventory

Stock only moves through vouchers:

| Voucher | Effect |
|---|---|
| Purchase (positive qty) | IN (+) |
| Purchase (negative qty) | OUT (−)  ← return to supplier |
| Sale (positive qty) | OUT (−) |
| Sale (negative qty) | IN (+)  ← customer return |
| Stock Adjustment | + or − with a mandatory reason |
| Opening Stock | IN (+), once, at setup |

**Daily Stock Report** (auto) — columns exactly as printed:

```
Name | Opening | Purchase | Amount | Total | Sale | Amount | P | Closing Stock

Total   = Opening + Purchase
Closing = Total − Sale            (Sale is SIGNED — a return therefore increases stock)
Amount  = Σ (qty × rate) for that product that day
P       = Σ profit for that product that day
```

Real row (24/07/2025): `k30 | 551 | | | 551 | −77 | −107,500 | 8,000 | 628`

⚠️ **Negative stock is allowed.** Real row: `k50 | 0 | | | | −2 | −4,600 | 400 | 2`

---

## Module 4 — Parties

One collection for Customers, Suppliers, Employees, Others.

Fields: `name`, `type`, `phone`, `address`, `openingBalance`, `openingBalanceType` (Dr/Cr), `openingDate`, `isActive`.

Screens: Party list (with live balance), Add/Edit party, **Party Ledger** (the Khata).

---

## Module 4c — Bank Accounts & Position report

Banks are parties with `type: BANK` (see 07 R9.3). Their accounts use the same ledger as any party,
but are entered **directly** (not via the Day Book) and are **independent of the shop's daily cash**.

- Bank account screen: opening balance (Day 0) + add debit/credit entries by date.
- **Position report**: all bank accounts with their balance on a chosen date, plus each account's
  debit/credit history for a date range. Print / PDF / Excel, matching the paper "Position" page
  (Naration | Debit | Credit | Balance, per account, with Totals).

---

## Module 5 — Ledger (Khata)

Every party has exactly one ledger. Every voucher that touches a party writes a ledger entry automatically.

Ledger view (matches the real printed Khata exactly):

```
Ledger Book        Date From: 01/04/2025   To: 30/04/2025      Closing Balance  -42,784.00 Cr
Party Code: 2201001    Name: farhan malik account

Voucher No  Type  Date        Narration          Debit       Credit      Balance
         0  OP    01/04/2025  Opening balance                            44,118.00 Cr
     3,890  DV    08/04/2025  salary            44,000.00                   118.00 Cr
        82  JV    30/04/2025  salary                        42,666.00    42,784.00 Cr
                              Total             44,000.00   42,666.00    42,784.00 Cr
```

Voucher types: **OP** opening · **DV** cash paid (debit) · **CV** cash received (credit) · **JV** journal/accrual.

Filters: party + date range. Export/print.
**The ledger is read-only.** To change it you must change the voucher that created the entry.

---

## Module 6 — Expenses

Expense heads are a small master list: Rent, Electricity, Tea, Water, Hall Rent, Computer Repair, Salary, Misc… (Admin can add more.)

Every expense reduces cash on the day it is entered.

> ⭐ **Salary is an ACCRUAL — confirmed.** At month-end a **JV** credits the employee's ledger
> (salary becomes payable). On payment day a **DV** debits it and cash goes out. Two separate
> vouchers, two separate dates. A Journal Voucher screen is therefore **required** (see Module 6b).

## Module 6b — Journal Voucher (JV)

Non-cash entries. Used for month-end salary accrual and any adjustment between parties.
Lines: `Party | Narration | Debit | Credit`. Total debit must equal total credit. Admin only.

---

## Module 7 — Cash Book

Auto-generated. `Opening Cash + Cash In − Cash Out = Closing Cash`, per day, with a drill-down list of every cash movement.

---

## Module 8 — Reports

1. **Daily Sale & Expense Sheet** (the exact paper sheet)
2. **Daily Stock Report**
3. **Ledger Book** (per party / all parties)
4. Monthly Sale summary
5. Profit report (date range)
6. Expense report (by head, date range)
7. Outstanding report (all parties with a balance: who owes us, whom we owe)

All reports: date-range filter, print view, export (CSV/PDF).

---

## Module 9 — Users & Auth

JWT login. Roles:

- **Admin** — everything, including profit figures, cost rates, unpost, delete, user management.
- **Operator** — create/edit DRAFT day books, view stock & ledger. **Cannot see profit or cost price.** Cannot unpost or delete.

---

## Module 10 — Dashboard

Today's: Sale · Profit · Expense · Cash in hand · Credit sale · Total receivable · Total payable · Low-stock products.
