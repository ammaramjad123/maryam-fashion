# Garments Shop Day-End Management System

A MERN application that replaces three paper registers used in a garments shop:

- **Ledger Book (Khata)** — one running account per party
- **Daily Stock Report** — opening → purchase → sale → closing, per product
- **Daily Sale & Expense Sheet** — the whole day summarized on one page

> The user enters **vouchers**. The system generates **reports**.
> The user never types a closing balance, and never edits a report.

`docs/07-business-rules.md` is authoritative. For day-to-day use, read
**[`docs/USER-MANUAL.md`](./docs/USER-MANUAL.md)** (English + Roman Urdu). To
deploy, read **[`docs/DEPLOY.md`](./docs/DEPLOY.md)**.

---

## What's built

Everything from `docs/09-build-plan.md` through **Phase 9 (Hardening)**:

- Masters (Products, Parties, Expense Heads), **Bank Accounts** (a separate ledger)
- **Day Book** entry (5 sections) with keyboard flow, live totals, atomic Post/Unpost
- Derived engine: party balances, stock, cash chain — nothing stored, all from vouchers
- Reports: Daily Sale, Daily Stock, Ledger (Khata), Cash Book, Outstanding, **Position** — each with **print · PDF · Excel**, all from one source
- Role-based profit hiding (server-side), Dashboard, Stock Adjustment
- Backups, Day-Zero go-live tooling, security headers

## Layout

```
crm/
├── server/    Node + Express + Mongoose API (also serves the built client)
├── client/    React + Vite + Tailwind SPA
├── docs/      The specification + USER-MANUAL.md + DEPLOY.md
├── scripts/   backup.sh / restore.sh
└── start.sh   One command to run the whole app locally
```

## Prerequisites

- **Node.js** ≥ 18.18
- **MongoDB** ≥ 6, run as a single-node replica set (`--replSet rs0`) — post/unpost
  use transactions. `start.sh` handles this for you. (Cloud: Atlas M0 is already a
  replica set.)
- `mongodump` / `mongorestore` on PATH (from mongodb-database-tools) for backups.

## Quick start (one command)

```bash
./start.sh
```

Starts MongoDB (`rs0`), seeds demo data the first run, builds the client, and
starts the server. Open **http://localhost:5000** — login `admin@shop.local` /
`admin12345`. Data persists in `~/.crm-data/mongo`; delete that folder for a clean
slate. Press Ctrl+C to stop.

## Manual setup / dev

```bash
npm install                       # install all workspaces
cp server/.env.example server/.env
cp client/.env.example client/.env

# Mongo as a replica set (once):
mongod --dbpath <data> --replSet rs0 --fork --logpath <data>/mongod.log
mongosh --eval 'rs.initiate()'

npm run seed:masters -w server    # 41 product codes + parties + expense heads
npm run seed:admin   -w server    # admin login
npm run seed:demo    -w server    # optional: posted 24/07, banks, ledger demo

npm run dev                       # server :5000 + Vite client :5173 (hot reload)
```

In dev, use the Vite client at **:5173**; in production/review the server serves
the built client at **:5000** (single origin).

## Scripts

Root:

| Command                | What it does                    |
| ---------------------- | ------------------------------- |
| `npm run dev`          | Server + client (hot reload)    |
| `npm run lint`         | ESLint across the monorepo      |
| `npm run format`       | Prettier write                  |

Server workspace (`-w server`):

| Command                    | What it does                                        |
| -------------------------- | --------------------------------------------------- |
| `npm start`                | Run the API (serves the built client)               |
| `npm test`                 | Vitest — 60 tests (engine, API, reports, roles)     |
| `npm run seed:masters`     | Seed product codes, parties, expense heads          |
| `npm run seed:admin`       | Seed the admin login                                |
| `npm run seed:demo`        | Seed review demo data (idempotent)                  |
| `npm run backup`           | `mongodump` → `backups/<timestamp>/`                |
| `npm run restore`          | `mongorestore` from a backup (typed confirm)        |
| `npm run golive:setup`     | Guided Day-Zero: opening cash + read-back           |
| `npm run golive:verify`    | Read the opening position back (go/no-go gate)      |
| `npm run reset:golive`     | ⚠️ Wipe all data for go-live (typed confirm)        |

## Tech

Node · Express · Mongoose · MongoDB (replica set) · JWT auth · Zod-free hand
validation · Puppeteer (PDF) · ExcelJS (xlsx) · helmet (security headers).
React · Vite · Tailwind · TanStack-free hooks · React Router. Vitest +
mongodb-memory-server + supertest.

## Environment variables

See `server/.env.example` and `client/.env.example`. In **production** the server
refuses to start unless `JWT_SECRET` is a strong random string (≥ 32 chars).
