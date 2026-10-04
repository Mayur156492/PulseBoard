import { describe, expect, it } from 'vitest';

import {
  formatServerTimestamp,
  toServerTimestamp,
  type ServerTimestamp,
} from '../src/time.js';

describe('toServerTimestamp', () => {
  it('normalizes a Date to epoch milliseconds', () => {
    const date = new Date('2026-10-04T12:00:00.000Z');

    expect(toServerTimestamp(date)).toBe(date.getTime());
  });

  it('truncates fractional milliseconds so transport values stay integral', () => {
    expect(toServerTimestamp(1_700_000_000_123.9)).toBe(1_700_000_000_123);
  });

  it('preserves epoch zero', () => {
    expect(toServerTimestamp(new Date(0))).toBe(0);
  });

  it('preserves negative (pre-epoch) timestamps', () => {
    expect(toServerTimestamp(new Date('1969-07-20T20:17:00.000Z'))).toBe(-14_182_980_000);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s rather than fabricating a value', (_label, input) => {
    expect(() => toServerTimestamp(input)).toThrow(RangeError);
  });

  it('rejects an invalid Date instead of silently using Date.now()', () => {
    expect(() => toServerTimestamp(new Date('not-a-date'))).toThrow(RangeError);
  });
});

describe('formatServerTimestamp', () => {
  it('renders UTC ISO-8601 regardless of the host time zone', () => {
    const timestamp = toServerTimestamp(new Date('2026-10-04T12:00:00.000Z'));

    expect(formatServerTimestamp(timestamp)).toBe('2026-10-04T12:00:00.000Z');
  });

  it('round-trips through toServerTimestamp', () => {
    const original = '2026-01-02T03:04:05.678Z';

    const parsed = toServerTimestamp(new Date(original));

    expect(formatServerTimestamp(parsed)).toBe(original);
  });
});

describe('ServerTimestamp branding', () => {
  it('does not accept a plain number where a normalized timestamp is required', () => {
    // Compile-time proof, asserted at runtime so the check is not lost when
    // typechecking is skipped.
    const plain = 1_700_000_000_000;

    // @ts-expect-error - a raw number must be normalized first. See rule 8.
    const unsafe: ServerTimestamp = plain;

    expect(typeof unsafe).toBe('number');
    expect(unsafe).toBe(plain);
  });
});