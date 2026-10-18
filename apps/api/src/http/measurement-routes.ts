import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config.js';
import type { Clock, Database } from '../ports.js';
import {
  createMeasurement,
  listMeasurementsForService,
} from '../services/measurement-service.js';
import { findServiceById } from '../services/service-repository.js';
import { MEASUREMENT_ID_PATTERN } from '../services/measurement-id.js';
import type {
  MeasurementCreateRequest,
  MeasurementListQuery,
} from '@pulseboard/shared';
import { AppError } from '../errors.js';

export interface MeasurementRouteDependencies {
  readonly database: Database;
  readonly clock: Clock;
  readonly config: ApiConfig;
}

/**
 * Registers the measurement ingestion and listing routes.
 *
 * POST   /services/:serviceId/measurements   -> 201
 * GET    /services/:serviceId/measurements   -> 200
 */
export function registerMeasurementRoutes(
  app: FastifyInstance,
  deps: MeasurementRouteDependencies,
): void {
  const { database, clock } = deps;

  // POST /services/:serviceId/measurements
  app.post(
    '/services/:serviceId/measurements',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            serviceId: { type: 'string', pattern: MEASUREMENT_ID_PATTERN.source },
          },
          required: ['serviceId'],
        },
        body: {
          type: 'object',
          properties: {
            metric: { type: 'string', minLength: 1, maxLength: 128 },
            value: { type: 'number' },
            timestamp: { type: 'integer', minimum: 0 },
          },
          required: ['metric', 'value'],
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              serviceId: { type: 'string' },
              metric: { type: 'string' },
              value: { type: 'number' },
              eventTimestamp: { type: 'integer' },
              receivedAt: { type: 'integer' },
            },
            required: ['id', 'serviceId', 'metric', 'value', 'eventTimestamp', 'receivedAt'],
          },
        },
      },
    },
    async (request, reply) => {
      const serviceId = (request.params as { serviceId: string }).serviceId;

      // Verify the service exists.
      const service = await findServiceById(database, serviceId);
      if (service === null) {
        throw new AppError({
          code: 'NOT_FOUND',
          statusCode: 404,
          message: `Service not found: ${serviceId}`,
        });
      }

      const body = request.body as MeasurementCreateRequest;
      const result = await createMeasurement(database, serviceId, body, clock.now());
      return reply.code(201).send(result);
    },
  );

  // GET /services/:serviceId/measurements
  app.get(
    '/services/:serviceId/measurements',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            serviceId: { type: 'string', pattern: MEASUREMENT_ID_PATTERN.source },
          },
          required: ['serviceId'],
        },
        querystring: {
          type: 'object',
          properties: {
            metric: { type: 'string' },
            from: { type: ['integer', 'string'] },
            to: { type: ['integer', 'string'] },
            limit: { type: ['integer', 'string'] },
            cursor: { type: 'string' },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              measurements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    serviceId: { type: 'string' },
                    metric: { type: 'string' },
                    value: { type: 'number' },
                    eventTimestamp: { type: 'integer' },
                    receivedAt: { type: 'integer' },
                  },
                  required: ['id', 'serviceId', 'metric', 'value', 'eventTimestamp', 'receivedAt'],
                },
              },
              nextCursor: { type: 'string' },
            },
            required: ['measurements'],
          },
        },
      },
    },
    async (request, reply) => {
      const serviceId = (request.params as { serviceId: string }).serviceId;

      // Verify the service exists.
      const service = await findServiceById(database, serviceId);
      if (service === null) {
        throw new AppError({
          code: 'NOT_FOUND',
          statusCode: 404,
          message: `Service not found: ${serviceId}`,
        });
      }

      const query = request.query as MeasurementListQuery;
      const result = await listMeasurementsForService(
        database,
        serviceId,
        query,
        clock.now(),
      );
      return reply.code(200).send(result);
    },
  );
}
