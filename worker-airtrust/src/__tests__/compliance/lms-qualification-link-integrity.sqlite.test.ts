import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { loadLmsEvidence } from '../../services/training-compliance-snapshot-builder';

// SQLite real com adaptador D1 mínimo: prova do JOIN e do isolamento por tenant,
// sem fabricar matrículas, provas, certificados nem históricos de produção.
function sqliteD1(sqlite: DatabaseSync): D1Database {
  const prepared = (sql: string, args: Array<string | number | null> = []) => ({
    bind: (...params: Array<string | number | null>) => prepared(sql, params),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  return { prepare: (sql: string) => prepared(sql) } as unknown as D1Database;
}

describe('F-03 — matriz Compliance exige histórico ativo para conclusão LMS qualificante', () => {
  it('rejeita vínculo ausente, excluído e cross-tenant; aceita vínculo correto e curso não qualificante', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE lms_cursos (id INTEGER, empresa_id INTEGER, qualificacao_tipo_id INTEGER,
          gerar_qualificacao_ao_concluir INTEGER, titulo TEXT, deleted_at TEXT);
        CREATE TABLE lms_matriculas (id INTEGER, empresa_id INTEGER, curso_id INTEGER,
          funcionario_id INTEGER, qualificacao_historico_id INTEGER, status TEXT,
          progresso_pct INTEGER, data_conclusao TEXT, updated_at TEXT, created_at TEXT,
          perfil_competencia TEXT, deleted_at TEXT);
        CREATE TABLE qualificacoes_historico (id INTEGER, empresa_id INTEGER, funcionario_id INTEGER,
          qualificacao_id INTEGER, data_conclusao TEXT, deleted_at TEXT);
        INSERT INTO lms_cursos VALUES
          (10,6,20,1,'Qualificante',NULL),
          (11,6,20,0,'Somente curso',NULL),
          (12,7,20,1,'Outra empresa',NULL);
        INSERT INTO qualificacoes_historico VALUES
          (101,6,1,20,'2026-11-01','2026-11-02'),
          (102,6,1,20,'2026-11-01',NULL),
          (103,7,1,20,'2026-11-01',NULL),
          (104,6,2,20,'2026-11-01',NULL);
        INSERT INTO lms_matriculas VALUES
          (1,6,10,1,NULL,'CONCLUIDO',100,'2026-11-01',NULL,'2026-11-01',NULL,NULL),
          (2,6,10,1,101,'CONCLUIDO',100,'2026-11-01',NULL,'2026-11-01',NULL,NULL),
          (3,6,10,1,102,'CONCLUIDO',100,'2026-11-01',NULL,'2026-11-01',NULL,NULL),
          (4,6,10,1,103,'CONCLUIDO',100,'2026-11-01',NULL,'2026-11-01',NULL,NULL),
          (5,6,11,1,NULL,'CONCLUIDO',100,'2026-11-01',NULL,'2026-11-01',NULL,NULL),
          (6,7,12,1,103,'CONCLUIDO',100,'2026-11-01',NULL,'2026-11-01',NULL,NULL),
          (7,6,10,1,104,'CONCLUIDO',100,'2026-11-01',NULL,'2026-11-01',NULL,NULL);
      `);
      const map = await loadLmsEvidence(sqliteD1(sqlite), 6);
      const byId = new Map((map.get('1:20') || []).map((item) => [item.origem_id, item]));
      expect(byId.size).toBe(6); // tenant 7 não participa
      for (const id of [1, 2, 4, 7]) {
        expect(byId.get(id)?.qualificacao_integridade_pendente).toBe(true);
      }
      for (const id of [3, 5]) {
        expect(byId.get(id)?.qualificacao_integridade_pendente).toBe(false);
      }
      expect(byId.has(6)).toBe(false);
    } finally {
      sqlite.close();
    }
  });
});
