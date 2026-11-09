# Owner private attachments — integrated pre-hosting implementation

This branch adds an owner-authenticated MySQL binary store, atomic ledger+blob persistence, on-demand preview/download, portable JSON reconstruction, and encrypted archive coverage. Visitor/local storage remains unchanged. This is **pre-hosting** until real MySQL and restore acceptance tests pass.

## Schema and routes
- Apply migration `004_owner_private_attachments.sql` only to the dedicated RAKAN BALANCE database **after 001–003**.
- Binary writes are accepted only inside authenticated `PUT /api/owner/ledger`; ledger metadata and blob inserts/deletes commit in one InnoDB transaction. There is no standalone binary write endpoint.
- `GET /api/owner/attachment-blobs/:id` requires the owner session and checks the current committed ledger association before serving bytes with `no-store` and attachment disposition.
- Uploads require existing committed ledger metadata linking both attachment and transaction IDs; no overwrite; maximum 5 MiB per object; PDF, PNG, JPG, GIF and WebP magic signatures only. SVG is deliberately excluded from the binary endpoint.
- Strong SHA-256 verification of stored content on every download; corrupted bytes are never served.
- The binary API does not expose public URLs, browser-local files, or visitor IndexedDB.

## Backups
The separate encrypted snapshot archive now includes existing private attachment blobs, checksum-validated and linked to the ledger. Restore-test inserts both the snapshot and binary rows under **one database transaction** into an empty test database only. Existing archives without binary records remain readable.

## Explicit release blockers
1. Full real-MySQL migration, binary roundtrip and encrypted restore tests are required on an isolated Hostinger database.
2. Portable browser JSON is limited to 16 MiB total; the encrypted operator archive is currently limited to 24 MiB plaintext. Large aggregate collections need an off-host encrypted object/archive strategy and retention policy.
3. Scheduled backups, off-host encrypted retention, rotation and alerting are not configured until the hosting environment exists.
4. Rate-limit and reverse-proxy client-IP behavior must be verified on Hostinger.
5. Two physical devices must prove optimistic revision conflicts, network-failure behavior and attachment consistency.
6. No user files, visitor records, production database or public hosting have been modified.

## Client behavior
- Owner uploads still enter the existing transaction form as temporary Data URLs, but the server atomically extracts supported binary bytes and stores only `rakan-private://attachment/<id>` in the ledger snapshot.
- After a successful commit, the owner in-memory state is normalized to the same private reference, so later writes do not resend Base64.
- Preview/download fetches the authenticated blob only when opened.
- Portable owner JSON export temporarily reconstructs verified Data URLs from the private blob store; import of that portable JSON atomically recreates the private blobs.
- SVG remains available to local visitors but is deliberately rejected in owner private storage; owner uploads support PNG/JPEG/WebP/GIF/PDF.

## Verification
`npm run test:server` covers authorization, CSRF, atomic ledger/blob rollback, deletion, immutable integrity and encrypted archive checks. Full N1 CI also runs financial tests, TypeScript, production build, no-demo guard and browser regression tests. These are not substitutes for real InnoDB/Hostinger acceptance tests.
