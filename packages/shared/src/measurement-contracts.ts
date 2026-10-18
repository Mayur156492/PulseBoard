/** Contracts for measurement ingestion and listing. */

import type { ServerTimestamp } from './time.js';

export interface MeasurementCreateRequest {
  readonly metric: string;
  readonly value: number;
  readonly timestamp?: number;
}

export interface MeasurementResponse {
  readonly id: string;
  readonly serviceId: string;
  readonly metric: string;
  readonly value: number;
  readonly eventTimestamp: ServerTimestamp;
  readonly receivedAt: ServerTimestamp;
}

export interface MeasurementListQuery {
  readonly metric?: string;
  readonly from?: number;
  readonly to?: number;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface MeasurementListResponse {
  readonly measurements: readonly MeasurementResponse[];
  readonly nextCursor?: string;
}

/** Runtime shape of a decoded pagination cursor. */

export interface MeasurementCursor {
  readonly eventTimestamp: number;
  readonly receivedAt: number;
  readonly id: string;
  readonly fingerprint: {
    readonly serviceId: string;
    readonly metric: string | null;
    readonly from: number | null;
    readonly to: number | null;
    readonly limit: number;
  };
}
