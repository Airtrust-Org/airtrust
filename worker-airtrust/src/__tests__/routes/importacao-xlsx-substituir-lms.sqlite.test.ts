/**
 * #1492: importacao XLSX em modo "substituir" nao pode apagar historicos
 * derivados do LMS (deixava matricula CONCLUIDA com ponteiro para qualificacao
 * apagada). SQLite real (node:sqlite).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { SUBSTITUIR_HISTORICO_DELETE_SQL } from '../../routes/importacao-xlsx';

let sqlite: SqliteD1Database;

beforeEach(() => {
  sqlite = new SqliteD1Database();
  sqlite.database.exec(`
    ALTER TABLE qualificacoes_historico ADD COLUMN lms_matricula_id INTEGER;
    ALTER TABLE qualificacoes_historico ADD COLUMN lms_matricula_ciclo_id INTEGER;
  `);
  const insert = sqlite.database.prepare(
    `INSERT INTO qualificacoes_historico
       (id, funcionario_id, qualificacao_codigo, data_conclusao, status, empresa_id, lms_matricula_id, lms_matricula_ciclo_id)
     VALUES (?, ?, 'X', ?, 'CONCLUIDA', ?, ?, ?)`,
  );
  insert.run(1, 1, '2026-01-01', 6, null, null); // planilha/manual
  insert.run(2, 2, '2026-01-02', 6, 500, null); // LMS
  insert.run(3, 3, '2026-01-03', 6, null, 900); // LMS por ciclo
  insert.run(4, 4, '2026-01-04', 7, null, null); // outro tenant
});
afterEach(() => sqlite.close());

describe('SUBSTITUIR_HISTORICO_DELETE_SQL', () => {
  it('soft-deleta so historico nao-LMS do tenant', async () => {
    await sqlite.prepare(SUBSTITUIR_HISTORICO_DELETE_SQL).bind(6).run();
    const rows = sqlite.database
      .prepare('SELECT id, deleted_at IS NOT NULL AS deleted FROM qualificacoes_historico ORDER BY id')
      .all() as Array<{ id: number; deleted: number }>;
    expect(rows.map((r) => [r.id, r.deleted])).toEqual([
      [1, 1],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
  });
});
