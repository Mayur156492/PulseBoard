import cors from '@fastify/cors';
import {
  toServerTimestamp,
  type ServerTimestamp,
} from '@pulseboard/shared';
import Fastify, { type FastifyInstance } from 'fastify';

import { systemClock } from './clock.js';
import type { ApiConfig } from './config.js';
import type { MigrationStatus } from './db/migrations.js';
import { registerErrorHandling } from './http/error-handler.js';
import { registerHealthRoutes } from './http/health.js';
import type { Clock, Database } from './ports.js';
import { buildServerOptions } from './server-options.js';

export interface BuildAppDependencies {
  readonly config: ApiConfig;
  /**
   * Borrowed, not owned. `buildApp` never closes it: the process that opened
   * the database closes it, so ownership stays with a single explicit owner
   * (pulseboard-architecture rule 7).
   */
  readonly database: Database;
  readonly readMigrationStatus: () => Promise<MigrationStatus>;
  readonly clock?: Clock;
  /** Overridable so tests can assert exact timestamps. */
  readonly startedAt?: number;
}

/**
 * Builds the Fastify application without binding a port.
 *
 * Separating construction from `listen` is what makes the HTTP surface
 * testable through `app.inject()` with no socket, no port allocation and no
 * shutdown race.
 */
export function buildApp(dependencies: BuildAppDependencies): FastifyInstance {
  const { config, database, readMigrationStatus } = dependencies;
  const clock = dependencies.clock ?? systemClock;
  const startedAt: ServerTimestamp = toServerTimestamp(dependencies.startedAt ?? clock.now());

  const app = Fastify(buildServerOptions(config));

  registerErrorHandling(app);

  if (config.cors.enabled) {
    // Explicit allowlist only; the configuration loader refuses a wildcard.
    app.register(cors, { origin: [...config.cors.origins] });
  }

  registerHealthRoutes(app, {
    database,
    clock,
    version: config.version,
    startedAt,
    readMigrationStatus,
  });

  return app;
}