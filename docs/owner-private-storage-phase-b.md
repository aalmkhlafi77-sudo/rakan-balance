# Phase B — owner-only revisioned ledger store (not yet wired to the UI)

This branch extends Phase A. It is **not ready for publication** until the owner UI and full user operations use the remote backend instead of IndexedDB.

## MySQL
- Apply `database/002_owner_ledger.sql` to the **same new dedicated database** used for phase A, never to an existing site's schema.
- A single `owner_ledger_state` record (id=1) contains the complete validated owner ledger as JSON and an integer revision, updated atomically with InnoDB row locking.
- Required dataset: accounts, categories, transactions, attachments, notes, dues, allocations, reminders, sanitized settings.
- This is a correctness-first transitional storage mechanism; a later normalization/migration can be considered once conflict and performance characteristics are measured. No visitor data is ever stored here.
- Snapshot size limit: 20 MiB; API JSON limit: 24 MiB. Larger attachments/data sets **must receive explicit error**, never silent truncation or success.
- Before deploying, confirm Hostinger's `max_allowed_packet` can accept the configured size or lower the application limit to an explicitly validated value.

## API
- `GET /api/owner/ledger` — authenticated owner only; returns `{revision,data}`.
- `PUT /api/owner/ledger` — authenticated owner with exact Origin and CSRF, request `{expectedRevision,data}`.
- A stale expectedRevision returns HTTP 409 plus current revision, without changing persisted data.
- Validation rejects duplicate identifiers, demo-tagged records, broken references, cycles, incomplete transfers, fractional or out-of-range minor amounts, inconsistent dues/allocations, bad attachments, and secret fields in settings.
- All writes within a single InnoDB transaction; one row can never partially update.
- The API never accepts public registration or visitor records.

## Remaining before connecting the interface
- Adopt a **remote storage adapter for every financial mutation** and all imports, restore, attachments and settings. Never fake successful saves by writing local first and hoping to upload later.
- Scope all owner data to the authenticated session **in memory only**; clear it on logout and auth failure. Never persist owner records into visitor IndexedDB.
- Provide explicit conflict reload/resolve flow and visible network errors.
- Validate all existing golden fixtures, reconciliation, mobile editing, reports, attachments, currency operations and safe manual migration.
- Server-side backups, encrypted storage handling, attachment limits and tested restore need production hardening.
- Remove demo mode and seeded sample data in the separate cleanup task before publication.

## Tests
`npm run test:server` executes password/session, protected API and ledger atomicity tests. Financial regression tests remain unchanged.
