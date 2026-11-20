/**
 * Contracts for incident listing and inspection.
 *
 * These types are shared across the API and any future clients of the PulseBoard
 * schema. They do not own persistence or HTTP details.
 */

/** Lifecycle status of an incident. */
export type IncidentStatus = 'open' | 'resolved';

/**
 * Incident categories supported by this milestone.
 *
 * `SERVICE_STALE` is the only type: a service stopped sending heartbeats for
 * longer than the stale threshold.
 */
export type IncidentType = 'SERVICE_STALE';

/**
 * Public incident representation.
 *
 * Exactly six fields are exposed. `resolvedAt` is null while the incident is
 * open and holds the resolution timestamp once the incident is resolved.
 */
export interface IncidentResponse {
  readonly id: string;
  readonly serviceId: string;
  readonly incidentType: IncidentType;
  readonly status: IncidentStatus;
  readonly openedAt: number;
  readonly resolvedAt: number | null;
}

export interface ResolvedIncidentResponse {
  readonly id: string;
  readonly serviceId: string;
  readonly incidentType: IncidentType;
  readonly status: IncidentStatus;
  readonly openedAt: number;
  readonly resolvedAt: number;
}

export function isResolvedIncident(
  incident: IncidentResponse,
): incident is ResolvedIncidentResponse {
  return incident.resolvedAt !== null;
}

/** Query parameters accepted by the incident listing endpoint. */
export interface IncidentListQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly serviceId?: string;
  readonly status?: IncidentStatus;
}

/** Response body of the incident listing endpoint. */
export interface IncidentListResponse {
  readonly incidents: readonly IncidentResponse[];
  readonly nextCursor?: string;
}

/**
 * Runtime shape of a decoded incident pagination cursor.
 *
 * The fingerprint records the filters the page was produced with, so a cursor
 * can only be replayed against an identical query.
 */
export interface IncidentCursor {
  readonly id: string;
  readonly openedAt: number;
  readonly fingerprint: {
    readonly serviceId: string | null;
    readonly status: IncidentStatus | null;
    readonly limit: number;
  };
}
