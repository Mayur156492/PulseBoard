import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { Database } from '../ports.js';

export interface SqliteDatabaseOptions {
  /** Path to the SQLite file, or `:memory:` for an ephemeral database. */
  readonly filePath: string;
  readonly busyTimeoutMs: number;
}

/** Value types SQLite can bind. `boolean` and `undefined` are rejected. */
type BindValue = null | number | bigint | string | Uint8Array;

const MEMORY_PATH = ':memory:';

/**
 * Converts an application-level parameter to a SQLite bind value.
 *
 * `boolean` is mapped to 0/1 because SQLite has no boolean type, and
 * `undefined` is rejected outright rather than silently becoming NULL, so a
 * missing parameter surfaces as a bug instead of as wrong data.
 */
function toBindValue(value: unknown): BindValue {
  if (value === null) return null;

  if (typeof value === 'boolean') return value ? 1 : 0;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Cannot bind non-finite number: ${String(value)}`);
    }
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'string') return value;
  if (value instanceof Uint8Array) return value;

  throw new TypeError(`Cannot bind value of type ${typeof value} to a SQLite statement`);
}

function toBindValues(params: readonly unknown[]): BindValue[] {
  return params.map(toBindValue);
}

/**
 * SQLite implementation of the {@link Database} port.
 *
 * The driver's API is synchronous; the port is not. That mismatch is
 * intentional - it keeps the port honest for a future asynchronous PostgreSQL
 * driver so no business logic can come to depend on SQLite's timing.
 */
export class SqliteDatabase implements Database {
  readonly #db: DatabaseSync;

  #closed = false;

  #transactionDepth = 0;

  private constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Opens a database, creating the parent directory and applying pragmas. */
  static open(options: SqliteDatabaseOptions): SqliteDatabase {
    const { filePath, busyTimeoutMs } = options;

    if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
      throw new TypeError(`busyTimeoutMs must be a non-negative integer, received ${String(busyTimeoutMs)}`);
    }

    if (filePath.trim().length === 0) {
      throw new TypeError('filePath must not be empty');
    }

    if (filePath !== MEMORY_PATH) {
      mkdirSync(dirname(filePath), { recursive: true });
    }

    const db = new DatabaseSync(filePath);
    // Interpolated only after the integer guard above; this pragma cannot be
    // parameterized.
    db.exec(`PRAGMA busy_timeout = ${String(busyTimeoutMs)};`);
    db.exec('PRAGMA foreign_keys = ON;');

    return new SqliteDatabase(db);
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    this.#assertOpen();

    const statement = this.#db.prepare(sql);
    return statement.all(...toBindValues(params)) as T[];
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<void> {
    this.#assertOpen();

    const statement = this.#db.prepare(sql);
    statement.run(...toBindValues(params));
  }

  async executeScript(sql: string): Promise<void> {
    this.#assertOpen();

    // `exec` runs every statement in the script and accepts comment-only
    // scripts, which `prepare` rejects.
    this.#db.exec(sql);
  }

  async transaction<T>(work: (tx: Database) => Promise<T>): Promise<T> {
    this.#assertOpen();

    if (this.#transactionDepth > 0) {
      throw new Error('Nested transactions are not supported; use a single transaction');
    }

    this.#transactionDepth += 1;
    await this.execute('BEGIN');

    try {
      const result = await work(this);
      await this.execute('COMMIT');
      return result;
    } catch (error) {
      let rollbackError: unknown = undefined;

      try {
        await this.execute('ROLLBACK');
      } catch (caught) {
        rollbackError = caught;
      }

      // A failed rollback leaves the connection in an unknown state. The caller
      // must still see the original failure, so both are reported rather than
      // either being swallowed.
      if (rollbackError !== undefined) {
        throw new AggregateError(
          [error, rollbackError],
          'Transaction failed and could not be rolled back',
          { cause: error },
        );
      }

      throw error;
    } finally {
      this.#transactionDepth -= 1;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;

    this.#closed = true;
    this.#db.close();
  }

  /** Fails fast instead of executing against a closed handle. */
  #assertOpen(): void {
    if (this.#closed) {
      throw new Error('SqliteDatabase has been closed');
    }
  }
}