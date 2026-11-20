import { randomBytes } from 'node:crypto';
export const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

/** Custom 21-character URL-safe random identifiers using node:crypto. */
export function generateServiceId(): string {
  return randomBytes(16).toString('base64url').slice(0, 21);
}

/**
 * Runtime validator for service identifiers.
 *
 * The pattern is anchored and uses no `g`/`y` flags so repeated `.test()`
 * calls remain deterministic.
 */
export function isValidServiceId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return SERVICE_ID_PATTERN.test(value);
}

/**
 * Pattern source exported so other modules can reuse the exact same regex source
 * without importing the regex literal itself.
 */
export const SERVICE_ID_PATTERN_SOURCE = SERVICE_ID_PATTERN.source;
