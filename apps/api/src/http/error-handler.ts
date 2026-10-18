import type { FastifyInstance } from 'fastify';

import { AppError, toAppError, toErrorResponse } from '../errors.js';

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