# User Manual — Garments Day-End System

**English + Roman Urdu.** Simple steps for daily use.
**Angrezi + Roman Urdu. Rozana istemaal ke aasaan steps.**

---

## The one big idea / Bunyaadi baat

You **enter vouchers** (sales, purchases, cash, expenses). The system **makes the
reports and balances** by itself. You never type a closing balance, and you never
edit a report.

> **Roman Urdu:** Aap sirf **entry** karte hain — sale, purchase, cash, kharcha.
> Report aur closing balance system **khud** banata hai. Aap closing balance kabhi
> haath se nahi likhte, aur report kabhi edit nahi karte.

---

## Logging in / Login karna

1. Open **http://localhost:5000** (or your shop's web address).
2. Email: `admin@shop.local`, Password: the one you set.
3. Click **Login**.

> **Roman Urdu:** Browser mein address kholein, email aur password daal kar
> **Login** dabayein. Password kisi ko na batayein.

Two kinds of users:
- **Admin** (owner) — sees everything, including **profit**, and can **Unpost**.
- **Operator** (worker) — enters the day, but **cannot see profit** anywhere.

> **Roman Urdu:** Do tarah ke user: **Admin** (malik) sab kuch dekhta hai, nafa
> (profit) bhi. **Operator** (mulaazim) entry karta hai lekin nafa nahi dekh sakta.

---

## Pehla din / Day Zero (one time only)

Before you use the system for real, tell it where you are starting from — like the
first page of a new register. Do this **once**.

> **Roman Urdu:** System ko asal istemaal se pehle sirf **ek dafa** batana hai ke
> aap kahan se shuru kar rahe hain — jaise naye register ka pehla safha.

**Step 1 — Products (opening stock).** Go to **Products**. For each cloth code,
enter its **Opening Stock** and an **Opening Date** (the date you are counting
from). Cost is automatic from the code number (code 30 = 1,500).

> **Roman Urdu:** **Products** mein jayein. Har code ka **opening stock** aur
> **opening date** daalein. Cost khud code se ban jati hai (code 30 = 1,500).

**Step 2 — Parties (opening balances).** Go to **Parties**. For each customer,
supplier, or employee who owes you or whom you owe, enter the **opening balance**,
choose **Dr** (they owe us) or **Cr** (we owe them), and an **opening date**.
The date is **required** when there is a balance.

> **Roman Urdu:** **Parties** mein har customer/supplier/mulaazim ka **opening
> balance**, **Dr** (jin se lena hai) ya **Cr** (jin ko dena hai), aur **date**
> daalein. Balance ho to date zaroori hai.

**Step 3 — Banks (opening balances).** Go to **Banks**. Add each bank account with
its **opening balance**, **Dr/Cr**, and **date**.

> **Roman Urdu:** **Banks** mein har bank ka **opening balance**, **Dr/Cr** aur
> **date** daalein.

**Step 4 — Opening cash + confirm.** In a terminal, run:

```bash
npm run golive:setup -w server
```

It asks for your **opening cash** (the money in the drawer today), then shows the
**totals back** — opening stock total and opening cash — so you can **match them
against your physical count**. Anytime later:

```bash
npm run golive:verify -w server
```

> **Roman Urdu:** Terminal mein `npm run golive:setup -w server` chalayein. Ye
> **golle ka cash** poochta hai, phir totals **wapas dikhata hai** taake aap apni
> **ginti se milaa** lein. Baad mein bhi `golive:verify` se dobara dekh sakte hain.

**Starting completely fresh?** To wipe demo/old data first (⚠️ deletes everything
except logins), take a backup, then run `npm run reset:golive -w server` and type
the confirmation phrase. Only for a real fresh start.

> **Roman Urdu:** Bilkul naya shuru karna ho to pehle **backup** lein, phir
> `reset:golive` chalayein aur likh kar confirm karein. Ye sab data mita deta hai
> (sirf login rehta hai) — sirf naye aaghaz ke liye.

---

## The daily routine / Rozana ka tareeqa

Do this at the end of each day. Five steps.

> **Roman Urdu:** Har din ke aakhir mein ye paanch step karein.

### 1. Open the day / Din kholein
Top menu → **Day Book**. Set the date box to today (or the day you're entering).
The **Page No.** fills in automatically; the small line at top shows **yesterday's**
figures as a reminder.

> **Roman Urdu:** **Day Book** kholein, date aaj par set karein. **Page No.** khud
> aa jata hai; upar choti line **kal** ke figures yaad-dehani ke liye dikhati hai.

### 2. Enter the five sections / Paanch section bharein
Type into each grid. Press **Tab** to move across a line, **Enter** to commit a line,
**Esc** to clear it.

- **Sale** — Bill No · product code · Name. **Blank name = cash sale. A name = credit
  sale** (that party's ledger is charged). A **return is a minus quantity** (e.g. −77).
- **Purchase** — product code · supplier · qty · rate.
- **Cash Receipt** — money received from a party.
- **Cash Payment** — money paid to a party (e.g. salary). *Paying is not an expense.*
- **Shop Exp.** — shop expenses (rent, tea, bijli…).

> **Roman Urdu:** Har grid mein type karein. **Tab** aage, **Enter** line pakki,
> **Esc** saaf.
> **Sale:** naam khaali = **nakad**, naam likha = **udhaar**. Wapsi (return) ke liye
> **minus tadaad** (jaise −77). **Purchase:** code · supplier · tadaad · rate.
> **Cash Receipt:** party se paisa aaya. **Cash Payment:** party ko paisa diya (jaise
> tankhwah) — *dena kharcha nahi hai*. **Shop Exp.:** dukan ke kharche (kiraya, chai…).

### 3. Check the totals / Totals dekhein
At the bottom, the totals update live: **Total Sale, Profit, Net Cash**, etc. Match
**Net Cash** with the cash actually in your drawer.

> **Roman Urdu:** Neeche totals khud banti rehti hain — **Total Sale, Profit, Net
> Cash**. **Net Cash** ko golle ke asal cash se milaa lein.

### 4. Post the day / Din Post karein
Click **Post day** → confirm. The day gets a red **POSTED** stamp. Now the ledgers,
stock and cash for the next day roll forward **by themselves**.

> **Roman Urdu:** **Post day** dabayein aur confirm karein. Laal **POSTED** mohar lag
> jati hai. Ab agle din ka opening (stock, cash, balances) **khud** aa jata hai.

### 5. Print / save the sheet / Sheet nikaalein
Go to **Reports → Daily Sale**, pick the date, then:
- **Print** (or Ctrl/Cmd + P) for paper,
- **Download PDF** for a file that looks exactly like the paper,
- **Download Excel** for a formatted spreadsheet.

All three show the **same numbers** as the screen.

> **Roman Urdu:** **Reports → Daily Sale** kholein, date chunein, phir **Print**,
> **Download PDF** ya **Download Excel**. Teeno mein numbers **ek jaise** hote hain.

---

## Reports / Reports

Top menu → **Reports** (tabs across the top). Each has **Print · PDF · Excel**.

- **Daily Sale** — the full day sheet (six sections + summary), page number, totals.
- **Daily Stock** — every code: Opening · Purchase · Sale · Closing, with totals.
- **Ledger (Khata)** — pick a party + date range: Debit/Credit with running balance
  and closing (Dr/Cr).
- **Cash Book** — day by day: Opening + In − Out = Closing.
- **Outstanding** — who owes us (jin se lena hai) / whom we owe (jin ko dena hai).
- **Position** — all bank accounts with their balances and history.

> **Roman Urdu:** Har report ke saath **Print/PDF/Excel** hai. **Ledger** mein party
> aur date range chunein. **Outstanding** = jin se lena / jin ko dena hai.
> **Position** = bank accounts.

---

## Bank accounts / Bank

Top menu → **Banks**. A bank is a **separate register** — it does **not** touch the
day sheet or shop cash. Pick a bank to see its running ledger, and use the small
form to add a dated **Debit** (money in) or **Credit** (money out). The **Position**
report prints all banks together.

> **Roman Urdu:** **Banks** alag register hai — day sheet ya golle ke cash se **koi
> taalluq nahi**. Bank chunein, phir date ke saath **Debit** (aaya) ya **Credit**
> (gaya) daalein. Sab bank ek saath **Position** report mein chhapte hain.

---

## Fixing a mistake / Ghalti theek karna

A posted day is locked. To change it (**Admin only**):

1. Open **Day Book** on that date.
2. Click **Unpost** → it becomes a draft again (the ledger/stock rows it wrote are
   removed).
3. Fix the lines.
4. Click **Post day** again.

You can only unpost the **latest** posted day first (no gaps in the cash chain).

> **Roman Urdu:** Post kiya hua din lock hota hai. Badalne ke liye (**sirf Admin**):
> us date par Day Book kholein → **Unpost** → theek karein → dobara **Post day**.
> Pehle **aakhri** posted din unpost hota hai (cash chain mein gap nahi chalta).

---

## Backups / Backup

Take a backup regularly, and **before** any big change (like reset):

```bash
./scripts/backup.sh                       # saves to backups/<date-time>/
./scripts/restore.sh backups/<date-time>  # restore (asks you to type RESTORE)
```

Copy the backup folder **off the computer** (USB / cloud) — a backup on the same
machine is not safe.

> **Roman Urdu:** `backup.sh` se backup lein, khaas tor par kisi bade kaam se
> **pehle**. Restore ke liye `restore.sh`. Backup folder ko computer se **bahar**
> (USB/cloud) rakhein — isi machine par rakha backup mehfooz nahi.

---

## Quick reference / Jaldi yaad

| I want to… | Where |
| --- | --- |
| Enter today's business | Day Book |
| See profit / cash / who-owes | Dashboard |
| Print the day sheet | Reports → Daily Sale → Print/PDF/Excel |
| See a party's khata | Reports → Ledger |
| See bank balances | Banks, or Reports → Position |
| Fix a posted day | Day Book → Unpost (Admin) → edit → Post |
| Save my data | `./scripts/backup.sh` |

> **Roman Urdu:** Rozana entry = **Day Book**. Nafa/cash/lena-dena = **Dashboard**.
> Sheet chhapna = **Reports → Daily Sale**. Party ka khata = **Ledger**. Bank =
> **Banks / Position**. Ghalti = **Unpost → theek → Post**. Data mehfooz =
> `backup.sh`.
