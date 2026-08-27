/**
 * Fix 7 — activating/replacing a SCORM package invalidates the informational
 * completion-diagnostic snapshots for that course, tenant-scoped.
 *
 * `lms_completion_diagnostics_snapshots` is keyed by
 * (empresa_id, matricula_id, curso_id, tentativa) — NOT by package identity —
 * so a stale "68%" snapshot would otherwise stay attached to the new package.
 * activateScormPackageVersion() now runs, after the successful pointer switch:
 *
 *   DELETE FROM lms_completion_diagnostics_snapshots
 *    WHERE empresa_id = ? AND curso_id = ?
 *
 * This test runs that exact fragment (mirrors lms-scorm-package-version-service.ts)
 * against real in-memory SQLite and proves:
 *   (1) snapshots for the activated course + tenant are cleared;
 *   (2) another tenant's snapshots for the same curso_id are untouched;
 *   (3) the same tenant's snapshots for a different course are untouched;
 *   (4) no matricula/completion/qualification table is referenced.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

let db: DatabaseSync;

beforeEach(() => {
  db = new NodeDatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE lms_completion_diagnostics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      matricula_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      tentativa INTEGER NOT NULL DEFAULT 1,
      diagnostics_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (empresa_id, matricula_id, curso_id, tentativa)
    );
  `);
  const ins = db.prepare(
    `INSERT INTO lms_completion_diagnostics_snapshots (empresa_id, matricula_id, curso_id, diagnostics_json)
     VALUES (?, ?, ?, ?)`,
  );
  ins.run(1, 100, 10, '{"pct":68}'); // tenant 1, curso 10  -> must be cleared
  ins.run(1, 101, 10, '{"pct":90}'); // tenant 1, curso 10  -> must be cleared
  ins.run(2, 200, 10, '{"pct":50}'); // tenant 2, curso 10  -> must survive
  ins.run(1, 102, 11, '{"pct":42}'); // tenant 1, curso 11  -> must survive
});

// mirrors src/lib/lms/lms-scorm-package-version-service.ts (activateScormPackageVersion)
const INVALIDATE_SQL =
  'DELETE FROM lms_completion_diagnostics_snapshots WHERE empresa_id = ? AND curso_id = ?';

describe('completion-diagnostics snapshot invalidation on package activation', () => {
  it('clears only the activated tenant+course snapshots', () => {
    db.prepare(INVALIDATE_SQL).run(1, 10);

    const rows = db
      .prepare(
        'SELECT empresa_id, curso_id FROM lms_completion_diagnostics_snapshots ORDER BY empresa_id, curso_id',
      )
      .all() as Array<{ empresa_id: number; curso_id: number }>;

    expect(rows).toEqual([
      { empresa_id: 1, curso_id: 11 },
      { empresa_id: 2, curso_id: 10 },
    ]);
  });

  it('is a no-op for a course with no snapshots', () => {
    const res = db.prepare(INVALIDATE_SQL).run(1, 999);
    expect(res.changes).toBe(0);
  });

  it('the production call site is tenant-scoped and touches no enrollment/completion table', () => {
    const svc = readFileSync(
      resolve(process.cwd(), 'src/lib/lms/lms-scorm-package-version-service.ts'),
      'utf8',
    );
    expect(svc).toContain(
      'DELETE FROM lms_completion_diagnostics_snapshots WHERE empresa_id = ? AND curso_id = ?',
    );
    const activateBody = svc.slice(
      svc.indexOf('export async function activateScormPackageVersion'),
      svc.indexOf('async function candidateAssets'),
    );
    expect(activateBody).toContain('.bind(params.empresaId, params.cursoId)');
    expect(activateBody).not.toMatch(/UPDATE lms_matriculas|qualificac|data_conclusao|lms_completion_events/i);
  });
});
