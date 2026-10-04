import type { ServerTimestamp } from './time.js';

const HEALTH_STATUSES: readonly HealthStatus[] = ['ok', 'degraded', 'unavailable'];

/**
 * Overall health of a subsystem.
 *
 * - `ok` means the subsystem is fully operational.
 * - `degraded` means it is serving but something is wrong (for example,
 *   database migrations are pending).
 * - `unavailable` means it cannot serve at all.
 */
export type HealthStatus = 'ok' | 'degraded' | 'unavailable';

/** Result of a single named check contributing to a {@link HealthReport}. */
export interface HealthCheckReport {
  readonly name: string;
  readonly status: HealthStatus;
  /** Operator-facing detail. Must never contain secrets or stack traces. */
  readonly message?: string;
}

/**
 * Health payload returned by the API's `/health` and `/ready` endpoints.
 *
 * Timestamps are `ServerTimestamp`s (epoch milliseconds, UTC-normalized by the
 * server) rather than client-formatted strings, so clients cannot disagree
 * about the time format. See pulseboard-architecture rule 8.
 */
export interface HealthReport {
  readonly status: HealthStatus;
  readonly version: string;
  /** When the process started serving, normalized by the server. */
  readonly startedAt: ServerTimestamp;
  /** When this report was produced, normalized by the server. */
  readonly checkedAt: ServerTimestamp;
  readonly checks: readonly HealthCheckReport[];
}

function isHealthCheckReport(value: unknown): value is HealthCheckReport {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate['name'] !== 'string') return false;
  if (typeof candidate['status'] !== 'string') return false;
  if (!HEALTH_STATUSES.includes(candidate['status'] as HealthStatus)) return false;

  const { message } = candidate;
  return typeof message === 'undefined' || typeof message === 'string';
}

function isServerTimestamp(value: unknown): value is ServerTimestamp {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

/**
 * Runtime guard for {@link HealthReport}.
 *
 * The web app validates every response it receives: TypeScript types do not
 * survive the network, and rendering an unvalidated `checks` array is how a
 * malformed payload becomes a crash on someone else's screen
 * (pulseboard-architecture rule 2).
 */
export function isHealthReport(value: unknown): value is HealthReport {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;

  const { status } = candidate;
  if (typeof status !== 'string' || !HEALTH_STATUSES.includes(status as HealthStatus)) {
    return false;
  }

  if (typeof candidate['version'] !== 'string') return false;
  if (!isServerTimestamp(candidate['startedAt'])) return false;
  if (!isServerTimestamp(candidate['checkedAt'])) return false;

  const { checks } = candidate;
  return Array.isArray(checks) && checks.every(isHealthCheckReport);
}