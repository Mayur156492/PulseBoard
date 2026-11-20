// Incident backend module for PulseBoard Milestone 4.
//
// Maintainers:
// - Do not edit applied migrations. Add a new migration file instead.
// - Keep cursor pagination semantics (ORDER BY + keyset predicate + cursor
//   construction) consistent with the existing measurement listing in
//   apps/api/src/services/measurement-service.ts. Incident IDs are stored
//   with BINARY collation, and the next cursor is built from the last returned
//   row, excluding the lookahead row.
//
// This module does not import any HTTP framework. It owns:
//   - shared incident ID validation (imported from @pulseboard/shared)
//   - the incident persistence repository
//   - the service-status snapshot helper used by the detector and scheduler
//   - the detector transition logic
//   - the deterministic list query shape used by the incident routes

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export {
  isValidIncidentId,
  INCIDENT_ID_PATTERN,
} from '@pulseboard/shared';

export { SERVICE_ID_PATTERN } from './services/id-generation.js';
export { createIncidentId } from './services/incident-id-generator.js';
export type { IncidentRow } from './services/incident-service-horizon.js';

export const isValidLocalIncidentId = isValidIncidentId;
import { isValidIncidentId } from '@pulseboard/shared';



// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

// Local contracts are kept only for backward-compatibility re-export surfaces.
// The authoritative public response shape is the shared @pulseboard/shared
// IncidentResponse and IncidentListQuery / IncidentCursor.

export type IncidentStatus = 'open' | 'resolved';
export type IncidentType = 'SERVICE_STALE';

