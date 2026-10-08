# TechAssures Lab: backend + CRM

Zero-dependency Node server (Node >= 22.5, uses built-in `node:sqlite`) that serves the app and stores every edit and addition in one SQLite file.

## Run
    node server.js          # http://localhost:3000
    npm test                # API test suite

Demo logins (DEMO_MODE on): admin/1111, rahul/2222 (Store), suresh/3333 and imran/5555 (Testers), meera/4444 (Accounts).

## Environment
- PORT (3000), HOST, DB_PATH (./data/lab.db), TZ (Asia/Kolkata)
- DEMO_MODE=0 hides demo accounts. **For real use: set it to 0, log in as admin and change every PIN (Admin > Users).**

## What the backend does
- Set DATABASE_URL (Neon, Supabase or any Postgres) to keep data across restarts; without it a local SQLite file is used.
- Persists clients, projects, tests, samples, results, invoices, payments, CRM leads/interactions/tasks, settings.
- Server allocates UID / ULR / job / invoice numbers, enforces the date gate, strength calculation, advance-bill block on sending, and overpayment block.
- Roles enforced server-side: store and testers never receive prices or payments; testers only get their own jobs without client info; CRM and money are admin/accounts only.
- Audit log (Admin > Activity), CSV export (Reports), PINs scrypt-hashed, sessions are hashed bearer tokens, login throttling.
- Multi-device sync: devices poll a change feed every 8 s. Config/CRM edits are last-write-wins.
- Opened as a plain file (no server) the same page runs as the offline localStorage demo.

## Deploy
Any host that runs Node 22 with a persistent disk: `docker build -t lab . && docker run -p 3000:3000 -v labdata:/data lab`. Put it behind HTTPS.
