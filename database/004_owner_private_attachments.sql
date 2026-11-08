-- Private owner binary attachments, independent from the bounded ledger snapshot.
-- Run ONLY on the dedicated RAKAN BALANCE MySQL database, after migrations 001-003.
-- Existing legacy data URLs remain untouched; migration is explicitly opt-in.
CREATE TABLE IF NOT EXISTS owner_attachment_blobs (
  attachment_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  transaction_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  byte_length INT UNSIGNED NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content LONGBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_owner_attachment_transaction (transaction_id),
  CONSTRAINT chk_owner_attachment_size CHECK (byte_length BETWEEN 1 AND 5242880)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
