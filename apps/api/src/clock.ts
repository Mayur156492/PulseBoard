import type { Clock } from './ports.js';

/**
 * The process-wide clock.
 *
 * Exported as a frozen object rather than a mutable module-level variable, so
 * the owner is explicit and no consumer can replace time for the whole process
 * by accident (pulseboard-architecture rule 7).
 */
export const systemClock: Clock = Object.freeze({
  now: () => Date.now(),
});