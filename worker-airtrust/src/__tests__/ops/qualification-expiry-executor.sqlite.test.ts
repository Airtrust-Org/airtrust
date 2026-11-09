import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database, insertHistory } from '../helpers/qualification-history-sqlite-d1';
import { buildInventorySelectSql, buildPlan } from '../../../../scripts/production/qualification-expiry-legacy-readonly-plan.mjs';
import {
  AUDIT_ACTION_APPLY,
  AUDIT_ACTION_ROLLBACK,
  buildExecutionManifest,
  buildRollbackManifest,
  executeManifest,
  type ExecutionManifest,
  type ExecutorPort,
} from '../../../../scripts/production/lib/qualification-expiry-executor.mjs';

const SHA = 'a'.repeat(40);
const ACTOR = 'tester';

type Row = Record<string, unknown>;

function port(db: SqliteD1Database, beforeExec?: (sql: string, index: number) => void): ExecutorPort & { statements: string[] } {
  const statements: string[] = [];
  return {
    statements,
    query: (sql: string) => db.database.prepare(sql).all() as Row[],
    exec: (sql: string) => {
      beforeExec?.(sql, statements.length);
      statements.push(sql);
      db.database.exec(`BEGIN IMMEDIATE;\n${sql};\nCOMMIT;`);
    },
  };
}

function history(db: SqliteD1Database): Row[] {
  return db.database.prepare('SELECT * FROM qualificacoes_historico ORDER BY id').all() as Row[];
}
function audits(db: SqliteD1Database, action?: string): Row[] {
  return db.database
    .prepare('SELECT * FROM audit_logs WHERE (? IS NULL OR action = ?) ORDER BY id')
    .all(action ?? null, action ?? null) as Row[];
}

interface Seed {
  exact: number;
  endOfMonthLeap: number;
  leapExact: number;
  certificate: number;
  uploaded: number;
  cma: number;
  planned: number;
  noValidity: number;
  otherTenant: number;
  consistent: number;
}

function seed(db: SqliteD1Database): Seed {
  db.database.exec(`
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, categoria, validade, vencimento_fim_mes) VALUES
      (600, 6, 'MNT_S76AC', 'MANUTENCAO', 24, 0),
      (601, 6, 'EOM_MODEL', 'MANUTENCAO', 12, 1),
      (602, 6, 'CMA', 'MANUTENCAO', 12, 0),
      (603, 6, 'NO_VALIDITY', 'MANUTENCAO', NULL, 0);
  `);
  const mk = (n: number, opts: Parameters<typeof insertHistory>[1]) =>
    insertHistory(db.database, { funcionarioId: 7000 + n, empresaId: 6, ...opts });
  const exact = mk(1, { qualificationId: 600, qualificationCode: 'MNT_S76AC', completionDate: '2024-01-15', expiryDate: '2025-01-15', validityMonths: 12 });
  const endOfMonthLeap = mk(2, { qualificationId: 601, qualificationCode: 'EOM_MODEL', completionDate: '2024-02-29', expiryDate: null, validityMonths: 6 });
  const leapExact = mk(3, { qualificationId: 600, qualificationCode: 'MNT_S76AC', completionDate: '2024-02-29', expiryDate: '2025-02-28', validityMonths: 12 });
  const certificate = mk(4, { qualificationId: 600, qualificationCode: 'MNT_S76AC', completionDate: '2024-03-10', expiryDate: '2025-03-10', validityMonths: 12 });
  db.database.exec(`UPDATE qualificacoes_historico SET certificado_arquivo_id = 55 WHERE id = ${certificate}`);
  const uploaded = mk(5, { qualificationId: 600, qualificationCode: 'MNT_S76AC', completionDate: '2024-03-11', expiryDate: '2025-03-11', validityMonths: 12 });
  db.database.exec(`UPDATE qualificacoes_historico SET arquivo_url = 'r2://redacted' WHERE id = ${uploaded}`);
  const cma = mk(6, { qualificationId: 602, qualificationCode: 'CMA', completionDate: '2024-04-01', expiryDate: '2025-04-01', validityMonths: 6 });
  const planned = mk(7, { qualificationId: 600, qualificationCode: 'MNT_S76AC', status: 'PLANEJADA', completionDate: '2024-04-02', expiryDate: '2025-04-02', validityMonths: 12 });
  const noValidity = mk(8, { qualificationId: 603, qualificationCode: 'NO_VALIDITY', completionDate: '2024-04-03', expiryDate: '2025-04-03', validityMonths: 12 });
  const consistent = mk(9, { qualificationId: 600, qualificationCode: 'MNT_S76AC', completionDate: '2024-05-01', expiryDate: '2026-05-01', validityMonths: 24 });
  // Stale-looking row of ANOTHER tenant using the same model code: must never be touched.
  const otherTenant = insertHistory(db.database, {
    funcionarioId: 1000, empresaId: 1, qualificationId: 100, qualificationCode: 'MNT-12',
    completionDate: '2024-01-15', expiryDate: '2025-01-15', validityMonths: 6,
  });
  return { exact, endOfMonthLeap, leapExact, certificate, uploaded, cma, planned, noValidity, otherTenant, consistent };
}

function planFor(db: SqliteD1Database) {
  const rows = db.database.prepare(buildInventorySelectSql()).all() as Row[];
  return buildPlan(rows);
}

describe('qualification expiry governed executor (local SQLite only)', () => {
  let db: SqliteD1Database;
  let ids: Seed;
  let manifest: ExecutionManifest;
  const opts = () => ({ expectedPlanHash: manifest.plan_sha256, expectedCount: manifest.row_count });

  beforeEach(() => {
    db = new SqliteD1Database();
    // Production-shaped columns the shared helper does not declare.
    db.database.exec(`
      ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE qualificacoes_historico ADD COLUMN certificado_arquivo_id INTEGER;
      ALTER TABLE qualificacoes_historico ADD COLUMN arquivo_url TEXT;
      ALTER TABLE qualificacoes_historico ADD COLUMN origem_tipo TEXT;
      ALTER TABLE qualificacoes_historico ADD COLUMN lms_matricula_id INTEGER;
    `);
    db.database.exec(`CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      empresa_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`);
    ids = seed(db);
    manifest = buildExecutionManifest(planFor(db), { sourceSha: SHA });
  });
  afterEach(() => db.close());

  it('plans only eligible rows and keeps protected rows out of the manifest', () => {
    expect(manifest.rows.map((r) => r.id)).toEqual([ids.exact, ids.endOfMonthLeap, ids.leapExact]);
    const plan = planFor(db);
    expect(plan.blocked.issued_certificate_requires_review).toBe(2);
    expect(plan.blocked.regulatory_special_case).toBe(1);
    expect(plan.blocked.non_realized_or_unrecognized_status).toBe(1);
    expect(plan.blocked.model_validity_ambiguous).toBe(1);
  });

  it('applies exact-day, end-of-month and leap-year rules per model', () => {
    const byId = new Map(manifest.rows.map((r) => [r.id, r]));
    expect(byId.get(ids.exact)?.next_expiry).toBe('2026-01-15');
    // end-of-month model, 12 months from 2024-02-29 -> last day of Feb 2025
    expect(byId.get(ids.endOfMonthLeap)?.next_expiry).toBe('2025-02-28');
    // exact-day 24 months from a leap day: planner rule rolls 2026-02-29 over to 2026-03-01
    expect(byId.get(ids.leapExact)?.next_expiry).toBe('2026-03-01');
  });

  it('produces a deterministic manifest regardless of input order', () => {
    const plan = planFor(db);
    const shuffled = { ...plan, candidates: [...plan.candidates].reverse() };
    const again = buildExecutionManifest(shuffled, { sourceSha: SHA });
    expect(JSON.stringify(again)).toBe(JSON.stringify(manifest));
    expect(manifest.plan_sha256).toBe(plan.plan_sha256);
  });

  it('dry-run never writes', () => {
    const before = JSON.stringify(history(db));
    const p = port(db);
    const report = executeManifest({ port: p, manifest, ...opts() });
    expect(report.mode).toBe('dry-run');
    expect(report.pending).toBe(3);
    expect(p.statements).toHaveLength(0);
    expect(JSON.stringify(history(db))).toBe(before);
    expect(audits(db)).toHaveLength(0);
  });

  it('applies with per-row audit, touches only expiry fields, and is idempotent', () => {
    const before = history(db);
    const first = executeManifest({ port: port(db), manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    expect(first.changed).toBe(3);
    expect(first.postconditions_verified).toBe(true);
    const after = history(db);
    for (let i = 0; i < before.length; i++) {
      const { data_vencimento: _a, validade_meses: _b, updated_at: _c, ...restBefore } = before[i];
      const { data_vencimento: _d, validade_meses: _e, updated_at: _f, ...restAfter } = after[i];
      expect(restAfter).toEqual(restBefore);
    }
    const target = after.find((r) => r.id === ids.exact);
    expect(target?.data_vencimento).toBe('2026-01-15');
    expect(target?.validade_meses).toBe(24);
    const log = audits(db, AUDIT_ACTION_APPLY);
    expect(log).toHaveLength(3);
    const detail = JSON.parse(String(log[0].new_values));
    expect(detail).toMatchObject({ actor: ACTOR, plan_sha256: manifest.plan_sha256, source_sha: SHA, direction: 'forward' });
    expect(log[0].empresa_id).toBe(6);
    expect(JSON.parse(String(log[0].old_values))).toHaveProperty('data_vencimento');

    const snapshot = JSON.stringify(history(db));
    const second = executeManifest({ port: port(db), manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    expect(second.changed).toBe(0);
    expect(second.writes_attempted).toBe(0);
    expect(second.already_applied).toBe(3);
    expect(JSON.stringify(history(db))).toBe(snapshot);
    expect(audits(db, AUDIT_ACTION_APPLY)).toHaveLength(3);
  });

  it('leaves cross-tenant, certificate, regulatory, status and no-validity rows untouched', () => {
    const before = history(db);
    executeManifest({ port: port(db), manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    const after = history(db);
    for (const untouched of [ids.otherTenant, ids.certificate, ids.uploaded, ids.cma, ids.planned, ids.noValidity, ids.consistent]) {
      expect(after.find((r) => r.id === untouched)).toEqual(before.find((r) => r.id === untouched));
    }
  });

  it('every generated statement is tenant scoped and carries the certificate guard', () => {
    const p = port(db);
    executeManifest({ port: p, manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    expect(p.statements).toHaveLength(3);
    for (const sql of p.statements) {
      expect(sql).toMatch(/UPDATE qualificacoes_historico[\s\S]*empresa_id = 6[\s\S]*certificado_arquivo_id IS NULL/);
      expect(sql).toMatch(/INSERT INTO audit_logs[\s\S]*changes\(\) > 0/);
      expect(sql).toMatch(/\s6, datetime\('now'\)/);
    }
  });

  it('refuses a wrong plan hash, wrong count, tampered rows or missing actor', () => {
    const base = { port: port(db), manifest };
    expect(() => executeManifest({ ...base, expectedPlanHash: 'b'.repeat(64), expectedCount: 3 })).toThrow('EXPECTED_PLAN_HASH_MISMATCH');
    expect(() => executeManifest({ ...base, expectedPlanHash: manifest.plan_sha256, expectedCount: 2 })).toThrow('EXPECTED_ROW_COUNT_MISMATCH');
    expect(() => executeManifest({ ...base, ...opts(), apply: true, sourceSha: SHA })).toThrow('ACTOR_INVALID');
    const tampered = JSON.parse(JSON.stringify(manifest)) as ExecutionManifest;
    tampered.rows[0].next_expiry = '2030-01-01';
    expect(() => executeManifest({ ...base, manifest: tampered, ...opts() })).toThrow('MANIFEST_ROW_EXPIRY_RULE_MISMATCH');
    const foreign = JSON.parse(JSON.stringify(manifest)) as ExecutionManifest;
    foreign.rows[0].empresa_id = 1;
    expect(() => executeManifest({ ...base, manifest: foreign, ...opts() })).toThrow('MANIFEST_ROW_TENANT');
    const withCertificate = JSON.parse(JSON.stringify(manifest)) as ExecutionManifest;
    (withCertificate.rows[0] as unknown as Record<string, unknown>).expected_certificate_id = 9;
    expect(() => executeManifest({ ...base, manifest: withCertificate, ...opts() })).toThrow('MANIFEST_ROW_HAS_CERTIFICATE');
  });

  it('aborts before any write when a row drifted since planning (preflight CAS conflict)', () => {
    db.database.exec(`UPDATE qualificacoes_historico SET data_vencimento = '2025-06-30' WHERE id = ${ids.exact}`);
    const before = JSON.stringify(history(db));
    let error: (Error & { report?: { conflicts: Array<{ id: number; reason: string }> } }) | undefined;
    try {
      executeManifest({ port: port(db), manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    } catch (caught) {
      error = caught as typeof error;
    }
    expect(error?.message).toBe('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
    expect(error?.report?.conflicts).toEqual([{ id: ids.exact, reason: 'row_changed_since_plan' }]);
    expect(JSON.stringify(history(db))).toBe(before);
    expect(audits(db)).toHaveLength(0);
  });

  it('a certificate published after planning blocks that row', () => {
    db.database.exec(`UPDATE qualificacoes_historico SET certificado_arquivo_id = 77 WHERE id = ${ids.endOfMonthLeap}`);
    const report = executeManifest({ port: port(db), manifest, ...opts() });
    expect(report.conflicts).toEqual([{ id: ids.endOfMonthLeap, reason: 'guard_fields_changed_or_certificate_present' }]);
  });

  it('records a CAS race between preflight and write without auditing or overwriting the raced row', () => {
    const racing = port(db, (_sql, index) => {
      if (index === 0) db.database.exec(`UPDATE qualificacoes_historico SET data_vencimento = '2099-12-31' WHERE id = ${ids.exact}`);
    });
    const report = executeManifest({ port: racing, manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    expect(report.cas_conflicts).toEqual([ids.exact]);
    expect(report.changed).toBe(2);
    expect(report.postconditions_verified).toBe(false);
    expect(history(db).find((r) => r.id === ids.exact)?.data_vencimento).toBe('2099-12-31');
    expect(audits(db, AUDIT_ACTION_APPLY).map((r) => r.entity_id)).toEqual([ids.endOfMonthLeap, ids.leapExact]);
  });

  it('rolls back through the inverse CAS manifest, idempotently, restoring original values', () => {
    const original = history(db);
    executeManifest({ port: port(db), manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    const rollback = buildRollbackManifest(manifest, opts());
    expect(JSON.stringify(buildRollbackManifest(manifest, opts()))).toBe(JSON.stringify(rollback));
    const rbOpts = { expectedPlanHash: rollback.rollback_plan_sha256, expectedCount: rollback.row_count };

    const dry = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', ...rbOpts });
    expect(dry.pending).toBe(3);

    const applied = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', apply: true, actor: ACTOR, sourceSha: SHA, ...rbOpts });
    expect(applied.changed).toBe(3);
    expect(applied.postconditions_verified).toBe(true);
    const restored = history(db);
    for (const row of original) {
      const now = restored.find((r) => r.id === row.id);
      expect(now?.data_vencimento).toBe(row.data_vencimento);
      expect(now?.validade_meses).toBe(row.validade_meses);
      expect(now?.data_conclusao).toBe(row.data_conclusao);
      expect(now?.status).toBe(row.status);
    }
    expect(audits(db, AUDIT_ACTION_ROLLBACK)).toHaveLength(3);

    const again = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', apply: true, actor: ACTOR, sourceSha: SHA, ...rbOpts });
    expect(again.changed).toBe(0);
    expect(again.already_applied).toBe(3);
    expect(audits(db, AUDIT_ACTION_ROLLBACK)).toHaveLength(3);
  });

  it('rollback refuses rows never applied by the forward plan or edited after apply', () => {
    const rollback = buildRollbackManifest(manifest, opts());
    const rbOpts = { expectedPlanHash: rollback.rollback_plan_sha256, expectedCount: rollback.row_count };
    // Not applied yet: live rows already sit at the rollback target but no rollback audit exists.
    const notApplied = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', ...rbOpts });
    expect(notApplied.conflicts).toEqual([]);
    expect(notApplied.skipped_not_applied).toBe(3);
    expect(notApplied.pending).toBe(0);

    executeManifest({ port: port(db), manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    db.database.exec(`UPDATE qualificacoes_historico SET data_vencimento = '2031-01-01' WHERE id = ${ids.leapExact}`);
    const edited = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', ...rbOpts });
    expect(edited.conflicts).toEqual([{ id: ids.leapExact, reason: 'row_changed_since_plan' }]);
  });

  it('a model rule change between preflight and UPDATE becomes a CAS conflict (not applied, not audited)', () => {
    const racing = port(db, (_sql, index) => {
      if (index === 0) db.database.exec('UPDATE qualificacoes_tipos SET validade = 36 WHERE id = 600');
    });
    const report = executeManifest({ port: racing, manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    expect(report.cas_conflicts).toEqual([ids.exact, ids.leapExact]);
    expect(report.changed).toBe(1);
    expect(report.postconditions_verified).toBe(false);
    const rows = history(db);
    expect(rows.find((r) => r.id === ids.exact)?.data_vencimento).toBe('2025-01-15');
    expect(audits(db, AUDIT_ACTION_APPLY).map((r) => r.entity_id)).toEqual([ids.endOfMonthLeap]);
    for (const change of [
      'UPDATE qualificacoes_tipos SET vencimento_fim_mes = 0 WHERE id = 601',
      "UPDATE qualificacoes_tipos SET deleted_at = datetime('now') WHERE id = 601",
      "UPDATE qualificacoes_tipos SET codigo = 'RENAMED' WHERE id = 601",
    ]) {
      const fresh = new SqliteD1Database();
      fresh.database.exec(`ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE qualificacoes_historico ADD COLUMN certificado_arquivo_id INTEGER;
        ALTER TABLE qualificacoes_historico ADD COLUMN arquivo_url TEXT;
        ALTER TABLE qualificacoes_historico ADD COLUMN origem_tipo TEXT;
        ALTER TABLE qualificacoes_historico ADD COLUMN lms_matricula_id INTEGER;
        CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity_type TEXT,
          entity_id INTEGER, old_values TEXT, new_values TEXT, empresa_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
      const freshIds = seed(fresh);
      const m = buildExecutionManifest(planFor(fresh), { sourceSha: SHA });
      const r = executeManifest({
        port: port(fresh, (_sql, index) => { if (index === 1) fresh.database.exec(change); }),
        manifest: m, apply: true, actor: ACTOR, sourceSha: SHA,
        expectedPlanHash: m.plan_sha256, expectedCount: m.row_count,
      });
      expect(r.cas_conflicts).toEqual([freshIds.endOfMonthLeap]);
      expect(r.postconditions_verified).toBe(false);
      fresh.close();
    }
  });

  it('does not report an applied row as success once its model changed', () => {
    executeManifest({ port: port(db), manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    db.database.exec('UPDATE qualificacoes_tipos SET validade = 36 WHERE id = 600');
    const report = executeManifest({ port: port(db), manifest, ...opts() });
    expect(report.conflicts.map((c) => c.reason)).toEqual(['model_changed_since_plan', 'model_changed_since_plan']);
    expect(report.postconditions_verified).toBe(false);
  });

  it('rollback after a partial forward run skips never-applied rows and restores the applied ones', () => {
    const original = history(db);
    const racing = port(db, (_sql, index) => {
      if (index === 0) db.database.exec('UPDATE qualificacoes_tipos SET validade = 36 WHERE id = 600');
    });
    executeManifest({ port: racing, manifest, apply: true, actor: ACTOR, sourceSha: SHA, ...opts() });
    db.database.exec('UPDATE qualificacoes_tipos SET validade = 24 WHERE id = 600');
    const rollback = buildRollbackManifest(manifest, opts());
    const rbOpts = { expectedPlanHash: rollback.rollback_plan_sha256, expectedCount: rollback.row_count };
    const dry = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', ...rbOpts });
    expect(dry.conflicts).toEqual([]);
    expect(dry.pending).toBe(1);
    expect(dry.skipped_not_applied).toBe(2);
    const applied = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', apply: true, actor: ACTOR, sourceSha: SHA, ...rbOpts });
    expect(applied.changed).toBe(1);
    expect(applied.skipped_not_applied).toBe(2);
    expect(applied.postconditions_verified).toBe(true);
    expect(history(db)).toEqual(original.map((r) => ({ ...r, updated_at: history(db).find((x) => x.id === r.id)?.updated_at })));
    expect(audits(db, AUDIT_ACTION_ROLLBACK).map((r) => r.entity_id)).toEqual([ids.endOfMonthLeap]);
    const again = executeManifest({ port: port(db), manifest: rollback, direction: 'rollback', apply: true, actor: ACTOR, sourceSha: SHA, ...rbOpts });
    expect(again.changed).toBe(0);
    expect(audits(db, AUDIT_ACTION_ROLLBACK)).toHaveLength(1);
  });

  it('a manifest id belonging to another tenant is reported out of scope and never updated', () => {
    const foreign = JSON.parse(JSON.stringify(manifest)) as ExecutionManifest;
    foreign.rows[foreign.rows.length - 1].id = ids.otherTenant;
    foreign.plan_sha256 = buildExecutionManifest({ rows: foreign.rows }).plan_sha256;
    const before = JSON.stringify(history(db).find((r) => r.id === ids.otherTenant));
    const report = executeManifest({
      port: port(db), manifest: foreign, expectedPlanHash: foreign.plan_sha256, expectedCount: foreign.row_count,
    });
    expect(report.conflicts).toContainEqual({ id: ids.otherTenant, reason: 'row_missing_deleted_or_out_of_scope' });
    expect(JSON.stringify(history(db).find((r) => r.id === ids.otherTenant))).toBe(before);
  });
});
