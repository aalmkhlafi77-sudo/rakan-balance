-- Phase B — private single-owner ledger snapshot with optimistic revision control.
-- Run only on the fresh isolated RAKAN BALANCE database, after 001_owner_auth.sql.
-- Snapshot is a validated BackupBundle stored atomically as bytes; it is never public.
-- Temporary architecture: large attachments should be moved to a protected binary
-- repository before public launch; never pretend this is complete multi-device UX.

CREATE TABLE IF NOT EXISTS owner_ledger_snapshot (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  payload LONGBLOB NULL,
  payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT only_owner_ledger CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO owner_ledger_snapshot (id, revision, payload, payload_sha256)
VALUES (1, 0, NULL, NULL);
