import { describe, expect, it } from 'vitest';

import { SERVICE_ID_PATTERN, generateServiceId } from '../src/services/id-generation.js';

describe('generateServiceId', () => {
  it('returns exactly 21 characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateServiceId()).toHaveLength(21);
    }
  });

  it('uses only the allowed URL-safe alphabet', () => {
    const alphabet = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_');
    for (let i = 0; i < 50; i++) {
      const id = generateServiceId();
      for (const char of id) {
        expect(alphabet.has(char)).toBe(true);
      }
    }
  });

  it('produces ids that match SERVICE_ID_PATTERN', () => {
    for (let i = 0; i < 50; i++) {
      expect(SERVICE_ID_PATTERN.test(generateServiceId())).toBe(true);
    }
  });

  it('produces different ids across repeated calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateServiceId();
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});
