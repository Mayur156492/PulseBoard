import {
  isApiErrorResponse,
  type ApiErrorResponse,
  type HealthReport,
} from '@pulseboard/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadApiConfig, type ApiConfig } from '../src/config.js';
import {
  DEFAULT_MIGRATIONS_DIR,
  getMigrationStatus,
  loadMigrations,
  runMigrations,
  type MigrationStatus,
} from '../src/db/migrations.js';
import type { Clock, Database } from '../src/ports.js';
import {
  createFailingDatabase,
  createFixedClock,
  createTempDatabase,
  type TempDatabase,
} from './helpers/database.js';

const FIXED_INSTANT = '2026-10-04T12:00:00.000Z';
const FIXED_MS = Date.parse(FIXED_INSTANT);
const FIXED_START = '2026-10-04T11:00:00.000Z';

function makeConfig(env: Record<string, string> = {}): ApiConfig {
  return loadApiConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ENABLED: 'false',
    ...env,
  } as NodeJS.ProcessEnv);
}

function settledMigrations(): MigrationStatus {
  return { applied: ['001'], pending: [], orphaned: [] };
}

/** Routes that exist only to prove the shared error handling behaves. */
function registerProbeRoutes(app: FastifyInstance): void {
  app.post(
    '/__probe/service',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            replicas: { type: 'integer', minimum: 1 },
          },
          required: ['name'],
        },
      },
    },
    async (request) => ({ received: request.body }),
  );

  app.get('/__probe/boom', async () => {
    throw new Error('internal detail: postgres://pulse:hunter2@db.internal:5432/prod');
  });
}

async function createApp(
  options: {
    readonly config?: ApiConfig;
    readonly database?: Database;
    readonly readMigrationStatus?: () => Promise<MigrationStatus>;
    readonly clock?: Clock;
    readonly startedAt?: number;
  } = {},
): Promise<FastifyInstance> {
  const app = buildApp({
    config: options.config ?? makeConfig(),
    database:
      options.database ??
      createFailingDatabase(new Error('no database configured for this test')),
    readMigrationStatus: options.readMigrationStatus ?? (async () => settledMigrations()),
    clock: options.clock ?? createFixedClock(FIXED_INSTANT),
    startedAt: options.startedAt ?? Date.parse(FIXED_START),
  });

  registerProbeRoutes(app);
  return app;
}

describe('GET /health (liveness)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports the process as healthy', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);

    const report = response.json<HealthReport>();
    expect(report.status).toBe('ok');
    expect(report.version).toBe(makeConfig().version);
    expect(report.checks).toEqual([{ name: 'process', status: 'ok' }]);
  });

  it('sends server-normalized integer timestamps', async () => {
    const report = (await app.inject({ method: 'GET', url: '/health' })).json<HealthReport>();

    expect(report.startedAt).toBe(Date.parse(FIXED_START));
    expect(report.checkedAt).toBe(FIXED_MS);
    expect(Number.isInteger(report.startedAt)).toBe(true);
    expect(Number.isInteger(report.checkedAt)).toBe(true);
  });

  it('stays healthy when the database is unreachable, so an outage cannot cause a restart loop', async () => {
    const failingApp = await createApp({
      database: createFailingDatabase(new Error('database is down')),
    });

    try {
      const response = await failingApp.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json<HealthReport>().status).toBe('ok');
    } finally {
      await failingApp.close();
    }
  });
});

describe('GET /ready (readiness)', () => {
  it('is unavailable when the database cannot be reached', async () => {
    const app = await createApp({
      database: createFailingDatabase(new Error('disk I/O error')),
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });

      expect(response.statusCode).toBe(503);

      const report = response.json<HealthReport>();
      expect(report.status).toBe('unavailable');
      expect(report.checks).toEqual([
        { name: 'database', status: 'unavailable', message: 'Database is unreachable' },
      ]);
      expect(JSON.stringify(report)).not.toContain('disk I/O error');
    } finally {
      await app.close();
    }
  });

  it('is ready when the database answers and migrations are settled', async () => {
    const temp: TempDatabase = await createTempDatabase();
    const app = await createApp({ database: temp.database });

    try {
      const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
      await runMigrations(temp.database, migrations);

      const response = await app.inject({ method: 'GET', url: '/ready' });

      expect(response.statusCode).toBe(200);

      const report = response.json<HealthReport>();
      expect(report.status).toBe('ok');
      expect(report.checks).toEqual([
        { name: 'database', status: 'ok' },
        { name: 'migrations', status: 'ok' },
      ]);
    } finally {
      await app.close();
      await temp.cleanup();
    }
  });

  it('is not ready while migrations are outstanding', async () => {
    const temp: TempDatabase = await createTempDatabase();

    const app = await createApp({
      database: temp.database,
      readMigrationStatus: async () => ({
        applied: [],
        pending: ['001', '002'],
        orphaned: [],
      }),
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });

      expect(response.statusCode).toBe(503);

      const report = response.json<HealthReport>();
      expect(report.status).toBe('degraded');

      const migrationsCheck = report.checks.find((check) => check.name === 'migrations');
      expect(migrationsCheck?.status).toBe('degraded');
      expect(migrationsCheck?.message).toContain('001');
      expect(migrationsCheck?.message).toContain('002');
    } finally {
      await app.close();
      await temp.cleanup();
    }
  });

  it('is not ready when a recorded migration is missing from disk', async () => {
    const temp: TempDatabase = await createTempDatabase();

    const app = await createApp({
      database: temp.database,
      readMigrationStatus: async () => ({ applied: ['001'], pending: [], orphaned: ['007'] }),
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });

      expect(response.statusCode).toBe(503);
      expect(response.json<HealthReport>().status).toBe('degraded');
      expect(JSON.stringify(response.json<HealthReport>())).toContain('007');
    } finally {
      await app.close();
      await temp.cleanup();
    }
  });

  it('still verifies migrations against the real schema rather than a stub', async () => {
    const temp: TempDatabase = await createTempDatabase();
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);

    // Report a settled status while the database has never been migrated: the
    // route must trust the schema, so this must fail.
    const app = await createApp({
      database: temp.database,
      readMigrationStatus: () => getMigrationStatus(temp.database, migrations),
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });

      expect(response.statusCode).toBe(503);
      expect(response.json<HealthReport>().status).toBe('degraded');
    } finally {
      await app.close();
      await temp.cleanup();
    }
  });

  it('reports a schema that was never initialized without leaking the cause', async () => {
    const temp: TempDatabase = await createTempDatabase();

    const app = await createApp({
      database: temp.database,
      readMigrationStatus: () => getMigrationStatus(temp.database, []),
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });

      expect(response.statusCode).toBe(503);

      const report = response.json<HealthReport>();
      expect(report.status).toBe('degraded');

      const migrationsCheck = report.checks.find((check) => check.name === 'migrations');
      expect(migrationsCheck?.message).toBe('Database schema is not initialized');
      expect(JSON.stringify(report)).not.toContain('no such table');
    } finally {
      await app.close();
      await temp.cleanup();
    }
  });
});

describe('error contract', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers an unknown route with the shared error shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);

    const body = response.json<ApiErrorResponse>();
    expect(isApiErrorResponse(body)).toBe(true);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeTruthy();
  });

  it('rejects an invalid body with field details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__probe/service',
      payload: { name: 123 },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.path)).toContain('name');
  });

  it('reports every invalid field, not only the first', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__probe/service',
      payload: { name: 123, replicas: 0 },
    });

    const body = response.json<ApiErrorResponse>();
    const paths = body.error.details?.map((detail) => detail.path) ?? [];

    expect(paths).toContain('name');
    expect(paths).toContain('replicas');
  });

  it('accepts a valid body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__probe/service',
      payload: { name: 'payment-api', replicas: 3 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ received: unknown }>().received).toEqual({
      name: 'payment-api',
      replicas: 3,
    });
  });

  it('rejects a body with unexpected properties', async () => {
    const temp: TempDatabase = await createTempDatabase();
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(temp.database, migrations);

    const serviceApp = await createApp({
      database: temp.database,
      readMigrationStatus: () => getMigrationStatus(temp.database, migrations),
    });

    try {
      // Register a real service using the existing service route.
      const registerResponse = await serviceApp.inject({
        method: 'POST',
        url: '/services',
        payload: { name: 'test-service' },
      });

      expect(registerResponse.statusCode).toBe(201);
      const { id: serviceId } = registerResponse.json() as { id: string };

      const response = await serviceApp.inject({
        method: 'POST',
        url: `/services/${serviceId}/measurements`,
        payload: {
          metric: 'CPU_Usage',
          value: 42,
          unexpectedField: 'should be rejected',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.map((detail) => detail.path)).toContain('unexpectedField');

      // Verify the rejected measurement was not persisted.
      const listResponse = await serviceApp.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements`,
      });
      expect(listResponse.statusCode).toBe(200);
      const listBody = listResponse.json() as { measurements: unknown[] };
      expect(listBody.measurements).toEqual([]);
    } finally {
      await serviceApp.close();
      await temp.cleanup();
    }
  });

  it('reports malformed JSON as a client error, not a server error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__probe/service',
      headers: { 'content-type': 'application/json' },
      payload: '{ "name": ',
    });

    expect(response.statusCode).toBe(400);

    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Malformed request');
  });

  it('reports an oversized body as 413 rather than 500', async () => {
    const largeApp = await createApp({ config: makeConfig({ BODY_LIMIT_BYTES: '1024' }) });

    try {
      const response = await largeApp.inject({
        method: 'POST',
        url: '/__probe/service',
        payload: { name: 'x'.repeat(4096) },
      });

      expect(response.statusCode).toBe(413);

      const body = response.json<ApiErrorResponse>();
      expect(body.error.message).toBe('Request body is too large');
    } finally {
      await largeApp.close();
    }
  });

  it('never leaks an internal error message or stack to the client', async () => {
    const response = await app.inject({ method: 'GET', url: '/__probe/boom' });

    expect(response.statusCode).toBe(500);

    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('postgres://');
    expect(serialized).not.toContain('at ');
  });
});

describe('service registration: strict body validation', () => {
  let temp: TempDatabase;
  let app: FastifyInstance;

  beforeEach(async () => {
    temp = await createTempDatabase();
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(temp.database, migrations);
    app = await createApp({
      database: temp.database,
      readMigrationStatus: () => getMigrationStatus(temp.database, migrations),
    });
  });

  afterEach(async () => {
    await app.close();
    await temp.cleanup();
  });

  it('rejects a service registration body with unexpected properties', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/services',
      payload: {
        name: 'test-service',
        unexpectedField: 'should be rejected',
      },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.path)).toContain('unexpectedField');
  });

  it('rejects a heartbeat body with unexpected properties', async () => {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/services',
      payload: { name: 'heartbeat-test' },
    });
    const { id: serviceId } = registerResponse.json() as { id: string };

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/heartbeats`,
      payload: {
        timestamp: 1760000000000,
        unexpectedField: 'should be rejected',
      },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.path)).toContain('unexpectedField');
  });
});

describe('measurement ingestion (POST)', () => {
  let temp: TempDatabase;
  let app: FastifyInstance;

  beforeEach(async () => {
    temp = await createTempDatabase();
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(temp.database, migrations);
    app = await createApp({
      database: temp.database,
      readMigrationStatus: () => getMigrationStatus(temp.database, migrations),
    });
  });

  afterEach(async () => {
    await app.close();
    await temp.cleanup();
  });

  async function registerService(name: string = 'test-service'): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/services',
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  }

  it('returns 404 for an unregistered service', async () => {
    // Use a well-formed but non-existent service id so route validation passes.
    const response = await app.inject({
      method: 'POST',
      url: '/services/ScPa_S2lbtqzuy50Na7Kb/measurements',
      payload: { metric: 'cpu', value: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
  });

  it('returns 201 for a valid measurement', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'cpu.usage', value: 0.5 },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json() as {
      id: string;
      serviceId: string;
      metric: string;
      value: number;
      eventTimestamp: number;
      receivedAt: number;
    };
    expect(body.serviceId).toBe(serviceId);
    expect(body.metric).toBe('cpu.usage');
    expect(body.value).toBe(0.5);
    expect(Number.isInteger(body.eventTimestamp)).toBe(true);
    expect(Number.isInteger(body.receivedAt)).toBe(true);
  });

  it('persists the measurement so a subsequent GET returns it', async () => {
    const serviceId = await registerService();

    const postResponse = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'latency', value: 120 },
    });
    const posted = postResponse.json() as { id: string; eventTimestamp: number; receivedAt: number };

    const listResponse = await app.inject({
      method: 'GET',
      url: `/services/${serviceId}/measurements`,
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json() as { measurements: { id: string; value: number }[] };
    expect(listBody.measurements).toHaveLength(1);
    const first = listBody.measurements[0]!;
    expect(first.id).toBe(posted.id);
    expect(first.value).toBe(120);
  });

  it('preserves metric case', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'CPU_Usage', value: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { metric: string }).metric).toBe('CPU_Usage');
  });

  it('accepts a metric with permitted punctuation', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'cpu.usage', value: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { metric: string }).metric).toBe('cpu.usage');
  });

  it('trims leading and trailing whitespace from the metric', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: '  cpu.usage  ', value: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { metric: string }).metric).toBe('cpu.usage');
  });

  it('rejects a metric that is empty after trimming', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: '   ', value: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('metric');
  });

  it('rejects a metric longer than 128 characters', async () => {
    const serviceId = await registerService();
    const longMetric = 'a'.repeat(128) + 'x';

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: longMetric, value: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('metric');
  });

  it('accepts a metric of exactly 128 characters', async () => {
    const serviceId = await registerService();
    const exactMetric = 'a'.repeat(127) + 'B';

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: exactMetric, value: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { metric: string }).metric).toBe(exactMetric);
  });

  it('rejects a metric containing an invalid character', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'cpu space', value: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a metric starting with a dot', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: '.hidden_metric', value: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a metric starting with a hyphen', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: '-hidden_metric', value: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a metric not present in the previous hard-coded enum', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'new.custom.metric_v2', value: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { metric: string }).metric).toBe('new.custom.metric_v2');
  });

  it('accepts a finite negative value', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'offset', value: -3.5 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { value: number }).value).toBe(-3.5);
  });

  it('rejects a non-finite value', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'cpu', value: NaN },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('value');
  });

  it('rejects a measurement with no value', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'cpu' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('uses the server receipt time when the timestamp is omitted', async () => {
    const serviceId = await registerService();
    const clockApp = await createApp({
      database: temp.database,
      readMigrationStatus: async () => getMigrationStatus(temp.database, await loadMigrations(DEFAULT_MIGRATIONS_DIR)),
      clock: createFixedClock(FIXED_INSTANT),
    });

    try {
      const response = await clockApp.inject({
        method: 'POST',
        url: `/services/${serviceId}/measurements`,
        payload: { metric: 'cpu', value: 1 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { eventTimestamp: number; receivedAt: number };
      expect(body.eventTimestamp).toBe(FIXED_MS);
      expect(body.receivedAt).toBe(FIXED_MS);
    } finally {
      await clockApp.close();
    }
  });

  it('accepts a timestamp exactly at now + 60 seconds', async () => {
    const serviceId = await registerService();
    const FIXED_NOW = 1_700_000_000_000;
    const clockApp = await createApp({
      database: temp.database,
      readMigrationStatus: async () => getMigrationStatus(temp.database, await loadMigrations(DEFAULT_MIGRATIONS_DIR)),
      clock: createFixedClock(new Date(FIXED_NOW).toISOString()),
    });

    try {
      const response = await clockApp.inject({
        method: 'POST',
        url: `/services/${serviceId}/measurements`,
        payload: { metric: 'cpu', value: 1, timestamp: FIXED_NOW + 60_000 },
      });

      expect(response.statusCode).toBe(201);
    } finally {
      await clockApp.close();
    }
  });

  it('rejects a timestamp more than 60 seconds in the future', async () => {
    const serviceId = await registerService();
    const FIXED_NOW = 1_700_000_000_000;
    const clockApp = await createApp({
      database: temp.database,
      readMigrationStatus: async () => getMigrationStatus(temp.database, await loadMigrations(DEFAULT_MIGRATIONS_DIR)),
      clock: createFixedClock(new Date(FIXED_NOW).toISOString()),
    });

    try {
      const response = await clockApp.inject({
        method: 'POST',
        url: `/services/${serviceId}/measurements`,
        payload: { metric: 'cpu', value: 1, timestamp: FIXED_NOW + 60_001 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('timestamp');
    } finally {
      await clockApp.close();
    }
  });

  it('rejects a negative timestamp', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'cpu', value: 1, timestamp: -1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('timestamp');
  });

  it('rejects a fractional timestamp', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric: 'cpu', value: 1, timestamp: 1000.5 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('timestamp');
  });

  it('does not reject an old timestamp merely because it is more than 365 days old', async () => {
    const serviceId = await registerService();
    const OLD_TIMESTAMP = 0;
    const clockApp = await createApp({
      database: temp.database,
      readMigrationStatus: async () => getMigrationStatus(temp.database, await loadMigrations(DEFAULT_MIGRATIONS_DIR)),
      clock: createFixedClock('2026-10-04T12:00:00.000Z'),
    });

    try {
      const response = await clockApp.inject({
        method: 'POST',
        url: `/services/${serviceId}/measurements`,
        payload: { metric: 'cpu', value: 1, timestamp: OLD_TIMESTAMP },
      });

      expect(response.statusCode).toBe(201);
      expect((response.json() as { eventTimestamp: number }).eventTimestamp).toBe(OLD_TIMESTAMP);
    } finally {
      await clockApp.close();
    }
  });

  it('rejects an unexpected property and does not persist the measurement', async () => {
    const serviceId = await registerService();

    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: {
        metric: 'cpu.usage',
        value: 0.5,
        extra: 'rejected',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('extra');

    const listResponse = await app.inject({
      method: 'GET',
      url: `/services/${serviceId}/measurements`,
    });
    expect(listResponse.json() as { measurements: unknown[] }).toEqual({ measurements: [] });
  });
});

describe('measurement listing (GET) and pagination', () => {
  let temp: TempDatabase;
  let app: FastifyInstance;
  let serviceId: string;

  const NOW = 1_700_000_000_000;

  beforeEach(async () => {
    temp = await createTempDatabase();
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(temp.database, migrations);
    app = await createApp({
      database: temp.database,
      readMigrationStatus: () => getMigrationStatus(temp.database, migrations),
      clock: createFixedClock(new Date(NOW).toISOString()),
    });

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/services',
      payload: { name: 'pagination-test' },
    });
    serviceId = (registerResponse.json() as { id: string }).id;
  });

  afterEach(async () => {
    await app.close();
    await temp.cleanup();
  });

  async function ingest(metric: string, value: number, eventTimestamp: number): Promise<void> {
    await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric, value, timestamp: eventTimestamp },
    });
  }

  describe('query validation', () => {
    it('returns an empty list when no measurements exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements`,
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { measurements: unknown[] }).measurements).toEqual([]);
    });

    it('defaults to limit 100 when no limit is supplied', async () => {
      for (let i = 0; i < 100; i++) {
        await ingest('cpu', i, NOW - i * 1000);
      }

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { measurements: unknown[]; nextCursor?: string };
      expect(body.measurements).toHaveLength(100);
      expect(body.nextCursor).toBeUndefined();
    });

    it('accepts an explicit limit of 1000', async () => {
      for (let i = 0; i < 5; i++) {
        await ingest('cpu', i, NOW - i * 1000);
      }

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=1000`,
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { measurements: unknown[] }).measurements).toHaveLength(5);
    });

    it('rejects a limit greater than 1000', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=1001`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('limit');
    });

    it('rejects a non-integer limit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=1.5`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('limit');
    });

    it('rejects a limit of 0', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=0`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('limit');
    });

    it('rejects from greater than to', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=1000&to=500`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a future from beyond now + 60 seconds', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${NOW + 60_001}`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('from');
    });

    it('accepts from exactly at now + 60 seconds', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${NOW + 60_000}`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('rejects a future to beyond now + 60 seconds', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?to=${NOW + 60_001}`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(response.json<ApiErrorResponse>().error.details?.map((d) => d.path)).toContain('to');
    });

    it('rejects an interval wider than 365 days when both bounds are explicit', async () => {
      const from = NOW - 365 * 24 * 60 * 60 * 1000 - 1;
      const to = NOW;
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${from}&to=${to}`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('derives to = min(from + 365 days, now + 60s) when only from is supplied', async () => {
      await ingest('cpu', 1, NOW - 365 * 24 * 60 * 60 * 1000 + 1000);
      await ingest('cpu', 2, NOW - 365 * 24 * 60 * 60 * 1000 - 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${NOW - 365 * 24 * 60 * 60 * 1000 + 1000}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { measurements: { value: number }[] };
      expect(body.measurements.map((m) => m.value).sort()).toEqual([1]);
    });

    it('derives from = max(0, to - 365 days) when only to is supplied', async () => {
      await ingest('cpu', 1, NOW - 365 * 24 * 60 * 60 * 1000 + 1000);
      await ingest('cpu', 2, NOW - 365 * 24 * 60 * 60 * 1000 - 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?to=${NOW}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { measurements: { value: number }[] };
      expect(body.measurements.map((m) => m.value).sort()).toEqual([1]);
    });

    it('queries without a time restriction when both bounds are absent', async () => {
      await ingest('cpu', 1, NOW);
      await ingest('cpu', 2, NOW - 500 * 24 * 60 * 60 * 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { measurements: { value: number }[] };
      expect(body.measurements.map((m) => m.value).sort()).toEqual([1, 2]);
    });

    it('supports a zero-width interval', async () => {
      await ingest('cpu', 1, NOW);
      await ingest('cpu', 2, NOW);

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${NOW}&to=${NOW}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { measurements: unknown[] };
      expect(body.measurements).toHaveLength(2);
    });

    it('enforces inclusive lower and upper bounds', async () => {
      await ingest('cpu', 1, NOW - 1000);
      await ingest('cpu', 2, NOW);
      await ingest('cpu', 3, NOW + 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${NOW - 1000}&to=${NOW}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { measurements: { value: number }[] };
      expect(body.measurements.map((m) => m.value).sort()).toEqual([1, 2]);
    });

    it('rejects an invalid metric value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?metric=`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('cursor validation', () => {
    it('round-trips a cursor through encode/decode', async () => {
      await ingest('cpu', 1, NOW);
      await ingest('cpu', 2, NOW - 1000);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=1`,
      });
      const body = listResponse.json() as { measurements: { id: string }[]; nextCursor?: string };
      expect(body.nextCursor).toBeDefined();
      expect(body.measurements).toHaveLength(1);

      const cursorResponse = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=1&cursor=${body.nextCursor}`,
      });

      expect(cursorResponse.statusCode).toBe(200);
      const cursorBody = cursorResponse.json() as { measurements: { id: string }[] };
      expect(cursorBody.measurements).toHaveLength(1);
    });

    it('rejects a malformed cursor encoding', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=not-valid-base64`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a cursor that decodes to a non-object', async () => {
      const encoded = Buffer.from('hello', 'utf8').toString('base64url');
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=${encoded}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor that decodes to an array', async () => {
      const encoded = Buffer.from('[1,2,3]', 'utf8').toString('base64url');
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=${encoded}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor with an unexpected outer key', async () => {
      const payload = {
        eventTimestamp: NOW,
        receivedAt: NOW,
        id: 'ScPa_S2lbtqzuy50Na7Ka',
        fingerprint: {
          serviceId,
          metric: null,
          from: null,
          to: null,
          limit: 100,
        },
        extra: 'rejected',
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=${encoded}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor with an unexpected fingerprint key', async () => {
      const payload = {
        eventTimestamp: NOW,
        receivedAt: NOW,
        id: 'ScPa_S2lbtqzuy50Na7Ka',
        fingerprint: {
          serviceId,
          metric: null,
          from: null,
          to: null,
          limit: 100,
          extra: 'rejected',
        },
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=${encoded}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor with an invalid id', async () => {
      const payload = {
        eventTimestamp: NOW,
        receivedAt: NOW,
        id: 'not-a-valid-id',
        fingerprint: {
          serviceId,
          metric: null,
          from: null,
          to: null,
          limit: 100,
        },
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=${encoded}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor with a non-integer timestamp', async () => {
      const payload = {
        eventTimestamp: 1.5,
        receivedAt: NOW,
        id: 'ScPa_S2lbtqzuy50Na7Ka',
        fingerprint: {
          serviceId,
          metric: null,
          from: null,
          to: null,
          limit: 100,
        },
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=${encoded}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor whose fingerprint serviceId does not match', async () => {
      const otherReg = await app.inject({
        method: 'POST',
        url: '/services',
        payload: { name: 'other-service' },
      });
      const otherService = (otherReg.json() as { id: string }).id;
      const payload = {
        eventTimestamp: NOW,
        receivedAt: NOW,
        id: 'ScPa_S2lbtqzuy50Na7Ka',
        fingerprint: {
          serviceId: otherService,
          metric: null,
          from: null,
          to: null,
          limit: 100,
        },
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?cursor=${encoded}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor whose fingerprint metric does not match', async () => {
      await ingest('cpu', 1, NOW);
      await ingest('cpu', 2, NOW - 1000);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?metric=cpu&limit=1`,
      });
      const cursor = (listResponse.json() as { nextCursor?: string }).nextCursor;
      if (!cursor) throw new Error('expected a cursor');

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?metric=latency&cursor=${cursor}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor whose fingerprint limit does not match', async () => {
      await ingest('cpu', 1, NOW);
      await ingest('cpu', 2, NOW - 1000);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=1`,
      });
      const cursor = (listResponse.json() as { nextCursor?: string }).nextCursor;
      if (!cursor) throw new Error('expected a cursor');

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?limit=50&cursor=${cursor}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor whose fingerprint from does not match', async () => {
      const from = NOW - 3600 * 1000;
      const to = NOW;
      await ingest('cpu', 1, from);
      await ingest('cpu', 2, to);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${from}&to=${to}&limit=1`,
      });
      const cursor = (listResponse.json() as { nextCursor?: string }).nextCursor;
      if (!cursor) throw new Error('expected a cursor');

      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        eventTimestamp: number;
        receivedAt: number;
        id: string;
        fingerprint: {
          serviceId: string;
          metric: string | null;
          from: number | null;
          to: number | null;
          limit: number;
        };
      };

      const modifiedCursor = Buffer.from(
        JSON.stringify({
          ...decoded,
          fingerprint: { ...decoded.fingerprint, from: from - 60_000 },
        }),
        'utf8',
      ).toString('base64url');

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${from}&to=${to}&limit=1&cursor=${modifiedCursor}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a cursor whose fingerprint to does not match', async () => {
      const from = NOW - 3600 * 1000;
      const to = NOW;
      await ingest('cpu', 1, from);
      await ingest('cpu', 2, to);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${from}&to=${to}&limit=1`,
      });
      const cursor = (listResponse.json() as { nextCursor?: string }).nextCursor;
      if (!cursor) throw new Error('expected a cursor');

      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        eventTimestamp: number;
        receivedAt: number;
        id: string;
        fingerprint: {
          serviceId: string;
          metric: string | null;
          from: number | null;
          to: number | null;
          limit: number;
        };
      };

      const modifiedCursor = Buffer.from(
        JSON.stringify({
          ...decoded,
          fingerprint: { ...decoded.fingerprint, to: to + 60_000 },
        }),
        'utf8',
      ).toString('base64url');

      const response = await app.inject({
        method: 'GET',
        url: `/services/${serviceId}/measurements?from=${from}&to=${to}&limit=1&cursor=${modifiedCursor}`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('pagination integrity across pages', () => {
    it('traverses all pages with no duplicates and no omissions, including tied timestamps', async () => {
      // Insert rows so pagination will require multiple small pages and will exercise
      // exact ties on event_timestamp and received_at, leaving only id to break ties.
      const insertedPosts = [
        await injectAndCapture('cpu', 1, NOW),
        await injectAndCapture('cpu', 2, NOW),
        await injectAndCapture('cpu', 3, NOW),
        await injectAndCapture('cpu', 4, NOW - 1000),
        await injectAndCapture('cpu', 5, NOW - 1000),
        await injectAndCapture('cpu', 6, NOW - 2000),
      ];

      const expectedIds = insertedPosts.map((p) => p.id);

      let cursor: string | undefined;
      const limit = 2;
      const collectedByPage: { id: string; eventTimestamp: number; receivedAt: number }[][] = [];

      do {
        const url = cursor
          ? `/services/${serviceId}/measurements?limit=${limit}&cursor=${cursor}`
          : `/services/${serviceId}/measurements?limit=${limit}`;

        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode).toBe(200);

        const body = response.json() as {
          measurements: { id: string; eventTimestamp: number; receivedAt: number }[];
          nextCursor?: string;
        };

        collectedByPage.push(body.measurements);

        cursor = body.nextCursor ?? undefined;
      } while (cursor !== undefined);

      // Flatten traversal order.
      const traversalOrder = collectedByPage.flatMap((page) => page);

      // Every inserted row should have been returned exactly once.
      const returnedIds = traversalOrder.map((m) => m.id);
      const returnedIdSet = new Set(returnedIds);

      // Identical multisets: same length, no duplicate ids, and no missing inserted ids.
      expect(returnedIds).toHaveLength(expectedIds.length);
      expect(returnedIdSet).toEqual(new Set(expectedIds));

      // The final page in the real traversal must not have carried a nextCursor.
      const lastPage = collectedByPage[collectedByPage.length - 1]!;
      expect(lastPage.length).toBeLessThanOrEqual(limit);

      // Confirm deterministic order: (eventTimestamp DESC, receivedAt DESC, id COLLATE BINARY DESC).
      // SQLite binary collation compares the raw byte values of the text; for base64url text made of
      // [A-Za-z0-9_-] that is equivalent to unsigned bytewise comparison of the UTF-8 encoding,
      // which JavaScript's default sequential comparison does NOT guarantee for every possible octet
      // sequence once codepoints exceed 127. Our IDs stay ASCII, so we model BINARY ordering directly
      // as signed comparisons of the raw byte values rather than as string locale ordering.
      for (let i = 1; i < traversalOrder.length; i++) {
        const prev = traversalOrder[i - 1]!;
        const current = traversalOrder[i]!;

        if (prev.eventTimestamp !== current.eventTimestamp) {
          expect(prev.eventTimestamp).toBeGreaterThan(current.eventTimestamp);
          continue;
        }

        if (prev.receivedAt !== current.receivedAt) {
          expect(prev.receivedAt).toBeGreaterThan(current.receivedAt);
          continue;
        }

        // Tie-breaker: id must be strictly greater in SQLite binary order.
        expect(compareBinaryId(prev.id, current.id)).toBeGreaterThan(0);
      }
    });
  });

  async function injectAndCapture(
    metric: string,
    value: number,
    eventTimestamp: number,
  ): Promise<{ id: string; eventTimestamp: number; receivedAt: number }> {
    const response = await app.inject({
      method: 'POST',
      url: `/services/${serviceId}/measurements`,
      payload: { metric, value, timestamp: eventTimestamp },
    });

    if (response.statusCode !== 201) {
      throw new Error(
        `expected POST /services/${serviceId}/measurements to return 201, got ${response.statusCode}`,
      );
    }

    const body = response.json() as {
      id: string;
      eventTimestamp: number;
      receivedAt: number;
    };

    return { id: body.id, eventTimestamp: body.eventTimestamp, receivedAt: body.receivedAt };
  }

  function compareBinaryId(left: string, right: string): number {
    // Model SQLite COLLATE BINARY as unsigned bytewise comparison of the UTF-8
    // encoding. For the IDs used by this app (ASCII base64url) UTF-8 is a
    // byte-for-byte identity encoding, so this is equivalent to comparing the
    // raw ID bytes.
    const leftBytes = Buffer.from(left, 'utf8');
    const rightBytes = Buffer.from(right, 'utf8');

    const sharedLength = Math.min(leftBytes.length, rightBytes.length);

    for (let i = 0; i < sharedLength; i++) {
      // Unsigned comparison: a byte value of 0x41 ('A') sorts before 0x61 ('a').
      const leftByte = leftBytes[i]!;
      const rightByte = rightBytes[i]!;
      if (leftByte < rightByte) {
        return -1;
      }
      if (leftByte > rightByte) {
        return 1;
      }
    }

    if (leftBytes.length < rightBytes.length) {
      return -1;
    }
    if (leftBytes.length > rightBytes.length) {
      return 1;
    }
    return 0;
  }
});

describe('CORS', () => {
  it('echoes only allowlisted origins', async () => {
    const app = await createApp({
      config: makeConfig({ CORS_ENABLED: 'true', CORS_ORIGINS: 'http://localhost:5173' }),
    });

    try {
      const allowed = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:5173' },
      });
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

      const blocked = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://evil.example' },
      });
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('adds no CORS headers when disabled', async () => {
    const app = await createApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:5173' },
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

describe('application lifecycle', () => {
  it('does not close the database it borrows, leaving ownership with the caller', async () => {
    const temp: TempDatabase = await createTempDatabase();
    const app = await createApp({ database: temp.database });

    await app.close();

    // Still usable: the process that opened the connection still owns it.
    await expect(temp.database.query('SELECT 1')).resolves.toEqual([{ '1': 1 }]);

    await temp.cleanup();
  });

  it('stops serving after close', async () => {
    const temp: TempDatabase = await createTempDatabase();
    const app = await createApp({ database: temp.database });

    await app.close();

    await expect(app.inject({ method: 'GET', url: '/health' })).rejects.toThrow();

    await temp.cleanup();
  });
});