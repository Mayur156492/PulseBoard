/**
 * Incident identifier validation.
 *
 * This package holds wire contracts only. It must never import from the API or
 * the web app, and must never perform I/O (pulseboard-architecture rule 1 and
 * the public-surface comment in index.ts).
 *
 * Incident ids are standalone random 21-character URL-safe strings. They carry
 * no structure from the service they belong to: the only incident type in this
 * milestone is `SERVICE_STALE`, which is recorded on the incident row itself.
 * The composite `<serviceId>-<suffix>` grammar is deliberately not used, so
 * there is exactly one incident id grammar in the codebase.
 *
 * Uniqueness is guaranteed by the `incidents.id` primary key at the database
 * level, not by the shape of the identifier.
 */

/**
 * Incident id grammar: exactly 21 URL-safe characters.
 *
 * The pattern is anchored and uses no `g`/`y` flags so repeated `.test()`
 * calls remain deterministic.
 */
export const INCIDENT_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

export type IncidentIdPattern = typeof INCIDENT_ID_PATTERN;

/**
 * Pattern source exported so other modules can reuse the exact same regex
 * source without importing the regex literal itself.
 */
export const INCIDENT_ID_PATTERN_SOURCE = INCIDENT_ID_PATTERN.source;

/**
 * Validates an incident identifier.
 *
 * This is the single authoritative validator for incident ids. Route
 * parameters, pagination cursors and the service layer must all use this
 * function instead of a local copy of the grammar.
 */
export function isValidIncidentId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return INCIDENT_ID_PATTERN.test(value);
}
