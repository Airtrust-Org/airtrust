import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPlan,
  readInventory,
  type Lms1492Inventory,
} from '../../../../scripts/production/lms-consistency-1492-readonly-plan.mjs';
import {
  GROUP1_MATRICULAS,
  GROUP2_POINTERS,
  auditAction,
  buildExecutionManifest,
  buildRollbackManifest,
  executeManifest,
  hashBody,
  type ExecutionManifest,
  type ExecutorPort,
  type RollbackManifest,
} from '../../../../scripts/production/lib/lms-consistency-1492-batch.mjs';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

const SHA = 'c'.repeat(40);
const ACTOR = 'tester';
type Row = Record<string, unknown>;

function port(db: DatabaseSync, beforeExec?: (sql: string) => void): ExecutorPort & { statements: string[] } {
  const statements: string[] = [];
  return {
    statements,
    query: (sql: string) => db.prepare(sql).all() as Row[],
    exec: (sql: string) => {
      beforeExec?.(sql);
      statements.push(sql);
      db.exec(`BEGIN IMMEDIATE;\n${sql};\nCOMMIT;`);
    },
  };
}

const rows = (db: DatabaseSync, sql: string): Row[] => db.prepare(sql).all() as Row[];
const one = (db: DatabaseSync, sql: string): Row => {
  const found = rows(db, sql)[0];
  if (!found) throw new Error(`no row: ${sql}`);
  return found;
};
const audits = (db: DatabaseSync) => rows(db, 'SELECT * FROM audit_logs ORDER BY id');
const fullSnapshot = (db: DatabaseSync) => JSON.stringify([
  rows(db, 'SELECT * FROM lms_matriculas ORDER BY id'),
  rows(db, 'SELECT * FROM lms_matricula_ciclos ORDER BY id'),
  rows(db, 'SELECT * FROM qualificacoes_historico ORDER BY id'),
  rows(db, 'SELECT * FROM lms_progresso_scorm ORDER BY id'),
]);
// updated_at moves by design; everything else is the contract
const withoutUpdatedAt = (db: DatabaseSync, table: string) =>
  JSON.stringify((rows(db, `SELECT * FROM ${table} ORDER BY id`)).map(({ updated_at: _u, ...rest }) => rest));

function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, curso_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL,
      status TEXT NOT NULL, progresso_pct INTEGER DEFAULT 0, score_final INTEGER, tentativas INTEGER NOT NULL DEFAULT 0,
      data_conclusao TEXT, qualificacao_historico_id INTEGER, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, matricula_id INTEGER, curso_id INTEGER, funcionario_id INTEGER,
      numero_ciclo INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, ciclo_atual INTEGER NOT NULL DEFAULT 1,
      data_inicio TEXT, data_conclusao TEXT, progresso_pct INTEGER NOT NULL DEFAULT 0, score_final REAL,
      tentativas INTEGER NOT NULL DEFAULT 0, qualificacao_historico_id INTEGER, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL, qualificacao_id INTEGER,
      status TEXT, data_conclusao TEXT, data_vencimento TEXT, validade_meses INTEGER, numero_certificado TEXT,
      lms_matricula_id INTEGER, lms_matricula_ciclo_id INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE lms_progresso_scorm (
      id INTEGER PRIMARY KEY AUTOINCREMENT, matricula_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL, lesson_status TEXT,
      score_raw INTEGER, suspend_data TEXT, cmi_json TEXT
    );
    CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY, empresa_id INTEGER, gerar_qualificacao_ao_concluir INTEGER, qualificacao_tipo_id INTEGER);
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER,
      old_values TEXT, new_values TEXT, empresa_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

const G1_HISTORICO = (i: number) => 9001 + i;
const G1_CYCLE = (i: number) => 500 + i;

function seed(db: DatabaseSync): void {
  db.exec('INSERT INTO funcionarios (id, empresa_id) VALUES (41, 6);');
  GROUP1_MATRICULAS.forEach((mid, i) => {
    const f = 101 + i;
    db.exec(`
      INSERT INTO funcionarios (id, empresa_id) VALUES (${f}, 6);
      INSERT INTO lms_matriculas (id, empresa_id, curso_id, funcionario_id, status, progresso_pct, score_final, tentativas, data_conclusao, qualificacao_historico_id)
        VALUES (${mid}, 6, ${10 + i}, ${f}, 'CONCLUIDO', 100, 90, 1, '2026-06-27 12:00:00', ${G1_HISTORICO(i)});
      INSERT INTO lms_matricula_ciclos (id, empresa_id, matricula_id, curso_id, funcionario_id, status, ciclo_atual, data_inicio, data_conclusao, progresso_pct, score_final, tentativas, qualificacao_historico_id)
        VALUES (${G1_CYCLE(i)}, 6, ${mid}, ${10 + i}, ${f}, 'EM_ANDAMENTO', 1, '2026-06-26 08:00:00', NULL, 60, 77.5, 2, NULL);
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, status, data_conclusao, data_vencimento, validade_meses, numero_certificado, lms_matricula_id, lms_matricula_ciclo_id, created_at)
        VALUES (${G1_HISTORICO(i)}, 6, ${f}, 5, 'CONCLUIDA', '2026-06-27', '2027-06-27', 12, 'CERT-${i}', ${mid}, NULL, '2026-06-28 10:00:00');
      INSERT INTO lms_progresso_scorm (matricula_id, empresa_id, lesson_status, score_raw, suspend_data, cmi_json)
        VALUES (${mid}, 6, 'passed', 90, 'keep-me-${i}', '{"keep":true}');
    `);
  });
  GROUP2_POINTERS.forEach((p, i) => {
    const cyclePointer = i === 0 || i === 5 ? p.historico_id : 'NULL';
    db.exec(`
      INSERT INTO lms_matriculas (id, empresa_id, curso_id, funcionario_id, status, progresso_pct, data_conclusao, qualificacao_historico_id)
        VALUES (${p.matricula_id}, 6, ${30 + i}, 41, 'CONCLUIDO', 100, '2026-11-01 09:00:00', ${p.historico_id});
      INSERT INTO lms_matricula_ciclos (id, empresa_id, matricula_id, curso_id, funcionario_id, status, ciclo_atual, progresso_pct, qualificacao_historico_id)
        VALUES (${700 + i}, 6, ${p.matricula_id}, ${30 + i}, 41, 'CONCLUIDO', 1, 100, ${cyclePointer});
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, status, data_conclusao, lms_matricula_id, created_at, deleted_at)
        VALUES (${p.historico_id}, 6, 41, 5, 'CONCLUIDA', '2026-11-01', ${p.matricula_id}, '2026-11-01 09:00:00', '2026-11-03 10:00:00');
      INSERT INTO lms_progresso_scorm (matricula_id, empresa_id, lesson_status, score_raw) VALUES (${p.matricula_id}, 6, 'passed', 100);
    `);
  });
  // outside the owner scope: must never be touched (a group-1-like row not listed by the owner)
  db.exec(`
    INSERT INTO funcionarios (id, empresa_id) VALUES (900, 6);
    INSERT INTO lms_matriculas (id, empresa_id, curso_id, funcionario_id, status, progresso_pct, data_conclusao, qualificacao_historico_id)
      VALUES (4000, 6, 99, 900, 'CONCLUIDO', 100, '2026-06-30 10:00:00', 9900);
    INSERT INTO lms_matricula_ciclos (id, empresa_id, matricula_id, curso_id, funcionario_id, status, ciclo_atual, progresso_pct)
      VALUES (4100, 6, 4000, 99, 900, 'EM_ANDAMENTO', 1, 10);
    INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, status, lms_matricula_id, created_at)
      VALUES (9900, 6, 900, 'CONCLUIDA', 4000, '2026-06-30 10:00:00');
  `);
}

function inventoryOf(db: DatabaseSync, reverse = false): Lms1492Inventory {
  const inventory = readInventory(port(db));
  if (reverse) for (const v of Object.values(inventory)) (v as unknown[]).reverse();
  return inventory;
}

describe('LMS consistency #1492 governed executor (local SQLite only)', () => {
  let db: DatabaseSync;
  let manifest: ExecutionManifest;
  const opts = () => ({ expectedPlanHash: manifest.plan_sha256, expectedCount: manifest.row_count });
  const forward = (p: ExecutorPort, extra: Partial<Parameters<typeof executeManifest>[0]> = {}) =>
    executeManifest({ port: p, manifest, direction: 'forward', ...opts(), ...extra });

  beforeEach(() => {
    db = new NodeDatabaseSync(':memory:');
    createSchema(db);
    seed(db);
    const plan = buildPlan(inventoryOf(db));
    if (!plan.manifest) throw new Error(`seed plan blocked: ${JSON.stringify(plan.summary.blocked_detail)}`);
    manifest = { ...plan.manifest, source_sha: SHA };
  });
  afterEach(() => db.close());

  describe('planner', () => {
    it('plans exactly the owner scope and lists the counts per group', () => {
      const { summary, manifest: m } = buildPlan(inventoryOf(db));
      expect(m?.cycles.map((c) => c.matricula_id)).toEqual([...GROUP1_MATRICULAS]);
      expect(m?.links).toHaveLength(7);
      expect(m?.pointers.map((p) => [p.matricula_id, p.historico_id])).toEqual(
        [...GROUP2_POINTERS].sort((a, b) => a.matricula_id - b.matricula_id).map((p) => [p.matricula_id, p.historico_id]),
      );
      expect(m?.cycle_pointers.map((c) => c.matricula_id)).toEqual([699, 2061]);
      expect(summary.groups).toEqual({
        group1: { matriculas: 7, cycle_ops: 7, link_ops: 7, ops: 14 },
        group2: { matriculas: 6, pointer_ops: 6, cycle_pointer_ops: 2, ops: 8 },
      });
      expect(summary.row_count).toBe(22);
      expect(summary.blocked).toBe(0);
      expect(summary.fail_closed).toBe(false);
      expect(summary.cross_check_2161).toMatchObject({
        group1_owner_ids_not_listed: [], group2_owner_ids_not_listed: [],
        outside_owner_scope_untouched: { group1: 1, group2: 0 },
      });
      expect(summary.excluded_groups).toEqual({ group3: expect.any(String), group4: expect.any(String) });
      expect(m?.cycles[0]).toMatchObject({
        old_status: 'EM_ANDAMENTO', next_status: 'CONCLUIDO', old_data_conclusao: null, next_data_conclusao: '2026-06-27 12:00:00',
        old_progresso_pct: 60, next_progresso_pct: 100,
      });
      expect(summary.writes).toBe(0);
      expect(summary.pii_emitted).toBe(false);
    });

    it('is deterministic regardless of read order', () => {
      const a = buildPlan(inventoryOf(db)).manifest;
      const b = buildPlan(inventoryOf(db, true)).manifest;
      expect(b?.plan_sha256).toBe(a?.plan_sha256);
      expect(hashBody(a as ExecutionManifest)).toBe(manifest.plan_sha256);
    });

    const divergences: Array<[string, string, string]> = [
      ['group-1 enrollment in another tenant', "UPDATE lms_matriculas SET empresa_id = 1 WHERE id = 323", 'matricula_wrong_tenant'],
      ['group-1 enrollment not CONCLUIDO', "UPDATE lms_matriculas SET status = 'EM_ANDAMENTO' WHERE id = 328", 'matricula_status_not_concluido'],
      ['group-1 enrollment soft-deleted', "UPDATE lms_matriculas SET deleted_at = datetime('now') WHERE id = 331", 'matricula_deleted'],
      ['group-1 employee of another tenant', 'UPDATE funcionarios SET empresa_id = 1 WHERE id = 104', 'funcionario_tenant_mismatch'],
      ['group-1 SCORM not passed', "UPDATE lms_progresso_scorm SET lesson_status = 'incomplete' WHERE matricula_id = 394", 'scorm_not_passed'],
      ['group-1 history soft-deleted', "UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE id = 9007", 'historico_deleted'],
      ['group-1 history already linked to a cycle', 'UPDATE qualificacoes_historico SET lms_matricula_ciclo_id = 500 WHERE id = 9002', 'historico_cycle_already_set'],
      ['group-1 history not linked to the enrollment', 'UPDATE qualificacoes_historico SET lms_matricula_id = 1 WHERE id = 9003', 'historico_not_linked_to_matricula'],
      ['group-1 history created outside the owner window', "UPDATE qualificacoes_historico SET created_at = '2026-08-01 10:00:00' WHERE id = 9004", 'historico_created_outside_expected_window'],
      ['group-1 history of another employee', 'UPDATE qualificacoes_historico SET funcionario_id = 999 WHERE id = 9005', 'historico_owner_mismatch'],
      ['group-1 current cycle already CONCLUIDO', "UPDATE lms_matricula_ciclos SET status = 'CONCLUIDO' WHERE id = 500", 'cycle_status_not_em_andamento'],
      ['group-1 cycle in another tenant', 'UPDATE lms_matricula_ciclos SET empresa_id = 1 WHERE id = 501', 'cycle_wrong_tenant'],
      ['group-1 cycle points to a different history', 'UPDATE lms_matricula_ciclos SET qualificacao_historico_id = 1 WHERE id = 502', 'cycle_historico_pointer_diverges'],
      ['group-1 no current cycle', 'UPDATE lms_matricula_ciclos SET ciclo_atual = 0 WHERE id = 503', 'current_cycle_not_unique'],
      ['group-2 enrollment of another employee', 'UPDATE lms_matriculas SET funcionario_id = 5 WHERE id = 699', 'matricula_not_owner_test_employee'],
      ['group-2 pointer diverges from the expected history', 'UPDATE lms_matriculas SET qualificacao_historico_id = 1 WHERE id = 867', 'pointer_diverges_from_expected'],
      ['group-2 pointer already cleared', 'UPDATE lms_matriculas SET qualificacao_historico_id = NULL WHERE id = 947', 'pointer_already_cleared'],
      ['group-2 history is live (restored)', 'UPDATE qualificacoes_historico SET deleted_at = NULL WHERE id = 7155', 'historico_not_soft_deleted'],
      ['group-2 enrollment not CONCLUIDO', "UPDATE lms_matriculas SET status = 'CANCELADO' WHERE id = 1333", 'matricula_status_not_concluido'],
      ['group-2 non-current cycle points to the deleted history', 'UPDATE lms_matricula_ciclos SET ciclo_atual = 0 WHERE id = 700', 'non_current_cycle_points_to_deleted_historico'],
      ['group-2 enrollment in another tenant', 'UPDATE lms_matriculas SET empresa_id = 1 WHERE id = 2061', 'matricula_wrong_tenant'],
    ];
    for (const [label, sql, reason] of divergences) {
      it(`fails closed (no manifest) when ${label}`, () => {
        db.exec(sql);
        const { manifest: m, summary } = buildPlan(inventoryOf(db));
        expect(m).toBeNull();
        expect(summary.fail_closed).toBe(true);
        expect(summary.plan_sha256).toBeNull();
        expect(summary.blocked_detail.map((b) => b.reason)).toContain(reason);
      });
    }

    it('fails closed when the live consistency query no longer lists an owner row', () => {
      db.exec("UPDATE lms_matricula_ciclos SET status = 'CONCLUIDO' WHERE id = 504");
      const { manifest: m, summary } = buildPlan(inventoryOf(db));
      expect(m).toBeNull();
      expect(summary.cross_check_2161).toMatchObject({ group1_owner_ids_not_listed: [394] });
    });
  });

  describe('executor', () => {
    it('dry-run reads only and never calls exec', () => {
      const p = port(db);
      const before = fullSnapshot(db);
      const report = forward(p);
      expect(p.statements).toEqual([]);
      expect(report.mode).toBe('dry-run');
      expect(report.pending).toBe(manifest.row_count);
      expect(report.ops_by_group).toEqual({ group1: 14, group2: 8 });
      expect(report.conflicts).toEqual([]);
      expect(report.postconditions_verified).toBe(true);
      expect(fullSnapshot(db)).toBe(before);
      expect(audits(db)).toEqual([]);
    });

    it('apply group 1: cycle CONCLUIDO aligned to the enrollment, history linked, no score/scorm/history change, audit per row', () => {
      const scormBefore = JSON.stringify(rows(db, 'SELECT * FROM lms_progresso_scorm ORDER BY id'));
      const histBefore = withoutUpdatedAt(db, 'qualificacoes_historico');
      const report = forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.postconditions_verified).toBe(true);
      expect(report.changed).toBe(22);
      expect(report.pending_by_group).toEqual({ group1: 0, group2: 0 });

      GROUP1_MATRICULAS.forEach((mid, i) => {
        expect(one(db, `SELECT * FROM lms_matricula_ciclos WHERE id = ${G1_CYCLE(i)}`)).toMatchObject({
          status: 'CONCLUIDO', data_conclusao: '2026-06-27 12:00:00', progresso_pct: 100, qualificacao_historico_id: G1_HISTORICO(i),
          score_final: 77.5, tentativas: 2, data_inicio: '2026-06-26 08:00:00', ciclo_atual: 1,
        });
        expect(one(db, `SELECT * FROM qualificacoes_historico WHERE id = ${G1_HISTORICO(i)}`)).toMatchObject({
          lms_matricula_ciclo_id: G1_CYCLE(i), status: 'CONCLUIDA', data_vencimento: '2027-06-27', numero_certificado: `CERT-${i}`, deleted_at: null,
        });
        expect(one(db, `SELECT * FROM lms_matriculas WHERE id = ${mid}`)).toMatchObject({
          status: 'CONCLUIDO', score_final: 90, data_conclusao: '2026-06-27 12:00:00', qualificacao_historico_id: G1_HISTORICO(i),
        });
      });
      // the only history column that moves is the link
      const histAfter = JSON.stringify((rows(db, 'SELECT * FROM qualificacoes_historico ORDER BY id'))
        .map(({ updated_at: _u, lms_matricula_ciclo_id: _l, ...rest }) => rest));
      const histBeforeNoLink = JSON.stringify((JSON.parse(histBefore) as Row[]).map(({ lms_matricula_ciclo_id: _l, ...rest }) => rest));
      expect(histAfter).toBe(histBeforeNoLink);
      expect(JSON.stringify(rows(db, 'SELECT * FROM lms_progresso_scorm ORDER BY id'))).toBe(scormBefore);
      expect(rows(db, 'SELECT COUNT(*) AS n FROM qualificacoes_historico')[0].n).toBe(7 + 6 + 1);

      const g1Audits = audits(db).filter((a) => String(a.action).startsWith('LMS_CONSISTENCY_1492_CYCLE_RATIFY') || String(a.action).startsWith('LMS_CONSISTENCY_1492_LINK_RATIFY'));
      expect(g1Audits).toHaveLength(14);
      for (const a of g1Audits) {
        const nv = JSON.parse(String(a.new_values));
        expect(nv).toMatchObject({ origin: 'ratificação do dono #1492 grupo 1', group: 1, actor: ACTOR, plan_sha256: manifest.plan_sha256, source_sha: SHA, direction: 'forward' });
        expect(a.empresa_id).toBe(6);
      }
      expect(JSON.parse(String(g1Audits[0].old_values))).toMatchObject({ status: 'EM_ANDAMENTO', progresso_pct: 60 });
    });

    it('apply group 2: clears only the pointers, enrollment stays CONCLUIDO, deleted histories are not restored or recreated', () => {
      const deletedBefore = JSON.stringify(rows(db, 'SELECT * FROM qualificacoes_historico WHERE id >= 7152 AND id <= 7160 ORDER BY id'));
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      for (const p of GROUP2_POINTERS) {
        expect(one(db, `SELECT * FROM lms_matriculas WHERE id = ${p.matricula_id}`)).toMatchObject({
          qualificacao_historico_id: null, status: 'CONCLUIDO', data_conclusao: '2026-11-01 09:00:00', funcionario_id: 41,
        });
      }
      expect(rows(db, 'SELECT id FROM lms_matricula_ciclos WHERE qualificacao_historico_id IN (7152,7153,7154,7155,7157,7160)')).toEqual([]);
      expect(JSON.stringify(rows(db, 'SELECT * FROM qualificacoes_historico WHERE id >= 7152 AND id <= 7160 ORDER BY id'))).toBe(deletedBefore);
      const g2 = audits(db).filter((a) => /POINTER_CLEAR$/.test(String(a.action)));
      expect(g2).toHaveLength(8);
      expect(JSON.parse(String(g2[0].new_values))).toMatchObject({ group: 2, direction: 'forward' });
      expect(String(JSON.parse(String(g2[0].new_values)).origin)).toContain('#1492 grupo 2');
    });

    it('never touches the row outside the owner scope', () => {
      const untouched = () => JSON.stringify([
        rows(db, 'SELECT * FROM lms_matriculas WHERE id = 4000'), rows(db, 'SELECT * FROM lms_matricula_ciclos WHERE id = 4100'),
        rows(db, 'SELECT * FROM qualificacoes_historico WHERE id = 9900'),
      ]);
      const before = untouched();
      const p = port(db);
      forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(untouched()).toBe(before);
      for (const sql of p.statements) {
        expect(sql).toMatch(/empresa_id = 6/);
        const table = /UPDATE (\w+)/.exec(sql)?.[1];
        expect(['lms_matricula_ciclos', 'qualificacoes_historico', 'lms_matriculas']).toContain(table);
        const set = /SET([\s\S]*?)\n\s*WHERE/.exec(sql)?.[1] ?? '';
        expect(set).not.toMatch(/score|tentativas|suspend|lesson_status|numero_certificado|deleted_at|data_vencimento/);
        if (table === 'qualificacoes_historico') expect(set).toMatch(/^\s*lms_matricula_ciclo_id = \d+, updated_at/);
        if (table === 'lms_matriculas') expect(set).toMatch(/^\s*qualificacao_historico_id = NULL, updated_at/);
      }
      expect(audits(db).every((a) => a.empresa_id === 6)).toBe(true);
      expect(new Set(audits(db).map((a) => a.action))).toEqual(new Set([
        auditAction('cycle', 'forward'), auditAction('link', 'forward'), auditAction('pointer', 'forward'), auditAction('cptr', 'forward'),
      ]));
    });

    it('is idempotent: a second apply writes nothing and adds no audit', () => {
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      const second = port(db);
      const report = forward(second, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(second.statements).toEqual([]);
      expect(report.already_applied).toBe(manifest.row_count);
      expect(report.pending).toBe(0);
      expect(audits(db)).toHaveLength(manifest.row_count);
    });

    it('aborts before the first write when a row changed since planning (CAS preflight)', () => {
      db.exec("UPDATE lms_matricula_ciclos SET progresso_pct = 80 WHERE id = 502");
      const p = port(db);
      let error: (Error & { report?: { conflicts: Array<{ kind: string; id: number; reason: string }> } }) | undefined;
      try { forward(p, { apply: true, actor: ACTOR, sourceSha: SHA }); } catch (e) { error = e as Error; }
      expect(error?.message).toBe('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
      // the dependent link is reported too: it may only run once its cycle is CONCLUIDO
      expect(error?.report?.conflicts).toEqual([
        { kind: 'cycle', id: 502, reason: 'row_changed_since_plan' },
        { kind: 'link', id: 9003, reason: 'cycle_not_in_expected_state' },
      ]);
      expect(p.statements).toEqual([]);
      expect(audits(db)).toEqual([]);
      expect(one(db, 'SELECT * FROM lms_matricula_ciclos WHERE id = 500').status).toBe('EM_ANDAMENTO');
    });

    it('preflight also aborts when a group-2 history is restored in the meantime', () => {
      db.exec('UPDATE qualificacoes_historico SET deleted_at = NULL WHERE id = 7153');
      const p = port(db);
      expect(() => forward(p, { apply: true, actor: ACTOR, sourceSha: SHA })).toThrow('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
      expect(p.statements).toEqual([]);
    });

    it('detects a concurrent change between preflight and the write (statement CAS) without auditing it', () => {
      const p = port(db, (sql) => {
        if (sql.includes('UPDATE lms_matriculas') && sql.includes('WHERE id = 867\n')) {
          db.exec("UPDATE lms_matriculas SET status = 'CANCELADO' WHERE id = 867");
        }
      });
      const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.cas_conflicts).toEqual([{ kind: 'pointer', id: 867 }]);
      expect(report.postconditions_verified).toBe(false);
      expect(one(db, 'SELECT * FROM lms_matriculas WHERE id = 867').qualificacao_historico_id).toBe(7154);
      expect(audits(db).some((a) => a.entity_type === 'lms_matriculas' && a.entity_id === 867)).toBe(false);
    });

    it('a link is never written unless its cycle is already CONCLUIDO (type-state guard)', () => {
      // cycle update is lost to a concurrent change: the link statement must not run its write
      const p = port(db, (sql) => {
        if (sql.includes('UPDATE lms_matricula_ciclos') && sql.includes('WHERE id = 500\n') && sql.includes("SET status = 'CONCLUIDO'")) {
          db.exec("UPDATE lms_matricula_ciclos SET progresso_pct = 61 WHERE id = 500");
        }
      });
      const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.postconditions_verified).toBe(false);
      expect(report.cas_conflicts).toEqual(expect.arrayContaining([{ kind: 'cycle', id: 500 }, { kind: 'link', id: 9001 }]));
      expect(one(db, 'SELECT * FROM qualificacoes_historico WHERE id = 9001').lms_matricula_ciclo_id).toBeNull();
    });

    it('refuses manifests outside the owner scope, tampered hashes, wrong source SHA and bad actor', () => {
      const body = manifest;
      expect(() => buildExecutionManifest({ ...body, cycles: [{ ...body.cycles[0], matricula_id: 4000 }], links: [{ ...body.links[0], matricula_id: 4000 }] }))
        .toThrow('MANIFEST_CYCLE_OUTSIDE_OWNER_SCOPE');
      expect(() => buildExecutionManifest({ ...body, pointers: [{ matricula_id: 699, historico_id: 9999, funcionario_id: 41 }], cycle_pointers: [] }))
        .toThrow('MANIFEST_POINTER_OUTSIDE_OWNER_SCOPE');
      expect(() => buildExecutionManifest({ ...body, pointers: [{ matricula_id: 699, historico_id: 7160, funcionario_id: 5 }], cycle_pointers: [] }))
        .toThrow('MANIFEST_POINTER_OUTSIDE_OWNER_SCOPE');
      expect(() => buildExecutionManifest({ ...body, links: body.links.slice(1) })).toThrow('MANIFEST_CYCLE_WITHOUT_LINK');
      const tampered = { ...manifest, cycles: manifest.cycles.map((c, i) => (i === 0 ? { ...c, next_progresso_pct: 99 } : c)) };
      expect(() => executeManifest({ port: port(db), manifest: tampered, ...opts() })).toThrow('MANIFEST_HASH_MISMATCH');
      expect(() => executeManifest({ port: port(db), manifest, ...opts(), expectedPlanHash: 'f'.repeat(64) })).toThrow('EXPECTED_PLAN_HASH_MISMATCH');
      expect(() => executeManifest({ port: port(db), manifest, expectedPlanHash: manifest.plan_sha256, expectedCount: 21 })).toThrow('EXPECTED_ROW_COUNT_MISMATCH');
      expect(() => forward(port(db), { apply: true, actor: ACTOR, sourceSha: 'd'.repeat(40) })).toThrow('MANIFEST_SOURCE_SHA_MISMATCH');
      expect(() => forward(port(db), { apply: true, actor: 'bad actor!', sourceSha: SHA })).toThrow('ACTOR_INVALID');
    });

    describe('rollback', () => {
      let rollback: RollbackManifest;
      beforeEach(() => { rollback = buildRollbackManifest(manifest, opts()); });
      const back = (p: ExecutorPort, extra: Partial<Parameters<typeof executeManifest>[0]> = {}) =>
        executeManifest({
          port: p, manifest: rollback, direction: 'rollback', expectedPlanHash: rollback.rollback_plan_sha256,
          expectedCount: manifest.row_count, ...extra,
        });

      it('restores every row exactly (except updated_at) and audits each inverse operation', () => {
        const before = [withoutUpdatedAt(db, 'lms_matriculas'), withoutUpdatedAt(db, 'lms_matricula_ciclos'), withoutUpdatedAt(db, 'qualificacoes_historico')];
        forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
        const report = back(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
        expect(report.postconditions_verified).toBe(true);
        expect(report.changed).toBe(manifest.row_count);
        expect([withoutUpdatedAt(db, 'lms_matriculas'), withoutUpdatedAt(db, 'lms_matricula_ciclos'), withoutUpdatedAt(db, 'qualificacoes_historico')]).toEqual(before);
        expect(audits(db).filter((a) => String(a.action).endsWith('_ROLLBACK'))).toHaveLength(manifest.row_count);
      });

      it('does nothing for operations the forward plan never applied', () => {
        const p = port(db);
        const report = back(p, { apply: true, actor: ACTOR, sourceSha: SHA });
        expect(p.statements).toEqual([]);
        expect(report.skipped_not_applied).toBe(manifest.row_count);
      });

      it('undoes links before cycles (reverse order) and refuses a different plan hash', () => {
        forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
        const p = port(db);
        back(p, { apply: true, actor: ACTOR, sourceSha: SHA });
        const firstCycle = p.statements.findIndex((s) => s.includes('UPDATE lms_matricula_ciclos') && s.includes("SET status = 'EM_ANDAMENTO'"));
        const lastLink = p.statements.map((s) => s.includes('UPDATE qualificacoes_historico')).lastIndexOf(true);
        expect(lastLink).toBeLessThan(firstCycle);
        expect(() => back(port(db), { apply: true, actor: ACTOR, sourceSha: SHA, expectedPlanHash: 'e'.repeat(64) })).toThrow('ROLLBACK_HASH_MISMATCH');
      });

      it('a rollback conflict (row changed after apply) aborts before any write', () => {
        forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
        db.exec('UPDATE lms_matricula_ciclos SET progresso_pct = 90 WHERE id = 501');
        const p = port(db);
        expect(() => back(p, { apply: true, actor: ACTOR, sourceSha: SHA })).toThrow('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
        expect(p.statements).toEqual([]);
      });
    });
  });
});
