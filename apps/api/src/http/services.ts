import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config.js';
import type { Clock, Database } from '../ports.js';
import {
  createService,
  listServices,
  findServiceById,
  recordHeartbeat,
  getServiceDetail,
} from '../services/service-repository.js';
import { SERVICE_ID_PATTERN } from '../services/id-generation.js';
import type {
  ServiceDetailResponse,
} from '@pulseboard/shared';
import { AppError } from '../errors.js';

export interface ServiceRouteDependencies {
  readonly database: Database;
  readonly clock: Clock;
  readonly config: ApiConfig;
}

export function registerServiceRoutes(app: FastifyInstance, deps: ServiceRouteDependencies): void {
  const { database, clock } = deps;

  // POST /services - Register a new service
  app.post(
    '/services',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 256 },
            description: { type: 'string', maxLength: 1024 },
          },
          required: ['name'],
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string', pattern: SERVICE_ID_PATTERN.source },
              name: { type: 'string' },
              description: { type: 'string' },
              createdAt: { type: 'integer' },
            },
            required: ['id', 'name', 'createdAt'],
          },
        },
      },
    },
    async (request, reply) => {
      const result = await createService(database, clock, request.body as Parameters<typeof createService>[2]);
      return reply.code(201).send(result);
    },
  );

  // GET /services - List all registered services
  app.get(
    '/services',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              services: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    createdAt: { type: 'integer' },
                  },
                  required: ['id', 'name', 'createdAt'],
                },
              },
            },
            required: ['services'],
          },
        },
      },
    },
    async () => {
      return listServices(database);
    },
  );

  // POST /services/:serviceId/heartbeats - Ingest a heartbeat
  app.post(
    '/services/:serviceId/heartbeats',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            serviceId: { type: 'string', pattern: SERVICE_ID_PATTERN.source },
          },
          required: ['serviceId'],
        },
        body: {
          type: 'object',
          properties: {
            timestamp: { type: 'integer', minimum: 0 },
          },
          required: [],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              serviceId: { type: 'string' },
              receivedAt: { type: 'integer' },
              status: { type: 'string', enum: ['healthy', 'stale', 'unknown'] },
            },
            required: ['serviceId', 'receivedAt', 'status'],
          },
        },
      },
    },
    async (request, reply) => {
      const serviceId = (request.params as { serviceId: string }).serviceId;

      // Validate service exists first
      const service = await findServiceById(database, serviceId);
      if (service === null) {
        throw new AppError({
          code: 'NOT_FOUND',
          statusCode: 404,
          message: `Service not found: ${serviceId}`,
        });
      }

      const body = request.body as { timestamp?: number } | null | undefined;
      let clientTs: number | undefined = undefined;
      if (body !== null && body !== undefined && typeof body.timestamp === 'number') {
        if (!Number.isFinite(body.timestamp)) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Invalid timestamp: must be finite',
            details: [{ path: 'body.timestamp', message: 'must be finite' }],
          });
        }
        if (!Number.isInteger(body.timestamp)) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Invalid timestamp: must be an integer',
            details: [{ path: 'body.timestamp', message: 'must be an integer' }],
          });
        }
        if (body.timestamp < 0) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Invalid timestamp: must be non-negative',
            details: [{ path: 'body.timestamp', message: 'must be non-negative' }],
          });
        }
        clientTs = body.timestamp;
      }

      const result = await recordHeartbeat(database, clock, serviceId, clientTs);
      return reply.code(200).send(result);
    },
  );

  // GET /services/:serviceId - Get service detail with latest heartbeat
  app.get(
    '/services/:serviceId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            serviceId: { type: 'string', pattern: SERVICE_ID_PATTERN.source },
          },
          required: ['serviceId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              service: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  createdAt: { type: 'integer' },
                },
                required: ['id', 'name', 'createdAt'],
              },
              latestHeartbeat: {
                type: 'object',
                properties: {
                  receivedAt: { type: 'integer' },
                  clientTimestamp: { type: 'integer' },
                },
                required: ['receivedAt'],
              },
              status: { type: 'string', enum: ['healthy', 'stale', 'unknown'] },
            },
            required: ['service', 'status'],
          },
          404: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  requestId: { type: 'string' },
                },
                required: ['code', 'message', 'requestId'],
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const serviceId = (request.params as { serviceId: string }).serviceId;
      const detail = await getServiceDetail(database, clock, serviceId);

      if (detail === null) {
        throw new AppError({
          code: 'NOT_FOUND',
          statusCode: 404,
          message: `Service not found: ${serviceId}`,
        });
      }

      const response: ServiceDetailResponse = {
        service: detail.service,
        status: detail.status,
        ...(detail.latestHeartbeat !== undefined
          ? { latestHeartbeat: detail.latestHeartbeat }
          : {}),
      };
      return reply.code(200).send(response);
    },
  );
}
