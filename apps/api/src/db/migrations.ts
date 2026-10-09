import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Database } from '../ports.js';

/** `001_baseline.sql` -> version `001`, name `baseline`. */
const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

/**
 * Directory holding the SQL migrations shipped with this package.
 *
 * Resolved relative to this module so it points at the same folder whether the
 * code runs from `src/` (tsx, tests) or from `dist/` (production build).
 */
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Bookkeeping table owned by the runner, not by any migration.
 *
 * `applied_at` is epoch milliseconds, written by the server, so recorded times
 * are server-normalized (pulseboard-architecture rule 8).
 */
const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT    NOT NULL PRIMARY KEY,
  name       TEXT    NOT NULL,
  checksum   TEXT    NOT NULL,
  applied_at INTEGER NOT NULL
);
`;

/** Raised when migrations are missing, malformed or inconsistent. */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export interface Migration {
  readonly version: string;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface MigrationStatus {
  readonly applied: readonly string[];
  readonly pending: readonly string[];
  /** Versions recorded in the database whose SQL file no longer exists. */
  readonly orphaned: readonly string[];
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

export interface RunMigrationsOptions {
  /** Injectable clock so tests do not depend on wall-clock time. */
  readonly now?: () => number;
}

/** Reads and validates every migration file in `directory`. */
export async function loadMigrations(directory: string): Promise<readonly Migration[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    // Surface filesystem failures through the same error type as malformed
    // migrations, so callers that catch MigrationError see a consistent shape.
    // We do replay the underlying code so diagnostics are still actionable.
    throw new MigrationError(
      `Cannot read migrations directory "${directory}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const migrations: Migration[] = [];
  const seenVersions = new Set<string>();

  // Sort by filename so the migration order is stable across filesystems.
  for (const entry of [...entries].sort()) {
    if (!entry.endsWith('.sql')) continue;

    const match = MIGRATION_FILE_PATTERN.exec(entry);
    const version = match?.[1];
    const name = match?.[2];

    if (version === undefined || name === undefined) {
      throw new MigrationError(
        `Migration file "${entry}" must be named <NNN>_<snake_case_name>.sql`,
      );
    }

    if (seenVersions.has(version)) {
      throw new MigrationError(`Duplicate migration version "${version}" (file "${entry}")`);
    }
    seenVersions.add(version);

    const sql = await readFile(join(directory, entry), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    migrations.push({ version, name, sql, checksum });
  }

  return migrations;
}

async function readAppliedChecksums(database: Database): Promise<Map<string, string>> {
  const rows = await database.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );

  return new Map(rows.map((row) => [row.version, row.checksum]));
}

/**
 * Applies every migration that has not run yet.
 *
 * Each migration runs in its own transaction together with its bookkeeping
 * insert, so a failed migration leaves neither partial DDL nor a false record
 * of having been applied. An already-applied migration whose contents changed
 * is refused rather than silently ignored, because re-running edited DDL is
 * undefined.
 */
export async function runMigrations(
  database: Database,
  migrations: readonly Migration[],
  options: RunMigrationsOptions = {},
): Promise<MigrationResult> {
  const now = options.now ?? Date.now;

  await database.executeScript(SCHEMA_MIGRATIONS_DDL);

  const appliedChecksums = await readAppliedChecksums(database);

  for (const migration of migrations) {
    const recordedChecksum = appliedChecksums.get(migration.version);
    if (recordedChecksum !== undefined && recordedChecksum !== migration.checksum) {
      throw new MigrationError(
        `Migration "${migration.version}" changed after it was applied ` +
          `(recorded ${recordedChecksum}, found ${migration.checksum}). ` +
          'Add a new migration instead of editing an applied one.',
      );
    }
  }

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const migration of migrations) {
    if (appliedChecksums.has(migration.version)) {
      alreadyApplied.push(migration.version);
      continue;
    }

    await database.transaction(async (tx) => {
      await tx.executeScript(migration.sql);
      await tx.execute(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        [migration.version, migration.name, migration.checksum, now()],
      );
    });

    applied.push(migration.version);
  }

  return { applied, alreadyApplied };
}

/** Compares recorded migrations against the migrations on disk. */
export async function getMigrationStatus(
  database: Database,
  migrations: readonly Migration[],
): Promise<MigrationStatus> {
  const rows = await database.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );

  const appliedVersions = new Set(rows.map((row) => row.version));
  const knownVersions = new Set(migrations.map((migration) => migration.version));

  return {
    applied: [...appliedVersions],
    pending: migrations
      .filter((migration) => !appliedVersions.has(migration.version))
      .map((migration) => migration.version),
    orphaned: [...appliedVersions]
      .filter((version) => !knownVersions.has(version))
      .sort(),
  };
}