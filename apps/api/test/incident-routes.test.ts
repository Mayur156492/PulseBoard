import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadApiConfig, type ApiConfig } from '../src/config.js';
import {
  DEFAULT_MIGRATIONS_DIR,
  loadMigrations,
  runMigrations,
} from '../src/db/migrations.js';
import { createTempDatabase, type TempDatabase } from './helpers/database.js';
import { makeTestServiceId } from './helpers/id-generation.js';
import { createIncident } from '../src/services/incident-service-horizon.js';

const FIXED_INSTANT = '2026-10-04T12:00:00.000Z';
const FIXED_MS = Date.parse(FIXED_INSTANT);

function makeConfig(env: Record<string, string> = {}): ApiConfig {
  return loadApiConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ENABLED: 'false',
    ...env,
  } as NodeJS.ProcessEnv);
}

function incidentId(serviceId: string, suffix: number): string {
  // Deterministic standalone 21-char ids matching the test helpers' generator
  // shape used elsewhere, so they remain valid incident ids for cursor/key usage.
  // Order by suffix first so BINARY DESC pagination assertions are stable.
  const suffixPart = String(suffix).padStart(3, '0');
  const rest = Buffer.from(serviceId, 'utf8')
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 18)
    .padEnd(18, 'a');
  return suffixPart + rest;
}

describe('GET /incidents and GET /incidents/:incidentId', () => {
  let temp: TempDatabase;
  let app: Awaited<ReturnType<typeof buildApp>>;

  const serviceA = makeTestServiceId(1);
  const serviceB = makeTestServiceId(2);
  const epoch = 1_700_000_000_000;

  beforeEach(async () => {
    temp = await createTempDatabase();
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(temp.database, migrations);

    await temp.database.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceA, 'service-a', Date.now()],
    );
    await temp.database.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceB, 'service-b', Date.now()],
    );

    await createIncident(temp.database, {
      id: incidentId(serviceA, 2),
      incidentType: 'SERVICE_STALE',
      serviceId: serviceA,
      status: 'open',
      openedAt: epoch,
    });
    await createIncident(temp.database, {
      id: incidentId(serviceA, 1),
      incidentType: 'SERVICE_STALE',
      serviceId: serviceA,
      status: 'resolved',
      openedAt: epoch - 1,
    });

    app = await buildApp({
      config: makeConfig(),
      database: temp.database,
      readMigrationStatus: async () => ({ applied: ['001', '002', '003', '004'], pending: [], orphaned: [] }),
      clock: { now: () => FIXED_MS },
      startedAt: FIXED_MS - 3_600_000,
    });
  });

  afterEach(async () => {
    await app.close();
    await temp.cleanup();
  });

  it('lists incidents with default pagination', async () => {
    const response = await app.inject({ method: 'GET', url: '/incidents' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.incidents)).toBe(true);
    expect(body.incidents.length).toBeGreaterThanOrEqual(2);
    expect(body).not.toHaveProperty('nextCursor');
  });

  it('returns open-only incidents when filtered by status=open', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents?status=open',
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.incidents.every((incident: { status: string }) => incident.status === 'open')).toBe(true);
  });

  it('returns resolved-only incidents when filtered by status=resolved', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents?status=resolved',
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.incidents.every((incident: { status: string }) => incident.status === 'resolved')).toBe(true);
  });

  it('returns incidents for a single service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/incidents?serviceId=${serviceA}`,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.incidents.every((incident: { serviceId: string }) => incident.serviceId === serviceA)).toBe(true);
  });

  it('returns 404 when a service filter references a nonexistent service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents?serviceId=does-not-exist',
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns a single incident by id', async () => {
    const incident = await app.inject({
      method: 'GET',
      url: `/incidents/${incidentId(serviceA, 2)}`,
    });
    expect(incident.statusCode).toBe(200);

    const body = incident.json();
    expect(body.id).toBe(incidentId(serviceA, 2));
    expect(body.serviceId).toBe(serviceA);
    expect(body.status).toBe('open');
    expect(body).not.toHaveProperty('serviceName');
    expect(body).not.toHaveProperty('reason');
    expect(body).not.toHaveProperty('lastEventAt');
    expect(body).not.toHaveProperty('expectedHeartbeatAfter');
    expect(body.incidentType).toBe('SERVICE_STALE');
    expect(body.openedAt).toBe(epoch);
    expect(body.resolvedAt).toBeNull();
  });

  it('returns 404 for an unknown incident id', async () => {
    const unknownId = incidentId(serviceA, 99);
    const response = await app.inject({
      method: 'GET',
      url: `/incidents/${unknownId}`,
    });
    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain(unknownId);
  });

  it('rejects an invalid incident id path segment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents/not-an-incident',
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns a nextCursor when more rows exist', async () => {
    await createIncident(temp.database, {
      id: incidentId(serviceB, 3),
      incidentType: 'SERVICE_STALE',
      serviceId: serviceB,
      status: 'open',
      openedAt: epoch,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/incidents?limit=1',
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.incidents).toHaveLength(1);
    expect(body.nextCursor).toBeDefined();
    expect(typeof body.nextCursor).toBe('string');
  });

  it('follows a cursor to the next page', async () => {
    await createIncident(temp.database, {
      id: incidentId(serviceB, 3),
      incidentType: 'SERVICE_STALE',
      serviceId: serviceB,
      status: 'open',
      openedAt: epoch,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/incidents?limit=1',
    });
    const firstBody = first.json();
    expect(firstBody.nextCursor).toBeDefined();

    const second = await app.inject({
      method: 'GET',
      url: `/incidents?limit=1&cursor=${firstBody.nextCursor}`,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.incidents).toHaveLength(1);
    expect(secondBody.incidents[0]!.id).not.toBe(firstBody.incidents[0]!.id);

    // Confirm the returned shape is the six-field public response, including
    // `resolvedAt: null` for open incidents and no internal columns.
    expect(secondBody.incidents[0]).toHaveProperty('id');
    expect(secondBody.incidents[0]).toHaveProperty('serviceId');
    expect(secondBody.incidents[0]).toHaveProperty('incidentType');
    expect(secondBody.incidents[0]).toHaveProperty('status');
    expect(secondBody.incidents[0]).toHaveProperty('openedAt');
    expect(secondBody.incidents[0]).toHaveProperty('resolvedAt');
    expect(secondBody.incidents[0]).not.toHaveProperty('serviceName');
    expect(secondBody.incidents[0]).not.toHaveProperty('reason');
    expect(secondBody.incidents[0]).not.toHaveProperty('lastEventAt');
    expect(secondBody.incidents[0]).not.toHaveProperty('expectedHeartbeatAfter');
    expect(secondBody.incidents[0].resolvedAt).toBeNull();
  });

  it('rejects a cursor that does not match the requested limit', async () => {
    await createIncident(temp.database, {
      id: incidentId(serviceB, 3),
      incidentType: 'SERVICE_STALE',
      serviceId: serviceB,
      status: 'open',
      openedAt: epoch,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/incidents?limit=1',
    });
    const firstBody = first.json();

    const response = await app.inject({
      method: 'GET',
      url: `/incidents?limit=2&cursor=${firstBody.nextCursor}`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a cursor that does not match the requested status', async () => {
    await createIncident(temp.database, {
      id: incidentId(serviceB, 3),
      incidentType: 'SERVICE_STALE',
      serviceId: serviceB,
      status: 'open',
      openedAt: epoch,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/incidents?status=resolved&limit=1',
    });
    const firstBody = first.json();

    const response = await app.inject({
      method: 'GET',
      url: `/incidents?status=open&limit=1&cursor=${firstBody.nextCursor ?? ''}`,
    });
    expect(response.statusCode).toBe(400);
  });
});
