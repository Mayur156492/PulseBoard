import type { FieldError } from '@pulseboard/shared';
import type { FastifyInstance } from 'fastify';

import { AppError, toErrorResponse } from '../errors.js';

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
 * Extracts field-level problems from a schema validation failure.
 *
 * Only the instance path and the validation message are forwarded. Schema
 * paths and ajv parameters are withheld so the response cannot be used to
 * reconstruct the server's internal schemas (security-review, section 11).
 */
function extractValidationDetails(error: unknown): readonly FieldError[] {
  if (typeof error !== 'object' || error === null) return [];

  const { validation } = error as { validation?: unknown };
  if (!Array.isArray(validation)) return [];

  return validation.map((issue: unknown) => {
    const candidate =
      typeof issue === 'object' && issue !== null
        ? (issue as { instancePath?: unknown; message?: unknown })
        : {};

    const instancePath = typeof candidate.instancePath === 'string' ? candidate.instancePath : '';

    return {
      path: toFieldPath(instancePath),
      message: typeof candidate.message === 'string' ? candidate.message : 'Invalid value',
    };
  });
}

/**
 * Safe messages for transport-level client errors.
 *
 * Fastify's raw messages sometimes echo the offending input or mention internal
 * framing, so a fixed message is returned instead.
 */
const TRANSPORT_CLIENT_MESSAGES: Readonly<Record<number, string>> = {
  400: 'Malformed request',
  404: 'Not found',
  405: 'Method not allowed',
  406: 'Not acceptable',
  413: 'Request body is too large',
  415: 'Unsupported media type',
};

function readStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const { statusCode } = error as { statusCode?: unknown };
  return typeof statusCode === 'number' && Number.isInteger(statusCode) ? statusCode : undefined;
}

/**
 * Converts any thrown value into the {@link AppError} that should be reported.
 *
 * Fastify rejects oversized bodies, unsupported media types and malformed JSON
 * with its own error objects carrying a 4xx status. Those are genuine client
 * faults and must keep their status instead of being reported as 500.
 */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

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

  // Everything else is an unexpected failure: log the cause, tell the client
  // nothing beyond the fact that it failed.
  return AppError.internal('Internal server error', error);
}

/**
 * Installs the single place where thrown values become HTTP responses.
 *
 * Client-safe `AppError`s keep their status and message; everything else
 * becomes a generic 500 and is logged with its full cause.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body } = toErrorResponse(toAppError(error), request.id);

    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, 'Request failed');
    } else {
      request.log.warn({ statusCode, requestId: request.id }, 'Request rejected');
    }

    return reply.code(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const { statusCode, body } = toErrorResponse(
      AppError.notFound(`Route ${request.method} ${request.url} not found`),
      request.id,
    );

    request.log.warn({ statusCode, requestId: request.id }, 'No route matched the request');
    return reply.code(statusCode).send(body);
  });
}