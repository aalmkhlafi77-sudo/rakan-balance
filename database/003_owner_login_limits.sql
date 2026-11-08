-- Persistent owner login throttling. Apply ONLY to the dedicated RAKAN BALANCE database.
-- Required before enabling this branch's authentication API.
-- The HMAC digest avoids retaining raw remote IP addresses.
CREATE TABLE IF NOT EXISTS owner_login_limits (
  address_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL,
  window_ends_at DATETIME(3) NOT NULL,
  INDEX idx_window_ends_at (window_ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
