import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationError,
  getMigrationStatus,
  loadMigrations,
  runMigrations,
  type Migration,
} from '../src/db/migrations.js';
import { createTempDatabase, type TempDatabase } from './helpers/database.js';

const FIXED_NOW = 1_760_000_000_000;

async function createMigrationsDir(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'pulseboard-migrations-'));
  await Promise.all(
    Object.entries(files).map(async ([name, contents]) => {
      await writeFile(join(directory, name), contents, 'utf8');
    }),
  );
  return directory;
}

describe('migration loading', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it('reads version, name and a checksum from the filename', async () => {
    directory = await createMigrationsDir({ '001_baseline.sql': 'SELECT 1;\n' });

    const migrations = await loadMigrations(directory);

    expect(migrations).toHaveLength(1);
    expect(migrations[0]?.version).toBe('001');
    expect(migrations[0]?.name).toBe('baseline');
    expect(migrations[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns migrations in version order regardless of write order', async () => {
    directory = await createMigrationsDir({
      '010_third.sql': 'SELECT 3;\n',
      '002_second.sql': 'SELECT 2;\n',
      '001_first.sql': 'SELECT 1;\n',
    });

    const versions = (await loadMigrations(directory)).map((m) => m.version);

    expect(versions).toEqual(['001', '002', '010']);
  });

  it('ignores files that are not SQL', async () => {
    directory = await createMigrationsDir({
      '001_baseline.sql': 'SELECT 1;\n',
      'README.md': '# migrations\n',
    });

    const migrations = await loadMigrations(directory);

    expect(migrations).toHaveLength(1);
  });

  it('changes the checksum when the contents change', async () => {
    directory = await createMigrationsDir({ '001_baseline.sql': 'SELECT 1;\n' });
    const [before] = await loadMigrations(directory);

    await writeFile(join(directory, '001_baseline.sql'), 'SELECT 2;\n', 'utf8');
    const [after] = await loadMigrations(directory);

    expect(after?.checksum).not.toBe(before?.checksum);
  });

  it.each([
    ['1_baseline.sql', /<NNN>_/],
    ['001-BASELINE.sql', /<NNN>_/],
    ['001_baseline_extra!.sql', /<NNN>_/],
  ])('rejects the malformed filename %s', async (name, pattern) => {
    directory = await createMigrationsDir({ [name]: 'SELECT 1;\n' });

    await expect(loadMigrations(directory)).rejects.toThrow(pattern);
  });

  it('rejects two files claiming the same version', async () => {
    directory = await createMigrationsDir({
      '001_baseline.sql': 'SELECT 1;\n',
      '001_other.sql': 'SELECT 2;\n',
    });

    await expect(loadMigrations(directory)).rejects.toThrow(/Duplicate migration version "001"/);
  });

  it('throws MigrationError when the directory does not exist', async () => {
    const missing = join(tmpdir(), `pulseboard-missing-${Date.now()}`);

    await expect(loadMigrations(missing)).rejects.toThrow(MigrationError);
    await expect(loadMigrations(missing)).rejects.toThrow(/Cannot read migrations directory/);
  });
});

describe('runMigrations', () => {
  let temp: TempDatabase;
  let directory: string;

  const baseline: Migration = {
    version: '001',
    name: 'baseline',
    sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY);',
    checksum: 'checksum-001',
  };

  beforeEach(async () => {
    temp = await createTempDatabase();
    directory = await createMigrationsDir({});
  });

  afterEach(async () => {
    await temp.cleanup();
    await rm(directory, { recursive: true, force: true });
  });

  it('records each applied migration with a server-normalized timestamp', async () => {
    const result = await runMigrations(temp.database, [baseline], { now: () => FIXED_NOW });

    expect(result).toEqual({ applied: ['001'], alreadyApplied: [] });

    const rows = await temp.database.query<{
      version: string;
      name: string;
      checksum: string;
      applied_at: number;
    }>('SELECT * FROM schema_migrations WHERE version = ?', ['001']);

    expect(rows).toEqual([
      { version: '001', name: 'baseline', checksum: 'checksum-001', applied_at: FIXED_NOW },
    ]);
  });

  it('applies the migration DDL', async () => {
    await runMigrations(temp.database, [baseline]);

    const tables = await temp.database.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ['notes'],
    );

    expect(tables).toHaveLength(1);
  });

  it('is idempotent across repeated runs', async () => {
    await runMigrations(temp.database, [baseline]);
    const second = await runMigrations(temp.database, [baseline]);

    expect(second).toEqual({ applied: [], alreadyApplied: ['001'] });

    const rows = await temp.database.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM schema_migrations',
    );
    expect(rows[0]?.total).toBe(1);
  });

  it('applies only the migrations that are new', async () => {
    const second: Migration = {
      version: '002',
      name: 'add_label',
      sql: 'ALTER TABLE notes ADD COLUMN label TEXT;',
      checksum: 'checksum-002',
    };

    await runMigrations(temp.database, [baseline]);
    const result = await runMigrations(temp.database, [baseline, second]);

    expect(result).toEqual({ applied: ['002'], alreadyApplied: ['001'] });
  });

  it('refuses to run when an applied migration was edited on disk', async () => {
    await runMigrations(temp.database, [baseline]);

    const edited: Migration = { ...baseline, checksum: 'checksum-edited' };

    await expect(runMigrations(temp.database, [edited])).rejects.toThrow(MigrationError);
    await expect(runMigrations(temp.database, [edited])).rejects.toThrow(
      /changed after it was applied/,
    );
  });

  it('rolls back a failing migration and records nothing', async () => {
    const broken: Migration = {
      version: '002',
      name: 'broken',
      sql: 'CREATE TABLE half_created (id INTEGER); SELECT this_function_does_not_exist();',
      checksum: 'checksum-002',
    };

    await runMigrations(temp.database, [baseline]);

    await expect(runMigrations(temp.database, [baseline, broken])).rejects.toThrow();

    const recorded = await temp.database.query('SELECT * FROM schema_migrations WHERE version = ?', [
      '002',
    ]);
    expect(recorded).toHaveLength(0);

    // The first statement of the failing script must have been rolled back too.
    const tables = await temp.database.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ['half_created'],
    );
    expect(tables).toHaveLength(0);

    // And the baseline must still be recorded exactly once.
    const remaining = await temp.database.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM schema_migrations',
    );
    expect(remaining[0]?.total).toBe(1);
  });

  it('succeeds with no migrations at all', async () => {
    const result = await runMigrations(temp.database, []);

    expect(result).toEqual({ applied: [], alreadyApplied: [] });
  });
});

describe('getMigrationStatus', () => {
  let temp: TempDatabase;

  beforeEach(async () => {
    temp = await createTempDatabase();
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  const first: Migration = {
    version: '001',
    name: 'first',
    sql: 'SELECT 1;',
    checksum: 'c1',
  };
  const second: Migration = {
    version: '002',
    name: 'second',
    sql: 'SELECT 2;',
    checksum: 'c2',
  };

  it('reports applied and pending versions', async () => {
    await runMigrations(temp.database, [first]);

    const status = await getMigrationStatus(temp.database, [first, second]);

    expect(status).toEqual({ applied: ['001'], pending: ['002'], orphaned: [] });
  });

  it('reports a fully migrated database as settled', async () => {
    await runMigrations(temp.database, [first, second]);

    const status = await getMigrationStatus(temp.database, [first, second]);

    expect(status.pending).toEqual([]);
    expect(status.orphaned).toEqual([]);
  });

  it('reports recorded versions whose SQL file is gone', async () => {
    await runMigrations(temp.database, [first, second]);

    const status = await getMigrationStatus(temp.database, [first]);

    expect(status.orphaned).toEqual(['002']);
  });

  it('fails when the schema has never been initialized', async () => {
    await expect(getMigrationStatus(temp.database, [first])).rejects.toThrow();
  });
});

describe('shipped migrations', () => {
  let temp: TempDatabase;

  beforeEach(async () => {
    temp = await createTempDatabase();
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it('ships at least the baseline migration', async () => {
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);

    expect(migrations.length).toBeGreaterThanOrEqual(1);
    expect(migrations.map((migration) => migration.version)).toContain('001');
  });

  it('applies cleanly to an empty database', async () => {
    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);

    const result = await runMigrations(temp.database, migrations, { now: () => FIXED_NOW });

    expect(result.applied).toEqual(migrations.map((migration) => migration.version));
  });
});