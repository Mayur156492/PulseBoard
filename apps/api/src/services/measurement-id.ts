import { randomBytes } from 'node:crypto';

export const MEASUREMENT_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

/** Custom 21-character URL-safe random identifiers using node:crypto. */
export function generateMeasurementId(): string {
  return randomBytes(16).toString('base64url').slice(0, 21);
}

/**
 * Runtime validator for measurement identifiers.
 *
 * The pattern is anchored and uses no `g`/`y` flags so repeated `.test()`
 * calls remain deterministic.
 */
export function isValidMeasurementId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return MEASUREMENT_ID_PATTERN.test(value);
}
