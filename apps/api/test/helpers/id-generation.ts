/**
 * Test helpers for identifier generation.
 *
 * These are for tests only. They do not affect production ID generation.
 */

import { SERVICE_ID_PATTERN } from '../../src/services/id-generation.js';

export function makeTestServiceId(seed: number): string {
  // Deterministic 21-char ids for test fixtures only.
  const base = Math.abs(seed).toString(36).padStart(21, 'a');
  return base.slice(0, 21);
}

export function assertValidServiceId(id: unknown): asserts id is string {
  if (!SERVICE_ID_PATTERN.test(id as string)) {
    throw new Error(`Invalid test service id: ${id}`);
  }
}
