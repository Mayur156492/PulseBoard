import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteDatabase } from '../src/db/sqlite-database.js';
import { createTempDatabase, type TempDatabase } from './helpers/database.js';

describe('SqliteDatabase', () => {
  let temp: TempDatabase;

  beforeEach(async () => {
    temp = await createTempDatabase();
    await temp.database.executeScript(`
      CREATE TABLE samples (
        id     INTEGER PRIMARY KEY,
        label  TEXT    NOT NULL,
        value  REAL,
        active INTEGER
      );
    `);
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  describe('open', () => {
    it('creates the parent directory of the database file', async () => {
      // `createTempDatabase` targets a path whose parent does not exist yet.
      const nested = await stat(join(temp.directory, 'nested'));

      expect(nested.isDirectory()).toBe(true);
    });

    it('rejects an empty file path', () => {
      expect(() => SqliteDatabase.open({ filePath: '   ', busyTimeoutMs: 10 })).toThrow(
        TypeError,
      );
    });

    it.each([-1, 1.5, Number.NaN])(
      'rejects a non-integer or negative busy timeout (%s)',
      (busyTimeoutMs) => {
        expect(() =>
          SqliteDatabase.open({ filePath: ':memory:', busyTimeoutMs }),
        ).toThrow(TypeError);
      },
    );
  });

  describe('parameters', () => {
    it('binds strings, numbers, nulls and booleans', async () => {
      await temp.database.execute(
        'INSERT INTO samples (id, label, value, active) VALUES (?, ?, ?, ?)',
        [1, 'first', 1.5, true],
      );
      await temp.database.execute(
        'INSERT INTO samples (id, label, value, active) VALUES (?, ?, ?, ?)',
        [2, 'second', null, false],
      );

      const rows = await temp.database.query<{
        id: number;
        label: string;
        value: number | null;
        active: number;
      }>('SELECT * FROM samples WHERE id >= ? ORDER BY id', [1]);

      expect(rows).toEqual([
        { id: 1, label: 'first', value: 1.5, active: 1 },
        { id: 2, label: 'second', value: null, active: 0 },
      ]);
    });

    it('returns an empty array when nothing matches', async () => {
      const rows = await temp.database.query('SELECT * FROM samples WHERE id = ?', [999]);

      expect(rows).toEqual([]);
    });

    it('rejects undefined instead of silently binding NULL', async () => {
      await expect(
        temp.database.execute('INSERT INTO samples (id, label) VALUES (?, ?)', [
          undefined,
          'oops',
        ]),
      ).rejects.toThrow(TypeError);
    });

    it('rejects non-finite numbers rather than storing garbage', async () => {
      await expect(
        temp.database.execute('INSERT INTO samples (id, label) VALUES (?, ?)', [
          1,
          Number.NaN,
        ]),
      ).rejects.toThrow(TypeError);
    });

    it('rejects a value type SQLite cannot represent', async () => {
      await expect(
        temp.database.execute('INSERT INTO samples (id, label) VALUES (?, ?)', [
          1,
          { nested: 'object' },
        ]),
      ).rejects.toThrow(TypeError);
    });
  });

  describe('executeScript', () => {
    it('runs every statement in the script', async () => {
      await temp.database.executeScript(
        'CREATE TABLE a (x INTEGER); CREATE TABLE b (y TEXT);',
      );

      const tables = await temp.database.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('a','b') ORDER BY name",
      );

      expect(tables.map((row) => row.name)).toEqual(['a', 'b']);
    });

    it('accepts a comment-only script', async () => {
      await expect(temp.database.executeScript('-- nothing to do here\n')).resolves.toBeUndefined();
    });
  });

  describe('transaction', () => {
    it('commits when the work succeeds', async () => {
      await temp.database.transaction(async (tx) => {
        await tx.execute('INSERT INTO samples (id, label) VALUES (?, ?)', [10, 'kept']);
      });

      const rows = await temp.database.query('SELECT * FROM samples WHERE id = ?', [10]);
      expect(rows).toHaveLength(1);
    });

    it('returns the value produced by the work', async () => {
      const result = await temp.database.transaction(async (tx) => {
        await tx.execute('INSERT INTO samples (id, label) VALUES (?, ?)', [11, 'counted']);
        return tx.query<{ total: number }>('SELECT COUNT(*) AS total FROM samples');
      });

      expect(result[0]?.total).toBe(1);
    });

    it('rolls back and rethrows the original error', async () => {
      const failure = new Error('work failed');

      await expect(
        temp.database.transaction(async (tx) => {
          await tx.execute('INSERT INTO samples (id, label) VALUES (?, ?)', [20, 'discarded']);
          throw failure;
        }),
      ).rejects.toBe(failure);

      const rows = await temp.database.query('SELECT * FROM samples WHERE id = ?', [20]);
      expect(rows).toHaveLength(0);
    });

    it('refuses to nest, so an inner commit cannot silently commit the outer work', async () => {
      await expect(
        temp.database.transaction(async (tx) => {
          await expect(tx.transaction(async () => 'inner')).rejects.toThrow(
            /Nested transactions/,
          );
        }),
      ).resolves.toBeUndefined();
    });

    it('allows a later transaction after a failed one', async () => {
      await expect(
        temp.database.transaction(async () => {
          throw new Error('first fails');
        }),
      ).rejects.toThrow('first fails');

      await expect(
        temp.database.transaction(async (tx) => {
          await tx.execute('INSERT INTO samples (id, label) VALUES (?, ?)', [30, 'after']);
        }),
      ).resolves.toBeUndefined();

      const rows = await temp.database.query('SELECT * FROM samples WHERE id = ?', [30]);
      expect(rows).toHaveLength(1);
    });
  });

  describe('lifecycle', () => {
    it('is safe to close more than once', async () => {
      await temp.database.close();
      await expect(temp.database.close()).resolves.toBeUndefined();
    });

    it('refuses queries after close instead of failing deep inside the driver', async () => {
      await temp.database.close();

      await expect(temp.database.query('SELECT 1')).rejects.toThrow(/has been closed/);
      await expect(temp.database.execute('SELECT 1')).rejects.toThrow(/has been closed/);
    });

    it('refuses to start a transaction after close', async () => {
      await temp.database.close();

      await expect(temp.database.transaction(async () => 'never')).rejects.toThrow(
        /has been closed/,
      );
    });
  });
});