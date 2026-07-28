# Deploy & Operations Notes (Phase 9)

How to run this in production for free, plus the decisions behind the hardening.

---

## 1. Architecture in one line

The **server serves the built client**, so the simplest production setup is a
**single service** (server + client on one origin) talking to a **MongoDB Atlas**
database. A split deploy (client on Vercel, server on Render) also works and is
documented below.

---

## 2. MongoDB — must be a replica set (docs/08 Q9)

`postDayBook` / `unpostDayBook` write several collections inside **one Mongo
transaction** (atomic post). Transactions require a **replica set** — a
standalone `mongod` will throw `Transaction numbers are only allowed on a replica
set member or mongos`.

- **Local / self-host:** run `mongod --replSet rs0` and `rs.initiate()` **once**.
  `start.sh` does this automatically. A single-node replica set is fine.
- **Cloud (recommended):** **MongoDB Atlas M0 (free)** is already a 3-node replica
  set. Create a free cluster, add a database user, allow your server's IP (or
  `0.0.0.0/0` for a start), and copy the `mongodb+srv://…` URI into `MONGODB_URI`.
  No `?replicaSet=` needed — the SRV URI includes it.

---

## 3. Puppeteer / headless Chrome on the host (docs/08 Q10)

"Download PDF" renders each report with **Puppeteer (headless Chrome)** — the same
`@media print` layout as Ctrl+P, so there is one layout, not two. Two consequences
on deploy:

1. **Chrome gets downloaded (~150–300 MB) on `npm install`.** Fine locally; on a
   host make sure the build step runs a normal `npm install` (not `--omit`) so
   Puppeteer's `postinstall` fetches Chrome, **or** pin a known-good Chrome.
2. **The host needs Chrome's shared libraries** (fonts, `libnss3`, `libatk`,
   `libgbm`, etc.). Managed Node hosts often lack them.

### Render.com (the free option that works with Puppeteer)

Use a **Docker** web service so the OS libs are present and reproducible. Add a
`Dockerfile` to `server/` (or repo root):

```dockerfile
FROM node:20-slim
# Chrome runtime libraries for Puppeteer (Debian). This is the standard set from
# Puppeteer's "Running in Docker" troubleshooting page.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation wget \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
      libdrm2 libgbm1 libgtk-3-0 libnss3 libpango-1.0-0 libx11-6 libxcomposite1 \
      libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci                           # Puppeteer's postinstall fetches Chrome here
COPY . .
RUN npm run build -w client          # build the client the server will serve
ENV NODE_ENV=production
EXPOSE 5000
CMD ["npm","start","-w","server"]
```

Render settings:
- **Environment:** Docker
- **Env vars:** `MONGODB_URI` (Atlas), `JWT_SECRET` (strong — see §5), `NODE_ENV=production`,
  `CLIENT_ORIGIN` (your public URL), `SEED_ADMIN_*` for the first seed.
- **After first deploy**, run the seed once via Render's shell:
  `npm run seed:masters -w server && npm run seed:admin -w server`.
- Free tier sleeps after inactivity — the first request (and first PDF, which
  launches Chrome) is slow. That's expected.

If you prefer Render's **native** (non-Docker) runtime, set a Build Command that
installs Chrome (`npx puppeteer browsers install chrome`) and keep the download in
a persistent cache dir — the Docker route is more reliable.

---

## 4. Free hosting recipes

### Option A — single service (simplest)

Deploy **only the server** (the Dockerfile above) on Render; it serves the built
client too. DB on Atlas. One URL. `VITE_API_BASE_URL` stays empty (same origin).

### Option B — split (client on Vercel, server on Render)

- **Client → Vercel:** import the repo, set **Root Directory** = `client`, build
  `npm run build`, output `dist`. Set env `VITE_API_BASE_URL=https://<your-render>.onrender.com`.
- **Server → Render:** as in §3.
- **CORS:** set the server's `CLIENT_ORIGIN` to your Vercel URL
  (`https://<app>.vercel.app`) so the browser is allowed to call the API.
- **PDF note:** the PDF renderer loads `/print` pages from the **server's own**
  origin (not Vercel), so split hosting doesn't affect PDFs.

### DB → MongoDB Atlas M0

Free, a real replica set, ~512 MB — ample for this shop. Back it up (§6) anyway.

---

## 5. JWT storage decision (docs/08 Q8) — DECIDED & IMPLEMENTED

**Decision: keep the JWT as a Bearer token in `localStorage`, and harden against
its one real weakness (XSS) with a Content-Security-Policy.** We did **not** move
to httpOnly cookies.

**Why not cookies?** httpOnly cookies protect the token from JS, but for this app
the trade-offs aren't worth it:
- They need **CSRF** protection on every mutating request (extra tokens/headers).
- The **PDF pipeline** injects the token into the print page's `localStorage` so
  headless Chrome can fetch report data as the user — cookies would complicate
  that same-origin injection.
- It's a **single shop, 2 users**, same-origin, no third-party embeds.

**What we did instead (the XSS mitigation that actually matters):**
- **helmet** with a strict **CSP**: `script-src 'self'` (only our own bundle can
  run — an injected `<script>` is blocked), `object-src 'none'`,
  `frame-ancestors 'none'` (no clickjacking), `style-src 'self' 'unsafe-inline'`
  (needed for the runtime `<style>` the print pages inject), fonts/images limited
  to `'self'`/`data:`. Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  and HSTS (effective over HTTPS).
- **Production refuses to boot with a weak `JWT_SECRET`** (see §5 env guard) so a
  forged-token deploy can't happen.
- JWT expiry is **7 days** (`JWT_EXPIRES_IN`) — reasonable for a shop; lower it if
  you want more frequent re-login.

**Revisit later** only if the app grows third-party scripts or more users — then
httpOnly cookies + CSRF become worth the complexity.

### Env guard

In production the server **throws on startup** unless `JWT_SECRET` is ≥ 32 chars
and not a known default. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 6. Backups & restore

```bash
./scripts/backup.sh                 # → backups/<timestamp>/  (mongodump)
./scripts/restore.sh backups/<ts>   # mongorestore --drop (asks you to type RESTORE)
```

Both read `MONGODB_URI` from `server/.env` (or the environment). **Copy backup
folders off the machine** (cloud storage / another disk) — a backup on the same
dead disk is no backup. On Atlas you also get automated snapshots, but keep your
own `mongodump` copies too. Schedule `backup.sh` nightly with `cron` if
self-hosting.

---

## 7. Indexes (hot paths)

Declared on the models, created automatically by Mongoose on boot:

| Collection          | Index                         | Serves                                  |
| ------------------- | ----------------------------- | --------------------------------------- |
| `ledgerentries`     | `{ partyId, date }`           | party balance / ledger as-of-date       |
| `ledgerentries`     | `{ sourceId }`                | unpost cleanup                          |
| `stocktransactions` | `{ productId, date }`         | stock as-of-date, closing/opening       |
| `stocktransactions` | `{ sourceId }`                | unpost cleanup                          |
| `daybooks`          | `{ date }` (unique)           | one book per day, day lookups           |
| `parties`           | `{ type }`                    | list banks / by type                    |

---

## 8. Go-live (Day Zero)

See **`docs/USER-MANUAL.md` → "Pehla din / Day Zero"**. In short: enter opening
stock + opening balances (with dates) in the app, set opening cash with
`npm run golive:setup -w server`, confirm with `npm run golive:verify -w server`.
`reset:golive` wipes everything for a fresh start and is guarded by a typed
confirmation — **take a backup first**.

---

## 9. Pre-flight checklist

- [ ] `MONGODB_URI` points at a **replica set** (Atlas M0 or `rs0`).
- [ ] `JWT_SECRET` is a fresh 48-byte hex string; `NODE_ENV=production`.
- [ ] `CLIENT_ORIGIN` set (only matters for a split deploy).
- [ ] Client built (`npm run build -w client`) so the server can serve it and
      render PDFs.
- [ ] Puppeteer's Chrome + OS libs present (Docker image in §3).
- [ ] Seeded once (`seed:masters`, `seed:admin`); admin password changed.
- [ ] A backup taken and copied off-box.
- [ ] `.env` is **not** committed (it's gitignored).
