# Owner private attachment foundation — staged, not enabled in UI

This branch adds an owner-authenticated MySQL binary store and includes its objects in the encrypted backup archive. It is intentionally **not** a complete migration of the legacy inline Base64 attachment model.

## Schema and routes
- Apply migration `004_owner_private_attachments.sql` only to the dedicated RAKAN BALANCE database **after 001–003**.
- `PUT /api/owner/attachment-blobs/:id` uses an authenticated session, exact same-origin check, CSRF token, `Content-Type: application/octet-stream`, and `x-transaction-id` header.
- `GET /api/owner/attachment-blobs/:id` requires the owner session and checks the current committed ledger association before serving bytes with `no-store` and attachment disposition.
- Uploads require existing committed ledger metadata linking both attachment and transaction IDs; no overwrite; maximum 5 MiB per object; PDF, PNG, JPG, GIF and WebP magic signatures only. SVG is deliberately excluded from the binary endpoint.
- Strong SHA-256 verification of stored content on every download; corrupted bytes are never served.
- The binary API does not expose public URLs, browser-local files, or visitor IndexedDB.

## Backups
The separate encrypted snapshot archive now includes existing private attachment blobs, checksum-validated and linked to the ledger. Restore-test inserts both the snapshot and binary rows under **one database transaction** into an empty test database only. Existing archives without binary records remain readable.

## Explicit release blockers
1. Legacy client attachments still use inline `dataUrl`; **no automatic migration or deletion** is implemented. Do not call this complete private attachment UX.
2. Full real-MySQL migration and restore testing are required. Backup size is bounded by 24 MiB total plaintext and per-attachment limit 5 MiB; large aggregate collections require an independently encrypted offsite object archive and restore manifest.
3. Current binary uploads are independent of the initial ledger CAS transaction, so they must not be presented as atomic combined attachment+ledger writes. Client-side migration and transactional protocol must be designed, verified and approved before enabling this path in the interface.
4. Rate-limit and trust-proxy configuration must be verified on Hostinger. Scheduled backups/offsite retention are not configured.
5. No user files, visitor records, production database or public hosting have been modified.

## Verification
`npm run test:server` tests authorization, CSRF, MIME rejection, immutable uploads, checksum failures and encrypted archive integrity with mock DB pools. These are not substitutes for real InnoDB/Hostinger acceptance tests.
