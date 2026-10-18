-- 002_service_registry
--
-- Services and their latest heartbeat state.
--
-- Design:
-- - services: registered services with stable server-generated IDs.
-- - heartbeats: one row per service (service_id is the PRIMARY KEY).
--   Each heartbeat insert upserts the latest state; this is a repeat-safe
--   latest-state update, not strict request idempotency. A retried request
--   updates received_at because it is newly received.
--
-- This migration adds tables; it does not modify 001_baseline.sql.

CREATE TABLE IF NOT EXISTS services (
  id          TEXT    NOT NULL PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeats (
  service_id  TEXT    NOT NULL PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  received_at INTEGER NOT NULL,
  client_ts   INTEGER
);
