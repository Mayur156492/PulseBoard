/**
 * Ports owned by the application core.
 *
 * These interfaces are the seam that keeps business logic independent from
 * infrastructure (pulseboard-architecture rules 1 and 2). Concrete adapters -
 * the SQLite driver in `db/sqlite-database.ts`, a future PostgreSQL driver -
 * implement them, and nothing in `src/domain` or `src/http` imports a driver
 * directly.
 */

/** Source of the current time. Injectable so time-dependent code is testable. */
export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
}

/**
 * Minimal relational database port.
 *
 * Deliberately asynchronous even though the current SQLite adapter is
 * synchronous: a PostgreSQL adapter is the expected replacement, and business
 * logic must not depend on either driver's timing.
 */
export interface Database {
  /** Runs a parameterized query and returns all rows. */
  query<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs a parameterized statement that returns no rows. */
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
  /**
   * Runs a multi-statement DDL script.
   *
   * Separated from {@link Database.execute} because migrations contain several
   * statements and cannot be parameterized. It takes no parameters precisely so
   * a caller cannot accidentally build a script from user input.
   */
  executeScript(sql: string): Promise<void>;
  /**
   * Runs `work` inside a transaction, committing on success and rolling back on
   * failure.
   */
  transaction<T>(work: (tx: Database) => Promise<T>): Promise<T>;
  /**
   * Releases all resources. Must be idempotent: calling it twice is not an
   * error (pulseboard-architecture rule 6).
   */
  close(): Promise<void>;
}