import { describe, expect, it } from 'vitest';

import { ConfigError, loadApiConfig, readPackageVersion } from '../src/config.js';

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

function issuesFor(values: Record<string, string>): readonly string[] {
  try {
    loadApiConfig(env(values));
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }

  throw new Error('Expected loadApiConfig to throw');
}

describe('loadApiConfig defaults', () => {
  it('produces a usable configuration from an empty environment', () => {
    const config = loadApiConfig(env({ CORS_ENABLED: 'false' }));

    expect(config.nodeEnv).toBe('development');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.bodyLimitBytes).toBe(1_048_576);
    expect(config.shutdownTimeoutMs).toBe(10_000);
    expect(config.database.filePath).toBe('./data/pulseboard.sqlite');
    expect(config.database.busyTimeoutMs).toBe(5_000);
    expect(config.database.autoMigrate).toBe(true);
  });

  it('treats an empty string as unset rather than as a value', () => {
    const config = loadApiConfig(env({ HOST: '   ', CORS_ENABLED: 'false' }));

    expect(config.host).toBe('127.0.0.1');
  });

  it('trims surrounding whitespace from values', () => {
    const config = loadApiConfig(
      env({ HOST: '  0.0.0.0  ', CORS_ENABLED: 'false', DATABASE_FILE: ' ./x.sqlite ' }),
    );

    expect(config.host).toBe('0.0.0.0');
    expect(config.database.filePath).toBe('./x.sqlite');
  });

  it('reports the version declared by this package', () => {
    const config = loadApiConfig(env({ CORS_ENABLED: 'false' }));

    expect(config.version).toBe(readPackageVersion());
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('loadApiConfig explicit values', () => {
  it('accepts every supported NODE_ENV value', () => {
    for (const nodeEnv of ['development', 'test', 'production'] as const) {
      const config = loadApiConfig(env({ NODE_ENV: nodeEnv, CORS_ENABLED: 'false' }));
      expect(config.nodeEnv).toBe(nodeEnv);
    }
  });

  it('parses numeric values', () => {
    const config = loadApiConfig(
      env({
        PORT: '8080',
        BODY_LIMIT_BYTES: '2048',
        SHUTDOWN_TIMEOUT_MS: '0',
        DATABASE_BUSY_TIMEOUT_MS: '250',
        CORS_ENABLED: 'false',
      }),
    );

    expect(config.port).toBe(8080);
    expect(config.bodyLimitBytes).toBe(2048);
    expect(config.shutdownTimeoutMs).toBe(0);
    expect(config.database.busyTimeoutMs).toBe(250);
  });

  it('parses booleans case-insensitively', () => {
    const config = loadApiConfig(
      env({ DATABASE_AUTO_MIGRATE: ' FALSE ', CORS_ENABLED: 'false' }),
    );

    expect(config.database.autoMigrate).toBe(false);
  });

  it('parses a comma separated origin allowlist', () => {
    const config = loadApiConfig(
      env({
        CORS_ENABLED: 'true',
        CORS_ORIGINS: 'http://localhost:5173, https://pulseboard.internal ,',
      }),
    );

    expect(config.cors.enabled).toBe(true);
    expect(config.cors.origins).toEqual([
      'http://localhost:5173',
      'https://pulseboard.internal',
    ]);
  });

  it('allows CORS to be disabled without an origin list', () => {
    const config = loadApiConfig(env({ CORS_ENABLED: 'false' }));

    expect(config.cors.enabled).toBe(false);
    expect(config.cors.origins).toEqual([]);
  });
});

describe('loadApiConfig rejects invalid values', () => {
  it.each([
    ['a non-numeric port', { PORT: 'http' }],
    ['a fractional port', { PORT: '80.5' }],
    ['a port below range', { PORT: '0' }],
    ['a port above range', { PORT: '70000' }],
    ['a negative body limit', { BODY_LIMIT_BYTES: '-1' }],
    ['an unknown NODE_ENV', { NODE_ENV: 'staging' }],
    ['an unknown LOG_LEVEL', { LOG_LEVEL: 'chatty' }],
    ['a non-boolean flag', { DATABASE_AUTO_MIGRATE: 'yes' }],
    ['a negative busy timeout', { DATABASE_BUSY_TIMEOUT_MS: '-5' }],
  ])('rejects %s', (_label, values) => {
    const issues = issuesFor({ CORS_ENABLED: 'false', ...values });

    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('names the offending variable so the fix is obvious', () => {
    const issues = issuesFor({ CORS_ENABLED: 'false', PORT: 'http' });

    expect(issues[0]).toContain('PORT');
    expect(issues[0]).toContain('integer');
  });

  it('reports every problem at once instead of one per restart', () => {
    const issues = issuesFor({
      CORS_ENABLED: 'false',
      PORT: 'http',
      LOG_LEVEL: 'chatty',
      NODE_ENV: 'staging',
      DATABASE_AUTO_MIGRATE: 'maybe',
    });

    expect(issues).toHaveLength(4);
  });

  it('refuses a wildcard CORS origin', () => {
    const issues = issuesFor({ CORS_ENABLED: 'true', CORS_ORIGINS: '*' });

    expect(issues.some((issue) => issue.includes('CORS_ORIGINS'))).toBe(true);
  });

  it('refuses an origin that carries a path', () => {
    const issues = issuesFor({
      CORS_ENABLED: 'true',
      CORS_ORIGINS: 'https://pulseboard.internal/dashboard',
    });

    expect(issues.some((issue) => issue.includes('origin without a path'))).toBe(true);
  });

  it('refuses a malformed origin URL', () => {
    const issues = issuesFor({ CORS_ENABLED: 'true', CORS_ORIGINS: 'not a url' });

    expect(issues.some((issue) => issue.includes('invalid origin'))).toBe(true);
  });

  it('requires at least one origin when CORS is enabled', () => {
    const issues = issuesFor({ CORS_ENABLED: 'true' });

    expect(issues.some((issue) => issue.includes('at least one origin'))).toBe(true);
  });
});

describe('ConfigError', () => {
  it('lists each issue in its message', () => {
    const error = new ConfigError(['first problem', 'second problem']);

    expect(error.issues).toEqual(['first problem', 'second problem']);
    expect(error.message).toContain('first problem');
    expect(error.message).toContain('second problem');
    expect(error.name).toBe('ConfigError');
  });
});