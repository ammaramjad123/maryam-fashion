# 09 — Build Plan (for Claude Code)

Build in this order. **Do not skip ahead.** Each phase must run and be testable before the next one starts.

---

### Phase 0 — Understand (no code)
Read `00` → `08`. Then write back, in your own words: the business, the posting table (R1), and the derived-balance principle. List anything from `08-open-questions.md` that blocks you. **Write zero code in this phase.**

### Phase 1 — Skeleton
- Monorepo: `/server` (Node + Express + Mongoose) and `/client` (React + Vite + Tailwind).
- Env config, MongoDB connection, error handler, request logger, health check.
- No business logic yet.

### Phase 2 — Auth & Users
- User model, password hashing (bcrypt), JWT, `requireAuth` + `requireRole('ADMIN')` middleware.
- Seed script: one admin user.
- Login page + protected routes on the client.

### Phase 3 — Masters
- `Party` (with `type`, opening balance Dr/Cr), `Product`, `ExpenseHead`.
- Full CRUD + list screens. Type-ahead search endpoints.
- Seed script with the real product codes (K2, K3, K30, K64 …) and a few parties.

### Phase 4 — Core engine (the heart — do this carefully) ⚠️
Pure service functions, **fully unit-tested, no HTTP, no UI**:
- `getPartyBalance(partyId, uptoDate)`
- `getStock(productId, uptoDate)`
- `getCashBalance(uptoDate)`
- `getCostRate(productId, date)`   ← isolate the costing strategy here
- `postDayBook(dayBookId)` / `unpostDayBook(dayBookId)` — atomic, idempotent

Write the tests from the worked examples in `07-business-rules.md` (the Farhan Malik ledger, the K30 stock line) **before** the implementation.

### Phase 5 — Day Book API
`GET/PUT /daybook/:date`, `POST /daybook/:date/post`, `POST /daybook/:date/unpost`.
All validation from R7. Postman/REST-client collection committed to the repo.

### Phase 6 — Day Book UI ⭐
The main screen: 5 grid sections + live footer totals + keyboard-first entry + POST confirmation.
This is the screen the shop will live in — polish it more than anything else.

### Phase 7 — Reports
Daily Sale & Expense Sheet → Daily Stock Report → Ledger → Cash Book → Profit → Expenses → Outstanding.
Print stylesheets. They must look like the paper sheets.

### Phase 8 — Dashboard, stock adjustment, roles polish
Verify: an OPERATOR token can never receive `profit` or `costRate` from any endpoint.

### Phase 9 — Hardening ✅ DONE
Backups, seed/restore scripts, index review, deploy notes, a short user manual in Urdu/English.

Delivered:
- **Backup/restore:** `scripts/backup.sh` (mongodump → `backups/<ts>/`) and `scripts/restore.sh`
  (mongorestore, typed confirm). Also `npm run backup|restore -w server`.
- **Indexes:** `LedgerEntry {partyId,date}` + `{sourceId}`, `StockTransaction {productId,date}` +
  `{sourceId}`, `DayBook {date}` (unique), `Party {type}`.
- **Security:** helmet + strict CSP; production refuses to boot with a weak `JWT_SECRET`; `.env`
  gitignored; complete `.env.example` (server + client).
- **JWT storage (08 Q8):** decided — keep `localStorage` + CSP (not cookies). See `docs/DEPLOY.md §5`.
- **Deploy notes:** `docs/DEPLOY.md` — replica set (08 Q9), Puppeteer/Chrome on Render (08 Q10),
  free hosting (Vercel + Render + Atlas M0), backups, indexes, pre-flight checklist.
- **Go-live / Day Zero:** `reset:golive` (typed confirm, **never auto-run**), `golive:setup`
  (opening cash + read-back), `golive:verify` (position read-back / go-no-go gate).
- **User manual:** `docs/USER-MANUAL.md` (English + Roman Urdu) — Day Zero, daily routine, reports,
  banks, unpost, backups.
- Tests: **60 green** throughout.

---

## Rules for the AI while building

1. **Never invent a feature.** If it is not in the docs, it does not exist. Ask.
2. **Never store a derived balance** as an editable field.
3. **Never let the frontend decide** what a user is allowed to see — filter on the server.
4. **Every money-affecting operation is a voucher** with an audit trail.
5. Keep business logic in `server/services/*` — controllers stay thin.
6. When something in the docs is ambiguous, add it to `08-open-questions.md` instead of guessing.
