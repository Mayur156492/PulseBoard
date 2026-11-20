import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config.js';
import type { Clock, Database } from '../ports.js';
import {
  listIncidentsForService,
  findIncidentById,
} from '../services/incident-service-horizon.js';
import { INCIDENT_ID_PATTERN } from '../incident-service.js';
import type {
  IncidentListQuery,
  IncidentResponse as IncidentContractResponse,
} from '@pulseboard/shared';
import { AppError } from '../errors.js';
import { findServiceById } from '../services/service-repository.js';

export interface IncidentRouteDependencies {
  readonly database: Database;
  readonly clock: Clock;
  readonly config: ApiConfig;
}

/**
 * Registers the incident listing and inspection routes.
 *
 * GET /incidents                -> 200
 * GET /incidents/:incidentId   -> 200 / 404
 */
export function registerIncidentRoutes(
  app: FastifyInstance,
  deps: IncidentRouteDependencies,
): void {
  const { database, clock } = deps;

  app.get(
    '/incidents',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: ['integer', 'string'] },
            cursor: { type: 'string' },
            serviceId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['open', 'resolved'],
            },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              incidents: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    serviceId: { type: 'string' },
                    incidentType: { type: 'string' },
                    status: { type: 'string' },
                    openedAt: { type: 'integer' },
                    resolvedAt: { type: ['integer', 'null'] },
                  },
                  required: [
                    'id',
                    'serviceId',
                    'incidentType',
                    'status',
                    'openedAt',
                    'resolvedAt',
                  ],
                },
              },
              nextCursor: { type: 'string' },
            },
            required: ['incidents'],
          },
        },
      },
    },
    async (request, reply) => {
      const query = request.query as IncidentListQuery;

      if (query.serviceId !== undefined) {
        const serviceId = query.serviceId;
        if (typeof serviceId === 'string' && serviceId.trim().length > 0) {
          const service = await findServiceById(database, serviceId);
          if (service === null) {
            throw new AppError({
              code: 'NOT_FOUND',
              statusCode: 404,
              message: `Service not found: ${serviceId}`,
            });
          }
        }
      }

      const result = await listIncidentsForService(database, query, clock.now());
      return reply.code(200).send({
        incidents: result.incidents,
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
      });
    },
  );

  app.get(
    '/incidents/:incidentId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', pattern: INCIDENT_ID_PATTERN.source },
          },
          required: ['incidentId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              serviceId: { type: 'string' },
              incidentType: { type: 'string' },
              status: { type: 'string' },
              openedAt: { type: 'integer' },
              resolvedAt: { type: ['integer', 'null'] },
            },
            required: [
              'id',
              'serviceId',
              'incidentType',
              'status',
              'openedAt',
              'resolvedAt',
            ],
          },
        },
      },
    },
    async (request, reply) => {
      const incidentId = (request.params as { incidentId: string }).incidentId;

      const incident = await findIncidentById(database, incidentId);
      if (incident === null) {
        throw new AppError({
          code: 'NOT_FOUND',
          statusCode: 404,
          message: `Incident not found: ${incidentId}`,
        });
      }

      const response: IncidentContractResponse = {
        id: incident.id,
        serviceId: incident.serviceId,
        incidentType: incident.incidentType,
        status: incident.status,
        openedAt: incident.openedAt,
        resolvedAt: incident.resolvedAt,
      };

      return reply.code(200).send(response);
    },
  );
}
