import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SqliteDatabase } from '../../src/db/sqlite-database.js';
import type { Clock, Database } from '../../src/ports.js';

export interface TempDatabase {
  readonly database: SqliteDatabase;
  readonly directory: string;
  readonly cleanup: () => Promise<void>;
}

/**
 * Creates a real SQLite database in a throwaway directory.
 *
 * The file lives in a directory that does not exist yet, which also proves the
 * adapter creates its parent directory.
 */
export async function createTempDatabase(): Promise<TempDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'pulseboard-test-'));
  const database = SqliteDatabase.open({
    filePath: join(directory, 'nested', 'test.sqlite'),
    busyTimeoutMs: 1_000,
  });

  return {
    database,
    directory,
    cleanup: async () => {
      await database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

/** A clock frozen at a fixed instant so assertions never depend on wall time. */
export function createFixedClock(iso: string): Clock {
  const fixed = new Date(iso).getTime();
  return { now: () => fixed };
}

/** A {@link Database} whose every operation rejects, to exercise failure paths. */
export function createFailingDatabase(error: Error): Database {
  return {
    query: async () => {
      throw error;
    },
    execute: async () => {
      throw error;
    },
    executeScript: async () => {
      throw error;
    },
    transaction: async () => {
      throw error;
    },
    close: async () => {},
  };
}