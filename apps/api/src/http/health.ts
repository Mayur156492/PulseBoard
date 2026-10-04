import type { FastifyInstance } from 'fastify';
import {
  toServerTimestamp,
  type HealthCheckReport,
  type HealthReport,
  type HealthStatus,
  type ServerTimestamp,
} from '@pulseboard/shared';

import type { MigrationStatus } from '../db/migrations.js';
import type { Clock, Database } from '../ports.js';

export interface HealthRouteDependencies {
  readonly database: Database;
  readonly clock: Clock;
  readonly version: string;
  readonly startedAt: ServerTimestamp;
  readonly readMigrationStatus: () => Promise<MigrationStatus>;
}

function buildReport(
  status: HealthStatus,
  dependencies: HealthRouteDependencies,
  checks: readonly HealthCheckReport[],
): HealthReport {
  return {
    status,
    version: dependencies.version,
    startedAt: dependencies.startedAt,
    checkedAt: toServerTimestamp(dependencies.clock.now()),
    checks,
  };
}

/**
 * Registers the two operational endpoints.
 *
 * `/health` is liveness: it answers "is this process running?" and must not
 * depend on any downstream system, so a database outage cannot cause a restart
 * loop. `/ready` is readiness: it answers "can this instance serve traffic?"
 * and does depend on the database and the migration state.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: HealthRouteDependencies,
): void {
  app.get('/health', async (request, reply) => {
    request.log.debug('Liveness check requested');

    return reply.code(200).send(
      buildReport('ok', dependencies, [{ name: 'process', status: 'ok' }]),
    );
  });

  app.get('/ready', async (request, reply) => {
    const databaseCheck: HealthCheckReport = { name: 'database', status: 'ok' };

    try {
      await dependencies.database.query('SELECT 1');
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed: database is unreachable');

      return reply.code(503).send(
        buildReport('unavailable', dependencies, [
          { name: 'database', status: 'unavailable', message: 'Database is unreachable' },
        ]),
      );
    }

    let migrations: MigrationStatus;
    try {
      migrations = await dependencies.readMigrationStatus();
    } catch (error) {
      // A missing bookkeeping table means migrations have never run here.
      request.log.error({ err: error }, 'Readiness check failed: schema is not initialized');

      return reply.code(503).send(
        buildReport('degraded', dependencies, [
          databaseCheck,
          {
            name: 'migrations',
            status: 'unavailable',
            message: 'Database schema is not initialized',
          },
        ]),
      );
    }

    const migrationIssues: string[] = [];
    if (migrations.pending.length > 0) {
      migrationIssues.push(
        `${migrations.pending.length} pending migration(s): ${migrations.pending.join(', ')}`,
      );
    }
    if (migrations.orphaned.length > 0) {
      migrationIssues.push(
        `${migrations.orphaned.length} recorded migration(s) missing from disk: ${migrations.orphaned.join(', ')}`,
      );
    }

    if (migrationIssues.length > 0) {
      request.log.warn({ migrationIssues }, 'Readiness check failed: migrations are not settled');

      return reply.code(503).send(
        buildReport('degraded', dependencies, [
          databaseCheck,
          { name: 'migrations', status: 'degraded', message: migrationIssues.join('; ') },
        ]),
      );
    }

    return reply.code(200).send(
      buildReport('ok', dependencies, [
        databaseCheck,
        { name: 'migrations', status: 'ok' },
      ]),
    );
  });
}