import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPlan, readInventory } from '../../../../scripts/production/lms-cycle-dangling-pointer-readonly-plan.mjs';
import {
  AUDIT_ORIGIN,
  auditAction,
  buildExecutionManifest,
  buildRollbackManifest,
  casUpdateSql,
  executeManifest,
  hashBody,
  type CycleOperation,
  type ExecutionManifest,
  type ExecutorPort,
  type RollbackManifest,
} from '../../../../scripts/production/lib/lms-cycle-dangling-pointer-batch.mjs';

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
const audits = (db: DatabaseSync) => rows(db, 'SELECT * FROM audit_logs ORDER BY id');
const cycle = (db: DatabaseSync, id: number): Row => {
  const found = rows(db, `SELECT * FROM lms_matricula_ciclos WHERE id = ${id}`)[0];
  if (!found) throw new Error(`cycle ${id} missing`);
  return found;
};
const snapshotAll = (db: DatabaseSync) => JSON.stringify([
  rows(db, 'SELECT * FROM lms_matriculas ORDER BY id'),
  rows(db, 'SELECT * FROM qualificacoes_historico ORDER BY id'),
  rows(db, 'SELECT * FROM lms_progresso_scorm ORDER BY id'),
]);
// updated_at moves by design; everything else of the cycles is the contract
const cyclesWithoutPointer = (db: DatabaseSync) =>
  JSON.stringify(rows(db, 'SELECT * FROM lms_matricula_ciclos ORDER BY id').map(({ updated_at: _u, qualificacao_historico_id: _q, ...rest }) => rest));

function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT NOT NULL, progresso_pct INTEGER, score_final INTEGER,
      data_conclusao TEXT, qualificacao_historico_id INTEGER, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, matricula_id INTEGER, status TEXT NOT NULL, ciclo_atual INTEGER NOT NULL DEFAULT 1,
      data_conclusao TEXT, progresso_pct INTEGER NOT NULL DEFAULT 0, score_final REAL, tentativas INTEGER NOT NULL DEFAULT 0,
      qualificacao_historico_id INTEGER, origem TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT, numero_certificado TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE lms_progresso_scorm (
      id INTEGER PRIMARY KEY AUTOINCREMENT, matricula_id INTEGER, empresa_id INTEGER NOT NULL, lesson_status TEXT, suspend_data TEXT
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER,
      old_values TEXT, new_values TEXT, empresa_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seed(db: DatabaseSync): void {
  db.exec(`
    -- soft-deleted histories (tenant 6) and live ones
    INSERT INTO qualificacoes_historico (id, empresa_id, status, numero_certificado, deleted_at) VALUES
      (1001, 6, 'CONCLUIDA', 'CERT-1', '2026-11-03 10:00:00'),
      (1002, 6, 'CONCLUIDA', 'CERT-2', '2026-11-03 10:00:00'),
      (1003, 6, 'CONCLUIDA', 'CERT-3', '2026-11-03 10:00:00'),
      (1004, 6, 'CONCLUIDA', 'CERT-4', NULL),
      (1005, 1, 'CONCLUIDA', 'CERT-5', '2026-11-03 10:00:00'),
      (1006, 6, 'CONCLUIDA', 'CERT-6', '2026-11-03 10:00:00');
    INSERT INTO lms_matriculas (id, empresa_id, status, progresso_pct, score_final, data_conclusao, qualificacao_historico_id) VALUES
      (50, 6, 'CONCLUIDO', 100, 90, '2026-06-27 12:00:00', 1001),
      (51, 6, 'CONCLUIDO', 100, 80, '2026-06-28 12:00:00', 1004);
    INSERT INTO lms_progresso_scorm (matricula_id, empresa_id, lesson_status, suspend_data) VALUES (50, 6, 'passed', 'keep-me');
    INSERT INTO lms_matricula_ciclos (id, empresa_id, matricula_id, status, ciclo_atual, progresso_pct, score_final, tentativas, qualificacao_historico_id, origem, deleted_at) VALUES
      (8,  6, 50,   'CONCLUIDO',    1, 100, 90.0, 1, 1001, NULL,      NULL),              -- dangling, current cycle
      (9,  6, 50,   'CONCLUIDO',    0, 100, 70.0, 2, 1002, NULL,      NULL),              -- dangling, historical cycle
      (296, 6, NULL, 'CONCLUIDO',   0, 100, 88.5, 1, 1003, 'IMPORTADO_EDAPP', NULL),      -- dangling, no enrollment
      (10, 6, 51,   'CONCLUIDO',    1, 100, 80.0, 1, 1004, NULL,      NULL),              -- pointer to LIVE history: healthy
      (11, 6, 51,   'EM_ANDAMENTO', 0, 30,  NULL, 0, NULL, NULL,      NULL),              -- no pointer
      (12, 6, 50,   'CONCLUIDO',    0, 100, 60.0, 1, 1006, NULL,      '2026-11-01 00:00:00'), -- soft-deleted cycle: out of scope
      (13, 1, 50,   'CONCLUIDO',    1, 100, 60.0, 1, 1005, NULL,      NULL),              -- other tenant cycle: out of scope
      (14, 6, 51,   'CONCLUIDO',    0, 100, 60.0, 1, 1005, NULL,      NULL),              -- pointer to other-tenant history: listed, not altered
      (15, 6, 51,   'CONCLUIDO',    0, 100, 60.0, 1, 9999, NULL,      NULL);              -- pointer to missing history: listed, not altered
  `);
}

describe('LMS cycle dangling pointer batch (local SQLite only)', () => {
  let db: DatabaseSync;
  let manifest: ExecutionManifest;
  const opts = () => ({ expectedPlanHash: manifest.plan_sha256, expectedCount: manifest.row_count });
  const forward = (p: ExecutorPort, extra: Partial<Parameters<typeof executeManifest>[0]> = {}) =>
    executeManifest({ port: p, manifest, direction: 'forward', ...opts(), ...extra });

  beforeEach(() => {
    db = new NodeDatabaseSync(':memory:');
    createSchema(db);
    seed(db);
    const plan = buildPlan(readInventory(port(db)));
    if (!plan.manifest) throw new Error('expected a manifest');
    manifest = { ...plan.manifest, source_sha: SHA };
  });
  afterEach(() => db.close());

  it('plans only active tenant-6 cycles pointing to soft-deleted tenant-6 histories, and lists the rest without acting', () => {
    const { summary, manifest: m } = buildPlan(readInventory(port(db)));
    expect(m?.cycle_pointers).toEqual([
      { cycle_id: 8, matricula_id: 50, historico_id: 1001 },
      { cycle_id: 9, matricula_id: 50, historico_id: 1002 },
      { cycle_id: 296, matricula_id: null, historico_id: 1003 },
    ]);
    expect(summary.row_count).toBe(3);
    expect(summary.corrigible_cycle_ids).toEqual([8, 9, 296]);
    expect(summary.corrigible_without_matricula).toBe(1);
    expect(summary.classes).toEqual({
      dangling_soft_deleted_history: 3, pointer_to_live_history: 1, pointer_to_other_tenant_history: 1, pointer_to_missing_history: 1,
    });
    expect(summary.ids_by_class.pointer_to_other_tenant_history).toEqual([14]);
    expect(summary.ids_by_class.pointer_to_missing_history).toEqual([15]);
    expect(summary).toMatchObject({ writes: 0, pii_emitted: false, histories_restored: 0, count_cap: 100 });
    expect(summary.plan_sha256).toBe(m!.plan_sha256);
  });

  it('plans nothing (no manifest) when no pointer dangles', () => {
    db.exec('UPDATE lms_matricula_ciclos SET qualificacao_historico_id = NULL WHERE id IN (8, 9, 296)');
    const { manifest: m, summary } = buildPlan(readInventory(port(db)));
    expect(m).toBeNull();
    expect(summary.plan_sha256).toBeNull();
    expect(summary.row_count).toBe(0);
  });

  it('is deterministic regardless of read order and refuses plans above the count cap', () => {
    const inventory = readInventory(port(db));
    const reversed = { cycles: [...inventory.cycles].reverse() };
    expect(buildPlan(reversed).manifest!.plan_sha256).toBe(manifest.plan_sha256);
    expect(hashBody(manifest)).toBe(manifest.plan_sha256);
    const many = { cycles: Array.from({ length: 101 }, (_, i) => ({
      id: i + 1, matricula_id: 1, qualificacao_historico_id: 1000 + i, historico_found: 1000 + i, historico_empresa_id: 6, historico_deleted: 1,
    })) };
    expect(() => buildPlan(many)).toThrow('PLAN_EXCEEDS_COUNT_CAP');
  });

  it('dry-run reads only and never calls exec', () => {
    const p = port(db);
    const before = JSON.stringify(rows(db, 'SELECT * FROM lms_matricula_ciclos'));
    const report = forward(p);
    expect(p.statements).toEqual([]);
    expect(report).toMatchObject({ mode: 'dry-run', pending: 3, postconditions_verified: true, dangling_total_before: 3 });
    expect(report.conflicts).toEqual([]);
    expect(JSON.stringify(rows(db, 'SELECT * FROM lms_matricula_ciclos'))).toBe(before);
  });

  it('apply: one CAS+audit per row; only the pointer changes; histories, enrollments, scorm and cycle state untouched', () => {
    const others = snapshotAll(db);
    const cyclesBefore = cyclesWithoutPointer(db);
    const p = port(db);
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report).toMatchObject({ postconditions_verified: true, changed: 3, pending: 0, writes_attempted: 3, dangling_total_before: 3, dangling_total_after: 0 });
    for (const id of [8, 9, 296]) expect(cycle(db, id).qualificacao_historico_id).toBeNull();
    // out-of-scope rows keep their pointers
    expect(cycle(db, 10).qualificacao_historico_id).toBe(1004);
    expect(cycle(db, 12).qualificacao_historico_id).toBe(1006);
    expect(cycle(db, 13).qualificacao_historico_id).toBe(1005);
    expect(cycle(db, 14).qualificacao_historico_id).toBe(1005);
    expect(cycle(db, 15).qualificacao_historico_id).toBe(9999);
    expect(snapshotAll(db)).toBe(others);
    expect(cyclesWithoutPointer(db)).toBe(cyclesBefore);

    const log = audits(db);
    expect(log).toHaveLength(3);
    expect(log.every((a) => a.empresa_id === 6 && a.action === auditAction('forward') && a.entity_type === 'lms_matricula_ciclos')).toBe(true);
    expect(log.map((a) => a.entity_id)).toEqual([8, 9, 296]);
    expect(JSON.parse(String(log[2].new_values))).toMatchObject({
      qualificacao_historico_id: null, origin: AUDIT_ORIGIN, actor: ACTOR, plan_sha256: manifest.plan_sha256, source_sha: SHA,
      direction: 'forward', matricula_id: null, historico_id: 1003,
    });
    expect(JSON.parse(String(log[0].old_values))).toEqual({ qualificacao_historico_id: 1001 });
    for (const sql of p.statements) {
      expect(sql).toMatch(/empresa_id = 6/);
      const set = /SET([\s\S]*?)\sWHERE/.exec(sql)?.[1] ?? '';
      expect(set.replace(/\s+/g, ' ').trim()).toBe("qualificacao_historico_id = NULL, updated_at = datetime('now')");
    }
  });

  it('is idempotent: a second apply writes nothing and the planner then finds nothing', () => {
    forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
    const second = port(db);
    const report = forward(second, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(second.statements).toEqual([]);
    expect(report.already_applied).toBe(3);
    expect(audits(db)).toHaveLength(3);
    expect(buildPlan(readInventory(port(db))).manifest).toBeNull();
  });

  it('aborts before the first write when a row changed since planning (CAS preflight)', () => {
    db.exec('UPDATE lms_matricula_ciclos SET qualificacao_historico_id = 1004 WHERE id = 9');
    const p = port(db);
    let error: (Error & { report?: { conflicts: Array<{ id: number; reason: string }> } }) | undefined;
    try { forward(p, { apply: true, actor: ACTOR, sourceSha: SHA }); } catch (e) { error = e as Error; }
    expect(error?.message).toBe('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
    expect(error?.report?.conflicts).toEqual([{ id: 9, reason: 'row_changed_since_plan' }]);
    expect(p.statements).toEqual([]);
    expect(audits(db)).toEqual([]);
  });

  it('aborts when the history was restored (no longer soft-deleted) or the cycle was soft-deleted/re-parented', () => {
    db.exec("UPDATE qualificacoes_historico SET deleted_at = NULL WHERE id = 1001; UPDATE lms_matricula_ciclos SET deleted_at = '2026-11-05' WHERE id = 9; UPDATE lms_matricula_ciclos SET matricula_id = 51 WHERE id = 296");
    const p = port(db);
    let error: (Error & { report?: { conflicts: Array<{ id: number; reason: string }> } }) | undefined;
    try { forward(p, { apply: true, actor: ACTOR, sourceSha: SHA }); } catch (e) { error = e as Error; }
    expect(error?.report?.conflicts).toEqual([
      { id: 8, reason: 'historico_not_soft_deleted' },
      { id: 9, reason: 'guard_fields_changed' },
      { id: 296, reason: 'guard_fields_changed' },
    ]);
    expect(p.statements).toEqual([]);
  });

  it('statement CAS detects a history restored between preflight and write and audits nothing for that row', () => {
    const p = port(db, (sql) => {
      if (sql.includes('UPDATE lms_matricula_ciclos') && sql.includes('WHERE id = 9\n')) {
        db.exec('UPDATE qualificacoes_historico SET deleted_at = NULL WHERE id = 1002');
      }
    });
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.cas_conflicts).toEqual([{ id: 9 }]);
    expect(report.postconditions_verified).toBe(false);
    expect(cycle(db, 9).qualificacao_historico_id).toBe(1002);
    expect(audits(db).some((a) => a.entity_id === 9)).toBe(false);
  });

  it('refuses tampered manifests, wrong hashes, wrong source SHA, bad actors and unsorted/duplicate rows', () => {
    const tampered = { ...manifest, cycle_pointers: manifest.cycle_pointers.map((x) => (x.cycle_id === 8 ? { ...x, historico_id: 1004 } : x)) };
    expect(() => executeManifest({ port: port(db), manifest: tampered, ...opts() })).toThrow('MANIFEST_HASH_MISMATCH');
    expect(() => executeManifest({ port: port(db), manifest, ...opts(), expectedPlanHash: 'f'.repeat(64) })).toThrow('EXPECTED_PLAN_HASH_MISMATCH');
    expect(() => executeManifest({ port: port(db), manifest, ...opts(), expectedCount: 2 })).toThrow('EXPECTED_ROW_COUNT_MISMATCH');
    expect(() => forward(port(db), { apply: true, actor: ACTOR, sourceSha: 'd'.repeat(40) })).toThrow('MANIFEST_SOURCE_SHA_MISMATCH');
    expect(() => forward(port(db), { apply: true, actor: 'bad actor!', sourceSha: SHA })).toThrow('ACTOR_INVALID');
    expect(() => buildExecutionManifest({ cycle_pointers: [{ cycle_id: 9, matricula_id: 1, historico_id: 1 }, { cycle_id: 8, matricula_id: 1, historico_id: 1 }] }))
      .toThrow('MANIFEST_CPTR_NOT_SORTED_OR_DUPLICATE');
    expect(() => buildExecutionManifest({ cycle_pointers: [{ cycle_id: 8, matricula_id: 0, historico_id: 1 }] })).toThrow('CPTR_ROW_MATRICULA_ID');
    expect(() => buildExecutionManifest({ cycle_pointers: [] })).toThrow('MANIFEST_ROW_COUNT');
  });

  it('the forward statement carries the soft-deleted guard and the rollback statement does not need it', () => {
    const op: CycleOperation = { id: 8, spec: manifest.cycle_pointers[0], from: { qh: 1001 }, to: { qh: null }, direction: 'forward' };
    expect(casUpdateSql(op)).toContain('h.deleted_at IS NOT NULL');
    const inverse: CycleOperation = { ...op, direction: 'rollback', from: { qh: null }, to: { qh: 1001 } };
    const rollbackSql = casUpdateSql(inverse, { forwardPlanSha256: manifest.plan_sha256 });
    expect(rollbackSql).not.toContain('h.deleted_at');
    expect(rollbackSql).toContain('qualificacao_historico_id IS NULL');
    // rollback is bound to the post-apply fingerprint recorded by the forward audit row
    expect(rollbackSql).toContain('applied_fingerprint');
    expect(() => casUpdateSql(inverse)).toThrow('FORWARD_PLAN_HASH_REQUIRED');
  });

  describe('rollback', () => {
    let rollback: RollbackManifest;
    beforeEach(() => {
      rollback = buildRollbackManifest(manifest, opts());
    });
    const back = (p: ExecutorPort, extra: Partial<Parameters<typeof executeManifest>[0]> = {}) =>
      executeManifest({
        port: p, manifest: rollback, direction: 'rollback', expectedPlanHash: rollback.rollback_plan_sha256,
        expectedCount: manifest.row_count, ...extra,
      });

    it('restores every pointer exactly and audits each inverse operation', () => {
      const before = JSON.stringify(rows(db, 'SELECT id, qualificacao_historico_id, status, score_final FROM lms_matricula_ciclos ORDER BY id'));
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      const report = back(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report).toMatchObject({ postconditions_verified: true, changed: 3, dangling_total_after: 3 });
      expect(JSON.stringify(rows(db, 'SELECT id, qualificacao_historico_id, status, score_final FROM lms_matricula_ciclos ORDER BY id'))).toBe(before);
      expect(audits(db).filter((a) => a.action === auditAction('rollback'))).toHaveLength(3);
    });

    it('does nothing for operations the forward plan never applied', () => {
      const p = port(db);
      const report = back(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(p.statements).toEqual([]);
      expect(report.skipped_not_applied).toBe(3);
    });

    it('fails closed (conflict, zero writes) when a completion reversal changed the cycle after apply', () => {
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      // simulated lms-completion-reversal: pointer already NULL, completion invalidated, updated_at bumped
      db.exec("UPDATE lms_matricula_ciclos SET status = 'EM_ANDAMENTO', progresso_pct = 0, data_conclusao = NULL, updated_at = '2030-01-01 00:00:00' WHERE id = 9");
      const p = port(db);
      const auditsBefore = audits(db).length;
      let error: (Error & { report?: { conflicts: Array<{ id: number; reason: string }> } }) | undefined;
      try { back(p, { apply: true, actor: ACTOR, sourceSha: SHA }); } catch (e) { error = e as Error; }
      expect(error?.message).toBe('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
      expect(error?.report?.conflicts).toEqual([{ id: 9, reason: 'cycle_changed_after_apply' }]);
      expect(p.statements).toEqual([]);
      expect(audits(db)).toHaveLength(auditsBefore);
      expect(cycle(db, 9).qualificacao_historico_id).toBeNull();
      // dry-run also reports the conflict
      expect(back(port(db)).postconditions_verified).toBe(false);
    });

    it('fails closed even when only state (not updated_at) changed after apply', () => {
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      const stamp = cycle(db, 8).updated_at;
      db.exec(`UPDATE lms_matricula_ciclos SET status = 'EM_ANDAMENTO', updated_at = '${stamp}' WHERE id = 8`);
      const report = back(port(db));
      expect(report.conflicts).toEqual([{ id: 8, reason: 'cycle_changed_after_apply' }]);
    });

    it('statement guard blocks a reversal landing between rollback preflight and write', () => {
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      const p = port(db, (sql) => {
        if (sql.includes('UPDATE lms_matricula_ciclos') && sql.includes('WHERE id = 9\n')) {
          db.exec("UPDATE lms_matricula_ciclos SET progresso_pct = 10, updated_at = '2030-01-01 00:00:00' WHERE id = 9");
        }
      });
      const report = back(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.cas_conflicts).toEqual([{ id: 9 }]);
      expect(report.postconditions_verified).toBe(false);
      expect(cycle(db, 9).qualificacao_historico_id).toBeNull();
      expect(audits(db).some((a) => a.entity_id === 9 && a.action === auditAction('rollback'))).toBe(false);
    });

    it('rejects a rollback manifest with a tampered hash', () => {
      expect(() => executeManifest({
        port: port(db), manifest: { ...rollback, rollback_plan_sha256: 'a'.repeat(64) }, direction: 'rollback',
        expectedPlanHash: 'a'.repeat(64), expectedCount: manifest.row_count,
      })).toThrow('ROLLBACK_HASH_MISMATCH');
    });
  });
});
