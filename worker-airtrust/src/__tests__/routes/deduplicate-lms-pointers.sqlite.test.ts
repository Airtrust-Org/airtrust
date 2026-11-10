/**
 * #1492: deduplicar historicos nao pode deixar matricula/ciclo LMS apontando
 * para uma qualificacao soft-deletada. SQLite real (node:sqlite).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { buildDeduplicateLmsRepointSql } from '../../routes/deduplicate';

let sqlite: SqliteD1Database;

beforeEach(() => {
  sqlite = new SqliteD1Database();
  sqlite.database.exec(`
    ALTER TABLE qualificacoes_historico ADD COLUMN lms_matricula_id INTEGER;
    ALTER TABLE qualificacoes_historico ADD COLUMN lms_matricula_ciclo_id INTEGER;
    CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_historico_id INTEGER, updated_at TEXT);
    CREATE TABLE lms_matricula_ciclos (id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_historico_id INTEGER, updated_at TEXT);
    INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_codigo, data_conclusao, status, empresa_id, lms_matricula_id, lms_matricula_ciclo_id)
      VALUES (10, 1, 'X', '2026-01-01', 'CONCLUIDA', 6, 500, 900),
             (11, 1, 'X', '2026-01-01T10:00', 'CONCLUIDA', 6, NULL, NULL);
    INSERT INTO lms_matriculas VALUES (500, 6, 10, NULL), (501, 7, 10, NULL);
    INSERT INTO lms_matricula_ciclos VALUES (900, 6, 10, NULL), (901, 7, 10, NULL);
  `);
});
afterEach(() => sqlite.close());

describe('buildDeduplicateLmsRepointSql', () => {
  it('religa matricula/ciclo ao sobrevivente e herda o vinculo LMS, so no tenant', async () => {
    const sql = buildDeduplicateLmsRepointSql(1);
    await sqlite.prepare(sql.heranca).bind(6, 10, 6, 10, 6, 11).run();
    await sqlite.prepare(sql.matricula).bind(11, 6, 10).run();
    await sqlite.prepare(sql.ciclo).bind(11, 6, 10).run();

    const keeper = sqlite.database
      .prepare(
        'SELECT lms_matricula_id AS m, lms_matricula_ciclo_id AS c FROM qualificacoes_historico WHERE id = 11',
      )
      .get() as { m: number; c: number };
    expect(keeper).toEqual({ m: 500, c: 900 });
    const mats = sqlite.database
      .prepare('SELECT id, qualificacao_historico_id AS h FROM lms_matriculas ORDER BY id')
      .all();
    expect(mats).toEqual([
      { id: 500, h: 11 },
      { id: 501, h: 10 },
    ]);
    const cyc = sqlite.database
      .prepare('SELECT id, qualificacao_historico_id AS h FROM lms_matricula_ciclos ORDER BY id')
      .all();
    expect(cyc).toEqual([
      { id: 900, h: 11 },
      { id: 901, h: 10 },
    ]);
  });
});

describe('buildDeduplicateStatements respeita o limite de binds do D1', () => {
  for (const total of [50, 120]) {
    it(`grupo com ${total} registros (${total - 1} removidos): nenhum statement passa de 100 binds`, async () => {
      const { buildDeduplicateStatements } = await import('../../routes/deduplicate');
      const sizes: number[] = [];
      const db = {
        prepare: () => ({
          bind: (...values: unknown[]) => {
            sizes.push(values.length);
            return {};
          },
        }),
      } as unknown as D1Database;
      const removeIds = Array.from({ length: total - 1 }, (_, i) => 1000 + i);
      const statements = buildDeduplicateStatements(
        db,
        [
          {
            funcionario_id: 1,
            qualificacao_chave: 'X',
            qualificacao_id: 1,
            qualificacao_codigo: 'X',
            data_conclusao_dia: '2026-01-01',
            total,
            manter_id: 1,
            remover_ids: removeIds,
          },
        ],
        6,
      );
      expect(statements.length).toBe(sizes.length);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
    });
  }

  it('heranca em fatias ainda religa o vinculo LMS (SQLite real)', async () => {
    const sql = buildDeduplicateLmsRepointSql(1);
    sqlite.database.exec(
      `INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_codigo, data_conclusao, status, empresa_id)
       VALUES (12, 1, 'X', '2026-01-01T11:00', 'CONCLUIDA', 6)`,
    );
    await sqlite.prepare(sql.heranca).bind(6, 12, 6, 12, 6, 11).run();
    await sqlite.prepare(sql.heranca).bind(6, 10, 6, 10, 6, 11).run();
    const keeper = sqlite.database
      .prepare('SELECT lms_matricula_id AS m FROM qualificacoes_historico WHERE id = 11')
      .get() as { m: number };
    expect(keeper.m).toBe(500);
  });
});
