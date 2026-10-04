import {
  isApiErrorResponse,
  isHealthReport,
  type ApiErrorCode,
  type HealthReport,
} from '@pulseboard/shared';

/**
 * Why a request failed.
 *
 * `NETWORK_ERROR` means the request never produced a response; the remaining
 * codes come from the API's own error contract.
 */
export type ApiClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'MALFORMED_RESPONSE';

/** Normalized failure from every transport concern, so callers branch on one type. */
export class ApiRequestError extends Error {
  readonly code: ApiClientErrorCode;

  readonly status: number | undefined;

  /** Server-side correlation id, when the API supplied one. */
  readonly requestId: string | undefined;

  constructor(
    message: string,
    options: {
      readonly code: ApiClientErrorCode;
      readonly status?: number;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiRequestError';
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  /** Injectable for tests; defaults to the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

export interface ApiClient {
  /** Liveness probe. */
  getHealth(signal?: AbortSignal): Promise<HealthReport>;
  /** Readiness probe. */
  getReadiness(signal?: AbortSignal): Promise<HealthReport>;
}

/**
 * Detects an aborted request without depending on `DOMException`.
 *
 * `instanceof DOMException` is unreliable across realms (a jsdom test realm, or
 * a polyfill), so the abort is identified by its stable `name`.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new ApiRequestError('The API returned a response that was not JSON', {
      code: 'MALFORMED_RESPONSE',
      status: response.status,
      cause: error,
    });
  }
}

/**
 * Creates the web app's only door to the API.
 *
 * All persistence lives behind the backend (pulseboard-architecture rule 1), so
 * this client is the complete network surface of the UI. Every response is
 * validated before it is handed to the UI layer.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl } = options;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  if (typeof doFetch !== 'function') {
    throw new TypeError('No fetch implementation is available');
  }

  async function requestHealth(path: string, signal?: AbortSignal): Promise<HealthReport> {
    let response: Response;
    try {
      response = await doFetch(joinUrl(baseUrl, path), {
        method: 'GET',
        headers: { accept: 'application/json' },
        // `null` rather than `undefined`: with exactOptionalPropertyTypes an
        // explicit `undefined` is not a valid AbortSignal.
        signal: signal ?? null,
      });
    } catch (error) {
      // Aborts are a normal control-flow signal, not a failure to report.
      if (isAbortError(error)) throw error;

      throw new ApiRequestError('Could not reach the PulseBoard API', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    }

    if (!response.ok) {
      const body = await readJson(response).catch(() => undefined);

      if (isApiErrorResponse(body)) {
        throw new ApiRequestError(body.error.message, {
          code: body.error.code,
          status: response.status,
          requestId: body.error.requestId,
        });
      }

      throw new ApiRequestError(`The API responded with status ${String(response.status)}`, {
        code: 'MALFORMED_RESPONSE',
        status: response.status,
      });
    }

    const body = await readJson(response);
    if (!isHealthReport(body)) {
      throw new ApiRequestError('The API returned an unexpected health payload', {
        code: 'MALFORMED_RESPONSE',
        status: response.status,
      });
    }

    return body;
  }

  return {
    getHealth: (signal) => requestHealth('/health', signal),
    getReadiness: (signal) => requestHealth('/ready', signal),
  };
}

/** Turns any thrown value into a message safe to render. */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.requestId === undefined
      ? error.message
      : `${error.message} (request ${error.requestId})`;
  }

  return 'An unexpected error occurred';
}