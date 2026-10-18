import type { ApiErrorCode, ApiErrorResponse, FieldError } from '@pulseboard/shared';

/** Thrown when a service name is empty after trimming. */
export class ServiceNameEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceNameEmptyError';
  }
}

/** Thrown when a duplicate service name is detected. */
export class ServiceExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceExistsError';
  }
}

/**
 * An error whose HTTP representation is known.
 *
 * `expose` is the single switch between a message that may reach the client and
 * one that must not. Anything that is not an explicitly exposed `AppError` is
 * reported to clients as a generic 500 (security-review, section 11: errors
 * must not reveal stack traces, paths or internal structure).
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details: readonly FieldError[] | undefined;
  readonly expose: boolean;

  constructor(options: {
    readonly code: ApiErrorCode;
    readonly statusCode: number;
    readonly message: string;
    readonly details?: readonly FieldError[];
    readonly expose?: boolean;
    readonly cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }

  static notFound(message: string): AppError {
    return new AppError({ code: 'NOT_FOUND', statusCode: 404, message });
  }

  static validation(details: readonly FieldError[]): AppError {
    return new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Request validation failed',
      details,
    });
  }

  /** An internal failure. The cause is logged but never sent to the client. */
  static internal(message: string, cause?: unknown): AppError {
    return new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message,
      expose: false,
      cause,
    });
  }
}

export interface ErrorMapping {
  readonly statusCode: number;
  readonly body: ApiErrorResponse;
}

/**
 * Converts any thrown value into the {@link AppError} that should be reported.
 *
 * Custom service errors (ServiceNameEmptyError, ServiceExistsError) are mapped
 * to appropriate HTTP responses before being converted to error responses.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ServiceNameEmptyError) {
    return AppError.validation([{ path: 'name', message: error.message }]);
  }

  if (error instanceof ServiceExistsError) {
    return new AppError({
      code: 'SERVICE_EXISTS',
      statusCode: 409,
      message: error.message,
    });
  }

  const details = extractValidationDetails(error);
  if (details.length > 0) return AppError.validation(details);

  const statusCode = readStatusCode(error);
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return new AppError({
      code: statusCode === 404 || statusCode === 405 ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      statusCode,
      message: TRANSPORT_CLIENT_MESSAGES[statusCode] ?? 'Invalid request',
      cause: error,
    });
  }

  return AppError.internal('Internal server error', error);
}

/** Extracts field-level problems from a schema validation failure. */
function extractValidationDetails(error: unknown): readonly FieldError[] {
  if (typeof error !== 'object' || error === null) return [];

  const { validation } = error as { validation?: unknown };
  if (!Array.isArray(validation)) return [];

  return validation.map((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null) return { path: 'request', message: 'Invalid value' };

    const obj = issue as Record<string, unknown>;
    const instancePath = typeof obj.instancePath === 'string' ? obj.instancePath : '';
    const keyword = typeof obj.keyword === 'string' ? obj.keyword : '';
    const message = typeof obj.message === 'string' ? obj.message : 'Invalid value';

    // AJV's `additionalProperties` keyword reports the offending property name in
    // `params.additionalProperty` rather than in `instancePath`, so extract it
    // directly instead of relying on the JSON Pointer in `instancePath`.
    if (keyword === 'additionalProperties') {
      const params = obj.params;
      if (typeof params === 'object' && params !== null) {
        const additionalProperty = (params as Record<string, unknown>).additionalProperty;
        if (typeof additionalProperty === 'string' && additionalProperty.length > 0) {
          return { path: additionalProperty, message };
        }
      }
    }

    return {
      path: toFieldPath(instancePath),
      message,
    };
  });
}

function readStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const { statusCode } = error as { statusCode?: unknown };
  return typeof statusCode === 'number' && Number.isInteger(statusCode) ? statusCode : undefined;
}

/** Safe messages for transport-level client errors. */
const TRANSPORT_CLIENT_MESSAGES: Readonly<Record<number, string>> = {
  400: 'Malformed request',
  404: 'Not found',
  405: 'Method not allowed',
  406: 'Not acceptable',
  413: 'Request body is too large',
  415: 'Unsupported media type',
};

/**
 * Converts a JSON Pointer produced by schema validation into a readable field
 * path: `/services/0/name` becomes `services[0].name`.
 */
function toFieldPath(instancePath: string): string {
  const segments = instancePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`));

  if (segments.length === 0) return 'request';

  return segments.join('').replace(/^\./, '');
}

/**
 * Converts any thrown value into a client-safe response.
 *
 * `requestId` is echoed so an operator can find the corresponding log line
 * without the client ever seeing internals.
 */
export function toErrorResponse(error: unknown, requestId: string): ErrorMapping {
  const appError = toAppError(error);
  const { details } = appError;
  const body: ApiErrorResponse =
    details === undefined
      ? { error: { code: appError.code, message: appError.message, requestId } }
      : { error: { code: appError.code, message: appError.message, requestId, details } };

  return { statusCode: appError.statusCode, body };
}
