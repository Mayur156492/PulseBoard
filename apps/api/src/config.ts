import { readFileSync } from 'node:fs';

export type NodeEnv = 'development' | 'test' | 'production';

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

const LOG_LEVELS: readonly string[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
];

/**
 * Raised when the process environment cannot produce a usable configuration.
 *
 * Configuration is validated once at startup and never re-read, so an
 * invalid value must stop the process rather than degrade at runtime
 * (pulseboard-architecture: explicit configuration handling).
 */
export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

export interface DatabaseConfig {
  readonly filePath: string;
  readonly busyTimeoutMs: number;
  readonly autoMigrate: boolean;
}

export interface CorsConfig {
  readonly enabled: boolean;
  readonly origins: readonly string[];
}

export interface ApiConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly bodyLimitBytes: number;
  readonly shutdownTimeoutMs: number;
  readonly version: string;
  readonly database: DatabaseConfig;
  readonly cors: CorsConfig;
}

interface IntegerRange {
  readonly min: number;
  readonly max: number;
}

function readString(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: string,
): string {
  const raw = env[key];
  if (raw === undefined) return fallback;

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  range: IntegerRange,
  issues: string[],
): number {
  const raw = env[key];
  if (raw === undefined) return fallback;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    issues.push(`${key} must be an integer, received "${raw}"`);
    return fallback;
  }

  if (parsed < range.min || parsed > range.max) {
    issues.push(`${key} must be between ${range.min} and ${range.max}, received ${parsed}`);
    return fallback;
  }

  return parsed;
}

function readBoolean(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean,
  issues: string[],
): boolean {
  const raw = env[key];
  if (raw === undefined) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  issues.push(`${key} must be "true" or "false", received "${raw}"`);
  return fallback;
}

function readNodeEnv(env: NodeJS.ProcessEnv, issues: string[]): NodeEnv {
  const raw = env['NODE_ENV'];
  if (raw === undefined) return 'development';

  const normalized = raw.trim().toLowerCase();
  const match = NODE_ENVS.find((value) => value === normalized);
  if (match !== undefined) return match;

  issues.push(`NODE_ENV must be one of ${NODE_ENVS.join(' | ')}, received "${raw}"`);
  return 'development';
}

function readLogLevel(env: NodeJS.ProcessEnv, issues: string[]): string {
  const raw = env['LOG_LEVEL'];
  if (raw === undefined) return 'info';

  const normalized = raw.trim().toLowerCase();
  if (LOG_LEVELS.includes(normalized)) return normalized;

  issues.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(' | ')}, received "${raw}"`);
  return 'info';
}

function readOrigins(env: NodeJS.ProcessEnv, issues: string[]): readonly string[] {
  const raw = env['CORS_ORIGINS'];
  if (raw === undefined) return [];

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // A wildcard origin would make every website able to call the API. The web
  // app's origin is known, so an explicit allowlist costs nothing.
  if (origins.includes('*')) {
    issues.push('CORS_ORIGINS must not contain "*"; list explicit origins instead');
  }

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      issues.push(`CORS_ORIGINS contains an invalid origin: "${origin}"`);
      continue;
    }

    const isOriginOnly = parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
    if (!isOriginOnly) {
      issues.push(`CORS_ORIGINS entry must be an origin without a path: "${origin}"`);
    }
  }

  return origins;
}

/**
 * Reads the API version from this package's `package.json`.
 *
 * Resolved relative to this module so it works identically when executed from
 * `src/` (tsx, tests) and from `dist/` (production build).
 */
export function readPackageVersion(): string {
  const packageJsonPath = new URL('../package.json', import.meta.url);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown;
  } catch (error) {
    throw new ConfigError([
      `Unable to read ${packageJsonPath.pathname} to determine the API version: ${String(error)}`,
    ]);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { version?: unknown }).version !== 'string'
  ) {
    throw new ConfigError([`${packageJsonPath.pathname} does not declare a string "version"`]);
  }

  return (parsed as { version: string }).version;
}

/**
 * Builds the validated application configuration.
 *
 * Every problem is collected before throwing so a misconfigured deployment is
 * fixed in one pass instead of one restart per mistake.
 *
 * @throws ConfigError when any value is present but invalid.
 */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const issues: string[] = [];

  const nodeEnv = readNodeEnv(env, issues);
  const logLevel = readLogLevel(env, issues);
  const origins = readOrigins(env, issues);
  const corsEnabled = readBoolean(env, 'CORS_ENABLED', true, issues);

  if (corsEnabled && origins.length === 0) {
    issues.push('CORS_ORIGINS must list at least one origin when CORS_ENABLED is "true"');
  }

  const config: ApiConfig = {
    nodeEnv,
    host: readString(env, 'HOST', '127.0.0.1'),
    port: readInteger(env, 'PORT', 3000, { min: 1, max: 65_535 }, issues),
    logLevel,
    bodyLimitBytes: readInteger(
      env,
      'BODY_LIMIT_BYTES',
      1_048_576,
      { min: 1024, max: 100_000_000 },
      issues,
    ),
    shutdownTimeoutMs: readInteger(
      env,
      'SHUTDOWN_TIMEOUT_MS',
      10_000,
      { min: 0, max: 300_000 },
      issues,
    ),
    version: readPackageVersion(),
    database: {
      filePath: readString(env, 'DATABASE_FILE', './data/pulseboard.sqlite'),
      busyTimeoutMs: readInteger(
        env,
        'DATABASE_BUSY_TIMEOUT_MS',
        5_000,
        { min: 0, max: 120_000 },
        issues,
      ),
      autoMigrate: readBoolean(env, 'DATABASE_AUTO_MIGRATE', true, issues),
    },
    cors: {
      enabled: corsEnabled,
      origins,
    },
  };

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return config;
}