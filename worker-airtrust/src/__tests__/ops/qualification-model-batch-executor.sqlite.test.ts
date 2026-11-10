import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  buildBatchPlan,
  readInventory,
  type BatchInventory,
} from '../../../../scripts/production/qualification-model-batch-readonly-plan.mjs';
import {
  addMonthsClamped,
  auditAction,
  buildExecutionManifest,
  buildRollbackManifest,
  executeManifest,
  hashBody,
  type ExecutionManifest,
  type ExecutorPort,
  type RollbackManifest,
} from '../../../../scripts/production/lib/qualification-model-batch.mjs';

const SHA = 'b'.repeat(40);
const ACTOR = 'tester';

type Row = Record<string, unknown>;

function port(
  db: SqliteD1Database,
  beforeExec?: (sql: string, index: number) => void,
): ExecutorPort & { statements: string[] } {
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

const rows = (db: SqliteD1Database, sql: string): Row[] => db.database.prepare(sql).all() as Row[];
const histories = (db: SqliteD1Database) => rows(db, 'SELECT * FROM qualificacoes_historico ORDER BY id');
const tipos = (db: SqliteD1Database) => rows(db, 'SELECT * FROM qualificacoes_tipos ORDER BY id');
const audits = (db: SqliteD1Database) => rows(db, 'SELECT * FROM audit_logs ORDER BY id');
const history = (db: SqliteD1Database, id: number): Row => {
  const found = histories(db).find((r) => r.id === id);
  if (!found) throw new Error(`history ${id} missing`);
  return found;
};

const CERT_COLUMNS = ['certificado_arquivo_id', 'arquivo_url', 'numero_certificado', 'data_conclusao', 'status', 'funcionario_id', 'empresa_id'];
const pick = (row: Row, cols: string[]) => cols.map((c) => row[c]);

function createSchema(db: SqliteD1Database): void {
  db.database.exec(`
    ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE qualificacoes_tipos ADD COLUMN updated_at TEXT;
    ALTER TABLE qualificacoes_historico ADD COLUMN tipo TEXT;
    ALTER TABLE qualificacoes_historico ADD COLUMN certificado_arquivo_id INTEGER;
    ALTER TABLE qualificacoes_historico ADD COLUMN arquivo_url TEXT;
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER,
      old_values TEXT, new_values TEXT, empresa_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_historico_id INTEGER, updated_at TEXT);
    CREATE TABLE lms_matricula_ciclos (id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_historico_id INTEGER, updated_at TEXT);
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER);
  `);
}

function seed(db: SqliteD1Database): void {
  db.database.exec(`
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade, vencimento_fim_mes, deleted_at) VALUES
      (600, 6, 'M_EXACT', 'Modelo exato', 'EAD', NULL, 0, NULL),
      (601, 6, 'M_EOM', 'Modelo fim de mes', 'EAD', NULL, 1, NULL),
      (602, 6, 'M_SHARED', 'Modelo compartilhado', 'EAD', NULL, 0, NULL),
      (603, 6, 'M_EMPTY', 'Modelo sem historico', 'EAD', 0, 0, NULL),
      (604, 1, 'M_FOREIGN', 'Modelo de outro tenant', 'EAD', NULL, 0, NULL),
      (605, 6, 'M_OKVALIDITY', 'Modelo ja com validade', 'EAD', 12, 0, NULL),
      (700, 6, 'NR-11', 'NR-11 - Transporte, Movimentacao', 'EAD', 24, 0, NULL),
      (701, 6, 'NR-35', 'NR-35 - Trabalho em Altura', 'Presencial', 24, 0, NULL),
      (702, 6, 'LGPD', 'LGPD - Lei Geral', 'EAD', 24, 0, NULL),
      (800, 6, 'OUT_NR11', 'NR11 antigo', 'Outros', NULL, 0, '2026-01-01 00:00:00'),
      (801, 6, 'OUT_FISQP', 'FISQP antigo', 'Outros', NULL, 0, '2026-01-01 00:00:00'),
      (802, 6, 'OUT_NR35', 'NR35 antigo', 'Outros', NULL, 0, '2026-01-01 00:00:00'),
      (803, 6, 'OUT_LGPD', 'LGPD antigo', 'Outros', NULL, 0, '2026-01-01 00:00:00');
    INSERT INTO treinamento_requisitos (id, empresa_id, qualificacao_tipo_id) VALUES (1, 6, 600), (2, 6, 600), (3, 6, 601);
  `);
  const insert = db.database.prepare(`INSERT INTO qualificacoes_historico
    (id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, categoria, data_conclusao, data_vencimento, validade_meses,
     status, empresa_id, certificado_arquivo_id, arquivo_url, numero_certificado, renovacao_de, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);
  const h = (v: Array<string | number | null>) => insert.run(...v);
  // linked histories of M_EXACT / M_EOM (tenant 6)
  h([1, 11, 600, 'M_EXACT', null, 'EAD', '2024-02-29', null, null, 'CONCLUIDA', 6, 55, 'r2://private/redacted', 'CERT-1', null]);
  h([2, 12, 600, 'M_EXACT', null, 'EAD', '2024-05-10', '2025-05-10', 12, 'CONCLUIDO', 6, null, null, null, null]);
  h([3, 13, 600, 'M_EXACT', null, 'EAD', '2024-06-01', null, null, null, 6, null, 'r2://private/redacted2', null, null]);
  h([4, 14, 600, 'M_EXACT', null, 'EAD', '2024-07-01', null, null, 'CANCELADA', 6, null, null, null, null]);
  h([5, 15, 600, 'M_EXACT', null, 'EAD', null, null, null, 'CONCLUIDA', 6, null, null, null, null]);
  h([6, 16, 601, 'M_EOM', null, 'EAD', '2024-01-15', null, null, 'RENOVADA', 6, 56, 'r2://private/redacted3', 'CERT-6', null]);
  h([7, 17, 600, 'M_EXACT', null, 'EAD', '2024-08-01', '2026-08-01', 24, 'CONCLUIDA', 6, null, null, null, null]);
  // other tenant using M_SHARED
  h([20, 90, 602, 'M_SHARED', null, 'EAD', '2024-03-03', null, null, 'CONCLUIDA', 1, null, null, null, null]);
  h([21, 18, 602, 'M_SHARED', null, 'EAD', '2024-03-04', null, null, 'CONCLUIDA', 6, null, null, null, null]);
  // orphans from the owner list (ids are fixed in the planner)
  h([4970, 30, 800, 'OUT_NR11', 'NR11 antigo', 'Outros', '2024-10-15', null, null, 'CONCLUIDO', 6, 57, 'r2://private/redacted4', 'CERT-7', null]);
  h([4966, 31, 801, 'OUT_FISQP', 'FISQP antigo', 'Outros', '2024-10-11', null, null, 'CONCLUIDO', 6, 58, 'r2://private/redacted5', 'CERT-8', null]);
  h([5168, 32, 801, 'OUT_FISQP', 'FISQP antigo', 'Outros', '2018-09-01', null, null, 'CONCLUIDO', 6, null, null, null, null]);
  h([4989, 33, 801, 'OUT_FISQP', 'FISQP antigo', 'Outros', '2021-09-17', null, null, 'CONCLUIDO', 6, null, null, null, null]);
  h([5017, 34, 802, 'OUT_NR35', 'NR35 antigo', 'Outros', '2025-11-12', null, null, 'CONCLUIDO', 6, null, null, null, null]);
  h([5275, 35, 803, 'OUT_LGPD', 'LGPD antigo', 'Outros', '2025-01-01', null, null, 'CONCLUIDO', 6, null, null, null, null]);
  // duplicate of 5017 already living under the current NR-35 type (same employee and date) -> relink would collide
  h([7260, 34, 701, 'NR-35', 'NR-35 - Trabalho em Altura', 'Presencial', '2025-11-12', '2027-11-12', 24, 'CONCLUIDA', 6, null, null, null, null]);
  // LMS pointer on one of the soft-delete candidates
  db.database.exec('INSERT INTO lms_matriculas (id, empresa_id, qualificacao_historico_id) VALUES (1, 6, 4989)');
}

function makePlan(db: SqliteD1Database, reverse = false) {
  const inventory: BatchInventory = readInventory(port(db));
  if (reverse) {
    for (const key of Object.keys(inventory) as Array<keyof BatchInventory>) {
      const value = inventory[key];
      if (Array.isArray(value)) value.reverse();
    }
  }
  return buildBatchPlan(inventory, { today: '2026-11-10' });
}

describe('qualification model batch executor (local SQLite only)', () => {
  let db: SqliteD1Database;
  let manifest: ExecutionManifest;
  const opts = () => ({ expectedPlanHash: manifest.plan_sha256, expectedCount: manifest.row_count });
  const forward = (p: ExecutorPort, extra: Partial<Parameters<typeof executeManifest>[0]> = {}) =>
    executeManifest({ port: p, manifest, direction: 'forward', ...opts(), ...extra });

  beforeEach(() => {
    db = new SqliteD1Database();
    createSchema(db);
    seed(db);
    manifest = { ...makePlan(db).manifest, source_sha: SHA };
  });
  afterEach(() => db.close());

  it('clamps month additions (exact-day keeps/clamps the day, end-of-month mode returns the last day)', () => {
    expect(addMonthsClamped('2024-02-29', 24, false)).toBe('2026-02-28');
    expect(addMonthsClamped('2024-01-31', 1, false)).toBe('2024-02-29');
    expect(addMonthsClamped('2024-02-10', 24, true)).toBe('2026-02-28');
    expect(addMonthsClamped('2024-11-30', 3, false)).toBe('2025-02-28');
    expect(addMonthsClamped('not-a-date', 24)).toBeNull();
  });

  it('plans only models exclusively owned by tenant 6 and lists the rest as blocked', () => {
    const { summary, body } = makePlan(db);
    expect(body.models.map((m) => m.code)).toEqual(['M_EXACT', 'M_EOM', 'M_EMPTY']);
    const blocked = Object.fromEntries(summary.models.blocked_detail.map((b) => [b.code, b.reason]));
    expect(blocked).toEqual({
      M_SHARED: 'blocked_shared_with_other_tenant',
      M_FOREIGN: 'blocked_other_tenant_model',
      PERM: 'blocked_other_tenant_model', // base fixture type of tenant 1
    });
    // histories of the blocked shared model never enter the manifest
    expect(body.histories.every((x) => [600, 601].includes(x.qualificacao_id))).toBe(true);
    // M_OKVALIDITY already has a validity: untouched
    expect(body.models.some((m) => m.code === 'M_OKVALIDITY')).toBe(false);
  });

  it('applies the clamp per model, excludes unrealized rows with reason codes and never exposes PII', () => {
    const { summary, body } = makePlan(db);
    const byId = new Map(body.histories.map((x) => [x.id, x]));
    expect(byId.get(1)?.next_expiry).toBe('2026-02-28'); // leap day, exact-day clamp
    expect(byId.get(3)?.status).toBe(''); // NULL status with dates counts as realized
    expect(byId.get(6)?.next_expiry).toBe('2026-01-31'); // end-of-month model
    expect(byId.has(4)).toBe(false); // CANCELADA
    expect(byId.has(5)).toBe(false); // NULL data_conclusao
    expect(byId.has(7)).toBe(false); // already 24 months with the expected expiry
    expect(summary.linked_histories.excluded).toMatchObject({ status_not_realized: 1, completion_date_missing_or_invalid: 1, already_consistent: 1 });
    expect(JSON.stringify(summary)).not.toMatch(/r2:\/\/|CERT-/);
    expect(summary.pii_emitted).toBe(false);
    expect(summary.writes).toBe(0);
  });

  it('plans relink and soft-delete per owner decision and refuses collisions, lineage and LMS pointers', () => {
    const { summary, body } = makePlan(db);
    expect(body.relinks.map((r) => [r.id, r.to.code, r.next_validity_months])).toEqual([[4970, 'NR-11', 24], [5275, 'LGPD', 24]]);
    expect(body.soft_deletes.map((d) => d.id)).toEqual([4966, 5017, 5168]);
    expect(body.soft_deletes.find((d) => d.id === 5017)?.duplicate_of).toEqual({ id: 7260, qualificacao_id: 701, funcionario_id: 34 });
    expect(summary.orphans.excluded).toMatchObject({ lms_pointer_present: 1 });
    expect(summary.orphans.excluded).not.toHaveProperty('relink_code_collision');
    expect(summary.orphans.duplicate_of_live_row_soft_delete).toBe(1);
    expect(summary.orphans.certificates.soft_delete_with_certificate_id).toBe(1);
    expect(summary.orphans.certificates.soft_delete_with_uploaded_file).toBe(1);
  });

  it('resolves relink targets only inside tenant 6: another tenant reusing the code neither wins nor makes it ambiguous', () => {
    db.database.exec("INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade) VALUES (710, 1, 'NR-11', 'NR-11 outro tenant', 'EAD', 12)");
    const { body } = makePlan(db);
    expect(body.relinks.map((r) => [r.id, r.to.qualificacao_id])).toEqual([[4970, 700], [5275, 702]]);
    // a truly ambiguous in-scope target is still refused
    db.database.exec("INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade) VALUES (711, 6, 'NR-11', 'NR-11 duplicado', 'EAD', 24)");
    const ambiguous = makePlan(db);
    expect(ambiguous.body.relinks.map((r) => r.id)).toEqual([5275]);
    expect(ambiguous.summary.orphans.excluded).toMatchObject({ target_type_missing_or_ambiguous: 1 });
  });

  it('produces a deterministic manifest hash regardless of read order', () => {
    expect(makePlan(db, true).manifest.plan_sha256).toBe(makePlan(db).manifest.plan_sha256);
    expect(hashBody(makePlan(db).body)).toBe(manifest.plan_sha256);
  });

  it('dry-run reads only and never calls exec', () => {
    const p = port(db);
    const before = JSON.stringify([tipos(db), histories(db)]);
    const report = forward(p);
    expect(p.statements).toEqual([]);
    expect(report.mode).toBe('dry-run');
    expect(report.pending).toBe(manifest.row_count);
    expect(report.conflicts).toEqual([]);
    expect(report.postconditions_verified).toBe(true);
    expect(JSON.stringify([tipos(db), histories(db)])).toBe(before);
  });

  it('apply: updates models, histories, relinks and soft-deletes with one CAS+audit per operation and leaves certificate columns alone', () => {
    const before7260 = history(db, 7260).updated_at;
    const certBefore = new Map(histories(db).map((r) => [r.id as number, pick(r, CERT_COLUMNS)]));
    const p = port(db);
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.postconditions_verified).toBe(true);
    expect(report.changed).toBe(manifest.row_count);
    expect(report.writes_attempted).toBe(manifest.row_count);
    expect(report.pending_by_kind).toEqual({ model: 0, relink: 0, history: 0, softdelete: 0 });

    const model = tipos(db).find((t) => t.id === 600);
    expect(model?.validade).toBe(24);
    expect(tipos(db).find((t) => t.id === 602)?.validade).toBeNull(); // blocked shared model
    expect(tipos(db).find((t) => t.id === 604)?.validade).toBeNull(); // other tenant
    expect(history(db, 1)).toMatchObject({ data_vencimento: '2026-02-28', validade_meses: 24 });
    expect(history(db, 6)).toMatchObject({ data_vencimento: '2026-01-31', validade_meses: 24 });
    expect(history(db, 7)).toMatchObject({ data_vencimento: '2026-08-01', validade_meses: 24 }); // already consistent, untouched
    expect(history(db, 4).data_vencimento).toBeNull(); // CANCELADA untouched
    expect(history(db, 20).data_vencimento).toBeNull(); // other tenant untouched

    expect(history(db, 4970)).toMatchObject({
      qualificacao_id: 700, qualificacao_codigo: 'NR-11', tipo: 'NR-11 - Transporte, Movimentacao', categoria: 'EAD',
      data_vencimento: '2026-10-15', validade_meses: 24,
    });
    expect(history(db, 4966).deleted_at).not.toBeNull();
    expect(history(db, 5168).deleted_at).not.toBeNull();
    expect(history(db, 5017).deleted_at).not.toBeNull(); // duplicate of 7260
    expect(history(db, 7260).deleted_at).toBeNull(); // evidence row untouched
    expect(history(db, 7260).updated_at).toBe(before7260);
    expect(history(db, 4989).deleted_at).toBeNull(); // LMS pointer: excluded from plan

    for (const r of histories(db)) expect(pick(r, CERT_COLUMNS)).toEqual(certBefore.get(r.id as number));
    expect(audits(db)).toHaveLength(manifest.row_count);
    expect(audits(db).every((a) => a.empresa_id === 6)).toBe(true);
    expect(new Set(audits(db).map((a) => a.action))).toEqual(new Set([
      auditAction('model', 'forward'), auditAction('relink', 'forward'), auditAction('history', 'forward'), auditAction('softdelete', 'forward'),
    ]));
    // lms pointers untouched
    expect(rows(db, 'SELECT * FROM lms_matriculas')).toHaveLength(1);
    // every UPDATE carries the tenant predicate and never names certificate columns in SET
    for (const sql of p.statements) {
      expect(sql).toMatch(/empresa_id = 6/);
      const set = /SET([\s\S]*?)\sWHERE/.exec(sql)?.[1] ?? '';
      expect(set).not.toMatch(/certificado_arquivo_id|arquivo_url|numero_certificado|data_conclusao|status/);
    }
  });

  it('is idempotent: a second apply and the readback find everything already applied and write nothing', () => {
    forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
    const second = port(db);
    const report = forward(second, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(second.statements).toEqual([]);
    expect(report.already_applied).toBe(manifest.row_count);
    expect(report.pending).toBe(0);
    expect(report.postconditions_verified).toBe(true);
    expect(audits(db)).toHaveLength(manifest.row_count);
  });

  it('aborts before the first write when any row changed since planning (CAS preflight)', () => {
    db.database.exec("UPDATE qualificacoes_historico SET data_vencimento = '2030-01-01' WHERE id = 2");
    const p = port(db);
    let error: (Error & { report?: { conflicts: Array<{ kind: string; id: number; reason: string }> } }) | undefined;
    try { forward(p, { apply: true, actor: ACTOR, sourceSha: SHA }); } catch (e) { error = e as Error; }
    expect(error?.message).toBe('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
    expect(error?.report?.conflicts).toEqual([{ kind: 'history', id: 2, reason: 'row_changed_since_plan' }]);
    expect(p.statements).toEqual([]);
    expect(audits(db)).toEqual([]);
    expect(tipos(db).find((t) => t.id === 600)?.validade).toBeNull();
  });

  it('detects a concurrent change between preflight and the write (statement CAS) and reports it without auditing', () => {
    const p = port(db, (sql) => {
      if (sql.includes('UPDATE qualificacoes_historico') && sql.includes('WHERE id = 3\n')) {
        db.database.exec("UPDATE qualificacoes_historico SET status = 'CANCELADA' WHERE id = 3");
      }
    });
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.cas_conflicts).toEqual([{ kind: 'history', id: 3 }]);
    expect(report.postconditions_verified).toBe(false);
    expect(history(db, 3).data_vencimento).toBeNull();
    expect(audits(db).some((a) => a.entity_id === 3)).toBe(false);
  });

  it('refuses a manifest that touches a model or history of another tenant', () => {
    const foreignModel = buildExecutionManifest({
      ...makePlan(db).body,
      models: [...makePlan(db).body.models, { tipo_id: 604, code: 'M_FOREIGN', old_validity: null, next_validity: 24, end_of_month: 0 }].sort((a, b) => a.tipo_id - b.tipo_id),
    }, { sourceSha: SHA });
    const p = port(db);
    const report = executeManifest({
      port: p, manifest: foreignModel, expectedPlanHash: foreignModel.plan_sha256, expectedCount: foreignModel.row_count,
    });
    expect(report.conflicts).toContainEqual({ kind: 'model', id: 604, reason: 'row_missing_deleted_or_out_of_scope' });
    expect(() => executeManifest({
      port: p, manifest: foreignModel, apply: true, actor: ACTOR, sourceSha: SHA,
      expectedPlanHash: foreignModel.plan_sha256, expectedCount: foreignModel.row_count,
    })).toThrow('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
    expect(p.statements).toEqual([]);

    const foreignHistory = buildExecutionManifest({
      ...makePlan(db).body,
      histories: [...makePlan(db).body.histories, {
        id: 20, qualificacao_id: 600, model_code: 'M_EXACT', status: 'CONCLUIDA', completion: '2024-03-03',
        old_expiry: null, next_expiry: '2026-03-03', old_validity_months: null, next_validity_months: 24, end_of_month: 0,
      }].sort((a, b) => a.id - b.id),
    }, { sourceSha: SHA });
    const r2 = executeManifest({ port: port(db), manifest: foreignHistory, expectedPlanHash: foreignHistory.plan_sha256, expectedCount: foreignHistory.row_count });
    expect(r2.conflicts).toContainEqual({ kind: 'history', id: 20, reason: 'row_missing_deleted_or_out_of_scope' });
  });

  it('refuses a soft-delete when an LMS pointer or a successor appears after planning', () => {
    db.database.exec('INSERT INTO lms_matricula_ciclos (id, empresa_id, qualificacao_historico_id) VALUES (1, 6, 5168)');
    db.database.exec("UPDATE qualificacoes_historico SET renovacao_de = 4966 WHERE id = 2");
    const report = forward(port(db));
    expect(report.conflicts).toEqual(expect.arrayContaining([
      { kind: 'softdelete', id: 5168, reason: 'lms_pointer_present' },
      { kind: 'softdelete', id: 4966, reason: 'lineage_present' },
    ]));
  });

  it('keeps refusing a collision that is not a duplicate of a live row of the same target type', () => {
    db.database.exec("INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, status, empresa_id) VALUES (9100, 30, 702, 'NR-11', '2024-10-15', 'CONCLUIDA', 6)");
    const { body, summary } = makePlan(db);
    expect(body.relinks.map((r) => r.id)).toEqual([5275]);
    expect(body.soft_deletes.map((d) => d.id)).not.toContain(4970);
    expect(summary.orphans.excluded).toMatchObject({ relink_code_collision: 1 });
  });

  it('refuses the duplicate soft-delete when the evidence row changes after planning', () => {
    db.database.exec("UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE id = 7260");
    expect(forward(port(db)).conflicts).toContainEqual({ kind: 'softdelete', id: 5017, reason: 'duplicate_evidence_changed' });
    db.database.exec("UPDATE qualificacoes_historico SET deleted_at = NULL, data_conclusao = '2025-11-13' WHERE id = 7260");
    expect(forward(port(db)).conflicts).toContainEqual({ kind: 'softdelete', id: 5017, reason: 'duplicate_evidence_changed' });
  });

  it('refuses a relink when the target type changed or a colliding row appeared', () => {
    db.database.exec("UPDATE qualificacoes_tipos SET validade = 12 WHERE id = 700");
    expect(forward(port(db)).conflicts).toContainEqual({ kind: 'relink', id: 4970, reason: 'target_model_not_in_expected_state' });
    db.database.exec("UPDATE qualificacoes_tipos SET validade = 24 WHERE id = 700");
    db.database.exec("INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, status, empresa_id) VALUES (9001, 30, 700, 'NR-11', '2024-10-15', 'CONCLUIDA', 6)");
    expect(forward(port(db)).conflicts).toContainEqual({ kind: 'relink', id: 4970, reason: 'relink_code_collision' });
  });

  it('validates hash, count, tamper and source SHA binding', () => {
    expect(() => forward(port(db), { expectedCount: manifest.row_count + 1 })).toThrow('EXPECTED_ROW_COUNT_MISMATCH');
    expect(() => forward(port(db), { expectedPlanHash: 'c'.repeat(64) })).toThrow('EXPECTED_PLAN_HASH_MISMATCH');
    const tampered: ExecutionManifest = { ...manifest, histories: manifest.histories.map((r, i) => (i === 0 ? { ...r, next_expiry: '2031-01-01' } : r)) };
    expect(() => executeManifest({ port: port(db), manifest: tampered, ...opts() })).toThrow('HISTORY_ROW_EXPIRY_RULE_MISMATCH');
    expect(() => forward(port(db), { apply: true, actor: ACTOR, sourceSha: 'd'.repeat(40) })).toThrow('MANIFEST_SOURCE_SHA_MISMATCH');
    expect(() => forward(port(db), { apply: true, sourceSha: SHA })).toThrow('ACTOR_INVALID');
  });

  describe('rollback', () => {
    let rollback: RollbackManifest;
    beforeEach(() => { rollback = buildRollbackManifest(manifest, opts()); });
    const back = (p: ExecutorPort, extra: Partial<Parameters<typeof executeManifest>[0]> = {}) => executeManifest({
      port: p, manifest: rollback, direction: 'rollback', expectedPlanHash: rollback.rollback_plan_sha256,
      expectedCount: rollback.row_count, ...extra,
    });

    it('restores every row exactly to its pre-apply state and records rollback audits', () => {
      const before = JSON.stringify([tipos(db), histories(db)]);
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(JSON.stringify([tipos(db), histories(db)])).not.toBe(before);
      const dry = back(port(db));
      expect(dry.pending).toBe(manifest.row_count);
      const report = back(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.postconditions_verified).toBe(true);
      expect(report.changed).toBe(manifest.row_count);
      const strip = (list: Row[]) => list.map(({ updated_at: _u, ...rest }) => rest);
      expect(JSON.stringify([strip(tipos(db)), strip(histories(db))])).toBe(JSON.stringify([strip(JSON.parse(before)[0]), strip(JSON.parse(before)[1])]));
      expect(audits(db).filter((a) => String(a.action).endsWith('_ROLLBACK'))).toHaveLength(manifest.row_count);
      // idempotent
      const again = port(db);
      expect(back(again, { apply: true, actor: ACTOR, sourceSha: SHA }).already_applied).toBe(manifest.row_count);
      expect(again.statements).toEqual([]);
    });

    it('skips rows the forward plan never changed and refuses rows modified after the apply', () => {
      const dry = back(port(db));
      expect(dry.skipped_not_applied).toBe(manifest.row_count);
      expect(dry.conflicts).toEqual([]);
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      db.database.exec("UPDATE qualificacoes_historico SET data_vencimento = '2035-05-05' WHERE id = 2");
      expect(back(port(db)).conflicts).toContainEqual({ kind: 'history', id: 2, reason: 'row_changed_since_plan' });
    });

    it('recovers after a partial forward run: applied ops are rolled back, untouched ops count as satisfied', () => {
      const failing = port(db, (_sql, index) => { if (index === 2) throw new Error('SIMULATED_D1_FAILURE'); });
      expect(() => forward(failing, { apply: true, actor: ACTOR, sourceSha: SHA })).toThrow('SIMULATED_D1_FAILURE');
      expect(audits(db)).toHaveLength(2);
      const report = back(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.changed).toBe(2);
      expect(report.skipped_not_applied).toBe(manifest.row_count - 2);
      expect(report.already_applied + report.skipped_not_applied).toBe(manifest.row_count);
      expect(report.postconditions_verified).toBe(true);
      expect(tipos(db).filter((t) => t.validade === 24 && [600, 601, 603].includes(t.id as number))).toEqual([]);
      const readback = back(port(db));
      expect(readback.pending).toBe(0);
      expect(readback.already_applied + readback.skipped_not_applied).toBe(manifest.row_count);
      expect(readback.conflicts).toEqual([]);
    });

    it('is bound to the original SHA and its own hash', () => {
      expect(rollback.source_sha).toBe(SHA);
      expect(() => back(port(db), { expectedPlanHash: manifest.plan_sha256 })).toThrow('ROLLBACK_HASH_MISMATCH');
      const retargeted: RollbackManifest = { ...rollback, source_sha: 'e'.repeat(40) };
      expect(() => back(port(db), { manifest: retargeted })).toThrow('ROLLBACK_SOURCE_SHA_MISMATCH');
      expect(() => back(port(db), { apply: true, actor: ACTOR, sourceSha: 'e'.repeat(40) })).toThrow('MANIFEST_SOURCE_SHA_MISMATCH');
    });
  });
});
