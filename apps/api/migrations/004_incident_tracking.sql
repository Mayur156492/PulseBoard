-- 004_incident_tracking
--
-- Deterministic service-staleness incident tracking.
--
-- Minimal incident record:
--   id, service_id, incident_type, status, opened_at, resolved_at
--
-- Incident identity:
--   - id is a standalone 21-character URL-safe identifier.
--   - incident_type is recorded on the incident row; for this milestone the
--     only type is SERVICE_STALE.
--   - status is either open or resolved.
--
-- Lifecycle constraint:
--   - Only one open incident may exist per service at a time.
--   - A service that still has incident history cannot be deleted.

CREATE TABLE IF NOT EXISTS incidents (
  id           TEXT    NOT NULL PRIMARY KEY,
  incident_type TEXT   NOT NULL,
  service_id   TEXT    NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  status       TEXT    NOT NULL,
  opened_at    INTEGER NOT NULL,
  resolved_at  INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_open_service
  ON incidents (service_id)
  WHERE status = 'open';

