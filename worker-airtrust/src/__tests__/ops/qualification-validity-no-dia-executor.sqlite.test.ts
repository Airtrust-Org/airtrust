import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  buildPlan,
  readInventory,
  type ValidityInventory,
} from '../../../../scripts/production/qualification-validity-no-dia-readonly-plan.mjs';
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
} from '../../../../scripts/production/lib/qualification-validity-no-dia-batch.mjs';

const SHA = 'c'.repeat(40);
const ACTOR = 'tester';

type Row = Record<string, unknown>;

function port(db: SqliteD1Database, beforeExec?: (sql: string) => void): ExecutorPort & { statements: string[] } {
  const statements: string[] = [];
  return {
    statements,
    query: (sql: string) => db.database.prepare(sql).all() as Row[],
    exec: (sql: string) => {
      beforeExec?.(sql);
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
const tipo = (db: SqliteD1Database, id: number): Row => {
  const found = tipos(db).find((r) => r.id === id);
  if (!found) throw new Error(`tipo ${id} missing`);
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
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
  `);
}

function seed(db: SqliteD1Database): void {
  db.database.exec(`
    DELETE FROM qualificacoes_historico;
    DELETE FROM qualificacoes_tipos;
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade, vencimento_fim_mes, deleted_at) VALUES
      (23, 6, 'D2', 'D2', 'TREINAMENTO', 36, 0, NULL),
      (122, 6, 'MNT_INTEGRACAO_DOUTRINACAO', 'Integracao', 'MANUTENCAO', 36, 0, NULL),
      (129, 6, 'MNT_S76AC', 'S76', 'MANUTENCAO', 24, 0, NULL),
      (138, 6, 'MNT_INGLES_TECNICO', 'Ingles', 'MANUTENCAO', 24, 0, NULL),
      (18, 6, 'ASO', 'ASO', 'EXAME', 12, 1, NULL),
      (106, 6, 'G1-SEM', 'G1 SEM', 'TREINAMENTO', 6, 1, NULL),
      (40, 6, 'G2', 'G2', 'TREINAMENTO', 12, 1, NULL);
  `);
  const insert = db.database.prepare(`INSERT INTO qualificacoes_historico
    (id, funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao, data_vencimento, validade_meses,
     status, empresa_id, certificado_arquivo_id, arquivo_url, numero_certificado, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'X', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);
  const h = (v: Array<string | number | null>) => insert.run(...v);
  // (b) validity group: 36-month rows
  h([1, 11, 23, 'D2', '2024-02-29', '2027-02-28', 36, 'CONCLUIDA', 6, 55, 'r2://private/redacted', 'CERT-1']); // with certificate
  h([2, 12, 23, 'D2', '2024-05-10', '2027-05-31', 36, 'CONCLUIDO', 6, null, null, null]); // end-of-month style stored value
  h([3, 13, 122, 'MNT_INTEGRACAO_DOUTRINACAO', '2025-01-31', '2028-01-31', 36, 'CONCLUIDA', 6, null, null, null]);
  h([4, 14, 129, 'MNT_S76AC', '2024-08-15', '2027-08-15', 36, 'CONCLUIDA', 6, null, 'r2://private/redacted2', null]);
  h([5, 15, 138, 'MNT_INGLES_TECNICO', '2024-09-01', '2027-09-01', 36, 'RENOVADA', 6, 56, null, 'CERT-5']);
  h([6, 16, 23, 'D2', '2024-07-01', null, 36, 'CANCELADA', 6, null, null, null]); // not realized
  h([7, 17, 23, 'D2', '2024-08-01', '2026-08-01', 24, 'CONCLUIDA', 6, null, null, null]); // already 24: not in scope
  h([8, 18, 23, 'D2', '2024-03-31', '2027-03-31', null, 'CONCLUIDA', 6, null, null, null]); // NULL validity but 36m expiry: reported only
  h([9, 19, 23, 'D2', null, null, 36, 'CONCLUIDA', 6, null, null, null]); // no completion
  // (c) flag group
  h([20, 21, 18, 'ASO', '2025-01-15', '2026-01-31', 12, 'CONCLUIDA', 6, 57, 'r2://private/redacted3', 'CERT-20']); // derived by EOM rule
  h([21, 22, 18, 'ASO', '2025-02-10', '2026-02-10', 12, 'CONCLUIDA', 6, null, null, null]); // already no-dia
  h([22, 23, 18, 'ASO', '2025-03-10', '2026-03-20', 12, 'CONCLUIDA', 6, null, null, null]); // explicit/documentary: preserved
  h([23, 24, 106, 'G1-SEM', '2025-08-31', '2026-02-28', 6, 'CONCLUIDA', 6, null, null, null]); // EOM == no-dia clamp -> already consistent
  h([24, 25, 40, 'G2', '2024-04-10', '2025-04-30', null, 'CONCLUIDA', 6, null, null, null]); // validity from the type (12m)
  h([25, 26, 40, 'G2', '2024-05-10', null, 12, 'CONCLUIDA', 6, null, null, null]); // no stored expiry
  h([26, 27, 40, 'G2', '2024-06-10', '2025-06-30', 12, 'PLANEJADA', 6, null, null, null]); // not realized
}

function makePlan(db: SqliteD1Database, reverse = false) {
  const inventory: ValidityInventory = readInventory(port(db));
  if (reverse) for (const list of Object.values(inventory)) if (Array.isArray(list)) list.reverse();
  return buildPlan(inventory, { today: '2026-11-11' });
}

describe('qualification validity no-dia batch executor (local SQLite only)', () => {
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

  it('date math is always no-dia: clamps to the month end and ignores the legacy end-of-month argument', () => {
    expect(addMonthsClamped('2024-02-29', 24)).toBe('2026-02-28');
    expect(addMonthsClamped('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsClamped('2025-01-15', 12, true)).toBe('2026-01-15');
  });

  it('plans the owner scope: models 23/122, flags 18/106/40 and only derived histories', () => {
    const { summary, manifest: m } = makePlan(db);
    expect(m.models.map((x) => [x.tipo_id, x.code])).toEqual([[23, 'D2'], [122, 'MNT_INTEGRACAO_DOUTRINACAO']]);
    expect(m.flags.map((x) => [x.tipo_id, x.code])).toEqual([[18, 'ASO'], [40, 'G2'], [106, 'G1-SEM']]);
    const byId = new Map(m.histories.map((x) => [x.id, x]));
    // validity group: 36 -> 24 and expiry = conclusion + 24m no dia
    expect(byId.get(1)).toMatchObject({ group: 'validity', old_validity_months: 36, next_validity_months: 24, next_expiry: '2026-02-28' });
    expect(byId.get(2)?.next_expiry).toBe('2026-05-10');
    expect(byId.get(3)?.next_expiry).toBe('2027-01-31');
    expect(byId.get(4)?.next_expiry).toBe('2026-08-15'); // MNT_S76AC: type already 24, histories follow
    expect(byId.get(5)?.status).toBe('RENOVADA');
    for (const id of [6, 7, 8, 9]) expect(byId.has(id)).toBe(false);
    // flag group: only expiries derived by the old end-of-month rule move; validade_meses never changes
    expect(byId.get(20)).toMatchObject({ group: 'flag', old_expiry: '2026-01-31', next_expiry: '2026-01-15', old_validity_months: 12, next_validity_months: 12 });
    expect(byId.get(24)).toMatchObject({ group: 'flag', old_validity_months: null, next_validity_months: null, validity_used: 12, next_expiry: '2025-04-10' });
    for (const id of [21, 22, 23, 25, 26]) expect(byId.has(id)).toBe(false);
    expect(summary.histories.excluded.flag).toMatchObject({ already_no_dia: 2, explicit_expiry_preserved: 1, no_stored_expiry: 1, status_not_realized: 1 });
    expect(summary.histories.excluded.validity).toMatchObject({ completion_date_missing_or_invalid: 1, status_not_realized: 1 });
    expect(summary.histories.stale_36m_expiry_with_null_validity.rows_with_null_validity_and_36m_expiry).toBe(1);
    expect(summary.models.blocked).toBe(0);
  });

  it('reports certificates without touching them and never exposes PII', () => {
    const { summary } = makePlan(db);
    expect(summary.certificates).toMatchObject({
      operations_with_certificate_id: 3, operations_with_uploaded_file: 3, operations_with_any_certificate: 4, reissued: 0,
    });
    expect(summary.certificates.by_model).toMatchObject({ D2: 1, MNT_S76AC: 1, MNT_INGLES_TECNICO: 1, ASO: 1 });
    expect(JSON.stringify(summary)).not.toMatch(/r2:\/\/|CERT-/);
    expect(summary.pii_emitted).toBe(false);
    expect(summary.writes).toBe(0);
  });

  it('blocks a flag model whose histories are used by another tenant', () => {
    db.database.exec(`INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao,
      data_vencimento, validade_meses, status, empresa_id) VALUES (901, 1, 18, 'ASO', '2025-01-15', '2026-01-31', 12, 'CONCLUIDA', 1)`);
    const { summary, manifest: m } = makePlan(db);
    expect(summary.models.blocked_detail).toEqual([{ tipo_id: 18, code: 'ASO', group: 'flag', reason: 'blocked_shared_with_other_tenant' }]);
    expect(m.flags.map((x) => x.code)).toEqual(['G2', 'G1-SEM']);
    expect(m.histories.some((x) => x.qualificacao_id === 18)).toBe(false);
  });

  it('plans history-only corrections when the flag is already 0 and applies them under the live-state guard', () => {
    db.database.exec(`UPDATE qualificacoes_tipos SET vencimento_fim_mes = 0 WHERE id = 18;
      UPDATE qualificacoes_historico SET data_vencimento = '2026-01-31' WHERE id = 20`);
    const plan = makePlan(db);
    expect(plan.manifest.flags.map((f) => f.code)).toEqual(['G2', 'G1-SEM']);
    expect(plan.manifest.histories.find((x) => x.id === 20)).toMatchObject({ group: 'flag', next_expiry: '2026-01-15' });
    const m = { ...plan.manifest, source_sha: SHA };
    const report = executeManifest({
      port: port(db), manifest: m, expectedPlanHash: m.plan_sha256, expectedCount: m.row_count,
      apply: true, actor: ACTOR, sourceSha: SHA,
    });
    expect(report.postconditions_verified).toBe(true);
    expect(history(db, 20).data_vencimento).toBe('2026-01-15');
  });

  it('blocks models shared with another tenant, with a code mismatch or with unexpected validity', () => {
    db.database.exec(`
      INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, status, empresa_id)
        VALUES (900, 1, 122, 'MNT_INTEGRACAO_DOUTRINACAO', '2025-01-01', 'CONCLUIDA', 1);
      UPDATE qualificacoes_tipos SET codigo = 'OUTRO' WHERE id = 18;
      UPDATE qualificacoes_tipos SET validade = 12 WHERE id = 138;
    `);
    const { summary, manifest: m } = makePlan(db);
    const blocked = Object.fromEntries(summary.models.blocked_detail.map((b) => [b.tipo_id, b.reason]));
    expect(blocked).toEqual({
      122: 'blocked_shared_with_other_tenant', 138: 'blocked_model_validity_not_24', 18: 'blocked_code_mismatch',
    });
    expect(m.models.map((x) => x.tipo_id)).toEqual([23]);
    expect(m.flags.map((x) => x.tipo_id)).toEqual([40, 106]);
    expect(m.histories.every((x) => ![122, 138, 18].includes(x.qualificacao_id))).toBe(true);
  });

  it('produces a deterministic manifest hash regardless of read order', () => {
    expect(makePlan(db, true).manifest.plan_sha256).toBe(makePlan(db).manifest.plan_sha256);
    expect(hashBody(makePlan(db).manifest)).toBe(manifest.plan_sha256);
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

  it('apply: one CAS+audit per operation, certificate columns and status untouched', () => {
    const certBefore = new Map(histories(db).map((r) => [r.id as number, pick(r, CERT_COLUMNS)]));
    const p = port(db);
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.postconditions_verified).toBe(true);
    expect(report.changed).toBe(manifest.row_count);
    expect(report.pending_by_kind).toEqual({ model: 0, flag: 0, history: 0 });

    expect(tipo(db, 23).validade).toBe(24);
    expect(tipo(db, 122).validade).toBe(24);
    expect(tipo(db, 129).validade).toBe(24);
    for (const id of [18, 40, 106]) expect(tipo(db, id).vencimento_fim_mes).toBe(0);
    expect(history(db, 1)).toMatchObject({ data_vencimento: '2026-02-28', validade_meses: 24 });
    expect(history(db, 2)).toMatchObject({ data_vencimento: '2026-05-10', validade_meses: 24 });
    expect(history(db, 4)).toMatchObject({ data_vencimento: '2026-08-15', validade_meses: 24 });
    expect(history(db, 20)).toMatchObject({ data_vencimento: '2026-01-15', validade_meses: 12 });
    expect(history(db, 24)).toMatchObject({ data_vencimento: '2025-04-10', validade_meses: null });
    expect(history(db, 22).data_vencimento).toBe('2026-03-20'); // explicit date preserved
    expect(history(db, 8).data_vencimento).toBe('2027-03-31'); // NULL validity row left to the owner
    expect(history(db, 6).data_vencimento).toBeNull();

    for (const r of histories(db)) expect(pick(r, CERT_COLUMNS)).toEqual(certBefore.get(r.id as number));
    expect(audits(db)).toHaveLength(manifest.row_count);
    expect(audits(db).every((a) => a.empresa_id === 6)).toBe(true);
    expect(new Set(audits(db).map((a) => a.action))).toEqual(new Set([
      auditAction('model', 'forward'), auditAction('flag', 'forward'), auditAction('history', 'forward'),
    ]));
    for (const sql of p.statements) {
      expect(sql).toMatch(/empresa_id = 6/);
      const set = /SET([\s\S]*?)\sWHERE/.exec(sql)?.[1] ?? '';
      expect(set).not.toMatch(/certificado_arquivo_id|arquivo_url|numero_certificado|data_conclusao|status|deleted_at/);
    }
  });

  it('is idempotent: a second apply writes nothing', () => {
    forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
    const second = port(db);
    const report = forward(second, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(second.statements).toEqual([]);
    expect(report.already_applied).toBe(manifest.row_count);
    expect(report.pending).toBe(0);
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
    expect(tipo(db, 23).validade).toBe(36);
  });

  it('detects a concurrent change between preflight and the write (statement CAS) without auditing it', () => {
    const p = port(db, (sql) => {
      if (sql.includes('UPDATE qualificacoes_historico') && sql.includes('WHERE id = 3\n')) {
        db.database.exec("UPDATE qualificacoes_historico SET status = 'CANCELADA' WHERE id = 3");
      }
    });
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.cas_conflicts).toEqual([{ kind: 'history', id: 3 }]);
    expect(report.postconditions_verified).toBe(false);
    expect(history(db, 3).validade_meses).toBe(36);
    expect(audits(db).some((a) => a.entity_id === 3 && a.entity_type === 'qualificacoes_historico')).toBe(false);
  });

  it('refuses manifests outside the owner scope, tampered hashes and wrong source SHA', () => {
    const body = makePlan(db).manifest;
    expect(() => buildExecutionManifest({ ...body, models: [{ tipo_id: 604, code: 'X', old_validity: 36, next_validity: 24 }] }))
      .toThrow('MANIFEST_MODEL_OUTSIDE_OWNER_SCOPE');
    expect(() => buildExecutionManifest({ ...body, flags: [{ tipo_id: 23, code: 'D2', old_flag: 1, next_flag: 0 }], models: body.models.filter((x) => x.tipo_id !== 23) }))
      .toThrow('MANIFEST_FLAG_OUTSIDE_OWNER_SCOPE');
    const tampered = { ...manifest, histories: manifest.histories.map((x) => (x.id === 1 ? { ...x, next_expiry: '2026-03-01' } : x)) };
    expect(() => executeManifest({ port: port(db), manifest: tampered, ...opts() })).toThrow('HISTORY_ROW_EXPIRY_RULE_MISMATCH');
    expect(() => executeManifest({ port: port(db), manifest, ...opts(), expectedPlanHash: 'f'.repeat(64) })).toThrow('EXPECTED_PLAN_HASH_MISMATCH');
    expect(() => forward(port(db), { apply: true, actor: ACTOR, sourceSha: 'd'.repeat(40) })).toThrow('MANIFEST_SOURCE_SHA_MISMATCH');
    expect(() => forward(port(db), { apply: true, actor: 'bad actor!', sourceSha: SHA })).toThrow('ACTOR_INVALID');
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

    it('restores every row exactly and audits each inverse operation', () => {
      const snapshotBefore = JSON.stringify([tipos(db).map((t) => [t.id, t.validade, t.vencimento_fim_mes]), histories(db).map((r) => [r.id, r.data_vencimento, r.validade_meses])]);
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      const report = back(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.postconditions_verified).toBe(true);
      expect(report.changed).toBe(manifest.row_count);
      const snapshotAfter = JSON.stringify([tipos(db).map((t) => [t.id, t.validade, t.vencimento_fim_mes]), histories(db).map((r) => [r.id, r.data_vencimento, r.validade_meses])]);
      expect(snapshotAfter).toBe(snapshotBefore);
      expect(audits(db).filter((a) => String(a.action).endsWith('_ROLLBACK'))).toHaveLength(manifest.row_count);
    });

    it('does nothing for operations the forward plan never applied', () => {
      const p = port(db);
      const report = back(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(p.statements).toEqual([]);
      expect(report.skipped_not_applied).toBe(manifest.row_count);
    });

    it('rolls back only after forward history operations are undone first (reverse order)', () => {
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      const p = port(db);
      back(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      const firstModel = p.statements.findIndex((s) => s.includes('UPDATE qualificacoes_tipos'));
      const lastHistory = p.statements.map((s) => s.includes('UPDATE qualificacoes_historico')).lastIndexOf(true);
      expect(lastHistory).toBeLessThan(firstModel);
    });
  });
});
