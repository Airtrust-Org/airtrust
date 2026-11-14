import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  buildComplianceCurrentQualificationSql,
  loadComplianceCurrentQualificacoes,
} from '../../../lib/qualificacoes/compliance-current-qualifications';

type Scalar = string | number | null;
type NativeDb = {
  exec(sql: string): void;
  prepare(sql: string): { all(...args: Scalar[]): Array<Record<string, unknown>> };
  close(): void;
};
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (filename: string) => NativeDb;
const modern = {
  tipoCol: 'qualificacao_id' as const,
  inicioCol: 'data_conclusao' as const,
  fimCol: 'data_vencimento' as const,
  hasStatus: true,
  hasTenant: true,
  hasRenewalLink: true,
};

function createDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE qualificacoes_tipos (
      id INTEGER, empresa_id INTEGER, codigo TEXT, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER, funcionario_id INTEGER, empresa_id INTEGER,
      qualificacao_id INTEGER, status TEXT, data_conclusao TEXT,
      data_vencimento TEXT, renovacao_de INTEGER, deleted_at TEXT
    );
    INSERT INTO qualificacoes_tipos VALUES
      (10,6,'CRM',NULL),(10,7,'OUTRO_TENANT',NULL),(20,6,'CMA',NULL);

    INSERT INTO qualificacoes_historico VALUES
      (999,1,6,10,'CONCLUIDA','2025-01-10','2099-01-10',NULL,NULL),
      (1,1,6,10,'CONCLUIDA','2026-01-10','2027-01-10',999,NULL),
      (2,1,6,10,'PLANEJADA','2026-10-01','2030-10-01',NULL,NULL),
      (3,1,6,20,'CONCLUIDA','2026-04-01','2026-10-01',NULL,NULL),
      (4,1,6,20,'CONCLUIDA','2026-09-01','2027-09-01',3,NULL),
      (5,2,6,10,'CANCELADA','2026-09-01','2030-09-01',NULL,NULL),
      (6,2,6,10,'CONCLUIDA','2025-09-01','2026-09-01',NULL,NULL),
      (7,3,7,10,'CONCLUIDA','2025-01-01','2026-01-01',NULL,NULL),
      (8,3,6,10,'CONCLUIDA','2025-01-01','2026-01-01',NULL,NULL),
      (9,4,6,10,'PLANEJADA',NULL,'2026-01-01',NULL,NULL);
  `);
  const calls: Array<{ sql: string; binds: Scalar[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: Scalar[]) => ({
        all: async () => {
          calls.push({ sql, binds });
          return { results: sqlite.prepare(sql).all(...binds) };
        },
      }),
    }),
  } as unknown as D1Database;
  return { sqlite, db, calls };
}

describe('F14-01 — Compliance coletivo SQL atual, tenant e limite D1', () => {
  it('seleciona a última conclusão, não o maior vencimento; ignora CANCELADA e PLANEJADA', async () => {
    const { sqlite, db } = createDb();
    try {
      const rows = await loadComplianceCurrentQualificacoes(db,6,[1,2,3,4],modern);
      expect(rows.map(row => [row.funcionario_id,row.codigo,row.data_vencimento])).toEqual([
        [1,'CMA','2027-09-01'],
        [1,'CRM','2027-01-10'],
        [2,'CRM','2026-09-01'],
        [3,'CRM','2026-01-01'],
      ]);
    } finally { sqlite.close(); }
  });

  it('usa lotes de 90 funcionários, dois binds fixos e bloqueia IDs inválidos', async () => {
    const { sqlite, db, calls } = createDb();
    try {
      const ids = Array.from({ length: 241 }, (_, i) => i+1);
      const rows = await loadComplianceCurrentQualificacoes(db,6,ids,modern);
      expect(rows).toHaveLength(4);
      expect(calls.map(c=>c.binds.length)).toEqual([92,92,63]);
      expect(calls.every(c=>c.binds[0]===6 && c.binds[c.binds.length-1]===6)).toBe(true);
      await expect(loadComplianceCurrentQualificacoes(db,6,[1,NaN],modern))
        .rejects.toThrow('INVALID_COMPLIANCE_EMPLOYEE_ID');
      expect(()=>buildComplianceCurrentQualificationSql(modern,91))
        .toThrow('INVALID_COMPLIANCE_EMPLOYEE_CHUNK_SIZE');
    } finally { sqlite.close(); }
  });

  it('fallback legado não exige coluna renovacao_de, mas exige conclusão real', () => {
    const sql = buildComplianceCurrentQualificationSql({
      tipoCol:'tipo_qualificacao_id',inicioCol:'data_realizacao',
      fimCol:'data_validade',hasStatus:true,hasTenant:false,hasRenewalLink:false,
    },1);
    expect(sql).toContain('qh.data_realizacao IS NOT NULL');
    expect(sql).not.toContain('qh.renovacao_de');
    expect(sql).toContain('PLANEJADA');
    expect(sql).toContain('tq.empresa_id = ?');
  });
});
