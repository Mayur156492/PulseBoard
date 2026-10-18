/** Contracts for service registration and heartbeat ingestion. */

import type { ServerTimestamp } from './time.js';

export interface ServiceRegistrationRequest {
  readonly name: string;
  readonly description?: string;
}

export interface ServiceRegistrationResponse {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: ServerTimestamp;
}

export interface ServiceListResponse {
  readonly services: readonly ServiceRegistrationResponse[];
}

export interface HeartbeatRequest {
  readonly timestamp?: number;
}

export interface ServiceHeartbeatResponse {
  readonly serviceId: string;
  readonly receivedAt: ServerTimestamp;
  readonly status: ServiceStatus;
}

export type ServiceStatus = 'healthy' | 'stale' | 'unknown';

export interface ServiceDetailResponse {
  readonly service: ServiceRegistrationResponse;
  readonly latestHeartbeat?: {
    readonly receivedAt: ServerTimestamp;
    readonly clientTimestamp?: number;
  };
  readonly status: ServiceStatus;
}
