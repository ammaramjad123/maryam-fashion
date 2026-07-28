# Phase 9 (Hardening) + Day Zero — Summary

What I did while you were away. **All 60 tests green, lint clean.** The review app
is running at **http://localhost:5000** (login `admin@shop.local` / `admin12345`),
with the demo data intact.

⚠️ **I did NOT run `reset:golive`** — it's written and wired, but never executed, so
your demo data is untouched (verified: 41 products, opening stock 2,804, 24/07
posted, both banks present).

---

## 1. Backups & restore
- `scripts/backup.sh` → `mongodump` into `backups/<timestamp>/`. **Ran it once** so you
  already have a snapshot of the current demo data.
- `scripts/restore.sh <folder>` → `mongorestore --drop`, guarded by typing `RESTORE`.
- Also `npm run backup -w server` / `npm run restore -w server`. `backups/` is gitignored.

## 2. Indexes (hot paths)
Added `Party { type }` (bank/type listing). Confirmed the rest already declared:
`LedgerEntry {partyId,date}` & `{sourceId}`, `StockTransaction {productId,date}` &
`{sourceId}`, `DayBook {date}` unique. Mongoose creates them on boot.

## 3. Security pass
- **helmet** with a strict **Content-Security-Policy** (`script-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`, `style-src 'self' 'unsafe-inline'`
  for the print pages' runtime `<style>`). Verified the app **and** the Puppeteer PDF
  still render under it.
- **Production won't boot with a weak `JWT_SECRET`** (must be ≥ 32 chars, not a default).
- `.env` is gitignored (dev-only values); `.env.example` completed for server + client
  (added `PRINT_BASE_URL`, split-deploy notes). This isn't a git repo, so nothing is
  committed anyway.

## 4. JWT storage decision (08 Q8) — decided + implemented
**Keep the Bearer token in `localStorage`; mitigate XSS with the CSP above — do NOT move
to httpOnly cookies.** Cookies would add CSRF handling and break the same-origin token
injection the PDF renderer needs, for no real gain in a single-shop, 2-user, same-origin
app. Full reasoning in `docs/DEPLOY.md §5`.

## 5. Deploy notes → `docs/DEPLOY.md`
Single-node replica set / Atlas M0 (08 Q9); Puppeteer + Chrome libs on Render via a
Docker image (08 Q10, Dockerfile included); free hosting (server-serves-client on Render,
or split Vercel + Render); backups; indexes; a pre-flight checklist. Marked 08 Q8/Q9/Q10
resolved.

## 6. Go-live / Day Zero
- `npm run reset:golive -w server` — wipes all transactional data + demo masters (keeps
  logins), behind a typed `RESET GO-LIVE` confirmation. **Never auto-runs.**
- `npm run golive:setup -w server` — guided: prompts opening cash, then reads the opening
  position **back** to confirm against your physical count.
- `npm run golive:verify -w server` — read-only position read-back; exits non-zero if
  anything looks off (a go/no-go gate). Ran it against the demo — shows stock total 2,804,
  cash 260,297, party/bank openings with dates, and correctly flags the demo as "not a
  clean slate."
- Logic lives in `server/src/services/golive.service.js` (thin scripts).

## 7. User manual → `docs/USER-MANUAL.md`
**English + Roman Urdu.** Day Zero (Pehla din), the daily routine (open → enter 5 sections
→ check totals → Post → print/PDF/Excel), all reports, banks/position, fixing a posted day
(Unpost), and backups. Written in simple steps.

## 8. Housekeeping
Rewrote `README.md` (was still "Phase 1"); updated `docs/09-build-plan.md` Phase 9 to done.

---

### To run it again next time
`./start.sh` (starts Mongo `rs0`, seeds first run, builds client, starts server, opens the
browser). It's already running now — just open http://localhost:5000.
