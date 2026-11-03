import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FiraLinhPreview } from '../../lib/frms/fira-service';
import { buildSelectedDaysForSigvoosImport, syncSigvoosForFrms } from '../../services/sigvoos-frms';

function preview(day: number, jornadaId: string): FiraLinhPreview {
  return {
    dia: day,
    data: `2026-11-${String(day).padStart(2, '0')}`,
    status_fira: 'ES',
    status_frms: 'ES',
    hora_apresentacao: '08:00',
    hora_termino: '10:00',
    duracao_jornada_min: 120,
    horas_voo_min: 60,
    local_base: 'SBRJ',
    situacao: 'DUPLICATA',
    jornada_existente_id: jornadaId,
    marcado: true,
  };
}

describe('SIGVOOS replacement candidate lookup: tenant boundary', () => {

  it('rejects the entire sync before an external request or any write if tenant is unresolved', async () => {
    const db = {
      prepare: vi.fn(() => ({ all: async () => ({ results: [] }) })),
      batch: vi.fn(), exec: vi.fn(), withSession: vi.fn(), dump: vi.fn(),
    } as D1Database;
    await expect(syncSigvoosForFrms(db, null, 'qa', {} as Parameters<typeof syncSigvoosForFrms>[3]))
      .rejects.toThrow('SIGVOOS_TENANT_REQUIRED');
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('scopes real enrichment and relabel UPDATE queries to the intended company', () => {
    const source = readFileSync('src/services/sigvoos-frms.ts', 'utf8');
    const query = (functionName: string) => {
      const start = source.indexOf('async function ' + functionName + '(');
      if (start < 0) throw new Error('No SIGVOOS function ' + functionName);
      const quote = String.fromCharCode(96);
      const from = source.indexOf(quote + 'UPDATE frms_jornada', start);
      const to = source.indexOf(quote, from + 1);
      if (from < 0 || to < 0) throw new Error('No SQL in ' + functionName);
      return source.slice(from + 1, to).replace('
  it('refuses to consider duplicate journeys without a valid empresa_id', async () => {
    const db = { prepare: vi.fn(), batch: vi.fn(), exec: vi.fn(), withSession: vi.fn(), dump: vi.fn() } as D1Database;
    await expect(buildSelectedDaysForSigvoosImport(db, [preview(3, 'other')], null))
      .rejects.toThrow('SIGVOOS_REPLACEMENT_REQUIRES_EMPRESA_ID');
    await expect(buildSelectedDaysForSigvoosImport(db, [preview(3, 'other')], 0))
      .rejects.toThrow('SIGVOOS_REPLACEMENT_REQUIRES_EMPRESA_ID');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('does not replace another company journey even if its ID is supplied in a preview', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE frms_jornada (
          id TEXT PRIMARY KEY, origem TEXT, empresa_id INTEGER,
          hora_apresentacao TEXT, hora_termino TEXT,
          horas_voo_minutos INTEGER, duracao_jornada_minutos INTEGER,
          registrado_por TEXT, observacao TEXT
        );
        INSERT INTO frms_jornada VALUES
          ('our-sigvoos', 'SIGVOOS', 7, '08:00','10:00',60,120,NULL,NULL),
          ('other-sigvoos','SIGVOOS',8,'08:00','10:00',60,120,NULL,NULL);
      `);
      const seen: Array<{ sql: string; binds: unknown[] }> = [];
      const db = {
        prepare(sql: string) {
          return {
            bind(...binds: unknown[]) {
              seen.push({ sql, binds });
              return {
                async all() {
                  return { results: sqlite.prepare(sql).all(...binds) };
                },
              };
            },
          };
        },
      } as D1Database;

      const result = await buildSelectedDaysForSigvoosImport(db, [
        preview(3, 'our-sigvoos'), preview(4, 'other-sigvoos'),
      ], 7);
      expect(result).toEqual({
        selectedDays: [
          { dia: 3, forcar_substituicao: true },
          { dia: 4, forcar_substituicao: false },
        ],
        relabelDates: ['2026-11-03'],
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].sql).toMatch(/WHERE id IN \(\?, \?\) AND empresa_id = \?/);
      expect(seen[0].binds).toEqual(['our-sigvoos', 'other-sigvoos', 7]);
    } finally {
      sqlite.close();
    }
  });
});
 + '{placeholders}', '?');
    };
    const relabelSql = query('relabelImportedJornadasAsSigvoos');
    const enrichSql = query('enrichImportedSigvoosJornadas');
    expect(relabelSql).toContain('AND tripulante_id = ? AND empresa_id = ?');
    expect(enrichSql).toContain('AND tripulante_id = ? AND empresa_id = ?');

    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec("CREATE TABLE frms_jornada (id TEXT, empresa_id INTEGER, origem TEXT, tripulante_id INTEGER, data TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, matricula_aeronave TEXT, tempo_noturno_str TEXT, tempo_ifr_str TEXT, fonte_resolucao_sigvoos TEXT)");
      db.exec("INSERT INTO frms_jornada (id,empresa_id,origem,tripulante_id,data,created_at) VALUES ('own',7,'FIRA',70,'2026-11-03','2026-11-03 07:05:00'),('foreign',8,'FIRA',70,'2026-11-03','2026-11-03 07:05:00')");
      db.prepare(relabelSql).run(70, 7, '2026-11-03', '2026-11-03 07:00:00');
      db.prepare(enrichSql).run('PR-ABC', '00:12', '00:09', 'CANAC', 70, 7, '2026-11-03');
      const rows = db.prepare('SELECT id, origem, matricula_aeronave, fonte_resolucao_sigvoos FROM frms_jornada ORDER BY id').all();
      expect(rows).toEqual([
        { id: 'foreign', origem: 'FIRA', matricula_aeronave: null, fonte_resolucao_sigvoos: null },
        { id: 'own', origem: 'SIGVOOS', matricula_aeronave: 'PR-ABC', fonte_resolucao_sigvoos: 'CANAC' },
      ]);
    } finally {
      db.close();
    }
  });


  it('refuses to consider duplicate journeys without a valid empresa_id', async () => {
    const db = { prepare: vi.fn(), batch: vi.fn(), exec: vi.fn(), withSession: vi.fn(), dump: vi.fn() } as D1Database;
    await expect(buildSelectedDaysForSigvoosImport(db, [preview(3, 'other')], null))
      .rejects.toThrow('SIGVOOS_REPLACEMENT_REQUIRES_EMPRESA_ID');
    await expect(buildSelectedDaysForSigvoosImport(db, [preview(3, 'other')], 0))
      .rejects.toThrow('SIGVOOS_REPLACEMENT_REQUIRES_EMPRESA_ID');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('does not replace another company journey even if its ID is supplied in a preview', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE frms_jornada (
          id TEXT PRIMARY KEY, origem TEXT, empresa_id INTEGER,
          hora_apresentacao TEXT, hora_termino TEXT,
          horas_voo_minutos INTEGER, duracao_jornada_minutos INTEGER,
          registrado_por TEXT, observacao TEXT
        );
        INSERT INTO frms_jornada VALUES
          ('our-sigvoos', 'SIGVOOS', 7, '08:00','10:00',60,120,NULL,NULL),
          ('other-sigvoos','SIGVOOS',8,'08:00','10:00',60,120,NULL,NULL);
      `);
      const seen: Array<{ sql: string; binds: unknown[] }> = [];
      const db = {
        prepare(sql: string) {
          return {
            bind(...binds: unknown[]) {
              seen.push({ sql, binds });
              return {
                async all() {
                  return { results: sqlite.prepare(sql).all(...binds) };
                },
              };
            },
          };
        },
      } as D1Database;

      const result = await buildSelectedDaysForSigvoosImport(db, [
        preview(3, 'our-sigvoos'), preview(4, 'other-sigvoos'),
      ], 7);
      expect(result).toEqual({
        selectedDays: [
          { dia: 3, forcar_substituicao: true },
          { dia: 4, forcar_substituicao: false },
        ],
        relabelDates: ['2026-11-03'],
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].sql).toMatch(/WHERE id IN \(\?, \?\) AND empresa_id = \?/);
      expect(seen[0].binds).toEqual(['our-sigvoos', 'other-sigvoos', 7]);
    } finally {
      sqlite.close();
    }
  });
});
