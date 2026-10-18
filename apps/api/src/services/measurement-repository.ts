import type { Database } from '../ports.js';

export interface MeasurementRow {
  readonly id: string;
  readonly service_id: string;
  readonly metric: string;
  readonly value: number;
  readonly event_timestamp: number;
  readonly received_at: number;
}

/**
 * Inserts one measurement.
 *
 * The caller is responsible for validating inputs and normalizing timestamps.
 */
export async function insertMeasurement(
  database: Database,
  id: string,
  serviceId: string,
  metric: string,
  value: number,
  eventTimestamp: number,
  receivedAt: number,
): Promise<void> {
  await database.execute(
    `INSERT INTO measurements (id, service_id, metric, value, event_timestamp, received_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, serviceId, metric, value, eventTimestamp, receivedAt],
  );
}

/** Base ORDER BY used by every measurements listing query. */
const ORDER_BY = `
  ORDER BY
    event_timestamp DESC,
    received_at DESC,
    id COLLATE BINARY DESC`;

/**
 * Returns the first page of measurements for a service.
 *
 * This query has no cursor predicate so it returns the most recent rows.
 * Returns the rows, a boolean indicating whether more rows exist, and the
 * boundary row for the next page (if hasMore is true).
 */
async function listFirstPage(
  database: Database,
  serviceId: string,
  options: {
    readonly metric?: string;
    readonly from?: number | null;
    readonly to?: number | null;
    readonly limit: number;
  },
): Promise<{ rows: MeasurementRow[]; hasMore: boolean; nextBoundary?: MeasurementRow }> {
  let sql =
    `SELECT id, service_id, metric, value, event_timestamp, received_at
     FROM measurements
     WHERE service_id = ?`;

  const params: unknown[] = [serviceId];

  if (options.metric !== undefined) {
    sql += ` AND metric = ?`;
    params.push(options.metric);
  }
  if (options.from !== undefined && options.from !== null) {
    sql += ` AND event_timestamp >= ?`;
    params.push(options.from);
  }
  if (options.to !== undefined && options.to !== null) {
    sql += ` AND event_timestamp <= ?`;
    params.push(options.to);
  }

  sql += ORDER_BY;
  sql += ` LIMIT ?`;
  params.push(options.limit + 1);

  const rows = await database.query<MeasurementRow>(sql, params);  const hasMore = rows.length > options.limit;
  // The cursor for the next page is the last row in the current page,
  // i.e. rows[options.limit - 1]. That row is the boundary: the next page
  // must return rows that sort strictly after it.
  const nextBoundary = hasMore ? rows[options.limit - 1] : undefined;

  if (hasMore) {
    rows.pop();
  }

  return { rows, hasMore, nextBoundary };
}

/**
 * Returns the next page of measurements for a service, after the given cursor.
 *
 * The keyset predicate is strict, so a page never includes its own boundary
 * cursor row.
 *
 * Ordering is deterministic:
 *   1. event_timestamp DESC
 *   2. received_at DESC
 *   3. id COLLATE BINARY DESC
 *
 * Returns the rows, a boolean indicating whether more rows exist, and the
 * boundary row for the next page (if hasMore is true).
 */
async function listSubsequentPage(
  database: Database,
  serviceId: string,
  options: {
    readonly metric?: string;
    readonly from?: number | null;
    readonly to?: number | null;
    readonly limit: number;
    readonly cursorId: string;
    readonly cursorEventTimestamp: number;
    readonly cursorReceivedAt: number;
  },
): Promise<{ rows: MeasurementRow[]; hasMore: boolean; nextBoundary?: MeasurementRow }> {
  let sql =
    `SELECT id, service_id, metric, value, event_timestamp, received_at
     FROM measurements
     WHERE service_id = ?`;

  const params: unknown[] = [serviceId];

  if (options.metric !== undefined) {
    sql += ` AND metric = ?`;
    params.push(options.metric);
  }
  if (options.from !== undefined && options.from !== null) {
    sql += ` AND event_timestamp >= ?`;
    params.push(options.from);
  }
  if (options.to !== undefined && options.to !== null) {
    sql += ` AND event_timestamp <= ?`;
    params.push(options.to);
  }

  // Strict keyset pagination: exclude rows at or before the cursor position.
  sql += `
     AND (
           event_timestamp < ?
        OR (event_timestamp = ? AND received_at < ?)
        OR (event_timestamp = ? AND received_at = ? AND id < ? COLLATE BINARY)
          )`;

  sql += ORDER_BY;
  sql += ` LIMIT ?`;

  // Cursor values: repeated for each comparison in the predicate.
  params.push(
    options.cursorEventTimestamp,
    options.cursorEventTimestamp,
    options.cursorReceivedAt,
    options.cursorEventTimestamp,
    options.cursorReceivedAt,
    options.cursorId,
    options.limit + 1,
  );

  const rows = await database.query<MeasurementRow>(sql, params);

  const hasMore = rows.length > options.limit;
  const nextBoundary = hasMore ? rows[options.limit - 1] : undefined;

  if (hasMore) {
    rows.length = options.limit;
  }

  return { rows, hasMore, nextBoundary };
}

/**
 * Returns the next page of measurements for a service.
 *
 * Uses a first-page query when no cursor is present, and a subsequent-page
 * query with a strict keyset predicate otherwise.
 * Returns the rows, a boolean indicating whether more rows exist, and the
 * boundary row for the next page (if hasMore is true).
 */
export async function listMeasurements(
  database: Database,
  serviceId: string,
  options: {
    readonly metric?: string;
    readonly from?: number | null;
    readonly to?: number | null;
    readonly limit: number;
    readonly cursorId?: string;
    readonly cursorEventTimestamp?: number;
    readonly cursorReceivedAt?: number;
  },
): Promise<{ rows: MeasurementRow[]; hasMore: boolean; nextBoundary?: MeasurementRow }> {
  if (options.cursorEventTimestamp === undefined) {
    return listFirstPage(database, serviceId, options);
  }

  // When a cursor is present, the fields are guaranteed by the caller to be
  // populated. Narrow the type for the subsequent-page query.
  return listSubsequentPage(database, serviceId, {
    metric: options.metric,
    from: options.from,
    to: options.to,
    limit: options.limit,
    cursorId: options.cursorId as string,
    cursorEventTimestamp: options.cursorEventTimestamp as number,
    cursorReceivedAt: options.cursorReceivedAt as number,
  });
}
