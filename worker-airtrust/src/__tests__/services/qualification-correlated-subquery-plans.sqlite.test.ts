import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  buildCurrentOperationalQualificationPredicate,
  buildHistoricalOperationalQualificationPredicate,
} from '../../lib/qualificacoes/operational-qualification-predicates';
import { ROSTER_ENROLLMENT_EVIDENCE_SQL } from '../../services/training-compliance-roster-sync';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};

const SCHEMA_SQL = readFileSync(
  decodeURIComponent(
    new URL('../fixtures/d1-schema/qualification-plan-tables.sql', import.meta.url).pathname,
  ),
  'utf8',
);

// The generic tenant index that the planner used to pick inside correlated
// subqueries, turning them into a per-row scan of the whole tenant history.
const GENERIC_TENANT_INDEX = 'idx_qualificacoes_historico_empresa_deleted';

function openProductionShapedDb(): DatabaseSyncType {
  const db = new DatabaseSync(':memory:');
  // The fixture carries only the tables under test; their FK parents (funcoes,
  // setores, lms_cursos, ...) are intentionally absent. Referential integrity is
  // not what these tests assert, so node:sqlite's default FK enforcement is off.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(SCHEMA_SQL);
  return db;
}

function plan(db: DatabaseSyncType, sql: string, ...binds: Array<string | number | null>): string[] {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds) as Array<{ detail: string }>).map(
    (row) => row.detail,
  );
}

function subqueryLines(lines: string[], alias: string): string[] {
  return lines.filter((line) => new RegExp(`^SEARCH ${alias} |^SCAN ${alias} `).test(line));
}

function currentQualificationSql(): string {
  return `SELECT qh.id
    FROM qualificacoes_historico qh
    JOIN funcionarios f ON f.id = qh.funcionario_id
   WHERE f.empresa_id = ? AND qh.empresa_id = f.empresa_id
     AND ${buildCurrentOperationalQualificationPredicate('qh')}
   ORDER BY qh.id`;
}

function historicalQualificationSql(): string {
  return `SELECT qh.id
    FROM qualificacoes_historico qh
   WHERE qh.empresa_id = ?
     AND ${buildHistoricalOperationalQualificationPredicate('qh', '?')}
   ORDER BY qh.id`;
}

describe('qualification correlated subqueries use selective indexes (performance audit 2026-11-13)', () => {
  it('roster enrollment evidence: has_history seeks by lms_matricula_id, not a tenant scan', () => {
    const db = openProductionShapedDb();
    const historyLines = subqueryLines(plan(db, ROSTER_ENROLLMENT_EVIDENCE_SQL, 6), 'h');

    expect(historyLines).toHaveLength(1);
    expect(historyLines[0]).toContain('idx_qual_historico_lms_matricula');
    expect(historyLines[0]).not.toContain(GENERIC_TENANT_INDEX);
    // Reference: the previous predicate produced exactly the tenant scan.
    const legacySql = ROSTER_ENROLLMENT_EVIDENCE_SQL.replace('+h.empresa_id', 'h.empresa_id');
    expect(subqueryLines(plan(db, legacySql, 6), 'h')[0]).toContain(GENERIC_TENANT_INDEX);
  });

  it('current operational predicate: successor lookup seeks by renovacao_de', () => {
    const db = openProductionShapedDb();
    const successorLines = subqueryLines(plan(db, currentQualificationSql(), 6), 'qh_next');

    expect(successorLines).toHaveLength(1);
    expect(successorLines[0]).toContain('idx_qh_renovacao_de');
    expect(successorLines[0]).not.toContain(GENERIC_TENANT_INDEX);
  });

  it('historical operational predicate: successor lookup seeks by renovacao_de', () => {
    const db = openProductionShapedDb();
    const successorLines = subqueryLines(
      plan(db, historicalQualificationSql(), 6, '2026-11-13', '2026-11-13'),
      'qh_next',
    );

    expect(successorLines).toHaveLength(1);
    expect(successorLines[0]).toContain('idx_qh_renovacao_de');
  });

  it('keeps tenant scoping and renewal semantics of the current predicate', () => {
    const db = openProductionShapedDb();
    const insertEmployee = db.prepare(
      `INSERT INTO funcionarios (id, empresa_id, nome, matricula, status) VALUES (?, ?, ?, ?, 'ATIVO')`,
    );
    insertEmployee.run(1, 6, 'Tripulante A', 'A-1');
    insertEmployee.run(2, 7, 'Tripulante B', 'B-1');

    const insertHistory = db.prepare(
      `INSERT INTO qualificacoes_historico
         (id, empresa_id, funcionario_id, qualificacao_codigo, status, data_conclusao, renovacao_de, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // 10 renewed by 11 (same tenant) -> only 11 is current.
    insertHistory.run(10, 6, 1, 'CRM', 'CONCLUIDA', '2025-01-10', null, null);
    insertHistory.run(11, 6, 1, 'CRM', 'CONCLUIDA', '2026-01-10', 10, null);
    // 20 has a successor that is cancelled -> 20 stays current.
    insertHistory.run(20, 6, 1, 'CMA', 'CONCLUIDA', '2025-02-01', null, null);
    insertHistory.run(21, 6, 1, 'CMA', 'CANCELADA', '2026-02-01', 20, null);
    // 30 has a successor from ANOTHER tenant pointing at it -> must not be
    // treated as renewed (tenant condition still enforced despite unary +).
    insertHistory.run(30, 6, 1, 'AVSEC', 'CONCLUIDA', '2025-03-01', null, null);
    insertHistory.run(31, 7, 2, 'AVSEC', 'CONCLUIDA', '2026-03-01', 30, null);
    // 40 is planned -> never current; 41 is soft-deleted successor -> 42 current.
    insertHistory.run(40, 6, 1, 'TRE', 'PLANEJADA', '2026-05-01', null, null);
    insertHistory.run(42, 6, 1, 'HUET', 'CONCLUIDA', '2025-04-01', null, null);
    insertHistory.run(41, 6, 1, 'HUET', 'CONCLUIDA', '2026-04-01', 42, '2026-04-02');

    const ids = (db.prepare(currentQualificationSql()).all(6) as Array<{ id: number }>).map(
      (row) => row.id,
    );
    expect(ids).toEqual([11, 20, 30, 42]);

    // Historical cut-off before the CRM renewal: 10 was still current then.
    const historicalIds = (
      db.prepare(historicalQualificationSql()).all(6, '2025-12-31', '2025-12-31') as Array<{ id: number }>
    ).map((row) => row.id);
    expect(historicalIds).toEqual([10, 20, 30, 42]);
  });
});
