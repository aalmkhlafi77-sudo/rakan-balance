-- Owner-only remote financial data. Apply after 001_owner_auth.sql, in a dedicated database.
-- The data is one validated revisioned snapshot: updates are all-or-nothing.
-- Never co-locate the public visitors' IndexedDB data here.
CREATE TABLE IF NOT EXISTS owner_ledger_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  payload LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT owner_ledger_only_one CHECK (id = 1),
  CONSTRAINT owner_ledger_json CHECK (JSON_VALID(payload))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO owner_ledger_state(id,revision,payload)
VALUES (1, 0, '{"accounts":[],"categories":[],"transactions":[],"attachments":[],"notes":[],"dues":[],"allocations":[],"reminders":[],"settings":{}}');
