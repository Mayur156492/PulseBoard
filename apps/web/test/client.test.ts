import { toServerTimestamp } from '@pulseboard/shared';
import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError, createApiClient, describeApiError } from '../src/api/client.js';

const VALID_REPORT = {
  status: 'ok',
  version: '0.1.0',
  startedAt: toServerTimestamp(new Date('2026-10-04T11:00:00.000Z')),
  checkedAt: toServerTimestamp(new Date('2026-10-04T12:00:00.000Z')),
  checks: [{ name: 'process', status: 'ok' }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface RecordedCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/**
 * Wraps a handler in a `fetch` spy that records its arguments in a typed way,
 * so assertions never need an unchecked cast of `mock.calls`.
 */
function recordingFetch(
  handler: (url: string, init: RequestInit | undefined) => Promise<Response>,
): { readonly fetchImpl: typeof fetch; readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });

  return { fetchImpl: spy as unknown as typeof fetch, calls };
}

function alwaysReturning(response: () => Promise<Response>) {
  return recordingFetch(() => response());
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('Expected the request to reject, but it resolved');
    },
    (error: unknown) => error,
  );
}

describe('createApiClient', () => {
  it('requests the liveness endpoint and returns the validated report', async () => {
    const { fetchImpl, calls } = alwaysReturning(async () => jsonResponse(VALID_REPORT));

    const report = await createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual([{ name: 'process', status: 'ok' }]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://api.test/health');
    expect(calls[0]?.init?.method).toBe('GET');
    expect(calls[0]?.init?.headers).toMatchObject({ accept: 'application/json' });
  });

  it('requests the readiness endpoint separately', async () => {
    const { fetchImpl, calls } = alwaysReturning(async () => jsonResponse(VALID_REPORT));

    await createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getReadiness();

    expect(calls[0]?.url).toBe('http://api.test/ready');
  });

  it('joins the base URL without doubling slashes', async () => {
    const { fetchImpl, calls } = alwaysReturning(async () => jsonResponse(VALID_REPORT));

    await createApiClient({ baseUrl: 'http://api.test/', fetchImpl }).getHealth();

    expect(calls[0]?.url).toBe('http://api.test/health');
  });

  it('forwards the abort signal to fetch', async () => {
    const { fetchImpl, calls } = alwaysReturning(async () => jsonResponse(VALID_REPORT));
    const controller = new AbortController();

    await createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth(controller.signal);

    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it('surfaces the API error contract, including the request id', async () => {
    const { fetchImpl } = alwaysReturning(async () =>
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'Service not found', requestId: 'req-42' } },
        404,
      ),
    );

    const error = await captureError(
      createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth(),
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      requestId: 'req-42',
      message: 'Service not found',
    });
  });

  it('reports an unreachable API as a network error', async () => {
    const { fetchImpl } = recordingFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const error = await captureError(
      createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth(),
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it.each([
    ['a missing status', { ...VALID_REPORT, status: undefined }],
    ['an unknown status', { ...VALID_REPORT, status: 'exploded' }],
    ['a string timestamp', { ...VALID_REPORT, checkedAt: '2026-10-04T12:00:00.000Z' }],
    ['checks that are not an array', { ...VALID_REPORT, checks: 'none' }],
  ])('rejects a successful response containing %s', async (_label, body) => {
    const { fetchImpl } = alwaysReturning(async () => jsonResponse(body));

    const error = await captureError(
      createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth(),
    );

    expect(error).toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('rejects a successful response that is not JSON', async () => {
    const { fetchImpl } = alwaysReturning(
      async () => new Response('<html>gateway</html>', { status: 200 }),
    );

    const error = await captureError(
      createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth(),
    );

    expect(error).toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('does not disguise an unrecognized error body as an API error', async () => {
    const { fetchImpl } = alwaysReturning(async () => jsonResponse({ message: 'nope' }, 500));

    const error = await captureError(
      createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth(),
    );

    expect(error).toMatchObject({ code: 'MALFORMED_RESPONSE', status: 500 });
  });

  it('lets an abort propagate unchanged so cleanup is not reported as a failure', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    const { fetchImpl } = recordingFetch(() => Promise.reject(abortError));

    const error = await captureError(
      createApiClient({ baseUrl: 'http://api.test', fetchImpl }).getHealth(),
    );

    expect(error).toBe(abortError);
  });

  it('falls back to the platform fetch when no implementation is injected', () => {
    expect(() => createApiClient({ baseUrl: 'http://api.test' })).not.toThrow();
  });
});

describe('describeApiError', () => {
  it('includes the request id when the server supplied one', () => {
    const error = new ApiRequestError('Service not found', {
      code: 'NOT_FOUND',
      status: 404,
      requestId: 'req-42',
    });

    expect(describeApiError(error)).toBe('Service not found (request req-42)');
  });

  it('omits the request id when there is none', () => {
    const error = new ApiRequestError('Could not reach the PulseBoard API', {
      code: 'NETWORK_ERROR',
    });

    expect(describeApiError(error)).toBe('Could not reach the PulseBoard API');
  });

  it('never renders an arbitrary thrown value', () => {
    expect(describeApiError(new Error('secret internal detail'))).toBe(
      'An unexpected error occurred',
    );
    expect(describeApiError('a string')).toBe('An unexpected error occurred');
  });
});