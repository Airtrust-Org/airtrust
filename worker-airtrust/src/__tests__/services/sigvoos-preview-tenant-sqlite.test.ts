import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { buildSigvoosMonthlyPreview } from '../../services/sigvoos-frms';

describe('SIGVOOS monthly preview tenant identity', () => {
  it('ignores another company journey with the same crew ID and date, but detects its own duplicate', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(
        'CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, empresa_id INTEGER, tripulante_id INTEGER, data TEXT, deleted_at TEXT)',
      );
      sqlite.exec("INSERT INTO frms_jornada VALUES ('foreign-day', 8, 70, '2026-11-02', NULL)");
      const db = {
        prepare(sql: string) {
          return {
            bind(...args: (string | number)[]) {
              return {
                async all() {
                  return { results: sqlite.prepare(sql).all(...args) };
                },
              };
            },
          };
        },
      } as D1Database;

      const build = () => buildSigvoosMonthlyPreview({
        db,
        empresaId: 7,
        importacaoId: 'preview-tenant-7',
        tripulanteId: '70',
        tripulanteNomeFira: 'TRIPULANTE TESTE',
        tripulanteNomeSistema: 'Tripulante Teste',
        canac: '12345',
        identificadorSigvoos: null,
        fonteResolucao: 'CANAC',
        ano: 2026,
        mes: 11,
        groupedDays: [{
          canac: '12345',
          identificadorSigvoos: null,
          tripulanteNome: 'TRIPULANTE TESTE',
          data: '2026-11-02',
          dia: 2,
          horaApresentacao: '07:00',
          horaTermino: '09:00',
          horasVooMin: 50,
          localBase: 'SBRJ',
          matriculaAeronave: 'PR-TEST',
          tempoNoturnoMin: 0,
          tempoIfrMin: 0,
          rawItems: [{ id: 1 }],
        }],
      });

      const withoutOwn = await build();
      expect(withoutOwn.preview.empresa_id).toBe(7);
      expect(withoutOwn.preview.linhas[0]).toMatchObject({
        situacao: 'NOVO',
        jornada_existente_id: null,
      });

      sqlite.exec("INSERT INTO frms_jornada VALUES ('own-day', 7, 70, '2026-11-02', NULL)");
      const withOwn = await build();
      expect(withOwn.preview.linhas[0]).toMatchObject({
        situacao: 'DUPLICATA',
        jornada_existente_id: 'own-day',
      });
    } finally {
      sqlite.close();
    }
  });
});
