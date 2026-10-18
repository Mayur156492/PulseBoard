import type { FastifyServerOptions } from 'fastify';

import type { ApiConfig } from './config.js';

/**
 * Builds the Fastify server options from validated configuration.
 *
 * Kept separate from `app.ts` so logging policy can be asserted in a unit test
 * without constructing a server.
 */
export function buildServerOptions(config: ApiConfig): FastifyServerOptions {
  return {
    // Reject oversized bodies at the transport boundary rather than in a route.
    bodyLimit: config.bodyLimitBytes,
    ajv: {
      customOptions: {
        // Report every invalid field in one response instead of only the first.
        allErrors: true,
        // Reject wrong-typed input instead of coercing it. Fastify defaults to
        // `coerceTypes: 'array'`, which silently accepts `{ replicas: 3 }`
        // where an integer is declared and - worse - accepts `{ value: 123 }`
        // as the string "123" for telemetry that must stay numeric.
        // Query-string routes that need coercion must opt in explicitly in the
        // milestone that introduces them.
        coerceTypes: false,
        // Do not silently strip unknown properties. With `additionalProperties: false`
        // on a body schema, `removeAdditional: true` (Fastify's default) would remove
        // unknown fields from the request body without rejecting the request. Setting
        // this to false lets AJV surface a validation error so the error handler can
        // return a proper 400 VALIDATION_ERROR instead of accepting a stripped body.
        removeAdditional: false,
      },
    },
    logger: {
      level: config.logLevel,
      redact: {
        // Credentials must never reach the log stream, even at debug level.
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      base: {
        service: 'pulseboard-api',
        env: config.nodeEnv,
      },
    },
  };
}