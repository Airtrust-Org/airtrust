import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { buildEmployeeQualificationStatsSql } from '../../../lib/qualificacoes/employee-dashboard-qualification-sql';

type Scalar = number | string | null;
type DB = {
  exec(sql: string): void;
  prepare(sql: string): { get(...args: Scalar[]): Record<string, Scalar> };
  close(): void;
};
const Database = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (name: string) => DB;

function withFixture<T>(run: (db: DB) => T): T {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT, ativo INTEGER
      );
      CREATE TABLE qualificacoes_tipos (
        id INTEGER, empresa_id INTEGER, deleted_at TEXT, codigo TEXT, validade INTEGER
      );
      CREATE TABLE qualificacoes_historico (
        id INTEGER, funcionario_id INTEGER, empresa_id INTEGER, deleted_at TEXT,
        status TEXT, renovacao_de INTEGER, qualificacao_id INTEGER,
        qualificacao_codigo TEXT, validade_meses INTEGER, data_conclusao TEXT,
        data_vencimento TEXT, created_at TEXT, updated_at TEXT
      );
      INSERT INTO funcionarios VALUES (1,6,NULL,1),(2,6,NULL,1),(3,7,NULL,1);
      INSERT INTO qualificacoes_tipos VALUES
        (10,6,NULL,'CMA',12),
        (20,6,NULL,'CRM',12),
        (30,7,NULL,'CMA',12);
      INSERT INTO qualificacoes_historico
      (id,funcionario_id,empresa_id,deleted_at,status,renovacao_de,qualificacao_id,
       qualificacao_codigo,validade_meses,data_conclusao,data_vencimento)
      VALUES
        (80,1,6,NULL,'CONCLUIDA',NULL,10,'CMA',12,'2025-08-01','2026-08-01'),
        (10,1,6,NULL,'CONCLUIDA',NULL,10,'CMA',12,'2026-10-01','2027-10-01'),
        (90,1,6,NULL,'CANCELADA',10,10,'CMA',12,'2026-11-13','2028-11-13'),
        (91,1,6,NULL,'PLANEJADA',NULL,10,'CMA',12,NULL,'2028-12-31'),
        (12,1,6,NULL,'CONCLUIDA',NULL,20,'CRM',12,'2026-01-01','2026-06-01'),
        (4,1,6,NULL,'CONCLUIDA',12,20,'CRM',12,'2026-11-01','2027-11-01'),
        (3,2,6,NULL,'CONCLUIDA',NULL,10,'CMA',12,'2026-05-13','2026-11-13'),
        (102,2,6,NULL,'CANCELADA',3,10,'CMA',12,'2026-11-13','2027-11-13'),
        (7,3,7,NULL,'CONCLUIDA',NULL,30,'CMA',12,'2026-10-01','2027-10-01'),
        (8,1,7,NULL,'CONCLUIDA',NULL,30,'CMA',12,'2026-10-01','2027-10-01');
    `);
    return run(db);
  } finally { db.close(); }
}

describe('F14-01/F14-02 — estatística de funcionários no SQL operacional canônico', () => {
  const sql = buildEmployeeQualificationStatsSql('COALESCE(f.ativo,1)=1', '1=1');

  it('usa a conclusão mais recente, não maior id; ignora cancelada/planejada e isola tenant', () => {
    const rows = withFixture((db) => db.prepare(sql).get(6, '2026-11-14', '2026-11-14'));
    expect(rows).toMatchObject({
      funcionarios_com_qualificacoes: 2,
      total_qualificacoes: 3,
      qualificacoes_validas: 2,
      qualificacoes_vencidas: 1,
    });
  });

  it('respeita data civil: vencimento no dia ainda é válido, depois passa a vencido', () => {
    const rows = withFixture((db) => {
      db.exec("UPDATE qualificacoes_historico SET data_vencimento='2026-11-14' WHERE id=3;");
      return [
        db.prepare(sql).get(6,'2026-11-14','2026-11-14'),
        db.prepare(sql).get(6,'2026-11-15','2026-11-15'),
      ];
    });
    expect(rows[0]).toMatchObject({ qualificacoes_validas: 3, qualificacoes_vencidas: 0 });
    expect(rows[1]).toMatchObject({ qualificacoes_validas: 2, qualificacoes_vencidas: 1 });
  });

  it('não conta histórico de outra empresa mesmo que funcionario_id coincida', () => {
    const rows = withFixture((db) => db.prepare(sql).get(7, '2026-11-14', '2026-11-14'));
    expect(rows).toMatchObject({
      funcionarios_com_qualificacoes: 1,
      total_qualificacoes: 1,
      qualificacoes_validas: 1,
      qualificacoes_vencidas: 0,
    });
  });
});
