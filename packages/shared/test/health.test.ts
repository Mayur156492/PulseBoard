import { describe, expect, it } from 'vitest';

import { isHealthReport } from '../src/health.js';
import { toServerTimestamp } from '../src/time.js';

function validReport(overrides: Record<string, unknown> = {}): unknown {
  return {
    status: 'ok',
    version: '0.1.0',
    startedAt: toServerTimestamp(new Date('2026-10-04T11:00:00.000Z')),
    checkedAt: toServerTimestamp(new Date('2026-10-04T12:00:00.000Z')),
    checks: [{ name: 'process', status: 'ok' }],
    ...overrides,
  };
}

describe('isHealthReport', () => {
  it('accepts a well-formed report', () => {
    expect(isHealthReport(validReport())).toBe(true);
  });

  it('accepts a report whose checks carry a message', () => {
    const body = validReport({
      checks: [{ name: 'database', status: 'degraded', message: '2 pending migrations' }],
    });

    expect(isHealthReport(body)).toBe(true);
  });

  it.each([null, undefined, 'ok', 42, [], {}])('rejects non-object input: %s', (input) => {
    expect(isHealthReport(input)).toBe(false);
  });

  it.each(['ok', 'degraded', 'unavailable'])('accepts the status %s', (status) => {
    expect(isHealthReport(validReport({ status }))).toBe(true);
  });

  it.each(['unknown', '', 200, null])('rejects the invalid status %s', (status) => {
    expect(isHealthReport(validReport({ status }))).toBe(false);
  });

  it.each([
    ['a non-string version', { version: 1 }],
    ['a string startedAt', { startedAt: '2026-10-04T11:00:00.000Z' }],
    ['a fractional checkedAt', { checkedAt: 1.5 }],
    ['a non-finite startedAt', { startedAt: Number.NaN }],
    ['a missing startedAt', { startedAt: undefined }],
  ])('rejects %s', (_label, overrides) => {
    expect(isHealthReport(validReport(overrides))).toBe(false);
  });

  it.each([
    ['a non-array checks value', { checks: 'none' }],
    ['a missing checks value', { checks: undefined }],
    ['a check with no name', { checks: [{ status: 'ok' }] }],
    ['a check with an unknown status', { checks: [{ name: 'database', status: 'weird' }] }],
    ['a check with a non-string message', { checks: [{ name: 'db', status: 'ok', message: 7 }] }],
  ])('rejects %s', (_label, overrides) => {
    expect(isHealthReport(validReport(overrides))).toBe(false);
  });
});