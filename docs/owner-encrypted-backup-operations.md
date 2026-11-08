# RAKAN BALANCE — encrypted owner backups (pre-hosting implementation)

**Not ready for production.** This provides manually initiated encrypted export, offline verification, and restricted restore to an empty isolated test database only. It does not create automated backups, cloud retention, or recovery monitoring.

## Cryptography
- AES-256-GCM, independent random 96-bit nonce and 256-bit salt per export.
- scrypt N=32768, r=8, p=1 for a dedicated 20+ character passphrase.
- Integrity checks include authenticated ciphertext, ledger payload SHA-256, and domain backup validation.
- Only encrypted files should leave the protected server environment. The passphrase must be maintained **separately** from the database and backup file.

## Operations (after isolated MySQL setup; NOT NOW)
Use a protected process environment supplying `RAKAN_BACKUP_PASSPHRASE`, standard DB variables and generated validator. Never place passphrases in command history, GitHub, public folders or logs.

```sh
node server/scripts/owner-backup.mjs export /private/backups/owner-2026.enc
node server/scripts/owner-backup.mjs verify /private/backups/owner-2026.enc
```

For restoration **only** against a verified new **test/staging** database with the dedicated schema initialized and empty `owner_ledger_snapshot` (revision 0, payload NULL):

```sh
RAKAN_RESTORE_TEST_ONLY=1 node server/scripts/owner-backup.mjs restore-test /private/backups/owner-2026.enc
```

The filename is an example, not a known Hostinger path. Restore refusal is intentional when the DB name does not indicate test/staging, when the restore guard is missing, or when the target contains any ledger. A database name is not strong isolation proof: before execution manually verify the server/database identity, least-privilege credentials, separate Hostinger installation and no real customer or owner data.

## Outstanding release requirements
1. Actual Hostinger MySQL-based export and isolated restore; financial reconciliation and checksum verification.
2. Regular scheduled encrypted backups, off-host encrypted retention, rotation, alerting and tested restore drills.
3. Protected large binary attachment storage and verified attachment restore; **the backup currently covers only the bounded ledger snapshot**.
4. Verify MySQL migrations 001, 002 and 003, rate-limit behavior across workers and reverse proxy IP handling.
5. Two-device authenticated owner testing, guest separation, failed network saves and stale-version 409 conflicts.
6. Full CI checks and explicit owner merge approval before hosting.

No changes to real visitor IndexedDB, no database deletion and no production restore route.
