import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { buildPlan, readInventory } from '../../../../scripts/production/qualification-cma-age-readonly-plan.mjs';
import {
  AUDIT_ORIGIN,
  addMonthsClamped,
  auditAction,
  buildExecutionManifest,
  buildRollbackManifest,
  classifyCmaRow,
  executeManifest,
  hashBody,
  type ExecutionManifest,
  type ExecutorPort,
  type RollbackManifest,
} from '../../../../scripts/production/lib/qualification-cma-age-batch.mjs';
import { completedAgeYears } from '../../../../src/shared/utils/cma-validity';

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
    ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE qualificacoes_tipos ADD COLUMN updated_at TEXT;
    ALTER TABLE qualificacoes_historico ADD COLUMN tipo TEXT;
    ALTER TABLE qualificacoes_historico ADD COLUMN certificado_arquivo_id INTEGER;
    ALTER TABLE qualificacoes_historico ADD COLUMN arquivo_url TEXT;
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER,
      old_values TEXT, new_values TEXT, empresa_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seed(db: SqliteD1Database): void {
  db.database.exec(`
    DELETE FROM qualificacoes_historico;
    DELETE FROM qualificacoes_tipos;
    DELETE FROM funcionarios;
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade) VALUES
      (1, 6, 'CMA', 'CMA', 'EXAME', 12),
      (2, 1, 'CMA', 'CMA outro tenant', 'EXAME', 12);
    INSERT INTO funcionarios (id, empresa_id, nascimento) VALUES
      (11, 6, '1960-03-10'),  -- 60+ in 2020-03-10
      (12, 6, '1990-01-01'),
      (13, 6, NULL),
      (14, 6, '2000-02-30'),  -- invalid calendar date
      (15, 1, '1950-01-01'),  -- employee of another tenant: birth date not trusted
      (16, 6, '1966-08-04');  -- turns 60 on 2026-08-04
  `);
  const insert = db.database.prepare(`INSERT INTO qualificacoes_historico
    (id, funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao, data_vencimento, validade_meses,
     status, empresa_id, certificado_arquivo_id, arquivo_url, numero_certificado, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, 'CMA', 'X', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);
  const h = (v: Array<string | number | null>) => insert.run(...v);
  // [id, func, tipo, conclusao, vencimento, validade, status, empresa, certId, url, numero, deleted_at]
  h([1, 11, 1, '2024-05-10', '2025-05-10', 12, 'CONCLUIDA', 6, 55, 'r2://private/redacted', 'CERT-1', null]); // 64 anos, 12 -> 6 (com certificado)
  h([2, 12, 1, '2025-01-31', '2026-01-31', 12, 'CONCLUIDA', 6, null, null, null, null]); // conforme
  h([3, 12, 1, '2025-03-10', '2026-03-31', 12, 'CONCLUIDA', 6, null, null, null, null]); // validade ok, vencimento fim do mes legado
  h([4, 11, 1, '2024-01-15', '2024-07-31', 6, 'RENOVADA', 6, null, null, null, null]); // 63 anos, 6 ok, fim do mes legado
  h([5, 12, 1, '2025-04-01', '2025-10-01', 6, 'CONCLUIDA', 6, null, null, null, null]); // 35 anos, 6 -> 12
  h([6, 11, 1, '2024-02-02', '2025-06-15', 12, 'CONCLUIDA', 6, null, null, null, null]); // vencimento explicito/documental: preservado
  h([7, 13, 1, '2024-06-01', '2025-06-01', 12, 'CONCLUIDA', 6, null, null, null, null]); // sem nascimento
  h([8, 14, 1, '2024-06-01', '2025-06-01', 6, 'CONCLUIDA', 6, null, null, null, null]); // nascimento invalido
  h([9, 15, 1, '2024-06-01', '2025-06-01', 12, 'CONCLUIDA', 6, null, null, null, null]); // funcionario de outro tenant
  h([10, 16, 1, '2026-08-04', '2027-08-04', 12, 'CONCLUIDA', 6, null, null, null, null]); // completa 60 no dia: 12 -> 6
  h([11, 16, 1, '2026-08-03', '2027-02-03', 6, 'CONCLUIDA', 6, null, null, null, null]); // 59 anos: 6 -> 12
  h([12, 12, 1, '2025-02-01', '2026-02-01', 12, 'CANCELADA', 6, null, null, null, null]); // nao realizado
  h([13, 12, 1, null, null, 12, 'CONCLUIDA', 6, null, null, null, null]); // sem data de realizacao
  h([14, 12, 1, '2025-05-05', null, 12, 'CONCLUIDA', 6, null, null, null, null]); // sem vencimento
  h([15, 11, 1, '2024-05-11', '2025-05-11', 12, 'CONCLUIDA', 6, null, null, null, '2025-01-01']); // removido (ignorado)
  h([16, 11, 2, '2024-05-12', '2025-05-12', 12, 'CONCLUIDA', 1, null, null, null, null]); // tipo CMA de outro tenant
  h([17, 12, 1, '2025-06-10', '2025-06-10', null, '', 6, null, null, null, null]); // validade nula, status vazio, vencimento = no dia 0? nao derivado
}

function makePlan(db: SqliteD1Database, reverse = false) {
  const inventory = readInventory(port(db));
  if (reverse) inventory.histories.reverse();
  return buildPlan(inventory);
}

describe('qualification CMA age batch (local SQLite only)', () => {
  let db: SqliteD1Database;
  let manifest: ExecutionManifest;
  const opts = () => ({ expectedPlanHash: manifest.plan_sha256, expectedCount: manifest.row_count });
  const forward = (p: ExecutorPort, extra: Partial<Parameters<typeof executeManifest>[0]> = {}) =>
    executeManifest({ port: p, manifest, direction: 'forward', ...opts(), ...extra });

  beforeEach(() => {
    db = new SqliteD1Database();
    createSchema(db);
    seed(db);
    const plan = makePlan(db);
    if (!plan.manifest) throw new Error('expected a manifest');
    manifest = { ...plan.manifest, source_sha: SHA };
  });
  afterEach(() => db.close());

  it('classifies every live tenant-6 CMA row and plans only the corrigible ones', () => {
    const { summary, manifest: m } = makePlan(db);
    expect(summary.live_rows).toBe(15);
    expect(summary.classes).toEqual({
      validity_wrong_by_age: 4,
      conforme: 1,
      expiry_wrong_legacy_eom: 2,
      explicit_expiry_preserved: 2,
      birth_date_missing: 3,
      status_not_realized: 1,
      completion_date_missing_or_invalid: 1,
      no_stored_expiry: 1,
    });
    expect(summary.ids_by_class.validity_wrong_by_age).toEqual([1, 5, 10, 11]);
    expect(summary.ids_by_class.expiry_wrong_legacy_eom).toEqual([3, 4]);
    expect(summary.ids_by_class.explicit_expiry_preserved).toEqual([6, 17]);
    expect(summary.ids_by_class.birth_date_missing).toEqual([7, 8, 9]);
    expect(summary.corrigible_operations).toBe(6);
    expect(summary.birth_date_missing).toMatchObject({ total: 3, stored_validity_not_12: 1, stored_expiry_not_exact_12: 0 });
    expect(summary.models.cma_types_tenant6).toEqual([1]);
    const byId = new Map(m!.histories.map((x) => [x.id, x]));
    expect(byId.get(1)).toMatchObject({ old_validity_months: 12, next_validity_months: 6, next_expiry: '2024-11-10', age_years: 64 });
    expect(byId.get(3)).toMatchObject({ old_validity_months: 12, next_validity_months: 12, next_expiry: '2026-03-10', reason: 'expiry_wrong_legacy_eom' });
    expect(byId.get(4)).toMatchObject({ next_validity_months: 6, next_expiry: '2024-07-15' });
    expect(byId.get(5)).toMatchObject({ old_validity_months: 6, next_validity_months: 12, next_expiry: '2026-04-01' });
    expect(byId.get(10)).toMatchObject({ next_validity_months: 6, next_expiry: '2027-02-04', age_years: 60 });
    expect(byId.get(11)).toMatchObject({ next_validity_months: 12, next_expiry: '2027-08-03', age_years: 59 });
    for (const id of [2, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17]) expect(byId.has(id)).toBe(false);
  });

  it('never alters rows without a valid birth date and preserves explicit expiries (only lists them)', () => {
    forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(history(db, 7)).toMatchObject({ validade_meses: 12, data_vencimento: '2025-06-01' });
    expect(history(db, 8)).toMatchObject({ validade_meses: 6, data_vencimento: '2025-06-01' });
    expect(history(db, 9)).toMatchObject({ validade_meses: 12, data_vencimento: '2025-06-01' });
    expect(history(db, 6)).toMatchObject({ validade_meses: 12, data_vencimento: '2025-06-15' });
    expect(history(db, 16)).toMatchObject({ validade_meses: 12, data_vencimento: '2025-05-12' });
  });

  it('SQL age and the shared TS rule agree around birthdays and leap days', () => {
    const births = ['1960-02-29', '1966-08-04', '1990-12-31', '2000-02-29'];
    const refs = ['2020-02-28', '2020-02-29', '2020-03-01', '2026-08-03', '2026-08-04', '2030-12-30', '2030-12-31', '2031-02-28', '2031-03-01'];
    let id = 100;
    db.database.exec('DELETE FROM qualificacoes_historico; DELETE FROM funcionarios;');
    const expectations: Array<[number, number | null]> = [];
    for (const birth of births) {
      const empId = id++;
      db.database.exec(`INSERT INTO funcionarios (id, empresa_id, nascimento) VALUES (${empId}, 6, '${birth}')`);
      for (const ref of refs) {
        const hid = id++;
        db.database.exec(`INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, validade_meses, status, empresa_id)
          VALUES (${hid}, ${empId}, 1, '${ref}', NULL, 12, 'CONCLUIDA', 6)`);
        expectations.push([hid, completedAgeYears(birth, ref)]);
      }
    }
    const inventory = readInventory(port(db));
    const byId = new Map(inventory.histories.map((r) => [Number(r.id), r.age_years]));
    for (const [hid, age] of expectations) expect(byId.get(hid)).toBe(age);
  });

  it('classifyCmaRow is pure: missing birth keeps the default and never emits an operation', () => {
    const base = { id: 1, qualificacao_id: 1, status: 'CONCLUIDA', completion: '2024-05-10', old_expiry: '2025-05-10', old_validity: 12, employee_in_tenant: true };
    expect(classifyCmaRow({ ...base, age_years: null })).toMatchObject({ cls: 'birth_date_missing', exact_expiry_12: '2025-05-10' });
    expect(classifyCmaRow({ ...base, age_years: 59 }).cls).toBe('conforme');
    expect(classifyCmaRow({ ...base, age_years: 60 }).operation).toMatchObject({ next_validity_months: 6, next_expiry: '2024-11-10' });
    expect(addMonthsClamped('2024-08-31', 6)).toBe('2025-02-28');
  });

  it('reports no PII and no certificate changes in the summary', () => {
    const { summary } = makePlan(db);
    expect(summary.pii_emitted).toBe(false);
    expect(summary.writes).toBe(0);
    expect(summary.certificates_touched).toBe(0);
    expect(JSON.stringify(summary)).not.toMatch(/r2:\/\/|CERT-|19[0-9]{2}-[0-9]{2}-[0-9]{2}/);
  });

  it('plans nothing (no manifest) when every row already follows the rule', () => {
    db.database.exec(`DELETE FROM qualificacoes_historico WHERE id NOT IN (2, 7)`);
    const { manifest: m, summary } = makePlan(db);
    expect(m).toBeNull();
    expect(summary.corrigible_operations).toBe(0);
    expect(summary.plan_sha256).toBeNull();
  });

  it('produces a deterministic manifest hash regardless of read order', () => {
    expect(makePlan(db, true).manifest!.plan_sha256).toBe(makePlan(db).manifest!.plan_sha256);
    expect(hashBody(makePlan(db).manifest!)).toBe(manifest.plan_sha256);
  });

  it('dry-run reads only and never calls exec', () => {
    const p = port(db);
    const before = JSON.stringify(histories(db));
    const report = forward(p);
    expect(p.statements).toEqual([]);
    expect(report.mode).toBe('dry-run');
    expect(report.pending).toBe(manifest.row_count);
    expect(report.conflicts).toEqual([]);
    expect(report.postconditions_verified).toBe(true);
    expect(JSON.stringify(histories(db))).toBe(before);
  });

  it('apply: one CAS+audit per row with the owner origin; certificate columns and status untouched', () => {
    const certBefore = new Map(histories(db).map((r) => [r.id as number, pick(r, CERT_COLUMNS)]));
    const p = port(db);
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.postconditions_verified).toBe(true);
    expect(report.changed).toBe(manifest.row_count);
    expect(report.pending).toBe(0);

    expect(history(db, 1)).toMatchObject({ validade_meses: 6, data_vencimento: '2024-11-10' });
    expect(history(db, 3)).toMatchObject({ validade_meses: 12, data_vencimento: '2026-03-10' });
    expect(history(db, 5)).toMatchObject({ validade_meses: 12, data_vencimento: '2026-04-01' });
    expect(history(db, 10)).toMatchObject({ validade_meses: 6, data_vencimento: '2027-02-04' });
    expect(history(db, 11)).toMatchObject({ validade_meses: 12, data_vencimento: '2027-08-03' });
    for (const r of histories(db)) expect(pick(r, CERT_COLUMNS)).toEqual(certBefore.get(r.id as number));

    const log = audits(db);
    expect(log).toHaveLength(manifest.row_count);
    expect(log.every((a) => a.empresa_id === 6 && a.action === auditAction('forward') && a.entity_type === 'qualificacoes_historico')).toBe(true);
    const first = JSON.parse(String(log[0].new_values));
    expect(first).toMatchObject({ origem: AUDIT_ORIGIN, actor: ACTOR, plan_sha256: manifest.plan_sha256, source_sha: SHA, direction: 'forward' });
    expect(JSON.parse(String(log[0].old_values))).toEqual({ data_vencimento: '2025-05-10', validade_meses: 12 });
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
    expect(audits(db)).toHaveLength(manifest.row_count);
    // after apply the planner finds nothing left to correct
    expect(makePlan(db).manifest).toBeNull();
  });

  it('aborts before the first write when a row changed since planning (CAS preflight)', () => {
    db.database.exec("UPDATE qualificacoes_historico SET data_vencimento = '2030-01-01' WHERE id = 3");
    const p = port(db);
    let error: (Error & { report?: { conflicts: Array<{ id: number; reason: string }> } }) | undefined;
    try { forward(p, { apply: true, actor: ACTOR, sourceSha: SHA }); } catch (e) { error = e as Error; }
    expect(error?.message).toBe('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
    expect(error?.report?.conflicts).toEqual([{ id: 3, reason: 'row_changed_since_plan' }]);
    expect(p.statements).toEqual([]);
    expect(audits(db)).toEqual([]);
  });

  it('aborts when the employee birth date changed the age since planning', () => {
    db.database.exec("UPDATE funcionarios SET nascimento = '1990-01-01' WHERE id = 11");
    const p = port(db);
    let error: (Error & { report?: { conflicts: Array<{ id: number; reason: string }> } }) | undefined;
    try { forward(p, { apply: true, actor: ACTOR, sourceSha: SHA }); } catch (e) { error = e as Error; }
    expect(error?.report?.conflicts).toEqual([{ id: 1, reason: 'age_changed_since_plan' }, { id: 4, reason: 'age_changed_since_plan' }]);
    expect(p.statements).toEqual([]);
  });

  it('statement CAS detects a birth-date edit between preflight and write and audits nothing for that row', () => {
    const p = port(db, (sql) => {
      if (sql.includes('UPDATE qualificacoes_historico') && sql.includes('WHERE id = 10\n')) {
        db.database.exec("UPDATE funcionarios SET nascimento = '1970-01-01' WHERE id = 16");
      }
    });
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.cas_conflicts.map((c) => c.id)).toContain(10);
    expect(report.postconditions_verified).toBe(false);
    expect(history(db, 10)).toMatchObject({ validade_meses: 12, data_vencimento: '2027-08-04' });
    expect(audits(db).some((a) => a.entity_id === 10)).toBe(false);
  });

  it('detects a concurrent status change between preflight and write', () => {
    const p = port(db, (sql) => {
      if (sql.includes('UPDATE qualificacoes_historico') && sql.includes('WHERE id = 3\n')) {
        db.database.exec("UPDATE qualificacoes_historico SET status = 'CANCELADA' WHERE id = 3");
      }
    });
    const report = forward(p, { apply: true, actor: ACTOR, sourceSha: SHA });
    expect(report.cas_conflicts).toEqual([{ id: 3 }]);
    expect(history(db, 3).data_vencimento).toBe('2026-03-31');
    expect(audits(db).some((a) => a.entity_id === 3)).toBe(false);
  });

  it('refuses tampered manifests, wrong hashes, wrong source SHA and bad actors', () => {
    const body = makePlan(db).manifest!;
    const tampered = { ...manifest, histories: manifest.histories.map((x) => (x.id === 1 ? { ...x, next_expiry: '2024-12-01' } : x)) };
    expect(() => executeManifest({ port: port(db), manifest: tampered, ...opts() })).toThrow('HISTORY_ROW_EXPIRY_RULE_MISMATCH');
    const wrongAge = { ...manifest, histories: manifest.histories.map((x) => (x.id === 1 ? { ...x, age_years: 30 } : x)) };
    expect(() => executeManifest({ port: port(db), manifest: wrongAge, ...opts() })).toThrow('HISTORY_ROW_AGE_RULE_MISMATCH');
    expect(() => buildExecutionManifest({ histories: [{ ...body.histories[0], reason: 'other' as never }] })).toThrow('HISTORY_ROW_REASON');
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
      const snap = () => JSON.stringify(histories(db).map((r) => [r.id, r.data_vencimento, r.validade_meses]));
      const before = snap();
      forward(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      const report = back(port(db), { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(report.postconditions_verified).toBe(true);
      expect(report.changed).toBe(manifest.row_count);
      expect(snap()).toBe(before);
      expect(audits(db).filter((a) => a.action === auditAction('rollback'))).toHaveLength(manifest.row_count);
    });

    it('does nothing for operations the forward plan never applied', () => {
      const p = port(db);
      const report = back(p, { apply: true, actor: ACTOR, sourceSha: SHA });
      expect(p.statements).toEqual([]);
      expect(report.skipped_not_applied).toBe(manifest.row_count);
    });

    it('rejects a rollback manifest with a tampered hash', () => {
      expect(() => executeManifest({
        port: port(db), manifest: { ...rollback, rollback_plan_sha256: 'a'.repeat(64) }, direction: 'rollback',
        expectedPlanHash: 'a'.repeat(64), expectedCount: manifest.row_count,
      })).toThrow('ROLLBACK_HASH_MISMATCH');
    });
  });
});
