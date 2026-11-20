import { randomBytes } from 'node:crypto';
import type { Database } from '../ports.js';

export async function createIncidentId(_database: Database, _serviceId: string): Promise<string> {
  // Standalone 21-character URL-safe incident ids.
  // Uniqueness is enforced by the incidents.id primary key, not by the id shape.
  return randomBytes(16).toString('base64url').slice(0, 21);
}

