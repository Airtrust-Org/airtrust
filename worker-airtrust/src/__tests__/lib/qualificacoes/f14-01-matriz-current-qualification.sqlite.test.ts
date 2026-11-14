import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { buildMatrixCurrentHistorySql } from '../../../lib/qualificacoes/matriz-current-qualification-sql';

type Scalar = number | string | null;
type Sqlite = {
  exec(sql: string): void;
  prepare(sql: string): { all(...args: Scalar[]): Record<string, unknown>[] };
  close(): void;
};
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (filename: string) => Sqlite;
const modern = (typeIdCount = 1) => buildMatrixCurrentHistorySql({
  tipoCol: 'qualificacao_id',
  dataInicioCol: 'data_conclusao',
  dataFimCol: 'data_vencimento',
  hasStatus: true,
  hasEmpresaId: true,
  hasRenewalLink: true,
  typeIdCount,
});
const legacy = () => buildMatrixCurrentHistorySql({
  tipoCol: 'tipo_qualificacao_id',
  dataInicioCol: 'data_realizacao',
  dataFimCol: 'data_validade',
  hasStatus: true,
  hasEmpresaId: false,
  hasRenewalLink: false,
  typeIdCount: 1,
});

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER NOT NULL,
      empresa_id INTEGER, qualificacao_id INTEGER, qualificacao_codigo TEXT,
      data_conclusao TEXT, data_vencimento TEXT, renovacao_de INTEGER,
      status TEXT, deleted_at TEXT, updated_at TEXT, created_at TEXT
    );
    INSERT INTO qualificacoes_historico
      (id, funcionario_id, empresa_id, qualificacao_id, qualificacao_codigo,
       data_conclusao, data_vencimento, renovacao_de, status)
    VALUES
      (99,1,6,10,'CRM','2025-01-05','2028-01-05',NULL,'CONCLUIDA'),
      (1,1,6,10,'CRM','2026-01-05','2027-01-05',99,'CONCLUIDA'),
      (100,1,6,10,'CRM',NULL,'2030-01-05',NULL,'PLANEJADA'),
      (102,1,6,10,'CRM','2026-09-05','2030-01-05',NULL,'CANCELADA'),
      (103,1,6,10,'CRM','2026-10-05','2040-01-05',NULL,'CONCLUIDA'),
      (104,1,6,10,'CRM','2026-11-05','2041-01-05',NULL,'PLANEJADA'),
      (105,1,6,20,'CMA','2026-04-01','2026-10-01',NULL,'CONCLUIDA'),
      (106,1,6,20,'CMA','2026-10-01','2027-10-01',105,'CONCLUIDA'),
      (107,1,7,10,'CRM','2027-01-01','2099-01-01',NULL,'CONCLUIDA'),
      (108,2,6,10,'CRM','2027-01-01','2099-01-01',NULL,'CONCLUIDA');
  `);
  return sqlite;
}

describe('F14-01/02: Matriz de requisitos seleciona realização operacional vigente', () => {
  it('ordena por conclusão, não pelo vencimento mais distante nem pelo ID', () => {
    const db = setup();
    try {
      // Intentionally non-monotonic IDs / historical expiries.
      const rows = db.prepare(modern()).all(1,6,10) as Array<{
        tipo_id: number; ultima_data: string; data_vencimento: string
      }>;
      expect(rows).toEqual([{ tipo_id: 10, ultima_data: '2026-10-05', data_vencimento: '2040-01-05' }]);
      // Completion of 2026-10-05 is the latest real record in the first fixture.
      // Cancelled and planned future events do not displace the real record.
    } finally { db.close(); }
  });

  it('exclui predecessor por renovacao_de e ignora outros tenants e funcionários', () => {
    const db = setup();
    try {
      const rows = db.prepare(modern(2)).all(1,6,10,20);
      expect(rows).toEqual([
        { tipo_id: 10, ultima_data: '2026-10-05', data_vencimento: '2040-01-05' },
        { tipo_id: 20, ultima_data: '2026-10-01', data_vencimento: '2027-10-01' },
      ]);
    } finally { db.close(); }
  });

  it('não reintegra cancelamento nem planejamento quando a data é maior', () => {
    const db = setup();
    try {
      db.exec(`
        UPDATE qualificacoes_historico
        SET status='PLANEJADA', data_vencimento='2099-12-31'
        WHERE id=103;
      `);
      const rows = db.prepare(modern()).all(1,6,10);
      expect(rows).toEqual([{tipo_id:10, ultima_data:'2026-01-05', data_vencimento:'2027-01-05'}]);
    } finally { db.close(); }
  });

  it('caminho legado não referencia colunas novas de renovação nem tenant', () => {
    const sql = legacy();
    expect(sql).toContain('qh.tipo_qualificacao_id');
    expect(sql).toContain('qh.data_realizacao');
    expect(sql).not.toContain('qh.empresa_id');
    expect(sql).not.toContain('renovacao_de');
    expect(sql).toContain('PLANEJADA');
  });

  it('rejeita contagem fora do orçamento D1 ou entrada negativa', () => {
    expect(() => modern(0)).toThrow('INVALID_MATRIX_TYPE_ID_CHUNK_SIZE');
    expect(() => modern(91)).toThrow('INVALID_MATRIX_TYPE_ID_CHUNK_SIZE');
    expect(modern(90)).toContain('ROW_NUMBER()');
  });
});
