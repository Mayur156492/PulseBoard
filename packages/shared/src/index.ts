/**
 * Public surface of `@pulseboard/shared`.
 *
 * This package holds wire contracts only. It must never import from the API or
 * the web app, must never perform I/O, and must never contain database or
 * business logic (pulseboard-architecture rule 1: the UI never accesses the
 * database directly, and the shared package is part of the UI's dependency
 * surface).
 */
export {
  isHealthReport,
  type HealthCheckReport,
  type HealthReport,
  type HealthStatus,
} from './health.js';
export {
  API_ERROR_CODES,
  isApiErrorResponse,
  type ApiErrorCode,
  type ApiErrorResponse,
  type FieldError,
} from './api-errors.js';
export {
  formatServerTimestamp,
  toServerTimestamp,
  type ServerTimestamp,
} from './time.js';