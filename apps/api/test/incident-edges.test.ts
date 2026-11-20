import { describe, expect, it } from 'vitest';

import { decide, snapshotService, type IncidentRow } from '../src/services/incident-service-horizon.js';

describe('incident detector transitions', () => {
  it('resolves an open incident when the service becomes healthy', () => {
    const open: IncidentRow = {
      id: 'svc-0001',
      service_id: 'svc',
      incident_type: 'SERVICE_STALE',
      status: 'open',
      opened_at: 1000,
      resolved_at: null,
    };

    const decision = decide('healthy', open, 5000);
    expect(decision).toMatchObject({ action: 'resolve', resolvedAt: 5000 });
  });

  it('does not resolve when there is no open incident even if healthy', () => {
    const decision = decide('healthy', null, 5000);
    expect(decision).toMatchObject({ action: 'noop' });
  });

  it('creates a new open incident when the service is stale and no open incident exists', () => {
    const decision = decide('stale', null, 5000);
    expect(decision).toMatchObject({
      action: 'create',
      reason: 'service heartbeat is stale',
      expectedHeartbeatAfter: 5000,
    });
  });

  it('does nothing when the service is stale but an open incident already exists', () => {
    const open: IncidentRow = {
      id: 'svc-0001',
      service_id: 'svc',
      incident_type: 'SERVICE_STALE',
      status: 'open',
      opened_at: 1000,
      resolved_at: null,
    };

    const decision = decide('stale', open, 5000);
    expect(decision).toMatchObject({ action: 'noop' });
  });

  it('ignores unknown status without opening or resolving', () => {
    const open: IncidentRow = {
      id: 'svc-0001',
      service_id: 'svc',
      incident_type: 'SERVICE_STALE',
      status: 'open',
      opened_at: 1000,
      resolved_at: null,
    };

    expect(decide('unknown', null, 5000)).toMatchObject({ action: 'ignore' });
    expect(decide('unknown', open, 5000)).toMatchObject({ action: 'ignore' });
  });

  it('creates a new incident after recovery and renewed staleness', () => {
    const oldOpen: IncidentRow = {
      id: 'svc-0001',
      service_id: 'svc',
      incident_type: 'SERVICE_STALE',
      status: 'open',
      opened_at: 1000,
      resolved_at: null,
    };

    // Recovery: healthy with open incident -> resolve.
    expect(decide('healthy', oldOpen, 3000)).toMatchObject({ action: 'resolve', resolvedAt: 3000 });

    // Renewed staleness with no open incident -> new incident.
    const renewed = decide('stale', null, 6000);
    expect(renewed).toMatchObject({
      action: 'create',
      reason: 'service heartbeat is stale',
      expectedHeartbeatAfter: 6000,
    });
  });
});

describe('service snapshot helper', () => {
  it('classifies healthy when within threshold', () => {
    const snapshot = snapshotService(1000, 1500, 1000);
    expect(snapshot.status).toBe('healthy');
    expect(snapshot.latestHeartbeatReceivedAt).toBe(1000);
    expect(snapshot.expectedHeartbeatAfter).toBe(2000);
  });

  it('classifies stale when past threshold', () => {
    const snapshot = snapshotService(1000, 2501, 1000);
    expect(snapshot.status).toBe('stale');
    expect(snapshot.expectedHeartbeatAfter).toBe(2000);
  });

  it('classifies unknown when no heartbeat exists', () => {
    const snapshot = snapshotService(null, 5000, 1000);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.latestHeartbeatReceivedAt).toBeNull();
  });
});
