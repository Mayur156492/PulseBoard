import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { loadApiConfig } from './config.js';
import {
  DEFAULT_MIGRATIONS_DIR,
  getMigrationStatus,
  loadMigrations,
  runMigrations,
} from './db/migrations.js';
import { SqliteDatabase } from './db/sqlite-database.js';

export interface ShutdownController {
  /** Resolves once a termination signal has been received. */
  readonly signalsReceived: Promise<void>;
  /** Clears the force-exit guard and detaches signal listeners. */
  dispose(): void;
}

/**
 * The subset of `process` the shutdown logic needs.
 *
 * Injecting it keeps the signal path testable without emitting real process
 * signals, which is fragile on Windows and in worker threads.
 */
export interface SignalSource {
  once(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
  off(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
}

/**
 * Registers SIGINT/SIGTERM handling.
 *
 * Both signals share one guarded handler, and `once` plus the explicit flag mean
 * a repeated signal cannot start a second shutdown sequence. The force-exit
 * timer is unref'd so it never keeps the process alive, and `dispose` always
 * clears it so a clean shutdown cannot be followed by a spurious forced exit.
 */
export function registerShutdownHandlers(
  app: FastifyInstance,
  shutdownTimeoutMs: number,
  signals: SignalSource = process,
): ShutdownController {
  let forceExitTimer: NodeJS.Timeout | undefined;
  let shuttingDown = false;
  let resolveSignals: (() => void) | undefined;

  // The executor runs synchronously, so `resolveSignals` is assigned before any
  // signal can be delivered.
  const signalsReceived = new Promise<void>((resolve) => {
    resolveSignals = resolve;
  });

  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      app.log.warn({ signal }, 'Shutdown already in progress; ignoring repeat signal');
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, 'Shutdown requested');

    forceExitTimer = setTimeout(() => {
      app.log.error({ shutdownTimeoutMs }, 'Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, shutdownTimeoutMs);
    forceExitTimer.unref();

    // `main` performs the actual close, so there is exactly one shutdown path.
    resolveSignals?.();
  };

  signals.once('SIGINT', onSignal);
  signals.once('SIGTERM', onSignal);

  return {
    signalsReceived,
    dispose: () => {
      if (forceExitTimer !== undefined) {
        clearTimeout(forceExitTimer);
        forceExitTimer = undefined;
      }
      signals.off('SIGINT', onSignal);
      signals.off('SIGTERM', onSignal);
    },
  };
}

/**
 * Composition root. Resolves once the server has shut down cleanly.
 *
 * This module has no side effects on import; `main.ts` is the process
 * entrypoint that calls it, so importing these functions from a test cannot
 * start a server.
 *
 * @throws ConfigError when the environment is invalid.
 */
export async function main(): Promise<void> {
  const config = loadApiConfig();

  const database = SqliteDatabase.open({
    filePath: config.database.filePath,
    busyTimeoutMs: config.database.busyTimeoutMs,
  });

  let app: FastifyInstance | undefined;
  let shutdown: ShutdownController | undefined;

  try {
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);

    app = buildApp({
      config,
      database,
      readMigrationStatus: () => getMigrationStatus(database, migrations),
    });

    if (config.database.autoMigrate) {
      const result = await runMigrations(database, migrations);
      app.log.info(
        { applied: result.applied, alreadyApplied: result.alreadyApplied },
        'Database migrations settled',
      );
    } else {
      app.log.warn('Automatic migrations are disabled; verify the schema before serving traffic');
    }

    shutdown = registerShutdownHandlers(app, config.shutdownTimeoutMs);

    await app.listen({ host: config.host, port: config.port });
    app.log.info(
      { host: config.host, port: config.port, version: config.version },
      'PulseBoard API listening',
    );

    await shutdown.signalsReceived;
  } finally {
    // Single, unconditional cleanup path: whichever step failed, the listener
    // and the database handle are released exactly once.
    shutdown?.dispose();

    if (app !== undefined) {
      await app.close();
    }

    await database.close();
  }
}