import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import type { FiraLinhPreview } from '../../lib/frms/fira-service';
import { buildSelectedDaysForSigvoosImport } from '../../services/sigvoos-frms';

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
