# 07 — Business Rules (MOST IMPORTANT FILE)

If any other document contradicts this file, **this file wins**.
Every rule below is **verified against the real printed reports** (Ledger Book 01–30/04/2025 for party `farhan malik account`; Daily Stock Report 24/07/2025; Daily Sale & Expenses Sheet 24/07/2025). The arithmetic proofs are included — use them as your test fixtures.

---

## R1. Debit / Credit convention (party ledger)

```
balance = openingSigned + Σ(debit) − Σ(credit)

openingSigned = +openingBalance if openingType == 'DR'
                −openingBalance if openingType == 'CR'

balance > 0  →  display "X Dr"   (party owes the shop — receivable)
balance < 0  →  display "X Cr"   (the shop owes the party — payable)
```

### Voucher types (from the real ledger print)

| Code | Name | Meaning |
|---|---|---|
| `OP` | Opening | Opening balance line, once per party |
| `DV` | Debit Voucher | Cash **paid** to the party → **Debit** |
| `CV` | Credit Voucher | Cash **received** from the party → **Credit** |
| `JV` | Journal Voucher | Non-cash accrual (e.g. month-end salary payable) → usually **Credit** |

### ✅ VERIFIED — Farhan Malik ledger (April 2025)

```
Party Code 2201001 — farhan malik account
                                   Debit      Credit     Balance
01/04  OP  0     Opening balance                         44,118 Cr
08/04  DV  3890  salary           44,000.00              118 Cr
30/04  JV  82    salary                      42,666.00   42,784 Cr
                 Totals           44,000.00  42,666.00   42,784 Cr

Check: 44,118 (Cr) − 44,000 + 42,666 = 42,784 Cr   ✓
```

**⚠️ Salary is an ACCRUAL, not a simple cash payment.**
Month-end: `JV` credits the employee's ledger (salary payable).
Payment day: `DV` debits it (cash goes out).
The two are separate vouchers on separate dates. Do **not** collapse them.

### Posting table

| Voucher | Party ledger | Cash | Stock |
|---|---|---|---|
| Sale, no party (cash sale) | — | **IN** | OUT |
| Sale, with party (credit sale) | **Debit** | — | OUT |
| Purchase, no party (cash) | — | **OUT** | IN |
| Purchase, with party (credit) | **Credit** | — | IN |
| Cash Receipt (`CV`) | **Credit** | **IN** | — |
| Cash Payment (`DV`) | **Debit** | **OUT** | — |
| Shop Expense | — | **OUT** | — |
| Salary accrual (`JV`) | **Credit** | — | — |

---

## R2. ⭐ Cash vs Credit is decided by the PARTY NAME on the line

There is **no cash/credit dropdown**. The rule is:

```
sale line has NO partyId   →  CASH SALE   (cash goes in immediately)
sale line HAS a partyId    →  CREDIT SALE (that party's ledger is debited)
```

### ✅ VERIFIED — Daily Sale Sheet, 24/07/2025

```
Lines with NO name:   k44 (2,200) + k30 (4,500)                = 6,700
                                                    Sheet: "Cash Sale   6,700"   ✓

Lines named "Slmn azam":
  100,000 + 16,200 + 27,000 − 107,800 − 8,700 − 5,400 − 4,200 − 4,600 = 12,500
                                                    Sheet: "Credit Sale 12,500"  ✓

Total Sale = 6,700 + 12,500 = 19,200                Sheet: "Total Sale 19,200"   ✓
```

**The "Credit Sale" column on the right of the sheet is NOT an input.** It is an auto-generated
summary: credit sale lines grouped by party (`Slmn azam → 12,500`). Never ask the user to type it.

---

## R2.1. Split payments = TWO LINES (owner-confirmed)

When a customer pays part cash and takes the rest on credit, the owner writes **two sale lines**:

```
100,000 sale, 50,000 cash + 50,000 credit  →
    line 1:  qty 25 @2000 = 50,000   name BLANK      → CASH
    line 2:  qty 25 @2000 = 50,000   name "slmn azam" → CREDIT
```

There is **no split-payment field** and no partial-cash column. The name-blank/name-filled rule (R2)
stays the only mechanism. Confirmed directly with the owner — he already works this way on paper.

---

## R3. ⭐ Quantity CAN BE NEGATIVE — that is how returns are recorded

There is **no separate Return voucher**. A return is a **sale line with a negative qty**, entered in the same grid.

### ✅ VERIFIED — 24/07/2025 sale lines

```
k30   qty −77  @1400  =  −107,800     ← 77 pieces returned by the customer
k32   qty  −6  @1450  =    −8,700
K40   qty  −3  @1800  =    −5,400
k50   qty  −2  @2300  =    −4,600
Total qty = −16 , Total Amt = 19,200                Sheet totals: −16 / 19,200   ✓
```

The same applies to purchases (negative qty = goods returned to supplier).

**Therefore:**
- ❌ Do **NOT** validate `qty > 0`. Validate `qty != 0`.
- ❌ Do **NOT** create `SALE_RETURN` / `PURCHASE_RETURN` voucher types.
- Amount, profit and stock all follow the sign automatically.

---

## R4. ⭐ Negative stock is ALLOWED — do not block it

### ✅ VERIFIED — Daily Stock Report, 24/07/2025

```
k50:  Opening 0 ,  Sale −2 ,  Closing 2
```
A return arrived for a product with zero stock, and the system accepted it.

**Therefore: no "insufficient stock" error.** Warn in the UI if you like, but never reject the entry.

---

## R5. Stock

Report columns (exactly as printed): `Opening | Purchase | Amount | Total | Sale | Amount | P | Closing Stock`

```
Total   = Opening + Purchase                (quantity)
Closing = Total − Sale                      (Sale is SIGNED, so a return increases stock)
Amount  = Σ (qty × rate)  of that day's lines for that product   (signed)
P       = Σ profit        of that day's lines for that product   (signed)

Opening(product, date) = product.openingStock
                       + Σ (qtyIn − qtyOut) of all StockTransactions before `date`
```

Stock is **always derived**, never a stored editable field.
**Closing of day N == Opening of day N+1**, automatically.

### ✅ VERIFIED — k30 on 24/07/2025

```
Sale sheet lines for k30:   −77 @1400 (P +7,700)
                             −3 @1400 (P   +300)
                             +3 @1500 (P      0)
   → net qty  = −77 ,  net amount = −107,800 − 4,200 + 4,500 = −107,500 ,  net P = 8,000

Stock report row k30:  Opening 551 | Sale −77 | Amount −107,500 | P 8,000 | Closing 628
   Closing = 551 − (−77) = 628                                                   ✓

Report totals:  Opening 2,804 | Sale −16 | Amount 19,200 | P −6,100 | Closing 2,820
   2,804 − (−16) = 2,820                                                         ✓
   (Amount and P totals match the Daily Sale Sheet exactly)                      ✓
```

---

## R6. ⭐⭐ THE PRODUCT CODE *IS* THE COST — verified on every line

This is the single most important rule in the system. The owner confirmed it and every line of the
real 24/07 sheet proves it.

```
costRate = codeNumber × 50
```

`k1` = 50 · `k2` = 100 · `k3` = 150 · `k30` = **1500** · `k44` = **2200** · `k64` = **3200**

The letter prefix is meaningless (K, M, A — anything). Only the **number** matters.
The multiplier (50) lives in `Setting.codeMultiplier` — one place, never hard-coded.

### ✅ VERIFIED — all ten sale lines of 24/07/2025

| Code | cost = n×50 | Qty | @ | Amt | P computed | P on sheet |
|---|---|---|---|---|---|---|
| k44 | 2,200 | 1 | 2,200 | 2,200 | 0 | *(blank)* ✅ |
| k44 | 2,200 | 50 | 2,000 | 100,000 | −10,000 | −10,000 ✅ |
| k64 | 3,200 | 6 | 2,700 | 16,200 | −3,000 | −3,000 ✅ |
| K40 | 2,000 | 15 | 1,800 | 27,000 | −3,000 | −3,000 ✅ |
| k30 | 1,500 | −77 | 1,400 | −107,800 | +7,700 | 7,700 ✅ |
| k32 | 1,600 | −6 | 1,450 | −8,700 | +900 | 900 ✅ |
| K40 | 2,000 | −3 | 1,800 | −5,400 | +600 | 600 ✅ |
| k30 | 1,500 | −3 | 1,400 | −4,200 | +300 | 300 ✅ |
| k50 | 2,500 | −2 | 2,300 | −4,600 | +400 | 400 ✅ |
| k30 | 1,500 | 3 | 1,500 | 4,500 | 0 | *(blank)* ✅ |

Ten out of ten. No exceptions.

### What this means

**A product code is a PRICE BUCKET, not a design name.** When goods arrive, the owner decides which
bucket to file them in, based on what he paid. That choice *is* the cost entry.

Worked example (owner's):
```
Buys cloth at 1,425/piece  →  files it under code 30  →  system cost = 30 × 50 = 1,500
                           →  purchase profit = 1,500 − 1,425 = 75   (booked at purchase, R8)
Shop boys know "code 30 ⇒ sell above 1,500"; they sell at 1,600
                           →  sale profit = 1,600 − 1,500 = 100      (booked at sale)
                           →  lifetime profit on that piece = 175
```

Side effect worth noting: **the cost is hidden from the shop staff by design.** They only see a code
number and know the floor price. The owner's true purchase rate never appears on the sale sheet.

### Formula for `P` (the owner's own words, and it matches the math already implemented)

```
amt = @ × qty
P   = amt − (costRate × qty)         where costRate = codeNumber × 50
    = (@ − costRate) × qty            ← algebraically identical; engine already does this
```

So **the engine's math does not change** — only where `costRate` comes from. It is now
**derived from the code**, not typed by hand.



---

## R6.1. Cost does NOT move when stock is purchased (owner-confirmed)

`costRate` comes from the code (R6) and **never drifts**. Buying at 1,425 under code 30 does not
change code 30's cost — it stays 1,500, and the 75 shows up as **purchase profit** (R8).

This is deliberate. If cost drifted toward the purchase rate (a moving average), the 75 would be
absorbed into a changed cost and then counted again inside the sale profit — double counting.
Keeping cost tied to the code keeps the two profits clean and separate: purchase P = 75,
sale P = 100, total 175.

If the owner wants a different cost for the same goods, he **files them under a different code** —
that is the entire mechanism. There is no "edit cost" workflow.

---

## R7. Cash

```
totalCash   = openingCash + cashReceipts + cashSaleLessDiscount
netCash     = totalCash − paidCash − shopExpenses          ← this is the CLOSING CASH
openingCash(date) = netCash(previous posted day)
```

**A Cash Payment is NOT an expense.** Paying a supplier or an employee settles a liability; only
`Shop Expenses` lines count as expenses. The sheet keeps them in two separate columns and two
separate totals — so must we.

Credit sales and credit purchases never touch cash.

### ✅ VERIFIED — 24/07/2025

```
Opening Cash        260,297
+ Cash Rec                0
+ Cash Sale (less disc) 6,700
= Total Cash        266,997                          Sheet: 266,997   ✓
− Paid Cash          90,000   (farhan malik 45,000 + Salman malik 45,000)
− Shop Exp           92,840
= Net Cash           84,157                          Sheet:  84,157   ✓
```

Shop expenses that day: masjid 5,000 · gaurd 1,000 · safai 1,000 · boys exp 7,140 ·
hall rent 73,000 · tea 1,250 · stall khana 500 · water 1,050 · computer rprng 2,500 ·
slmn mill kraya 400 → **92,840** ✓

---

## R8. Purchase `P` — ✅ CONFIRMED by the owner

The Purchase section has a `P` column; the summary reads "Profit Sale/Pur", i.e.
`totalProfit = Σ sale P + Σ purchase P`. **The owner confirmed the rule (with a worked example):**

> k30's stored cost is 1,500. New stock is bought at 1,425. Buying below cost earns a
> **purchase profit of 75** (1,500 − 1,425). Later that piece sells for 1,600, earning a
> **sale profit of 100** (1,600 − 1,500). Lifetime total on that piece = 75 + 100 = **175**.

```js
// server/services/profit.js  ← the ONLY place this formula may live
function calcPurchaseProfit(line, product) {
  return (product.costRate - line.rate) * line.qty;   // cost − purchase rate, per unit
}
```

`Setting.purchaseProfitFormula` now defaults to **`COST_MINUS_RATE`** (was `ZERO`).

**The operator only enters the purchase rate** (e.g. 1,425, or a decimal like 28.8). The system
already knows `costRate` and computes purchase P itself — the user never calculates it. Same
"user enters, system computes" philosophy as everywhere else.

⚠️ This does NOT change `costRate` — see R6.1. Cost is fixed; purchase profit is shown separately,
never folded into a moving cost. That is what keeps the 75 and the 100 from double-counting.

---

## R9. Discounts — UNPROVEN, isolate it

The sheet has `Discount on Sale`, `Total Sale Less Disc` and `Cash Sale Less Disc`.
On 24/07 the discount was **0**, so both readings below give identical results and neither is proven.
The owner does not know either.

**DECISION:** implement as a **single day-level field** `discountOnSale` (default 0), with the deduction
in **one function**:

```js
function applyDiscount(totals, discount, setting) {
  // setting.discountAppliesTo: 'CASH' (default) | 'TOTAL'
  totals.totalSaleLessDisc = totals.totalSale - discount;
  totals.cashSaleLessDisc  = setting.discountAppliesTo === 'CASH'
      ? totals.cashSale - discount     // ← DEFAULT: discount reduces the cash collected
      : totals.cashSale;
  return totals;
}
```

Default `discountAppliesTo = 'CASH'` (a discount you give at the counter reduces the cash in the drawer).
Risk is low: the real-world value is almost always 0. Revisit when a sheet with a non-zero discount surfaces.

---

## R9.1. Bill number on sale lines

Each sale line carries a small **bill number** printed before the product code
(e.g. `12037 k44`, `12038 k44 slmn azam`). The Name column of the sale grid is therefore three
things together: **billNo · productCode · partyName (blank = cash)**.

Bill numbers are entered by the operator (they come from the physical bill book), auto-incrementing
as a convenience but always editable.

---

## R9.2. Previous-day reminders across the top of the sheet

The row of small figures above the column headers (the ones showing `0` on 24/07, each with a tick)
are **the previous day's totals**, reprinted at the top of today's sheet as a reminder. They are
**not inputs** — the system fills them from the last posted day.

They carry forward: previous day's **Total Profit**, **Cash Sale**, **Shop Expenses**, and the other
headline figures from the summary block. On the next day's sheet, 24/07's `−6,100` profit, `6,700`
cash sale and `92,840` shop expenses will appear in those slots.

This is the same carry-forward principle as cash:
`Net Cash (24/07) 84,157` becomes `Opening Cash In (25/07)`. Already implemented — R7.

---

## R9.3. Bank accounts — a separate ledger, NOT tied to the daily sheet (owner-confirmed)

The owner keeps 2–3 **bank accounts** (different banks). Each has its own running account exactly
like a party ledger — but it is **independent of the shop's daily sale/cash**. Money in a bank account
does not flow through the Day Book.

The real "Position" printout shows several bank accounts on one page, each with Opening Amount,
then Debit / Credit entries, a running Balance, and a Total.

**This reuses the existing ledger engine — no new math.** A bank is just another party `type`:

- `Party.type` gains **`BANK`**.
- A bank's account = the same `LedgerEntry` stream every party already has.
- Day 0: each bank gets an `OP` entry with its opening balance and date (the guard in R11 applies).
- Thereafter the operator records a debit or credit on any date; the system keeps the running
  balance via `opening + Σdebit − Σcredit` (R1) — identical to farhan malik's ledger.
- **These entries are entered directly on the bank account, NOT through the Day Book.** They never
  touch cashSale/netCash or any shop total. The shop's cash chain (R7) is unchanged.

New report — **Position**: lists all `BANK` parties with their current balance on a given date
(and per-account debit/credit history for the date range), printed/PDF/Excel like the other sheets.

### ⚠️ This overturns the earlier "cash only, no bank" assumption

Docs previously assumed no bank account (old Q3/Q4). That is now **false** — banks exist, but as a
**separate ledger**, so the daily cash sheet stays exactly as built. When shop money actually moves
via a bank (rather than cash), that is a future question (see 08 Q11) — for now the bank ledger is
standalone bookkeeping the owner maintains by hand-entry, just like his paper "Position" page.

---

## R10. Day sheet totals (the summary block)

```
cashSale     = Σ sale lines WITHOUT a party
creditSale   = Σ sale lines WITH a party
totalSale    = cashSale + creditSale
totalProfit  = Σ line P                      (sales + purchases)
paidCash     = Σ cash payment lines
totalExp     = Σ shop expense lines
netCash      = see R7
```

---

## R11. Posting & immutability

1. A DayBook starts as `DRAFT`. Draft affects nothing.
2. **POST** = validate → write `StockTransaction[]` + `LedgerEntry[]` → freeze `costRate`, `openingCash`, `totals` → status `POSTED`.
3. Posting is **atomic** (MongoDB session) and **idempotent**.
4. **UNPOST** (Admin only) deletes every StockTransaction and LedgerEntry with `sourceId = dayBook._id` and reverts to `DRAFT`.
5. A day can be posted only if the previous day is posted or does not exist (no gaps in the cash chain).

---

## R12. Validation

- One DayBook per date (unique index).
- `qty != 0` (may be negative — see R3). `rate >= 0`.
- Purchase line requires a supplier `partyId`.
- Receipt / Payment: `partyId` required, `amount > 0`.
- Expense: `expenseHeadId` required, `amount > 0`.
- Product `code` unique, uppercase (`K30`).
- Party has an `accountCode` (e.g. `2201001`) — unique, chart-of-accounts style.
- No posting to a future date.

---

## R13. Money, display & audit

- PKR. Two decimals. Thousand separators: `44,118.00`.
- **Rates, costs, amounts and profit may be DECIMAL, not just whole numbers** (owner-confirmed: a rate
  can be e.g. 28.8, not only 1,425). Never round a rate to an integer on input — keep the decimals the
  operator typed. Qty may be fractional too if a unit needs it.
- Ledger balances always carry a `Dr` / `Cr` suffix — never a bare negative number.
- Every voucher stores `createdBy`, `postedBy`, timestamps. Masters are soft-deleted (`isActive: false`).
- Vouchers are numbered per series (`OP`, `DV`, `CV`, `JV`, plus sale/purchase voucher numbers as seen: 12037, 12038, 3902).
