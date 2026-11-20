/**
 * Incident scheduler wiring for PulseBoard Milestone 4.
 *
 * This module owns the lifecycle glue between:
 * - the application startup/shutdown hooks,
 * - the incident scheduler loop,
 * - heartbeat-triggered coalesced evaluation,
 * - startup reconciliation.
 *
 * It must not import any HTTP framework. It only consumes the ports and the
 * existing service/heartbeat queries.
 */

import type { Clock, Database } from '../ports.js';
import { findServiceById } from '../services/service-repository.js';
import {
  findOpenIncidentByServiceId,
  updateIncident,
  createIncident,
  latestHeartbeatReceivedAtForService,
  classifyServiceStatus,
  decide,
} from '../services/incident-service-horizon.js';
import type { IncidentType } from '../incident-service.js';
import { createIncidentId as createIncidentIdFromGenerator } from '../services/incident-id-generator.js';

export interface IncidentSchedulerOptions {
  readonly staleThresholdMs: number;
  readonly tickIntervalMs: number;
  readonly incidentType: IncidentType;
}

interface PendingServiceEvaluation {
  readonly serviceId: string;
  readonly scheduledAt: number;
}

export interface IncidentSchedulerState {
  readonly pendingByService: Map<string, PendingServiceEvaluation>;
  readonly activeByService: Set<string>;
}

export function createIncidentSchedulerState(): IncidentSchedulerState {
  return {
    pendingByService: new Map(),
    activeByService: new Set(),
  };
}

export interface IncidentSchedulerHandle {
  readonly running: boolean;
  readonly shuttingDown: boolean;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly scheduleService: (serviceId: string) => void;
}

/**
 * Creates the incident scheduler closure.
 *
 * The returned handle is used by app wiring. `start()` runs startup
 * reconciliation and arms the periodic tick; `stop()` cancels the tick and
 * prevents new evaluations. The app owns the periodic timer handle so shutdown
 * can cancel it in the same place it cancels other timers.
 */
export function createIncidentScheduler(
  database: Database,
  clock: Clock,
  options: IncidentSchedulerOptions,
  state: IncidentSchedulerState,
  onArmTimer: (timerId: ReturnType<typeof setTimeout>) => void,
  onCancelTimer: () => void,
): IncidentSchedulerHandle {
  const incidentType = options.incidentType;
  let running = false;
  let shutdown = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let sweeping = false;

  const readPeriodicServiceIds = async (): Promise<readonly string[]> => {
    const rows = await database.query<{ id: string }>('SELECT id FROM services ORDER BY id');
    return rows.map((row) => row.id);
  };

  const startPeriodicTick = (): void => {
    const tick = async (): Promise<void> => {
      if (shutdown || sweeping) {
        if (!shutdown) {
          timerId = setTimeout(tick, options.tickIntervalMs);
          onArmTimer(timerId);
        }
        return;
      }

      sweeping = true;
      try {
        if (shutdown) {
          return;
        }

        const services = await readPeriodicServiceIds();
        for (const serviceId of services) {
          if (shutdown) {
            break;
          }
          scheduleServiceInternal(serviceId);
        }
      } finally {
        sweeping = false;
      }

      if (!shutdown) {
        timerId = setTimeout(tick, options.tickIntervalMs);
        onArmTimer(timerId);
      }
    };

    timerId = setTimeout(tick, options.tickIntervalMs);
    onArmTimer(timerId);
  };

  const stopPeriodicTick = (): void => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
      onCancelTimer();
    }
  };

  const scheduleServiceInternal = (serviceId: string): void => {
    if (shutdown) {
      return;
    }
    if (state.activeByService.has(serviceId)) {
      if (!state.pendingByService.has(serviceId)) {
        state.pendingByService.set(serviceId, {
          serviceId,
          scheduledAt: clock.now(),
        });
      }
      return;
    }
    state.activeByService.add(serviceId);
    evaluateService(serviceId).finally(() => {
      state.activeByService.delete(serviceId);
      const pending = state.pendingByService.get(serviceId);
      if (pending && !shutdown) {
        state.pendingByService.delete(serviceId);
        evaluateService(serviceId);
      }
    });
  };

  const evaluateService = async (serviceId: string): Promise<void> => {
    if (shutdown) {
      return;
    }
    if (!running) {
      return;
    }

    try {
      const service = await findServiceById(database, serviceId);
      if (service === null) {
        return;
      }

      const latestReceivedAt = await latestHeartbeatReceivedAtForService(database, serviceId);
      const now = clock.now();
      const currentIncident = await findOpenIncidentByServiceId(database, serviceId);
      const decision = decide(
        classifyServiceStatus(latestReceivedAt, now, options.staleThresholdMs),
        currentIncident,
        now,
      );
      if (decision.action === 'noop' || decision.action === 'ignore') {
        return;
      }
      if (decision.action === 'resolve') {
        if (currentIncident === null) {
          return;
        }
        await updateIncident(database, currentIncident.id, {
          status: 'resolved',
          resolvedAt: now,
        });
        return;
      }

      // stale + no open incident -> create
      const incidentId = await createIncidentIdFromGenerator(database, serviceId);

      await createIncident(database, {
        id: incidentId,
        incidentType,
        serviceId,
        status: 'open',
        openedAt: now,
      });

    } catch (error) {
      // Evaluation failures must not affect the HTTP heartbeat contract.
      // They are logged here; the heartbeat route itself only records received
      // time and returns its established response.
      console.error(
        `[incident] failed to evaluate service ${serviceId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return {
    get running() {
      return running;
    },
    get shuttingDown() {
      return shutdown;
    },
    start: async (): Promise<void> => {
      if (running) {
        return;
      }
      running = true;
      // Startup reconciliation before the first periodic tick.
      const services = await database.query<{ id: string }>('SELECT id FROM services ORDER BY id');
      for (const service of services) {
        if (shutdown) {
          break;
        }
        await evaluateService(service.id);
      }
      startPeriodicTick();
    },
    stop: async (): Promise<void> => {
      shutdown = true;
      stopPeriodicTick();
      await Promise.resolve();
    },
    scheduleService: (serviceId: string): void => {
      scheduleServiceInternal(serviceId);
    },
  } satisfies IncidentSchedulerHandle;
}
