import type { Database, Clock } from '../ports.js';
import type {
  ServiceRegistrationRequest,
  ServiceRegistrationResponse,
  ServiceListResponse,
  ServiceHeartbeatResponse,
  ServiceDetailResponse,
  ServiceStatus,
} from '@pulseboard/shared';
import { toServerTimestamp } from '@pulseboard/shared';
import { generateServiceId } from './id-generation.js';

import { ServiceExistsError, ServiceNameEmptyError } from '../errors.js';

export function normalizeServiceName(name: string): string {
  return name.trim().toLowerCase();
}

export function computeStatus(latestReceivedAt: number | undefined, now: number): ServiceStatus {
  if (latestReceivedAt === undefined) {
    return 'unknown';
  }

  const age = now - latestReceivedAt;

  // Age <= 30,000ms is healthy; age > 30,000ms is stale
  return age <= 30_000 ? 'healthy' : 'stale';
}

export async function createService(
  database: Database,
  clock: Clock,
  request: ServiceRegistrationRequest,
): Promise<ServiceRegistrationResponse> {
  const name = normalizeServiceName(request.name);

  if (name.length === 0) {
    throw new ServiceNameEmptyError('Service name must not be empty');
  }

  const id = generateServiceId();

  await database.transaction(async (tx) => {
    try {
      await tx.execute(
        `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, ?, ?)`,
        [id, name, request.description ?? null, clock.now()],
      );
    } catch (error) {
      if (isDuplicateServiceNameError(error)) {
        throw new ServiceExistsError(`Service with name "${name}" already exists`);
      }
      throw error;
    }
  });

  return {
    id,
    name,
    ...(request.description !== undefined ? { description: request.description } : {}),
    createdAt: toServerTimestamp(clock.now()),
  };
}

export async function listServices(database: Database): Promise<ServiceListResponse> {
  const rows = await database.query<{
    id: string;
    name: string;
    description: string | null;
    created_at: number;
  }>('SELECT id, name, description, created_at FROM services ORDER BY created_at ASC');

  return {
    services: rows.map((row) => ({
      id: row.id,
      name: row.name,
      ...(row.description !== null ? { description: row.description } : {}),
      createdAt: toServerTimestamp(row.created_at),
    })),
  };
}

export async function findServiceById(
  database: Database,
  id: string,
): Promise<{
  id: string;
  name: string;
  description: string | null;
  created_at: number;
} | null> {
  const rows = await database.query<{
    id: string;
    name: string;
    description: string | null;
    created_at: number;
  }>('SELECT id, name, description, created_at FROM services WHERE id = ?', [id]);

  return rows[0] ?? null;
}

export async function recordHeartbeat(
  database: Database,
  clock: Clock,
  serviceId: string,
  clientTimestamp?: number,
): Promise<ServiceHeartbeatResponse> {
  const service = await findServiceById(database, serviceId);
  if (service === null) {
    return {
      serviceId,
      receivedAt: toServerTimestamp(clock.now()),
      status: 'unknown',
    };
  }

  const receivedAt = Math.trunc(clock.now());


  await database.execute(
    `INSERT INTO heartbeats (service_id, received_at, client_ts)
     VALUES (?, ?, ?)
     ON CONFLICT(service_id) DO UPDATE SET
       received_at = excluded.received_at,
       client_ts = excluded.client_ts`,
    [serviceId, receivedAt, clientTimestamp ?? null],
  );

  const latest = await database.query<{ received_at: number }>(
    'SELECT received_at FROM heartbeats WHERE service_id = ?',
    [serviceId],
  );



  return {
    serviceId,
    receivedAt: toServerTimestamp(receivedAt),
    status: computeStatus(latest[0]?.received_at, clock.now()),
  };
}

export async function getServiceDetail(
  database: Database,
  clock: Clock,
  serviceId: string,
): Promise<ServiceDetailResponse | null> {
  const service = await findServiceById(database, serviceId);
  if (service === null) {
    return null;
  }

  const latest = await database.query<{ received_at: number; client_ts: number | null }>(
    'SELECT received_at, client_ts FROM heartbeats WHERE service_id = ?',
    [serviceId],
  );




  const latestHeartbeat = latest[0] ?? undefined;
  const status = latestHeartbeat
    ? computeStatus(latestHeartbeat.received_at, clock.now())
    : 'unknown';

  if (latestHeartbeat) {
    return {
      service: {
        id: service.id,
        name: service.name,
        ...(service.description !== null ? { description: service.description } : {}),
        createdAt: toServerTimestamp(service.created_at),
      },
      latestHeartbeat: {
        receivedAt: toServerTimestamp(latestHeartbeat.received_at),
        ...(latestHeartbeat.client_ts !== null
          ? { clientTimestamp: latestHeartbeat.client_ts }
          : {}),
      },
      status,
    } as ServiceDetailResponse;
  }

  return {
    service: {
      id: service.id,
      name: service.name,
      ...(service.description !== null ? { description: service.description } : {}),
      createdAt: toServerTimestamp(service.created_at),
    },
    status,
  } as ServiceDetailResponse;
}

function isDuplicateServiceNameError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '');
    // SQLite returns a constraint error when a UNIQUE constraint is violated.
    // The error message includes the table and column name.
    return message.includes('UNIQUE constraint failed') && message.includes('services.name');
  }
  return false;
}
