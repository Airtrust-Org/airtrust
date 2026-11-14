import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  buildFicha360CurrentHistorySql,
  type Ficha360HistoryColumns,
} from '../../../lib/qualificacoes/ficha360-current-history-sql';

type Scalar = string | number | null;
type NativeDb = {
  exec(sql: string): void;
  prepare(sql: string): { all(...args: Scalar[]): Array<Record<string, unknown>> };
  close(): void;
};
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (filename: string) => NativeDb;
const modern: Ficha360HistoryColumns = {
  tipoCol:'qualificacao_id',inicioCol:'data_conclusao',fimCol:'data_vencimento',
  hasStatus:true,hasEmpresaId:true,hasRenewalLink:true,
};
function createDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE qualificacoes_tipos (
      id INTEGER, empresa_id INTEGER, codigo TEXT, nome TEXT, categoria TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER, funcionario_id INTEGER, empresa_id INTEGER, qualificacao_id INTEGER,
      data_conclusao TEXT, data_vencimento TEXT, status TEXT, renovacao_de INTEGER,
      observacoes TEXT, created_at TEXT, updated_at TEXT, origem_tipo TEXT,
      lms_matricula_id INTEGER, deleted_at TEXT
    );
    INSERT INTO qualificacoes_tipos VALUES
      (10,6,'CRM','CRM vigente','TREINAMENTO'),
      (10,7,'EXTERNO','CRM outro tenant','EXTERNO'),
      (20,6,'CMA','CMA válido','EXAME');
    INSERT INTO qualificacoes_historico
      (id,funcionario_id,empresa_id,qualificacao_id,data_conclusao,data_vencimento,status,renovacao_de)
    VALUES
      (99,1,6,10,'2025-04-10','2099-04-10','CONCLUIDA',NULL),
      (1,1,6,10,'2026-04-10','2027-04-10','CONCLUIDA',99),
      (2,1,6,10,NULL,'2040-04-10','PLANEJADA',NULL),
      (3,1,6,10,'2026-10-01','2040-10-01','CANCELADA',NULL),
      (4,1,6,20,'2025-05-01','2026-05-01','CONCLUIDA',NULL),
      (5,1,6,20,'2026-05-01','2027-05-01','CONCLUIDA',4),
      (6,1,7,10,'2027-01-01','2099-12-31','CONCLUIDA',NULL),
      (7,2,6,10,'2027-01-01','2099-12-31','CONCLUIDA',NULL);
  `);
  return sqlite;
}

describe('F14-01/02 — Ficha360 usa a realização operacional e o tenant corretos', () => {
  it('não seleciona histórico antigo de maior vencimento, nem cancelada ou planejada', () => {
    const db = createDb();
    try {
      const rows = db.prepare(buildFicha360CurrentHistorySql(modern)).all(1,6);
      expect(rows.map(row => [row.codigo,row.data_realizacao,row.data_vencimento])).toEqual([
        ['CMA','2026-05-01','2027-05-01'],
        ['CRM','2026-04-10','2027-04-10'],
      ]);
    } finally { db.close(); }
  });

  it('não mistura tipo de outra empresa nem histórico de funcionário fora do escopo', () => {
    const db = createDb();
    try {
      const rows = db.prepare(buildFicha360CurrentHistorySql(modern)).all(1,6);
      expect(rows.every(row => row.codigo !== 'EXTERNO')).toBe(true);
      expect(rows.every(row => row.funcionario_id === 1)).toBe(true);
    } finally { db.close(); }
  });

  it('em schema legado preserva a leitura usando código e conclusão sem exigir renovacao_de', () => {
    const sql = buildFicha360CurrentHistorySql({
      ...modern, inicioCol:'data_realizacao',fimCol:'data_validade',
      tipoCol:'tipo_qualificacao_id',hasEmpresaId:false,hasRenewalLink:false,
    });
    expect(sql).toContain('q.data_realizacao IS NOT NULL');
    expect(sql).toContain('tq.empresa_id = ?');
    expect(sql).not.toContain('renovacao_de');
    expect(sql).toContain('PLANEJADA');
  });
});
