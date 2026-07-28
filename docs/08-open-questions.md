# 08 — Open Questions

Most of the original questions have now been **RESOLVED** by analysing the three real printed reports
(Ledger Book Apr-2025, Daily Stock Report 24/07/2025, Daily Sale & Expenses Sheet 24/07/2025).
The proofs live in `07-business-rules.md`.

---

## ✅ RESOLVED (do not re-ask)

| # | Question | Answer |
|---|---|---|
| 1 | What is the `P` column? | **Profit** = `(rate − cost) × qty`. Proven on every line. |
| 2 | Stock report column names | `Opening \| Purchase \| Amount \| Total \| Sale \| Amount \| P \| Closing`. There is no "Safe" column — it reads **Sale**. |
| 3 | Fixed cost or moving average? | **Fixed cost per product.** k30 = 1,500 · K40 = 2,000 · k44 = 2,200 across every line that day. |
| 4 | Can the sale rate change per line? | **Yes.** k30 sold at 1,400 and at 1,500 on the same day. |
| 5 | Why are some numbers negative? | **Returns.** A return is a sale line with a **negative qty**. There is no separate return voucher. |
| 6 | Cash sale vs credit sale? | **Line with no party = cash. Line with a party = credit.** No dropdown. Proven: 2,200 + 4,500 = 6,700 cash; "Slmn azam" lines = 12,500 credit. |
| 7 | Does a credit sale have product lines? | **Yes** — it's a normal sale line that happens to carry a party name. The "Credit Sale" column on the right is an **auto-generated per-party summary**, not an input. |
| 8 | Is salary a cash payment or an accrual? | **Accrual.** `JV` credits the employee at month-end, `DV` debits him on payment day. Two separate vouchers. |
| 9 | Is negative stock possible? | **Yes, and it must be allowed.** k50: opening 0 → sale −2 → closing 2. |
| 10 | Are payments the same as expenses? | **No.** `Paid Cash` (90,000) and `Shop Exp` (92,840) are separate columns and separate totals. |
| 11 | Do discounts exist? | **Yes** — `Discount on Sale`, `Total Sale Less Disc`, `Cash Sale Less Disc` (was 0 on 24/07). |
| 12 | Does a party have a code? | **Yes** — chart-of-accounts style, e.g. `2201001`. |
| 13 | Voucher types | `OP` (opening), `DV` (payment), `CV` (receipt), `JV` (journal/accrual). |

---

## ❓ STILL OPEN — but NOT blocking

None of these stop development. Each one is isolated behind a single function or setting
(see `07-business-rules.md` R6, R8, R9). Build now, flip the switch later.

**Q1 — Purchase `P` column.** ✅ **RESOLVED (owner-confirmed).**
Purchase P = `(costRate − purchaseRate) × qty`. Example: cost 1,500, bought at 1,425 → P = 75.
Cost stays FIXED (does not move toward the purchase rate — 07 R6.1), so purchase-P and sale-P never
double-count. `Setting.purchaseProfitFormula` default is now `COST_MINUS_RATE`. Operator enters only
the rate (may be decimal, e.g. 28.8); the system computes P.

**Q2 — Discount.** *Owner does not know.* Was 0 on 24/07, so both readings agree.
→ Built as a day-level field with `Setting.discountAppliesTo = 'CASH'` (default) | `'TOTAL'`.
→ **How to resolve:** find an older page where `Discount on Sale` is non-zero.

**Q3 — "Total Sale Bank" (6,700).** Equals the cash sale on this sheet. Probably a leftover label
from the old software. Assume **cash only, no bank** until proven otherwise.

**Q4 — Voucher numbering.** Sales showed `12037`, `12038`; payments and expenses all showed `3902`.
Is one voucher number shared by all of a day's expenses? Are the series continuous across years?
→ Not blocking: generate one voucher number per section per day and move on.

**Q5 — Can a posted day be edited later?** The sheets carry a hand-written sign-off date
(24/07 sheet signed 28/07). → Build UNPOST as Admin-only. Ask the owner whether to lock it after signing.

**Q6 — Roles: should the Operator see profit and cost?** *(FLAGGED OPEN — ask the owner before shipping)*

**Build decision (already taken — do not revisit while coding):** build it **HIDDEN**.
`profit`, `costRate` and the report `P` column are stripped **server-side** for any user with
`permissions.viewProfit === false`. Tests must assert this.

Why hidden is the default:
- The cost price is the shop's most sensitive number (what suppliers charge, bargaining power).
- **`P` and `costRate` are the same secret.** Given a sale line you can recover the cost:
  `cost = rate − (P ÷ qty)` → `2000 − (−10,000 ÷ 50) = 2,200`. So they are hidden together or shown together — there is no middle option.
- The Operator does **not** need `P` to do his job. He enters party / product / qty / rate; the server computes profit at POST time.
- Asymmetric risk: turning it **on** later is a boolean flip. Turning it **off** later is impossible — he has already seen the costs.

Because it is permission-driven, the owner's eventual answer is a **seed value change, not a code change**:
```js
User.permissions = { viewProfit: Boolean }   // ADMIN: true, OPERATOR: false (default)
```

⚠️ Never hide it with CSS on the frontend. The field must not exist in the API response at all.

**Q7 — Year-end close / opening-balance rollover.** → Not needed for v1.

**Q10 — Server-side PDF (Phase 7b + Phase 9 deploy).** The "Download PDF" button uses Puppeteer
(headless Chrome) to render each report page to a pixel-exact PDF, driven by the SAME `@media print`
CSS as Ctrl+P so there is one layout, not two. Consequences: (a) Puppeteer downloads ~300MB of Chrome
on install — fine in dev; (b) on deploy the server host needs Chrome's shared libraries, so the deploy
notes in Phase 9 must install them (or use a slim Chromium build / a hosted PDF service). Logged so the
deploy step isn't a surprise. Owner wants BOTH Ctrl+P printing and downloadable PDFs for every report.
> ✅ **RESOLVED (Phase 9).** Deploy on Render with a Docker image that installs Chrome's libs — see
> `docs/DEPLOY.md §3`. Both Ctrl+P and PDF/Excel downloads ship for every report.

**Q9 — Dev MongoDB must be a replica set (Phase 5 infra).** `postDayBook`/`unpostDayBook` use a
Mongo transaction, which needs a replica set. Tests use an in-memory RS; the standalone dev `mongod`
from Phase 1–3 cannot run transactions. Before wiring the `/daybook/:date/post` route in Phase 5,
run dev Mongo as a single-node replica set (`--replSet rs0` + `rs.initiate()`) or use Atlas. Not a
question — a setup step, logged so it isn't a surprise.
> ✅ **RESOLVED (Phase 9).** `start.sh` runs a single-node `rs0` locally; production uses Atlas M0
> (already a replica set). See `docs/DEPLOY.md §2`.

**Q8 — JWT storage (hardening, Phase 9).** v1 stores the token in `localStorage` (simple, works).
Before shipping, decide whether to move to an httpOnly cookie — safer against XSS, but needs CSRF
handling. Not blocking; revisit in Phase 9. Flagged here so it isn't forgotten.
> ✅ **DECIDED (Phase 9): keep the Bearer token in `localStorage`, and mitigate XSS with a strict
> Content-Security-Policy (helmet) instead of moving to cookies.** Cookies would need CSRF handling and
> would complicate the same-origin token injection the PDF renderer relies on — not worth it for a
> single-shop, 2-user, same-origin app. Also: production refuses to boot with a weak `JWT_SECRET`.
> Full reasoning in `docs/DEPLOY.md §5`.

---

## ✅ ANSWERED BY THE OWNER

| # | Question | Answer |
|---|---|---|
| 14 | Who updates a product's cost rate? | **Manually, by the owner.** It is never auto-updated by a purchase. → `Product.costRate` is an Admin-editable field, plus a `CostRateHistory` log, plus a nudge when a purchase rate differs from the cost rate. See `07-business-rules.md` R6. |

---

**Q11 — Bank money vs shop cash (future).** Banks now exist as a SEPARATE ledger (07 R9.3), entered
by hand, independent of the daily sheet. Still open: does shop money ever move *through* a bank
(e.g. a customer pays into the bank instead of cash)? If yes, we'll later add a bank-side payment/
receipt that links to a party. For now bank accounts are standalone bookkeeping — no Day Book link.
The old "cash only, no bank" assumption (Q3/Q4) is now retired.

---

## Remaining assumptions

| # | Assumption |
|---|---|
| A1 | Purchase P = **0** until proven (setting-driven) |
| A2 | Discount is a single day-level field, deducted from cash sale (setting-driven) |
| A3 | Cash only — no bank account |
| A4 | No invoice printing, no barcodes |
| A5 | Single shop, 2 roles (Admin, Operator) |
| A6 | One DayBook per date |
