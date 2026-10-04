import { describe, expect, it } from 'vitest';

import { DEFAULT_API_BASE_URL, readApiBaseUrl } from '../src/config.js';

describe('readApiBaseUrl', () => {
  it('falls back to the default when nothing is configured', () => {
    expect(readApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(readApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
  });

  it('accepts an absolute http URL', () => {
    expect(readApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('accepts an absolute https URL', () => {
    expect(readApiBaseUrl('https://api.pulseboard.internal')).toBe(
      'https://api.pulseboard.internal',
    );
  });

  it('trims whitespace and trailing slashes', () => {
    expect(readApiBaseUrl('  http://localhost:3000///  ')).toBe('http://localhost:3000');
  });

  it('preserves a path prefix, which a reverse proxy may require', () => {
    expect(readApiBaseUrl('https://internal.example/pulseboard/')).toBe(
      'https://internal.example/pulseboard',
    );
  });

  it.each(['/api', 'not a url'])(
    'rejects the unparseable value %s instead of silently defaulting',
    (value) => {
      expect(() => readApiBaseUrl(value)).toThrow(/absolute URL/);
    },
  );

  // `localhost:3000` parses as a URL with protocol `localhost:`, so it is
  // rejected by the protocol check rather than the parse check. Either way it
  // must never be accepted as a base URL.
  it.each(['localhost:3000', 'ws://localhost:3000', 'file:///tmp/api', 'javascript:alert(1)'])(
    'rejects the non-http base URL %s',
    (value) => {
      expect(() => readApiBaseUrl(value)).toThrow(/http or https/);
    },
  );
});