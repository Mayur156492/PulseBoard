import type { Database } from '../ports.js';
import { toServerTimestamp } from '@pulseboard/shared';
import type {
  IncidentListQuery,
  IncidentListResponse,
  IncidentResponse,
} from '@pulseboard/shared';
import { isValidIncidentId } from '@pulseboard/shared';
import { AppError } from '../errors.js';

const MAX_LIMIT = 100;

export interface IncidentCursor {
  readonly id: string;
  readonly openedAt: number;
  readonly fingerprint: {
    readonly serviceId: string | null;
    readonly status: 'open' | 'resolved' | null;
    readonly limit: number;
  };
}

export function encodeIncidentCursor(
  row: {
    readonly id: string;
    readonly openedAt: number;
  },
  fingerprint: {
    readonly serviceId: string | null;
    readonly status: 'open' | 'resolved' | null;
    readonly limit: number;
  },
): string {
  return JSON.stringify({ id: row.id, openedAt: row.openedAt, fingerprint });
}

export function decodeIncidentCursor(value: string): IncidentCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor is not valid JSON',
      details: [{ path: 'cursor', message: 'not valid JSON' }],
    });
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor must be a JSON object',
      details: [{ path: 'cursor', message: 'cursor must be a JSON object' }],
    });
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.id !== 'string') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor is missing an id',
      details: [{ path: 'cursor', message: 'missing id' }],
    });
  }

  if (!isValidIncidentId(obj.id)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor contains an invalid incident id',
      details: [{ path: 'cursor', message: 'invalid incident id in cursor' }],
    });
  }

  if (typeof obj.openedAt !== 'number' || !Number.isInteger(obj.openedAt)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor has an invalid openedAt',
      details: [{ path: 'cursor', message: 'invalid openedAt' }],
    });
  }

  if (obj.fingerprint === undefined || obj.fingerprint === null) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor is missing an id',
      details: [{ path: 'cursor', message: 'missing id' }],
    });
  }

  const fingerprint = obj.fingerprint as Record<string, unknown>;

  if (typeof fingerprint !== 'object' || fingerprint === null) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor is missing a fingerprint',
      details: [{ path: 'cursor', message: 'cursor is missing a fingerprint' }],
    });
  }

  if (typeof fingerprint.limit !== 'number' || !Number.isInteger(fingerprint.limit) || fingerprint.limit < 1 || fingerprint.limit > MAX_LIMIT) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor has an invalid limit',
      details: [{ path: 'cursor', message: 'invalid limit' }],
    });
  }

  if (fingerprint.serviceId !== undefined && fingerprint.serviceId !== null) {
    if (typeof fingerprint.serviceId !== 'string' || fingerprint.serviceId.trim().length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'cursor has an invalid serviceId',
        details: [{ path: 'cursor', message: 'invalid serviceId' }],
      });
    }
  }

  if (fingerprint.status !== undefined && fingerprint.status !== null) {
    if (fingerprint.status !== 'open' && fingerprint.status !== 'resolved' && fingerprint.status !== 'all') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'cursor has an invalid status',
        details: [{ path: 'cursor', message: 'invalid status' }],
      });
    }
  }

  return {
    id: obj.id as string,
    openedAt: obj.openedAt as number,
    fingerprint: {
      serviceId: fingerprint.serviceId ?? null,
      status: fingerprint.status === 'all' ? null : (fingerprint.status ?? null),
      limit: fingerprint.limit as number,
    },
  };
}

export function validateIncidentCursorFingerprint(
  cursor: IncidentCursor,
  expectedOpenedAt: number,
  expected: {
    readonly serviceId: string | null;
    readonly status: 'open' | 'resolved' | null;
    readonly limit: number;
  },
): void {
  if (cursor.openedAt !== expectedOpenedAt) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor openedAt does not match the request',
      details: [{ path: 'cursor', message: 'cursor openedAt does not match the request' }],
    });
  }

  if (cursor.fingerprint.serviceId !== expected.serviceId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor serviceId does not match the request',
      details: [{ path: 'cursor', message: 'cursor serviceId does not match the request' }],
    });
  }

  if (cursor.fingerprint.status !== expected.status) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor status does not match the request',
      details: [{ path: 'cursor', message: 'cursor status does not match the request' }],
    });
  }

  if (cursor.fingerprint.limit !== expected.limit) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'cursor limit does not match the request',
      details: [{ path: 'cursor', message: 'cursor limit does not match the request' }],
    });
  }
}

function normalizeListQuery(
  query: IncidentListQuery,
): {
  readonly serviceId: string | null;
  readonly status: 'open' | 'resolved' | null;
  readonly limit: number;
  readonly cursorId: string | null;
  readonly cursorOpenedAt: number | null;
} {
  let serviceId: string | null = null;
  if (query.serviceId !== undefined) {
    if (typeof query.serviceId !== 'string' || query.serviceId.trim().length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'serviceId must be a non-empty string',
        details: [{ path: 'serviceId', message: 'must be a non-empty string' }],
      });
    }
    serviceId = query.serviceId;
  }

  let status: 'open' | 'resolved' | null = null;
  if (query.status !== undefined) {
    if (query.status !== 'open' && query.status !== 'resolved') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'status must be open or resolved',
        details: [{ path: 'status', message: 'must be open or resolved' }],
      });
    }
    status = query.status;
  }

  let limit = 20;
  if (query.limit !== undefined) {
    let parsed: number;
    if (typeof query.limit === 'string') {
      parsed = Number(query.limit);
    } else {
      parsed = query.limit;
    }
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'limit must be an integer between 1 and 100',
        details: [{ path: 'limit', message: 'must be an integer between 1 and 100' }],
      });
    }
    limit = parsed;
  }

  let cursorId: string | null = null;
  let cursorOpenedAt: number | null = null;

  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'cursor must be a string',
        details: [{ path: 'cursor', message: 'must be a string' }],
      });
    }

    const cursor = decodeIncidentCursor(query.cursor);

    if (serviceId !== null && cursor.fingerprint.serviceId !== null && cursor.fingerprint.serviceId !== serviceId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'cursor does not match the requested service',
        details: [{ path: 'cursor', message: 'cursor serviceId does not match the request' }],
      });
    }

    if (status !== null && cursor.fingerprint.status !== null && cursor.fingerprint.status !== status) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'cursor does not match the requested status',
        details: [{ path: 'cursor', message: 'cursor status does not match the request' }],
      });
    }

    validateIncidentCursorFingerprint(cursor, cursor.openedAt, {
      serviceId: cursor.fingerprint.serviceId,
      status: cursor.fingerprint.status,
      limit,
    });

    cursorId = cursor.id;
    cursorOpenedAt = cursor.openedAt;
  }

  return { serviceId, status, limit, cursorId, cursorOpenedAt };
}

export async function listIncidentsForService(
  database: Database,
  query: IncidentListQuery,
  _nowMs: number,
): Promise<IncidentListResponse> {
  const { serviceId, status, limit, cursorId, cursorOpenedAt } =
    normalizeListQuery(query);

  const { rows, hasMore, nextBoundary } =
    await listIncidents(database, {
      serviceId,
      status,
      limit,
      cursorId: cursorId ?? undefined,
      cursorOpenedAt: cursorOpenedAt ?? undefined,
    });

  const incidents: IncidentResponse[] = rows.map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    incidentType: row.incident_type as IncidentType,
    status: row.status,
    openedAt: toServerTimestamp(row.opened_at),
    resolvedAt: row.resolved_at == null ? null : toServerTimestamp(row.resolved_at),
  }));

  let nextCursor: string | undefined;
  if (hasMore && nextBoundary !== undefined) {
    nextCursor = encodeIncidentCursor(
      { id: nextBoundary.id, openedAt: nextBoundary.opened_at },
      { serviceId, status, limit },
    );
  }

  return { incidents, ...(nextCursor !== undefined ? { nextCursor } : {}) };
}

export async function findIncidentById(
  database: Database,
  incidentId: string,
): Promise<IncidentResponse | null> {
  if (!isValidIncidentId(incidentId)) {
    return null;
  }

  const row = await findIncidentRowById(database, incidentId);
  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    serviceId: row.service_id,
    incidentType: row.incident_type as IncidentType,
    status: row.status,
    openedAt: toServerTimestamp(row.opened_at),
    resolvedAt: row.resolved_at == null ? null : toServerTimestamp(row.resolved_at),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export type IncidentType = 'SERVICE_STALE';

export interface IncidentRow {
  readonly id: string;
  readonly service_id: string;
  readonly incident_type: string;
  readonly status: 'open' | 'resolved';
  readonly opened_at: number;
  readonly resolved_at: number | null;
}

const INCIDENT_ORDER_BY = `
  ORDER BY
    opened_at DESC,
    id COLLATE BINARY DESC`;

export async function listIncidentsFirstPage(
  database: Database,
  options: {
    readonly serviceId?: string | null;
    readonly status?: 'open' | 'resolved' | null;
    readonly limit: number;
  },
): Promise<{ rows: IncidentRow[]; hasMore: boolean; nextBoundary?: IncidentRow }> {
  let sql = `
    SELECT id, service_id, incident_type, status, opened_at, resolved_at
      FROM incidents
     WHERE 1=1`;
  const params: unknown[] = [];

  if (options.serviceId !== null && options.serviceId !== undefined && options.serviceId !== '') {
    sql += ` AND service_id = ?`;
    params.push(options.serviceId);
  }

  if (options.status !== null && options.status !== undefined) {
    if (options.status === 'open') {
      sql += ` AND status = 'open'`;
    } else {
      sql += ` AND status = 'resolved'`;
    }
  }

  sql += INCIDENT_ORDER_BY;
  sql += ` LIMIT ?`;
  params.push(options.limit + 1);

  const rows = await database.query<IncidentRow>(sql, params);

  const hasMore = rows.length > options.limit;
  const nextBoundary = hasMore ? rows[options.limit - 1] : undefined;

  if (hasMore) {
    rows.pop();
  }

  return { rows, hasMore, nextBoundary };
}

export async function listIncidentsSubsequentPage(
  database: Database,
  options: {
    readonly serviceId?: string | null;
    readonly status?: 'open' | 'resolved' | null;
    readonly limit: number;
    readonly cursorId: string;
    readonly cursorOpenedAt: number;
  },
): Promise<{ rows: IncidentRow[]; hasMore: boolean; nextBoundary?: IncidentRow }> {
  let sql = `
    SELECT id, service_id, incident_type, status, opened_at, resolved_at
      FROM incidents
     WHERE 1=1`;
  const params: unknown[] = [];

  if (options.serviceId !== null && options.serviceId !== undefined && options.serviceId !== '') {
    sql += ` AND service_id = ?`;
    params.push(options.serviceId);
  }

  if (options.status !== null && options.status !== undefined) {
    if (options.status === 'open') {
      sql += ` AND status = 'open'`;
    } else {
      sql += ` AND status = 'resolved'`;
    }
  }

  sql += `
     AND (
           opened_at < ?
        OR (opened_at = ? AND id < ? COLLATE BINARY)
          )`;

  sql += INCIDENT_ORDER_BY;
  sql += ` LIMIT ?`;

  params.push(
    options.cursorOpenedAt,
    options.cursorOpenedAt,
    options.cursorId,
    options.limit + 1,
  );

  const rows = await database.query<IncidentRow>(sql, params);

  const hasMore = rows.length > options.limit;
  const nextBoundary = hasMore ? rows[options.limit - 1] : undefined;

  if (hasMore) {
    rows.length = options.limit;
  }

  return { rows, hasMore, nextBoundary };
}

export async function listIncidents(
  database: Database,
  options: {
    readonly serviceId?: string | null;
    readonly status?: 'open' | 'resolved' | null;
    readonly limit: number;
    readonly cursorId?: string;
    readonly cursorOpenedAt?: number;
  },
): Promise<{ rows: IncidentRow[]; hasMore: boolean; nextBoundary?: IncidentRow }> {
  if (options.cursorOpenedAt === undefined) {
    return listIncidentsFirstPage(database, options);
  }

  return listIncidentsSubsequentPage(database, {
    serviceId: options.serviceId,
    status: options.status,
    limit: options.limit,
    cursorId: options.cursorId as string,
    cursorOpenedAt: options.cursorOpenedAt as number,
  });
}

export async function findIncidentRowById(
  database: Database,
  incidentId: string,
): Promise<IncidentRow | null> {
  const rows = await database.query<IncidentRow>(
    `SELECT id, service_id, incident_type, status, opened_at, resolved_at
       FROM incidents
      WHERE id = ?`,
    [incidentId],
  );

  return rows[0] ?? null;
}

export async function findOpenIncidentByServiceId(
  database: Database,
  serviceId: string,
): Promise<IncidentRow | null> {
  const rows = await database.query<IncidentRow>(
    `SELECT id, service_id, incident_type, status, opened_at, resolved_at
       FROM incidents
      WHERE service_id = ? AND status = 'open'`,
    [serviceId],
  );

  return rows[0] ?? null;
}

export async function createIncident(
  database: Database,
  incident: {
    readonly id: string;
    readonly incidentType: string;
    readonly serviceId: string;
    readonly status: 'open' | 'resolved';
    readonly openedAt: number;
  },
): Promise<void> {
  await database.execute(
    `INSERT INTO incidents (id, incident_type, service_id, status, opened_at)
       VALUES (?, ?, ?, ?, ?)`,
    [
      incident.id,
      incident.incidentType,
      incident.serviceId,
      incident.status,
      incident.openedAt,
    ],
  );
}

export async function updateIncident(
  database: Database,
  incidentId: string,
  changes: {
    readonly status?: 'open' | 'resolved';
    readonly resolvedAt?: number | null;
  },
): Promise<void> {
  let sql = `UPDATE incidents SET `;
  const params: unknown[] = [];

  if (changes.status !== undefined) {
    sql += `status = ?, `;
    params.push(changes.status);
  }
  if (changes.resolvedAt !== undefined) {
    sql += `resolved_at = ?, `;
    params.push(changes.resolvedAt);
  }

  if (params.length === 0) {
    return;
  }

  sql = sql.slice(0, -2);
  sql += ` WHERE id = ?`;
  params.push(incidentId);

  await database.execute(sql, params);
}

export async function createIncidentId(
  database: Database,
  serviceId: string,
): Promise<string> {
  // Standalone 21-character URL-safe incident ids.
  const { createIncidentId: gen } = await import('./incident-id-generator.js');
  return gen(database, serviceId);
}

/**
 * Returns the current incoming heartbeat time for a service from the existing
 * service/heartbeat system.
 *
 * Phase 2 incident persistence no longer stores heartbeat observations.
 * Where lifecycle logic needs the latest received heartbeat time, it uses the
 * established service/heartbeat repository and `heartbeats.received_at`.
 */
export async function latestHeartbeatReceivedAtForService(
  database: Database,
  serviceId: string,
): Promise<number | null> {
  const rows = await database.query<{ received_at: number }>(
    'SELECT received_at FROM heartbeats WHERE service_id = ?',
    [serviceId],
  );

  const first = rows[0];
  if (!first) {
    return null;
  }

  return first.received_at;
}

// ---------------------------------------------------------------------------
// Snapshot / status helper
// ---------------------------------------------------------------------------

export type ServiceOperationalStatus = 'healthy' | 'stale' | 'unknown';

export function classifyServiceStatus(
  latestHeartbeatReceivedAt: number | null,
  nowMs: number,
  staleThresholdMs: number,
): ServiceOperationalStatus {
  if (latestHeartbeatReceivedAt === null) {
    return 'unknown';
  }
  if (nowMs - latestHeartbeatReceivedAt <= staleThresholdMs) {
    return 'healthy';
  }
  return 'stale';
}

export interface ServiceSnapshot {
  readonly status: ServiceOperationalStatus;
  readonly latestHeartbeatReceivedAt: number | null;
  readonly expectedHeartbeatAfter: number;
}

export function snapshotService(
  latestHeartbeatReceivedAt: number | null,
  nowMs: number,
  staleThresholdMs: number,
): ServiceSnapshot {
  const status = classifyServiceStatus(latestHeartbeatReceivedAt, nowMs, staleThresholdMs);
  if (latestHeartbeatReceivedAt === null) {
    return { status, latestHeartbeatReceivedAt: null, expectedHeartbeatAfter: nowMs };
  }
  return {
    status,
    latestHeartbeatReceivedAt,
    expectedHeartbeatAfter: latestHeartbeatReceivedAt + staleThresholdMs,
  };
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export type DetectorDecision =
  | { action: 'create'; reason: string; expectedHeartbeatAfter: number }
  | { action: 'resolve'; resolvedAt: number }
  | { action: 'noop' }
  | { action: 'ignore' };

export function decide(
  currentStatus: ServiceOperationalStatus,
  currentOpenedIncident: IncidentRow | null,
  nowMs: number,
): DetectorDecision {
  if (currentStatus === 'healthy') {
    if (currentOpenedIncident === null) {
      return { action: 'noop' };
    }
    return { action: 'resolve', resolvedAt: nowMs };
  }

  if (currentStatus === 'unknown') {
    return { action: 'ignore' };
  }

  if (currentOpenedIncident === null) {
    return {
      action: 'create',
      reason: 'service heartbeat is stale',
      expectedHeartbeatAfter: nowMs,
    };
  }

  return { action: 'noop' };
}
