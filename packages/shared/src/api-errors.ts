/**
 * Wire contract for error responses.
 *
 * The web app and the API share this shape so the client can branch on a
 * stable `code` instead of parsing human-readable messages.
 */

/**
 * Error codes the API is allowed to emit.
 *
 * Kept deliberately small: codes are a public contract, so a new code is added
 * only when an endpoint actually needs it.
 */
export const API_ERROR_CODES = ['VALIDATION_ERROR', 'NOT_FOUND', 'INTERNAL_ERROR'] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** A single field-level validation problem. */
export interface FieldError {
  /** Dotted/bracketed path to the offending field, e.g. `body.services[0].name`. */
  readonly path: string;
  readonly message: string;
}

/**
 * Error body returned for every 4xx and 5xx response.
 *
 * `requestId` is safe to expose: it lets an operator correlate a user-visible
 * failure with a server log line without leaking any internals.
 */
export interface ApiErrorResponse {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly FieldError[];
  };
}

function isFieldError(value: unknown): value is FieldError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['path'] === 'string' && typeof candidate['message'] === 'string';
}

/**
 * Runtime guard for {@link ApiErrorResponse}.
 *
 * TypeScript types do not survive the network (pulseboard-architecture rule 2),
 * so the client validates responses instead of casting them.
 */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as Record<string, unknown>)['error'];
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as Record<string, unknown>;
  if (typeof candidate['code'] !== 'string') return false;
  if (!(API_ERROR_CODES as readonly string[]).includes(candidate['code'])) return false;
  if (typeof candidate['message'] !== 'string') return false;
  if (typeof candidate['requestId'] !== 'string') return false;

  const { details } = candidate;
  if (typeof details === 'undefined') return true;
  return Array.isArray(details) && details.every(isFieldError);
}