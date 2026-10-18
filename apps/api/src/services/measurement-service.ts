import type { Database } from '../ports.js';
import { generateMeasurementId, isValidMeasurementId } from './measurement-id.js';
import {
  insertMeasurement,
  listMeasurements,
  type MeasurementRow,
} from './measurement-repository.js';
import {
  toServerTimestamp,
  type ServerTimestamp,
} from '@pulseboard/shared';
import type {
  MeasurementCreateRequest,
  MeasurementResponse,
  MeasurementListQuery,
  MeasurementListResponse,
  MeasurementCursor,
} from '@pulseboard/shared';
import { AppError } from '../errors.js';

/**
 * Maximum page size supported by the listing query.
 */
const MAXIMUM_LIMIT = 1000;

/**
 * Interval width limit: 365 days in milliseconds.
 */
const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Allowed metric name characters: `[a-zA-Z0-9_.-]`.
 */
const METRIC_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,128}$/;

/**
 * Maximum future offset for client timestamps: 60 seconds in milliseconds.
 */
const MAX_FUTURE_MS = 60_000;


/**
 * Builds a `MeasurementCursor` JSON for the wire.
 */
export interface EncodedCursor {
  readonly eventTimestamp: number;
  readonly receivedAt: number;
  readonly id: string;
  readonly fingerprint: {
    readonly serviceId: string;
    readonly metric: string | null;
    readonly from: number | null;
    readonly to: number | null;
    readonly limit: number;
  };
}

/**
 * Service-layer validation and normalization for measurement ingestion and
 * listing.
 *
 * This module owns:
 * - input validation (metric, value, timestamp, limits, cursors)
 * - timestamp normalization to server time
 * - cursor encode/decode with independent object validation
 * - fingerprint reconstruction and matching
 *
 * It does not own SQL construction or ordering; that stays in the repository.
 */

/**
 * Validates and normalizes a measurement creation request.
 *
 * Returns the normalized request shape that the repository expects.
 */
export function validateMeasurementRequest(
  _serviceId: string,
  request: MeasurementCreateRequest,
  nowMs: number,
): {
  readonly metric: string;
  readonly value: number;
  readonly eventTimestamp: ServerTimestamp;
  readonly receivedAt: ServerTimestamp;
} {
  // Trim whitespace but preserve the original case.
  const metric = typeof request.metric === 'string'
    ? request.metric.trim()
    : '';

  if (metric.length === 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'metric is required',
      details: [{ path: 'metric', message: 'must be a non-empty string' }],
    });
  }

  if (metric.length > 128) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'metric name is too long',
      details: [{ path: 'metric', message: 'must be at most 128 characters' }],
    });
  }

  if (!METRIC_NAME_PATTERN.test(metric)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Invalid metric name "${metric}"`,
      details: [{ path: 'metric', message: 'must match [a-zA-Z0-9_.-] and not start with . or -' }],
    });
  }

  const firstChar = metric[0];
  if (firstChar === '.' || firstChar === '-') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Invalid metric name "${metric}"`,
      details: [{ path: 'metric', message: 'must not start with . or -' }],
    });
  }

  const value = request.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'value must be a finite number',
      details: [{ path: 'value', message: 'must be a finite number' }],
    });
  }

  // Check for unexpected properties beyond metric, value, and timestamp.
  const allowedKeys = new Set(['metric', 'value', 'timestamp']);
  for (const key of Object.keys(request)) {
    if (!allowedKeys.has(key)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Unexpected property "${key}" in request body`,
        details: [{ path: key, message: 'unexpected property' }],
      });
    }
  }

  // Normalize event timestamp from the client. A missing timestamp means
  // "now" from the client's perspective, so we use the server clock.
  let eventTimestampMs: number;
  if (request.timestamp === undefined) {
    eventTimestampMs = nowMs;
  } else {
    if (typeof request.timestamp !== 'number' || !Number.isFinite(request.timestamp)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'timestamp must be a finite number',
        details: [{ path: 'timestamp', message: 'must be a finite number' }],
      });
    }
    if (!Number.isInteger(request.timestamp)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'timestamp must be an integer',
        details: [{ path: 'timestamp', message: 'must be an integer' }],
      });
    }
    if (request.timestamp < 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'timestamp must be non-negative',
        details: [{ path: 'timestamp', message: 'must be non-negative' }],
      });
    }
    eventTimestampMs = request.timestamp;
  }

  // Enforce maximum timestamp: cannot be more than 60 seconds in the future.
  const maxTimestamp = nowMs + MAX_FUTURE_MS;
  if (eventTimestampMs > maxTimestamp) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'timestamp is too far in the future',
      details: [
        {
          path: 'timestamp',
          message: `must be at most 60 seconds in the future (before ${new Date(maxTimestamp).toISOString()})`,
        },
      ],
    });
  }

  return {
    metric,
    value,
    eventTimestamp: toServerTimestamp(eventTimestampMs),
    receivedAt: toServerTimestamp(nowMs),
  };
}

/**
 * Encodes a cursor from a measurement row and the query parameters that
 * produced it.
 */
export function encodeCursor(
  row: MeasurementRow,
  fingerprint: {
    readonly serviceId: string;
    readonly metric: string | null;
    readonly from: number | null;
    readonly to: number | null;
    readonly limit: number;
  },
): string {
  const cursor: EncodedCursor = {
    eventTimestamp: row.event_timestamp,
    receivedAt: row.received_at,
    id: row.id,
    fingerprint,
  };

  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Decodes and validates a cursor string.
 *
 * The decoded JSON is parsed as `unknown` and each object is validated
 * independently. Unexpected keys are rejected in both the outer cursor and the
 * nested fingerprint.
 */
export function decodeCursor(encoded: string): MeasurementCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
  } catch {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor', message: 'must be valid base64url-encoded JSON' }],
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor', message: 'must be a JSON object' }],
    });
  }

  const cursorObj = parsed as Record<string, unknown>;

  // Validate the outer cursor shape.
  const eventTimestamp = cursorObj.eventTimestamp;
  const receivedAt = cursorObj.receivedAt;
  const id = cursorObj.id;
  const fingerprint = cursorObj.fingerprint;

  if (typeof eventTimestamp !== 'number' || !Number.isInteger(eventTimestamp)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.eventTimestamp', message: 'must be an integer' }],
    });
  }

  if (typeof receivedAt !== 'number' || !Number.isInteger(receivedAt)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.receivedAt', message: 'must be an integer' }],
    });
  }

  if (typeof id !== 'string' || !isValidMeasurementId(id)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.id', message: 'must be a valid measurement id' }],
    });
  }

  if (typeof fingerprint !== 'object' || fingerprint === null || Array.isArray(fingerprint)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.fingerprint', message: 'must be a JSON object' }],
    });
  }

  const fp = fingerprint as Record<string, unknown>;

  // Reject unexpected keys on the fingerprint object.
  const allowedFingerprintKeys = new Set([
    'serviceId',
    'metric',
    'from',
    'to',
    'limit',
  ]);
  for (const key of Object.keys(fp)) {
    if (!allowedFingerprintKeys.has(key)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Malformed cursor',
        details: [{ path: 'cursor.fingerprint', message: `unexpected key "${key}"` }],
      });
    }
  }

  const serviceId = fp.serviceId;
  const metric = fp.metric;
  const from = fp.from;
  const to = fp.to;
  const limit = fp.limit;

  if (typeof serviceId !== 'string' || serviceId.length === 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.fingerprint.serviceId', message: 'must be a non-empty string' }],
    });
  }

  if (metric !== null && typeof metric !== 'string') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.fingerprint.metric', message: 'must be a string or null' }],
    });
  }

  if (from !== null && (typeof from !== 'number' || !Number.isInteger(from))) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.fingerprint.from', message: 'must be a number or null' }],
    });
  }

  if (to !== null && (typeof to !== 'number' || !Number.isInteger(to))) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.fingerprint.to', message: 'must be a number or null' }],
    });
  }

  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Malformed cursor',
      details: [{ path: 'cursor.fingerprint.limit', message: 'must be a positive integer' }],
    });
  }

  // Reject unexpected keys on the outer cursor object.
  const allowedCursorKeys = new Set([
    'eventTimestamp',
    'receivedAt',
    'id',
    'fingerprint',
  ]);
  for (const key of Object.keys(cursorObj)) {
    if (!allowedCursorKeys.has(key)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Malformed cursor',
        details: [{ path: 'cursor', message: `unexpected key "${key}"` }],
      });
    }
  }

  return {
    eventTimestamp,
    receivedAt,
    id,
    fingerprint: {
      serviceId,
      metric: metric === null ? null : metric,
      from: from === null ? null : from,
      to: to === null ? null : to,
      limit,
    },
  };
}

/**
 * Validates a decoded cursor against the current query parameters.
 *
 * A cursor is only valid for the exact same query shape that produced it.
 * Mismatches (different service, metric, range, or limit) are rejected so
 * clients cannot drift between query shapes mid-pagination.
 */
export function validateCursorFingerprint(
  cursor: MeasurementCursor,
  serviceId: string,
  metric: string | undefined,
  from: number | null,
  to: number | null,
  limit: number,
): void {
  if (cursor.fingerprint.serviceId !== serviceId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cursor fingerprint mismatch',
      details: [
        {
          path: 'cursor',
          message: 'cursor serviceId does not match the current service',
        },
      ],
    });
  }

  const expectedMetric = metric ?? null;
  if (cursor.fingerprint.metric !== expectedMetric) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cursor fingerprint mismatch',
      details: [
        {
          path: 'cursor',
          message: 'cursor metric does not match the current query',
        },
      ],
    });
  }

  if (cursor.fingerprint.from !== from) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cursor fingerprint mismatch',
      details: [
        {
          path: 'cursor',
          message: 'cursor from does not match the current query',
        },
      ],
    });
  }

  if (cursor.fingerprint.to !== to) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cursor fingerprint mismatch',
      details: [
        {
          path: 'cursor',
          message: 'cursor to does not match the current query',
        },
      ],
    });
  }

  if (cursor.fingerprint.limit !== limit) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cursor fingerprint mismatch',
      details: [
        {
          path: 'cursor',
          message: 'cursor limit does not match the current query',
        },
      ],
    });
  }
}

/**
 * Parses and validates a measurement list query.
 *
 * Returns the resolved query parameters for the repository, including the
 * cursor fields when a cursor is present.
 *
 * Bounds are validated and normalized against the supplied server time so
 * that cursor fingerprints use canonical normalized values.
 */
export function parseListQuery(
  serviceId: string,
  query: MeasurementListQuery,
  nowMs: number,
): {
  readonly metric: string | undefined;
  readonly from: number | null;
  readonly to: number | null;
  readonly limit: number;
  readonly cursor: MeasurementCursor | undefined;
} {
  let metric: string | undefined;
  if (query.metric !== undefined) {
    if (typeof query.metric !== 'string') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'metric must be a string',
        details: [{ path: 'metric', message: 'must be a string' }],
      });
    }
    const normalized = query.metric.trim();
    if (normalized.length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'metric must be a non-empty string',
        details: [{ path: 'metric', message: 'must be a non-empty string' }],
      });
    }
    if (normalized.length > 128) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'metric name is too long',
        details: [{ path: 'metric', message: 'must be at most 128 characters' }],
      });
    }
    if (!METRIC_NAME_PATTERN.test(normalized)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Invalid metric name "${normalized}"`,
        details: [{ path: 'metric', message: 'must match [a-zA-Z0-9_.-] and not start with . or -' }],
      });
    }
    metric = normalized;
  }

  // Validate explicitly supplied bounds before any normalization.
  let explicitFrom: number | undefined;
  if (query.from !== undefined) {
    const fromValue = typeof query.from === 'string' ? Number(query.from) : query.from;
    if (typeof fromValue !== 'number' || !Number.isFinite(fromValue)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'from must be a finite number',
        details: [{ path: 'from', message: 'must be a finite number' }],
      });
    }
    if (!Number.isInteger(fromValue)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'from must be an integer',
        details: [{ path: 'from', message: 'must be an integer' }],
      });
    }
    if (fromValue < 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'from must be non-negative',
        details: [{ path: 'from', message: 'must be a non-negative integer' }],
      });
    }
    explicitFrom = fromValue;
  }

  let explicitTo: number | undefined;
  if (query.to !== undefined) {
    const toValue = typeof query.to === 'string' ? Number(query.to) : query.to;
    if (typeof toValue !== 'number' || !Number.isFinite(toValue)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'to must be a finite number',
        details: [{ path: 'to', message: 'must be a finite number' }],
      });
    }
    if (!Number.isInteger(toValue)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'to must be an integer',
        details: [{ path: 'to', message: 'must be an integer' }],
      });
    }
    if (toValue < 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'to must be non-negative',
        details: [{ path: 'to', message: 'must be a non-negative integer' }],
      });
    }
    explicitTo = toValue;
  }

  // Explicit bounds must not exceed now + 60 seconds.
  const maxAllowedBound = nowMs + MAX_FUTURE_MS;
  if (explicitFrom !== undefined && explicitFrom > maxAllowedBound) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'from is too far in the future',
      details: [{ path: 'from', message: `must be at most 60 seconds in the future (before ${new Date(maxAllowedBound).toISOString()})` }],
    });
  }
  if (explicitTo !== undefined && explicitTo > maxAllowedBound) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'to is too far in the future',
      details: [{ path: 'to', message: `must be at most 60 seconds in the future (before ${new Date(maxAllowedBound).toISOString()})` }],
    });
  }

  // Range consistency: when both bounds are explicit, from must not exceed to.
  if (explicitFrom !== undefined && explicitTo !== undefined && explicitFrom > explicitTo) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'from must not be greater than to',
      details: [{ path: 'from', message: 'must be less than or equal to to' }],
    });
  }

  // Normalize bounds to canonical values used by SQL, cursors, and fingerprints.
  let from: number | null;
  let to: number | null;

  if (explicitFrom !== undefined && explicitTo !== undefined) {
    // Both bounds explicit: validate interval width, then use as-is.
    if (explicitTo - explicitFrom > MAX_INTERVAL_MS) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'time range is too wide',
        details: [{ path: 'to', message: 'must be at most 365 days after from' }],
      });
    }
    from = explicitFrom;
    to = explicitTo;
  } else if (explicitFrom !== undefined) {
    // Only from supplied: derive to = min(from + 365 days, now + 60s).
    const derivedTo = explicitFrom + MAX_INTERVAL_MS;
    // If the addition overflowed (wrapped negative), reject.
    if (derivedTo < explicitFrom) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'from is too close to the maximum safe integer',
        details: [{ path: 'from', message: 'time range arithmetic overflowed' }],
      });
    }
    const cappedTo = derivedTo > maxAllowedBound ? maxAllowedBound : derivedTo;
    from = explicitFrom;
    to = cappedTo;
  } else if (explicitTo !== undefined) {
    // Only to supplied: derive from = max(0, to - 365 days).
    const derivedFrom = explicitTo - MAX_INTERVAL_MS;
    // If the subtraction overflowed (wrapped positive), reject.
    if (derivedFrom > explicitTo) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'to is too close to the maximum safe integer',
        details: [{ path: 'to', message: 'time range arithmetic overflowed' }],
      });
    }
    const flooredFrom = derivedFrom < 0 ? 0 : derivedFrom;
    from = flooredFrom;
    to = explicitTo;
  } else {
    // No bounds supplied: query without a time restriction.
    from = null;
    to = null;
  }

  // Zero-width intervals are valid: from may equal to.

  let limit: number;
  if (query.limit === undefined) {
    limit = 100;
  } else {
    const limitValue = typeof query.limit === 'string' ? Number(query.limit) : query.limit;
    if (typeof limitValue !== 'number' || !Number.isInteger(limitValue)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'limit must be an integer',
        details: [{ path: 'limit', message: 'must be an integer' }],
      });
    }
    if (limitValue < 1) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'limit must be at least 1',
        details: [{ path: 'limit', message: 'must be at least 1' }],
      });
    }
    if (limitValue > MAXIMUM_LIMIT) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'limit exceeds maximum',
        details: [{ path: 'limit', message: `must be at most ${MAXIMUM_LIMIT}` }],
      });
    }
    limit = limitValue;
  }

  let cursor: MeasurementCursor | undefined;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || query.cursor.trim().length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'cursor must be a non-empty string',
        details: [{ path: 'cursor', message: 'must be a non-empty string' }],
      });
    }
    cursor = decodeCursor(query.cursor);

    // The cursor must belong to the same service.
    if (cursor.fingerprint.serviceId !== serviceId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Cursor does not match the current service',
        details: [
          {
            path: 'cursor',
            message: 'fingerprint.serviceId does not match the requested service',
          },
        ],
      });
    }

    // The cursor must be consistent with the current (normalized) query parameters.
    validateCursorFingerprint(cursor, serviceId, metric, from, to, limit);
  }

  return { metric, from, to, limit, cursor };
}

/**
 * Ingests one measurement for a service.
 */
export async function createMeasurement(
  database: Database,
  serviceId: string,
  request: MeasurementCreateRequest,
  nowMs: number,
): Promise<MeasurementResponse> {
  const normalized = validateMeasurementRequest(serviceId, request, nowMs);
  const id = generateMeasurementId();

  await insertMeasurement(
    database,
    id,
    serviceId,
    normalized.metric,
    normalized.value,
    normalized.eventTimestamp,
    normalized.receivedAt,
  );

  return {
    id,
    serviceId,
    metric: normalized.metric,
    value: normalized.value,
    eventTimestamp: normalized.eventTimestamp,
    receivedAt: normalized.receivedAt,
  };
}

/**
 * Lists measurements for a service.
 *
 * The repository fetches `limit + 1` rows to detect whether more records exist
 * beyond the requested page. We preserve that detection logic: if the repository
 * returned more than `limit` rows, there is a next page; otherwise there is not.
 *
 * Time bounds are normalized by `parseListQuery` and applied directly in the SQL
 * query. No separate rolling lookback filter is applied.
 */
export async function listMeasurementsForService(
  database: Database,
  serviceId: string,
  query: MeasurementListQuery,
  nowMs: number,
): Promise<MeasurementListResponse> {
  const parsed = parseListQuery(serviceId, query, nowMs);

  const cursorOptions = parsed.cursor !== undefined
    ? {
        metric: parsed.metric,
        from: parsed.from,
        to: parsed.to,
        limit: parsed.limit,
        cursorId: parsed.cursor.id,
        cursorEventTimestamp: parsed.cursor.eventTimestamp,
        cursorReceivedAt: parsed.cursor.receivedAt,
      }
    : {
        metric: parsed.metric,
        from: parsed.from,
        to: parsed.to,
        limit: parsed.limit,
      };

  const { rows, hasMore, nextBoundary } = await listMeasurements(database, serviceId, cursorOptions);

  const measurements: MeasurementResponse[] = rows.slice(0, parsed.limit).map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    metric: row.metric,
    value: row.value,
    eventTimestamp: toServerTimestamp(row.event_timestamp),
    receivedAt: toServerTimestamp(row.received_at),
  }));

  // Generate nextCursor only when more records actually exist.
  let nextCursor: string | undefined;
  if (hasMore && rows.length > 0 && nextBoundary !== undefined) {
    nextCursor = encodeCursor(nextBoundary, {
      serviceId,
      metric: parsed.metric ?? null,
      from: parsed.from,
      to: parsed.to,
      limit: parsed.limit,
    });
  }

  return {
    measurements,
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  };
}
