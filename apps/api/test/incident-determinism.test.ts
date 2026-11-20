import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  encodeIncidentCursor,
  decodeIncidentCursor,
  validateIncidentCursorFingerprint,
  listIncidentsForService,
} from '../src/services/incident-service-horizon.js';
import { DEFAULT_MIGRATIONS_DIR, loadMigrations, runMigrations } from '../src/db/migrations.js';
import { createTempDatabase, type TempDatabase } from './helpers/database.js';
import { makeTestServiceId } from './helpers/id-generation.js';
import type { Database } from '../src/ports.js';

function incidentId(serviceId: string, suffix: number): string {
  // Deterministic standalone 21-char incident ids for cursor/key usage.
  // Suffix is the most significant part, then serviceId text, so BINARY DESC
  // orders by suffix first, then by serviceId, which matches the assertions.
  const suffixPart = String(suffix).padStart(3, '0');
  const rest = Buffer.from(serviceId, 'utf8')
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 18)
    .padEnd(18, 'a');
  return suffixPart + rest;
}

describe('incident cursor encoding and decoding', () => {
  const serviceId = makeTestServiceId(1);

  it('rejects malformed JSON cursors', () => {
    expect(() => decodeIncidentCursor('not-json')).toThrow(/not valid JSON/);
    expect(() => decodeIncidentCursor('["array"]')).toThrow(/cursor is missing an id/);
    expect(() => decodeIncidentCursor('null')).toThrow(/cursor must be a JSON object/);
  });

  it('rejects cursors missing id or fingerprint', () => {
    expect(() => decodeIncidentCursor(JSON.stringify({ openedAt: 1 }))).toThrow(/cursor is missing an id/);
    expect(() => decodeIncidentCursor(JSON.stringify({ id: 'x' }))).toThrow(/cursor contains an invalid incident id/);
  });

  it('rejects cursors with an invalid incident id', () => {
    expect(() =>
      decodeIncidentCursor(JSON.stringify({ id: 'not-an-incident', openedAt: 1, fingerprint: { limit: 20 } })),
    ).toThrow(/cursor contains an invalid incident id/);
  });

  it('rejects cursors with an invalid openedAt', () => {
    expect(() =>
      decodeIncidentCursor(JSON.stringify({ id: incidentId(serviceId, 1), openedAt: '1', fingerprint: { limit: 20 } })),
    ).toThrow(/invalid openedAt/);
  });

  it('rejects cursors with an invalid limit', () => {
    expect(() =>
      decodeIncidentCursor(JSON.stringify({ id: incidentId(serviceId, 1), openedAt: 1, fingerprint: { limit: 0 } })),
    ).toThrow(/invalid limit/);
    expect(() =>
      decodeIncidentCursor(JSON.stringify({ id: incidentId(serviceId, 1), openedAt: 1, fingerprint: { limit: 101 } })),
    ).toThrow(/invalid limit/);
  });

  it('rejects cursors with an invalid serviceId fingerprint', () => {
    expect(() =>
      decodeIncidentCursor(JSON.stringify({ id: incidentId(serviceId, 1), openedAt: 1, fingerprint: { limit: 20, serviceId: 123 } })),
    ).toThrow(/invalid serviceId/);
  });

  it('rejects cursors with an invalid status fingerprint', () => {
    expect(() =>
      decodeIncidentCursor(JSON.stringify({ id: incidentId(serviceId, 1), openedAt: 1, fingerprint: { limit: 20, status: 'investigating' } })),
    ).toThrow(/invalid status/);
  });

  it('accepts a valid cursor and round-trips the fingerprint', () => {
    const id = incidentId(serviceId, 1);
    const openedAt = 1_700_000_000_000;
    const cursor = encodeIncidentCursor({ id, openedAt }, { serviceId: null, status: null, limit: 20 });
    const decoded = decodeIncidentCursor(cursor);
    expect(decoded.id).toBe(id);
    expect(decoded.openedAt).toBe(openedAt);
    expect(decoded.fingerprint).toEqual({ serviceId: null, status: null, limit: 20 });
  });

  it('accepts cursors with status fingerprint "all" and normalizes to null', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { limit: 20, status: 'all' },
      }),
    );
    expect(cursor.fingerprint.status).toBeNull();
  });

  it('rejects cursors with an invalid openedAt before validating the id', () => {
    // The validator runs on the id first, so once id is valid the openedAt
    // rejection should surface with its own message.
    const cursorWithValidId = JSON.stringify({
      id: incidentId(serviceId, 1),
      openedAt: 'not-a-number',
      fingerprint: { limit: 20, serviceId: null, status: null },
    });
    expect(() => decodeIncidentCursor(cursorWithValidId)).toThrow(/invalid openedAt/);
  });

  it('rejects cursors with an invalid limit before validating other fields', () => {
    const cursorWithValidId = JSON.stringify({
      id: incidentId(serviceId, 1),
      openedAt: 1,
      fingerprint: { limit: 200, serviceId: null, status: null },
    });
    expect(() => decodeIncidentCursor(cursorWithValidId)).toThrow(/invalid limit/);
  });

  it('rejects cursors with an invalid serviceId fingerprint once id is valid', () => {
    const cursorWithValidId = JSON.stringify({
      id: incidentId(serviceId, 1),
      openedAt: 1,
      fingerprint: { limit: 20, serviceId: 123, status: null },
    });
    expect(() => decodeIncidentCursor(cursorWithValidId)).toThrow(/invalid serviceId/);
  });

  it('rejects cursors with an invalid status fingerprint once id is valid', () => {
    const cursorWithValidId = JSON.stringify({
      id: incidentId(serviceId, 1),
      openedAt: 1,
      fingerprint: { limit: 20, serviceId: null, status: 'investigating' },
    });
    expect(() => decodeIncidentCursor(cursorWithValidId)).toThrow(/invalid status/);
  });
});

describe('incident cursor fingerprint validation', () => {
  const serviceId = makeTestServiceId(2);

  it('fails when openedAt fingerprint does not match', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: null, status: null, limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 2, { serviceId: null, status: null, limit: 20 }),
    ).toThrow(/cursor openedAt does not match the request/);
  });

  it('fails when serviceId fingerprint does not match', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: 'other', status: null, limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId, status: null, limit: 20 }),
    ).toThrow(/cursor serviceId does not match the request/);
  });

  it('fails when status fingerprint does not match', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: null, status: 'resolved', limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId: null, status: 'open', limit: 20 }),
    ).toThrow(/cursor status does not match the request/);
  });

  it('fails when limit fingerprint does not match', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: null, status: null, limit: 10 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId: null, status: null, limit: 20 }),
    ).toThrow(/cursor limit does not match the request/);
  });

  it('fails when both serviceId fingerprints are null but the request is not null', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: null, status: null, limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId, status: null, limit: 20 }),
    ).toThrow(/cursor serviceId does not match the request/);
  });

  it('fails when both status fingerprints are null but the request is not null', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: null, status: null, limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId: null, status: 'open', limit: 20 }),
    ).toThrow(/cursor status does not match the request/);
  });

  it('passes when fingerprints match exactly including null filters', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: null, status: null, limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId: null, status: null, limit: 20 }),
    ).not.toThrow();
  });

  it('passes when fingerprints match exactly with non-null filters', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId, status: 'open', limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId, status: 'open', limit: 20 }),
    ).not.toThrow();
  });

  it('passes when fingerprints match with status "all" normalized to null', () => {
    const cursor = decodeIncidentCursor(
      JSON.stringify({
        id: incidentId(serviceId, 1),
        openedAt: 1,
        fingerprint: { serviceId: null, status: 'all', limit: 20 },
      }),
    );
    expect(() =>
      validateIncidentCursorFingerprint(cursor, 1, { serviceId: null, status: null, limit: 20 }),
    ).not.toThrow();
  });
});

describe('incident list cursor pagination determinism', () => {
  let temp: TempDatabase;
  let db: Database;
  const serviceA = makeTestServiceId(10);
  const serviceB = makeTestServiceId(11);

  beforeEach(async () => {
    temp = await createTempDatabase();
    db = temp.database;

    const migrations = await loadMigrations(DEFAULT_MIGRATIONS_DIR);
    await runMigrations(db, migrations);

    await db.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceA, 'service-a', Date.now()],
    );
    await db.execute(
      `INSERT INTO services (id, name, description, created_at) VALUES (?, ?, NULL, ?)`,
      [serviceB, 'service-b', Date.now()],
    );
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it('returns deterministic pages for tied opened_at with mixed-case ids', async () => {
    const epoch = 1_700_000_000_000;

    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 2), 'SERVICE_STALE', serviceA, 'open', epoch],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 1), 'SERVICE_STALE', serviceA, 'resolved', epoch],
    );

    const first = await listIncidentsForService(db, { limit: 1 }, Date.now());
    expect(first.incidents.length).toBeGreaterThanOrEqual(1);
    expect(first.incidents[0]!.id).toBe(incidentId(serviceA, 2));
    expect(first.incidents[0]!.status).toBe('open');

    const second = await listIncidentsForService(db, { limit: 1, cursor: first.nextCursor }, Date.now());
    expect(second.incidents.length).toBeGreaterThanOrEqual(1);
    expect(second.incidents[0]!.id).toBe(incidentId(serviceA, 1));
    expect(second.incidents[0]!.status).toBe('resolved');
    expect(second.nextCursor).toBeUndefined();

    // Public response shape must be the six-field model.
    for (const incident of first.incidents) {
      expect(incident).toHaveProperty('id');
      expect(incident).toHaveProperty('serviceId');
      expect(incident).toHaveProperty('incidentType');
      expect(incident).toHaveProperty('status');
      expect(incident).toHaveProperty('openedAt');
      expect(incident).toHaveProperty('resolvedAt');
      expect(incident).not.toHaveProperty('serviceName');
      expect(incident).not.toHaveProperty('reason');
      expect(incident).not.toHaveProperty('lastEventAt');
      expect(incident).not.toHaveProperty('expectedHeartbeatAfter');
    }
    expect(first.incidents[0]!.resolvedAt).toBeNull();
    expect(second.incidents[0]!.resolvedAt).toBeNull();
  });

  it('does not duplicate or omit rows across full traversal', async () => {
    const epoch = 1_700_000_000_000;

    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 9), 'SERVICE_STALE', serviceA, 'resolved', epoch],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceB, 5), 'SERVICE_STALE', serviceB, 'open', epoch],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 2), 'SERVICE_STALE', serviceA, 'open', epoch],
    );
    await db.execute(
      `INSERT INTO incidents (id, incident_type, service_id, status, opened_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      [incidentId(serviceA, 1), 'SERVICE_STALE', serviceA, 'resolved', epoch],
    );

    const collected: { id: string }[] = [];
    let cursor: string | undefined = undefined;

    while (true) {
      const page = await listIncidentsForService(db, { limit: 1, cursor }, Date.now());
      for (const incident of page.incidents) {
        collected.push({ id: incident.id });
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    const expected = [
      incidentId(serviceA, 9),
      incidentId(serviceB, 5),
      incidentId(serviceA, 2),
      incidentId(serviceA, 1),
    ];
    expect(collected.map((r) => r.id)).toEqual(expected);
  });
});
