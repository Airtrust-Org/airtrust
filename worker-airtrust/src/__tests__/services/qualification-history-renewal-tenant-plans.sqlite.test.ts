import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildRenewalSqlPredicates } from '../../routes/qualificacoes/historico';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};
const schema = readFileSync(
  decodeURIComponent(new URL('../fixtures/d1-schema/qualification-plan-tables.sql', import.meta.url).pathname),
  'utf8',
);

function openDb(): DatabaseSyncType {
  const db = new DatabaseSync(':memory:');
  // The schema snapshot intentionally omits FK parents unrelated to renewal;
  // this test verifies query results/index selection, not referential integrity.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(schema);
  return db;
}

function renewalQuery() {
  const predicates = buildRenewalSqlPredicates(true);
  return `SELECT qh.id, CAST(${predicates.operationalCurrentQualificationPredicate} AS INTEGER) AS current,
    CAST(${predicates.renewedQualificationPredicate} AS INTEGER) AS renewed
    FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id
    WHERE qh.empresa_id=6 ORDER BY qh.id`;
}

describe('PERF-06 current/renewed history: tenant-scoped selective successor checks', () => {
  it('preserves same-company renewals but ignores malicious cross-company successors', () => {
    const db = openDb();
    try {
      const insert=db.prepare(`INSERT INTO qualificacoes_historico
        (id,empresa_id,funcionario_id,qualificacao_codigo,status,data_conclusao,data_vencimento,renovacao_de,deleted_at)
        VALUES (?,?,?,?,'CONCLUIDA',?,'2028-01-01',?,?)`);
      insert.run(10,6,1,'CRM','2025-01-01',null,null);
      insert.run(11,7,1,'CRM','2026-01-01',null,null);
      insert.run(20,6,1,'HUET','2025-01-01',null,null);
      insert.run(21,6,1,'HUET','2026-01-01',20,null);
      insert.run(30,6,1,'G1','2025-01-01',null,null);
      insert.run(31,7,2,'G1','2026-01-01',30,null);
      insert.run(40,6,1,'CMA','2025-01-01',null,null);
      insert.run(41,6,1,'CMA','2026-01-01',40,null);
      insert.run(50,6,1,'AVSEC','2025-01-01',null,null);
      db.prepare(`INSERT INTO qualificacoes_historico
       (id,empresa_id,funcionario_id,qualificacao_codigo,status,data_conclusao,data_vencimento)
       VALUES (51,6,1,'AVSEC','CANCELADA','2026-01-01','2028-01-01')`).run();
      const rows=db.prepare(renewalQuery()).all() as Array<{id:number;current:number;renewed:number}>;
      expect(rows).toEqual([
        {id:10,current:1,renewed:0},
        {id:20,current:0,renewed:1},
        {id:21,current:1,renewed:0},
        {id:30,current:1,renewed:0},
        {id:40,current:0,renewed:1},
        {id:41,current:1,renewed:0},
        {id:50,current:1,renewed:0},
        {id:51,current:0,renewed:0},
      ]);
    }finally{db.close()}
  });

  it('selects qualified indexes instead of a tenant-wide scan for both successors', () => {
    const db=openDb();
    try {
      const plans=(db.prepare('EXPLAIN QUERY PLAN '+renewalQuery()).all() as Array<{detail:string}>)
        .map(r=>r.detail);
      const newer=plans.filter(s=>s.includes('SEARCH qh_newer '));
      const renewal=plans.filter(s=>s.includes('SEARCH qh_renovadora '));
      expect(newer.length).toBeGreaterThan(0);
      expect(renewal.length).toBeGreaterThan(0);
      expect(newer.every(s=>/funcionario_id/.test(s))).toBe(true);
      expect(renewal.some(s=>s.includes('idx_qh_renovacao_de'))).toBe(true);
      expect(renewal.every(s=>!s.includes('idx_qualificacoes_historico_empresa_deleted'))).toBe(true);
    }finally{db.close()}
  });
});
