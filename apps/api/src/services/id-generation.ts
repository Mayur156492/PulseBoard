import { randomBytes } from 'node:crypto';

export const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

/** Custom 21-character URL-safe random identifiers using node:crypto. */
export function generateServiceId(): string {
  return randomBytes(16).toString('base64url').slice(0, 21);
}
