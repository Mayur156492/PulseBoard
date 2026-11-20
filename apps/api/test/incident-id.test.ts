import { describe, expect, it } from 'vitest';

import {
  INCIDENT_ID_PATTERN as SHARED_INCIDENT_ID_PATTERN,
  isValidIncidentId as isValidSharedIncidentId,
} from '@pulseboard/shared';
import {
  INCIDENT_ID_PATTERN,
  isValidIncidentId,
} from '../src/incident-service.js';

/**
 * Incident ids are standalone random 21-character URL-safe strings. They carry
 * no service-id structure, so the composite `<serviceId>-<suffix>` grammar is
 * not a valid incident id.
 *
 * The fixtures below are exactly 21 characters unless a test states otherwise.
 */
describe('isValidIncidentId', () => {
  it('accepts standalone 21-character url-safe incident ids', () => {
    expect(isValidIncidentId('ABCDEFGHIJKLMNOPQRSTU')).toBe(true);
    expect(isValidIncidentId('abcdefghij12345678901')).toBe(true);
    expect(isValidIncidentId('a-b_c-d_e-f_g-h_i-j_k')).toBe(true);
  });

  it('rejects composite incident ids that embed a service id', () => {
    expect(isValidIncidentId('ABCDEFGHIJKLMNOPQRSTU-a001')).toBe(false);
    expect(isValidIncidentId('ABCDEFGHIJKLMNO-1234')).toBe(false);
  });

  it('rejects ids that are not exactly 21 characters', () => {
    expect(isValidIncidentId('ABCDEFGHIJKLMNOPQRSTUV')).toBe(false);
    expect(isValidIncidentId('ABCDEFGHIJKLMNOPQRST')).toBe(false);
    expect(isValidIncidentId('')).toBe(false);
  });

  it('rejects characters outside the url-safe alphabet', () => {
    expect(isValidIncidentId('ABCDEFGHIJKLMNOPQRST/')).toBe(false);
    expect(isValidIncidentId('ABCDEFGHIJKLMNOPQRST ')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidIncidentId(null)).toBe(false);
    expect(isValidIncidentId(undefined)).toBe(false);
    expect(isValidIncidentId(123)).toBe(false);
    expect(isValidIncidentId({})).toBe(false);
  });
});

describe('INCIDENT_ID_PATTERN', () => {
  it('is anchored and matches the authoritative incident id grammar', () => {
    expect(INCIDENT_ID_PATTERN.source).toContain('^');
    expect(INCIDENT_ID_PATTERN.source).toContain('$');
    expect(INCIDENT_ID_PATTERN.test('ABCDEFGHIJKLMNOPQRSTU')).toBe(true);
    expect(INCIDENT_ID_PATTERN.test('ABCDEFGHIJKLMNOPQRSTU-0001')).toBe(false);
  });
});

describe('shared incident id validator', () => {
  it('is the single authoritative validator re-exported by the API module', () => {
    expect(isValidIncidentId).toBe(isValidSharedIncidentId);
    expect(INCIDENT_ID_PATTERN).toBe(SHARED_INCIDENT_ID_PATTERN);
  });
});
