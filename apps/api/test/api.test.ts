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