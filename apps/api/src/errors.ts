import type { ApiErrorCode, ApiErrorResponse, FieldError } from '@pulseboard/shared';

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
 * Converts any thrown value into a client-safe response.
 *
 * `requestId` is echoed so an operator can find the corresponding log line
 * without the client ever seeing internals.
 */
export function toErrorResponse(error: unknown, requestId: string): ErrorMapping {
  if (error instanceof AppError && error.expose) {
    const { details } = error;
    const body: ApiErrorResponse =
      details === undefined
        ? { error: { code: error.code, message: error.message, requestId } }
        : { error: { code: error.code, message: error.message, requestId, details } };

    return { statusCode: error.statusCode, body };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId,
      },
    },
  };
}