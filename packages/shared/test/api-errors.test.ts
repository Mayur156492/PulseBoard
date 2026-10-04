import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES, isApiErrorResponse } from '../src/api-errors.js';

function validBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    error: {
      code: 'NOT_FOUND',
      message: 'Service not found',
      requestId: 'req-1',
      ...overrides,
    },
  };
}

describe('isApiErrorResponse', () => {
  it('accepts a well-formed error body', () => {
    expect(isApiErrorResponse(validBody())).toBe(true);
  });

  it('accepts a body carrying field details', () => {
    const body = validBody({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'body.services[0].name', message: 'must not be empty' }],
    });

    expect(isApiErrorResponse(body)).toBe(true);
  });

  it.each([null, undefined, 'error', 42, [], {}])('rejects non-object input: %s', (input) => {
    expect(isApiErrorResponse(input)).toBe(false);
  });

  it('rejects a body without an error object', () => {
    expect(isApiErrorResponse({ message: 'boom' })).toBe(false);
  });

  it.each([
    ['a missing code', { message: 'x', requestId: 'req-1' }],
    ['a non-string code', { code: 500, message: 'x', requestId: 'req-1' }],
    ['an unknown code', { code: 'TEAPOT', message: 'x', requestId: 'req-1' }],
    ['a missing message', { code: 'NOT_FOUND', requestId: 'req-1' }],
    ['a missing requestId', { code: 'NOT_FOUND', message: 'x' }],
  ])('rejects %s', (_label, error) => {
    expect(isApiErrorResponse({ error })).toBe(false);
  });

  it('rejects details that are not an array of field errors', () => {
    expect(isApiErrorResponse(validBody({ details: 'nope' }))).toBe(false);
    expect(isApiErrorResponse(validBody({ details: [{ path: 'a' }] }))).toBe(false);
    expect(isApiErrorResponse(validBody({ details: [{ message: 'a' }] }))).toBe(false);
  });

  it('rejects a valid error nested under the wrong key', () => {
    const error = validBody();
    const body = { data: error };

    expect(isApiErrorResponse(body)).toBe(false);
  });
});

describe('API_ERROR_CODES', () => {
  it('exposes exactly the codes the foundation can emit', () => {
    expect([...API_ERROR_CODES]).toEqual(['VALIDATION_ERROR', 'NOT_FOUND', 'INTERNAL_ERROR']);
  });

  it('contains no duplicates', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
  });
});