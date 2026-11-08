# RAKAN BALANCE — encrypted owner backups (pre-hosting implementation)

**Not ready for production.** This provides manual encrypted export/verify/isolated restore plus a cron-ready scheduled runner with bounded retention. No schedule, Hostinger path, off-host destination or alerting is active until hosting is configured.

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

## Scheduled runner (prepared, not activated)
After isolated Hostinger setup, configure server-only values `RAKAN_BACKUP_DIR`, `RAKAN_BACKUP_RETENTION_COUNT` (default 14), and optionally a genuinely independent `RAKAN_BACKUP_MIRROR_DIR`. Both directories must be absolute, outside the application directory, and primary/mirror paths may not overlap.

```sh
npm run backup:scheduled
```

The runner:
- acquires a non-waiting MySQL advisory lock to prevent overlapping jobs;
- creates a uniquely named encrypted archive;
- runs the existing cryptographic/financial verification before retention;
- preserves a verified primary archive if an optional mirror operation fails;
- retains only its own managed `.rbe` files and never deletes unrelated files.

The mirror is only a second path. **Do not call it off-host** unless Hostinger storage topology proves it is on an independent failure domain. The actual scheduler/cron cadence and alerting are configured only after the hosting environment is known.

## Outstanding release requirements
1. Actual Hostinger MySQL-based export and isolated restore; financial reconciliation and checksum verification.
2. Activate the prepared scheduled runner on Hostinger, choose a proven independent encrypted retention destination, configure rotation/alerting and execute restore drills.
3. Validate private binary attachment backup/restore on real MySQL; current implementation includes binary rows but remains bounded by archive limits.
4. Verify MySQL migrations 001-004, rate-limit behavior across workers and reverse proxy IP handling.
5. Two-device authenticated owner testing, guest separation, failed network saves and stale-version 409 conflicts.
6. Full CI checks and explicit owner merge approval before hosting.

No changes to real visitor IndexedDB, no database deletion and no production restore route.
