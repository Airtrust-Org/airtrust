import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { syncSigvoosForFrms } from '../../services/sigvoos-frms';

describe('SIGVOOS: all writes require tenant identity', () => {
  it('stops unresolved-company sync before any mutation or external HTTP', async () => {
    const db = {
      prepare: vi.fn(() => ({
        all: async () => ({ results: [], success: true, meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0, size_after: 0, changed_db: false } }),
        first: async () => null, run: vi.fn(),
        raw: vi.fn(), bind: vi.fn(),
      })),
      batch: vi.fn(), exec: vi.fn(), withSession: vi.fn(), dump: vi.fn(),
    } as D1Database;
    await expect(syncSigvoosForFrms(
      db, null, 'qa', {} as Parameters<typeof syncSigvoosForFrms>[3],
    )).rejects.toThrow('SIGVOOS_TENANT_REQUIRED');
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('relabel and enrichment UPDATE SQL cannot cross tenants even for a shared employee ID', () => {
    const source = readFileSync('src/services/sigvoos-frms.ts', 'utf8');
    function sqlFor(functionName: string): string {
      const start = source.indexOf('async function ' + functionName + '(');
      if (start < 0) throw new Error('missing function');
      const tick = String.fromCharCode(96);
      const from = source.indexOf(tick + 'UPDATE frms_jornada', start);
      const to = source.indexOf(tick, from + 1);
      if (from < 0 || to < 0) throw new Error('missing SQL query');
      return source.slice(from + 1, to).replace('$' + '{placeholders}', '?');
    }
    const relabel = sqlFor('relabelImportedJornadasAsSigvoos');
    const enrich = sqlFor('enrichImportedSigvoosJornadas');
    expect(relabel).toContain('AND tripulante_id = ? AND empresa_id = ?');
    expect(enrich).toContain('AND tripulante_id = ? AND empresa_id = ?');

    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec("CREATE TABLE frms_jornada (id TEXT, empresa_id INTEGER, origem TEXT, tripulante_id INTEGER, data TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, matricula_aeronave TEXT, tempo_noturno_str TEXT, tempo_ifr_str TEXT, fonte_resolucao_sigvoos TEXT)");
      db.exec("INSERT INTO frms_jornada (id,empresa_id,origem,tripulante_id,data,created_at) VALUES ('own',7,'FIRA',70,'2026-11-03','2026-11-03 07:05:00'),('foreign',8,'FIRA',70,'2026-11-03','2026-11-03 07:05:00')");
      db.prepare(relabel).run(70, 7, '2026-11-03', '2026-11-03 07:00:00');
      db.prepare(enrich).run('PR-ABC', '00:12', '00:09', 'CANAC', 70, 7, '2026-11-03');
      const rows = db.prepare('SELECT id, origem, matricula_aeronave, fonte_resolucao_sigvoos FROM frms_jornada ORDER BY id').all();
      expect(rows).toEqual([
        { id: 'foreign', origem: 'FIRA', matricula_aeronave: null, fonte_resolucao_sigvoos: null },
        { id: 'own', origem: 'SIGVOOS', matricula_aeronave: 'PR-ABC', fonte_resolucao_sigvoos: 'CANAC' },
      ]);
    } finally {
      db.close();
    }
  });
});
