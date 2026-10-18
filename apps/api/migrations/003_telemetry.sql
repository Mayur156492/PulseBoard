-- 003_telemetry
--
-- Telemetry measurements for registered services.
--
-- Design:
-- - One row per measurement.
-- - Stable server-generated ID with the existing 21-char URL-safe format.
-- - server-normalized event_timestamp and received_at.
-- - Deterministic pagination ordering uses BINARY collation on id so the
--   keyset comparison and ORDER BY remain consistent.
--
-- Indexes support both metric-filtered and unfiltered service listing.
-- They are covering for the predictable listing query shape; they do not
-- promise performance for arbitrary filters not included here.

CREATE TABLE IF NOT EXISTS measurements (
  id              TEXT    NOT NULL PRIMARY KEY COLLATE BINARY,
  service_id      TEXT    NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  metric          TEXT    NOT NULL,
  value           REAL    NOT NULL,
  event_timestamp INTEGER NOT NULL,
  received_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_measurements_service_metric_time
  ON measurements (
    service_id,
    metric,
    event_timestamp,
    received_at,
    id COLLATE BINARY
  );

CREATE INDEX IF NOT EXISTS idx_measurements_service_time
  ON measurements (
    service_id COLLATE BINARY,
    event_timestamp,
    received_at,
    id COLLATE BINARY
  );
