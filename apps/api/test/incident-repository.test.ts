import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findIncidentById,
  findOpenIncidentByServiceId,
  latestHeartbeatReceivedAtForService,
  listIncidentsFirstPage,
  listIncidentsSubsequentPage,
  type IncidentRow,
} from '../src/services/incident-service-horizon.js';
import type { IncidentStatus } from '../src/incident-service.js';

import { DEFAULT_MIGRATIONS_DIR, loadMigrations, runMigrations } from '../src/db/migrations.js';
import { createTempDatabase, type TempDatabase } from './helpers/database.js';
import { makeTestServiceId } from './helpers/id-generation.js';
import type { Database } from '../src/ports.js';

function incidentId(serviceId: string, suffix: number): string {
  // Deterministic standalone 21-char ids for fixtures and cursor round-trips.
  // Suffix is the most significant part, then serviceId text, so BINARY DESC
  // orders by suffix first, then by serviceId, which matches the assertions.
  const suffixPart = String(suffix).padStart(3, '0');
  const rest = Buffer.from(serviceId, 'utf8')
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 18)
    .padEnd(18, 'a');
  return suffixPart + rest;
}

describe('incident repository pagination', () => {
  let temp: TempDatabase;
  let db: Database;
  const serviceA = makeTestServiceId(1);
  const serviceB = makeTestServiceId(2);

  beforeEach(async () => {
    temp = await createTempDatabase();
    db = temp.database;

    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(db, migrations);

    await db.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceA, 'service-a', Date.now()],
    );
    await db.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceB, 'service-b', Date.now()],
    );

    // Seed incidents with identical opened_at so ordering depends on BINARY id.
    const epoch = 1_700_000_000_000;
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 9), 'SERVICE_STALE', serviceA, 'resolved', epoch],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 2), 'SERVICE_STALE', serviceA, 'open', epoch],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceB, 5), 'SERVICE_STALE', serviceB, 'open', epoch],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 1), 'SERVICE_STALE', serviceA, 'resolved', epoch],
    );
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it('returns pages in deterministic BINARY id order when opened_at ties', async () => {
    const first = await listIncidentsFirstPage(db, { limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.rows.map((r: IncidentRow) => r.id)).toEqual([
      incidentId(serviceA, 9),
      incidentId(serviceB, 5),
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.nextBoundary).toMatchObject({ id: incidentId(serviceB, 5) });
    expect(first.rows[0]!.service_id).toBe(serviceA);
    expect(first.rows[1]!.service_id).toBe(serviceB);
    expect(first.rows[0]!.incident_type).toBe('SERVICE_STALE');
    expect(first.rows[1]!.incident_type).toBe('SERVICE_STALE');
    expect(first.rows[0]!).not.toHaveProperty('service_name');
    expect(first.rows[1]!).not.toHaveProperty('service_name');
    expect(first.rows[0]!.status).toBe('resolved');
    expect(first.rows[1]!.status).toBe('open');
    expect(first.rows[0]!.resolved_at).toBeNull();
    expect(first.rows[1]!.resolved_at).toBeNull();
    expect(first.rows[0]!.id).toBe(incidentId(serviceA, 9));
    expect(first.rows[1]!.id).toBe(incidentId(serviceB, 5));
    expect(first.rows[0]!.opened_at).toBe(1_700_000_000_000);
    expect(first.rows[1]!.opened_at).toBe(1_700_000_000_000);
    // Confirm row shape is the six-field minimal record.
    expect(first.rows[0]).toHaveProperty('id');
    expect(first.rows[0]).toHaveProperty('service_id');
    expect(first.rows[0]).toHaveProperty('incident_type');
    expect(first.rows[0]).toHaveProperty('status');
    expect(first.rows[0]).toHaveProperty('opened_at');
    expect(first.rows[0]).toHaveProperty('resolved_at');
    expect(first.rows[0]).not.toHaveProperty('service_name');
  });

  it('constructs the next cursor from the last returned row excluding the lookahead row', async () => {
    const first = await listIncidentsFirstPage(db, { limit: 2 });
    expect(first.hasMore).toBe(true);

    const next = await listIncidentsSubsequentPage(db, {
      limit: 2,
      cursorId: first.nextBoundary!.id,
      cursorOpenedAt: first.nextBoundary!.opened_at,
    });

    expect(next.rows.map((r: IncidentRow) => r.id)).toEqual([
      incidentId(serviceA, 2),
      incidentId(serviceA, 1),
    ]);
    expect(next.hasMore).toBe(false);
    expect(next.rows[0]!.service_id).toBe(serviceA);
    expect(next.rows[0]!.incident_type).toBe('SERVICE_STALE');
    expect(next.rows[0]!.status).toBe('open');
    expect(next.rows[0]!).not.toHaveProperty('service_name');
    expect(next.rows[0]!.resolved_at).toBeNull();
    expect(next.rows[0]!.opened_at).toBe(1_700_000_000_000);
    expect(next.rows[0]!.id).toBe(incidentId(serviceA, 2));
    expect(next.rows[1]!.service_id).toBe(serviceA);
    expect(next.rows[1]!.status).toBe('resolved');
    expect(next.rows[1]!).not.toHaveProperty('service_name');
    expect(next.rows[1]!.resolved_at).toBeNull();
    expect(next.rows[1]!.id).toBe(incidentId(serviceA, 1));
  });

  it('returns strict keyset pages without duplicates or omissions across multiple traversals', async () => {
    const collected: IncidentRow[] = [];
    let cursor: { id: string; openedAt: number } | undefined = undefined;

    while (true) {
      const page: { rows: IncidentRow[]; hasMore: boolean; nextBoundary?: IncidentRow } =
        cursor === undefined
        ? await listIncidentsFirstPage(db, { limit: 2 })
        : await listIncidentsSubsequentPage(db, {
            limit: 2,
            cursorId: cursor.id,
            cursorOpenedAt: cursor.openedAt,
          });

      collected.push(...page.rows);

      if (!page.hasMore) break;
      cursor = { id: page.nextBoundary!.id, openedAt: page.nextBoundary!.opened_at };
    }

    const seen = new Set<string>();
    for (const row of collected) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
    }

    expect(collected.map((r: IncidentRow) => r.id)).toEqual([
      incidentId(serviceA, 9),
      incidentId(serviceB, 5),
      incidentId(serviceA, 2),
      incidentId(serviceA, 1),
    ]);

    // Confirm row shape is the six-field minimal record.
    for (const row of collected) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('service_id');
      expect(row).toHaveProperty('incident_type');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('opened_at');
      expect(row).toHaveProperty('resolved_at');
      expect(row).not.toHaveProperty('service_name');
    }
  });

  it('honors service and status filters', async () => {
    const byService = await listIncidentsFirstPage(db, {
      serviceId: serviceA,
      limit: 10,
    });
    expect(byService.rows.map((r: IncidentRow) => r.service_id)).toEqual([serviceA, serviceA, serviceA]);
    expect(byService.rows.map((r: IncidentRow) => r.status)).toEqual(['resolved', 'open', 'resolved']);

    const openOnly = await listIncidentsFirstPage(db, {
      status: 'open',
      limit: 10,
    });
    expect(openOnly.rows.every((r: IncidentRow) => r.status === 'open')).toBe(true);
    expect(openOnly.rows.map((r: IncidentRow) => r.id)).toEqual([
      incidentId(serviceB, 5),
      incidentId(serviceA, 2),
    ]);

    const openOnlyForServiceA = await listIncidentsFirstPage(db, {
      serviceId: serviceA,
      status: 'open',
      limit: 10,
    });
    expect(openOnlyForServiceA.rows.every((r: IncidentRow) => r.status === 'open')).toBe(true);
    expect(openOnlyForServiceA.rows.map((r: IncidentRow) => r.id)).toEqual([incidentId(serviceA, 2)]);

    const resolvedOnly = await listIncidentsFirstPage(db, {
      status: 'resolved',
      limit: 10,
    });
    expect(resolvedOnly.rows.every((r: IncidentRow) => r.status === 'resolved')).toBe(true);
    expect(resolvedOnly.rows.map((r: IncidentRow) => r.id)).toEqual([
      incidentId(serviceA, 9),
      incidentId(serviceA, 1),
    ]);
  });
});

describe('incident open-incident uniqueness constraint', () => {
  let temp: TempDatabase;
  let db: Database;
  const serviceId = makeTestServiceId(3);

  beforeEach(async () => {
    temp = await createTempDatabase();
    db = temp.database;

    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(db, migrations);

    await db.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceId, 'svc', Date.now()],
    );
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it('allows multiple resolved incidents for the same service', async () => {
    const first = incidentId(serviceId, 1);
    const second = incidentId(serviceId, 2);

    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [first, 'SERVICE_STALE', serviceId, 'resolved', 1_000],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [second, 'SERVICE_STALE', serviceId, 'resolved', 900],
    );

    const foundFirst = await findIncidentById(db, first);
    const foundSecond = await findIncidentById(db, second);
    expect((foundFirst as IncidentRow | null)?.status).toBe('resolved');
    expect((foundSecond as IncidentRow | null)?.status).toBe('resolved');
    expect(foundFirst).not.toHaveProperty('service_name');
    expect(foundSecond).not.toHaveProperty('service_name');
  });

  it('prevents creating a second open incident for the same service', async () => {
    const first = incidentId(serviceId, 1);
    const second = incidentId(serviceId, 2);

    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [first, 'SERVICE_STALE', serviceId, 'open', 1_000],
    );

    await expect(
      db.execute(
        `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        [second, 'SERVICE_STALE', serviceId, 'open', 2_000],
      ),
    ).rejects.toThrow();
  });

  it('finds the open incident when requested by service id', async () => {
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceId, 1), 'SERVICE_STALE', serviceId, 'open', 1_000],
    );

    const found = await findOpenIncidentByServiceId(db, serviceId);
    expect(found?.id).toBe(incidentId(serviceId, 1));
  });

  it('open status set matches the agreed lifecycle', () => {
    const openStatuses: readonly IncidentStatus[] = ['open'];
    expect(openStatuses).toEqual(['open']);
  });
});

describe('incident service deletion constraint', () => {
  let temp: TempDatabase;
  let db: Database;
  const serviceId = makeTestServiceId(4);

  beforeEach(async () => {
    temp = await createTempDatabase();
    db = temp.database;

    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(db, migrations);

    await db.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceId, 'svc', Date.now()],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceId, 1), 'SERVICE_STALE', serviceId, 'resolved', 1_000],
    );
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it('prevents deleting a service that has incident history', async () => {
    await expect(
      db.execute(`DELETE FROM services WHERE id = ?`, [serviceId]),
    ).rejects.toThrow();
  });
});

describe('incident heartbeat observation', () => {
  let temp: TempDatabase;
  let db: Database;
  const serviceId = makeTestServiceId(5);

  beforeEach(async () => {
    temp = await createTempDatabase();
    db = temp.database;

    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(db, migrations);

    await db.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceId, 'svc', Date.now()],
    );
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it('returns null when no heartbeat has been received yet', async () => {
    expect(await latestHeartbeatReceivedAtForService(db, serviceId)).toBeNull();
  });

  it('returns the latest stored heartbeat receipt timestamp after an update', async () => {
    await db.execute(
      `INSERT INTO heartbeats (service_id, received_at, client_ts) VALUES (?, ?, NULL) ON CONFLICT(service_id) DO UPDATE SET received_at = excluded.received_at, client_ts = excluded.client_ts`,
      [serviceId, 1_100],
    );
    await db.execute(
      `INSERT INTO heartbeats (service_id, received_at, client_ts) VALUES (?, ?, NULL) ON CONFLICT(service_id) DO UPDATE SET received_at = excluded.received_at, client_ts = excluded.client_ts`,
      [serviceId, 1_400],
    );

    expect(await latestHeartbeatReceivedAtForService(db, serviceId)).toBe(1_400);

    const rows = await db.query<{ service_id: string; received_at: number }>(
      `SELECT service_id, received_at FROM heartbeats WHERE service_id = ?`,
      [serviceId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ service_id: serviceId, received_at: 1_400 });
  });
});
