/**
 * Public surface of `@pulseboard/shared`.
 *
 * This package holds wire contracts only. It must never import from the API or
 * the web app, must never perform I/O, and must never contain database or
 * business logic (pulseboard-architecture rule 1: the UI never accesses the
 * database directly, and the shared package is part of the UI's dependency
 * surface).
 */export {
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
export type {
  ServiceRegistrationRequest,
  ServiceRegistrationResponse,
  ServiceListResponse,
  HeartbeatRequest,
  ServiceHeartbeatResponse,
  ServiceStatus,
  ServiceDetailResponse,
} from './service-contracts.js';
export type {
  MeasurementCreateRequest,
  MeasurementResponse,
  MeasurementListQuery,
  MeasurementListResponse,
  MeasurementCursor,
} from './measurement-contracts.js';