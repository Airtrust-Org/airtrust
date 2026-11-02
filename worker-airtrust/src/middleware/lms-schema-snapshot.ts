import type { Context, Next } from 'hono';

import {
  SNAPSHOT_KEY,
  assertLmsSchemaKnown,
  createSchemaSnapshotDb,
  detectLmsSchemaSnapshot,
  type LmsSchemaSnapshot,
} from '../lib/lms/lms-schema-state';
import type { Env } from '../types';
import { createLogger } from '../utils/logger';
import { ApiError } from './error-handler';

// Adaptador do Context do Hono para o snapshot de schema do LMS. A detecção e o
// DB com cache vivem em lib/lms/lms-schema-state (sem dependência do framework).

export function getLmsSchemaSnapshot(c: Context): LmsSchemaSnapshot {
  const snapshot = c.get(SNAPSHOT_KEY as never) as LmsSchemaSnapshot | undefined;
  if (!snapshot) throw new ApiError('Snapshot de schema LMS não inicializado', 500);
  return snapshot;
}

export async function installLmsSchemaSnapshot(c: Context<{ Bindings: Env }>, next: Next) {
  const originalDb = c.env.DB;
  const snapshot = await detectLmsSchemaSnapshot(originalDb);
  const requestId = String(c.get('requestId' as never) ?? c.req.header('x-request-id') ?? '');
  assertLmsSchemaKnown(snapshot, requestId || undefined, createLogger(c, 'LmsSchemaState'));

  c.set(SNAPSHOT_KEY as never, snapshot as never);
  c.env.DB = createSchemaSnapshotDb(originalDb, snapshot);
  await next();
}
