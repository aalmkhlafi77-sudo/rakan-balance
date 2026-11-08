# RAKAN BALANCE — Hostinger Business, isolated private owner + public local visitors

**Status: PREDEPLOYMENT ONLY.** Approved host: `rakan.carpetbazar.org`.
The previous static-only PHP/HTML deployment plan is now **obsolete** for this app because the owner area needs authenticated Express APIs and MySQL.

## Confirm before performing any hosting changes

- Hostinger Business account manages `carpetbazar.org`. Create an **independent site/app** for `rakan.carpetbazar.org`; never reuse the root or database of any existing website.
- Do not change DNS records except `rakan`, and do not guess a shared-server IP.
- The frontend is public (free visitors save to their own browser IndexedDB); owner data is hosted privately, authenticated on every request and never downloaded to visitors.
- The owner's real financial ledger **must not be used** until the deployment tests, backup restore and multi-device conflict tests succeed.

## Node.js deployment

The deployed process must run `server/start.mjs` (Express + React static assets). Do NOT choose static-only hosting for the final application.

| Hostinger setting | Required value |
| --- | --- |
| Domain | `rakan.carpetbazar.org` |
| Source | `aalmkhlafi77-sudo/rakan-balance` |
| Branch | Approved release commit on `main` **only after all PRs approved and merged** |
| Node.js | Node 22 or newer compatible LTS |
| Install | `npm install` (needs build dependencies for Vite/esbuild) |
| Build | `npm run build` (creates `dist/` **and** `server/generated/owner-validator.mjs`) |
| Start/entry | `npm start` / `server/start.mjs` |
| Port | Provided by Hostinger's `PORT` environment variable |
| Web root | Served internally by Express from `dist/` |
| Auto deploy | **Disabled** until explicitly authorized |
| MySQL | A **new, dedicated** Hostinger MySQL database |
| Visitor data | Browser-local IndexedDB; no visitor account needed |

The app must have the full server code plus `dist/` and `server/generated/` at runtime. If the Hostinger builder publishes only `dist/` or refuses Node.js server entry, **stop**; do not silently switch back to static hosting.

## MySQL initialization

1. Create a dedicated database and **dedicated restricted database account**. Confirm the Hostinger-provided hostname (not automatically `localhost`).
2. Run these schema migrations sequentially **only in the new database**:
   - `database/001_owner_auth.sql`
   - `database/002_owner_ledger_snapshot.sql`
   - `database/003_owner_login_limits.sql`
   - `database/004_owner_private_attachments.sql`
3. One-time owner provisioning: `npm run provision:owner` using `RAKAN_OWNER_PASSWORD` in a protected, temporary environment (never paste passwords in chat or check them into GitHub). Unset the variable afterward.
4. Do **not** place the owner password or database credentials in any `VITE_*` variable or source file.

Required **server-only** variables:
```dotenv
APP_ORIGIN=https://rakan.carpetbazar.org
DB_HOST=<hostinger-host>
DB_PORT=3306
DB_NAME=<new-dedicated-database>
DB_USER=<dedicated-db-user>
DB_PASSWORD=<stored-in-Hostinger-secrets>
RAKAN_CSRF_SECRET=<random-strong-secret-at-least-32-chars>
```
`PORT` is hosting-managed.

## Security / operational constraints

- HTTPS must work correctly before owner credentials are used. The `__Host-rakan_session` session cookie is `HttpOnly; Secure; SameSite=Strict`.
- Origin and anti-CSRF checks apply to state changes. Passwords are salted slow hashes; sessions are revocable server-side.
- Confirm database sessions, periodic expiry cleanup, persistent login rate limits across workers, trusted reverse-proxy client IP behavior and server logs (without credentials or ledger records).
- Owner ledger writes use **atomic MySQL row locking** and optimistic revisions. A 409 conflict must be visible to the owner and must not overwrite a device's newer financial data.
- Owner ledger snapshot stores only private attachment references after save. Binary bytes live in `owner_attachment_blobs` and are committed/deleted atomically with ledger revisions. The current MySQL binary store is capped at 5 MiB per file; aggregate archive limits still require operational monitoring and an off-host retention strategy.
- Private owner mode does not support offline edits. Never show a false "saved" message when the server is unreachable.
- Configure **scheduled encrypted backups** using the protected server backup tool, retain an encrypted copy off-host, and verify actual restore into a dedicated empty test database including binary attachments. Local visitor JSON backups are separate and not handled by Hostinger MySQL backups.
- Local browser PIN only applies to the visitor/local experience; it is not owner-server authentication.

## Final release acceptance tests (required)

1. Open the **exact** subdomain over HTTPS on desktop and phone and verify the approved logo, bottom bar, and day/night modes.
2. **Guest**: can create data without registration, reload and see it only on the same origin/device. No guest financial records may be written to MySQL.
3. **Owner**: wrong password fails; valid password logs in; unauthenticated GET/PUT to `/api/owner/ledger` receives 401; cross-origin and missing-CSRF writes are rejected.
4. After owner login, the local visitor financial records must not appear in owner UI. After logout, owner records must not appear in guest UI or remain in visitor IndexedDB.
5. With **two physical devices**, create/edit accounts, transfers, due payments, notes, reports and attachments, verify the server is authoritative and revision 409 conflicts prevent lost writes.
6. Export/import the portable owner JSON with attachments, then export the encrypted operator archive and restore it into an empty isolated test database. Reconcile counts, balances, transfer pairs, attachment IDs/SHA-256 and test failure/atomic rollback.
7. Production bundles must have **zero preview labels or seeded fictional financial records** (CI `check-production-no-demo.mjs`).
8. Verify browser refresh and direct page routes; verify static asset 404s remain 404.
9. Verify SSL, uptime, backups, restore, session expiry, and restricted DB permissions; confirm other Hostinger sites remain unchanged.

**No claim of deployment completion** without real hosting, real database and acceptance evidence.