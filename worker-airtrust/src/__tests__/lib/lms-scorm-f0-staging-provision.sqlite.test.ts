import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
const SqliteDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (path: string): DatabaseSync };
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { provisionScormF0QaBinding, type ScormF0ProvisionRequest } from '../../lib/lms/lms-scorm-f0-staging-provision';

const id = '12345678-1234-1234-1234-123456789abc';
const runId = 'abcdefab-1234-1234-1234-abcdefabcdef';
const sha = 'a'.repeat(64);
const now = Date.now();
const request: ScormF0ProvisionRequest = {
  tenantId: 111, courseId: 15, packageId: id, packageSha256: sha,
  enrollmentId: 23, cycleId: 24, runId,
  approvalReceiptSha256: 'b'.repeat(64), runtimeSha: 'c'.repeat(40),
  expiresAt: new Date(now + 30 * 60_000).toISOString(), grantId: '6378307802', actorId: 3,
};

function fixture() {
  const db = new SqliteDatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE lms_cursos(
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, titulo TEXT NOT NULL,
      publicado INTEGER NOT NULL, ativo INTEGER NOT NULL,
      scorm_package_r2_prefix TEXT, deleted_at TEXT
    );
    CREATE TABLE funcionarios(
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE lms_matriculas(
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, curso_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL, status TEXT NOT NULL,
      observacoes TEXT, qualificacao_historico_id INTEGER,
      score_final REAL, progresso_pct REAL, tentativas INTEGER, deleted_at TEXT
    );
    CREATE TABLE lms_matricula_ciclos(
      id INTEGER PRIMARY KEY, matricula_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL, curso_id INTEGER NOT NULL,
      ciclo_atual INTEGER NOT NULL, numero_ciclo INTEGER NOT NULL,
      status TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE lms_scorm_package_versions(
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, curso_id INTEGER NOT NULL,
      package_sha256 TEXT NOT NULL, r2_prefix TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE lms_progresso_scorm(empresa_id INTEGER, matricula_id INTEGER);
    CREATE TABLE qualificacoes_historico(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, lms_matricula_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE audit_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER,
      old_values TEXT, new_values TEXT, empresa_id INTEGER, created_at TEXT
    );
  `);
  db.exec(readFileSync(fileURLToPath(new URL('../../../schema-v2/changes/0568_lms_scorm_qa_evidence_bindings.sql', import.meta.url).href), 'utf8'));
  db.prepare('INSERT INTO lms_cursos(id,empresa_id,titulo,publicado,ativo) VALUES(15,111,?,0,1)')
    .run('QA SCORM F0 staging synthetic');
  db.prepare('INSERT INTO funcionarios(id,empresa_id,nome) VALUES(41,111,?)')
    .run('QA-PARTICIPANTE-ALFA');
  db.prepare(`INSERT INTO lms_scorm_package_versions
    (id,empresa_id,curso_id,package_sha256,r2_prefix,status) VALUES(?,111,15,?,?,'VALIDATED')`)
    .run(id, sha, `lms/scorm/111/15/_candidates/${id}/`);
  db.prepare(`INSERT INTO lms_matriculas
    (id,empresa_id,curso_id,funcionario_id,status,observacoes,progresso_pct,tentativas)
    VALUES(23,111,15,41,'NAO_INICIADO',?,0,0)`).run(`QA_SCORM_F0:${runId}`);
  db.exec(`INSERT INTO lms_matricula_ciclos
    (id,matricula_id,empresa_id,curso_id,ciclo_atual,numero_ciclo,status)
    VALUES(24,23,111,15,1,1,'NAO_INICIADO')`);

  class D1Shim {
    prepare(sql: string) {
      return { bind: (...values: unknown[]) => ({
        execute: () => db.prepare(sql).run(...values as Array<string|number|null>),
      }) };
    }
    async batch(statements: Array<{ execute: () => {changes: bigint|number} }>) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const rows = statements.map(x => ({meta:{ changes:Number(x.execute().changes) }}));
        db.exec('COMMIT');
        return rows;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  }
  const shim = new D1Shim() as unknown as D1Database;
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n);
  return { db, shim, count };
}

describe('F0 atomic protected D1 synthetic binding, actual schema 0568', () => {
  it('writes one candidate-cycle binding and its audit, no CMI, qualification or active pointer', async () => {
    const f = fixture();
    try {
      const proof = await provisionScormF0QaBinding(f.shim, request, now);
      expect(proof).toMatchObject({
        source: 'SCORM_F0_STAGING_CANDIDATE_BINDING_V1',
        packageSha256: sha, enrollmentId: 23, cycleId: 24,
        activePackageChanged: false, completionWritten: false, certificateIssued: false,
      });
      expect(f.count('lms_scorm_qa_evidence_bindings')).toBe(1);
      expect(f.count('audit_logs')).toBe(1);
      expect(f.count('lms_progresso_scorm')).toBe(0);
      expect(f.count('qualificacoes_historico')).toBe(0);
      const row = f.db.prepare('SELECT package_sha256,status,synthetic FROM lms_scorm_qa_evidence_bindings').get() as Record<string, unknown>;
      expect(row).toMatchObject({ package_sha256: sha, status: 'ACTIVE', synthetic: 1 });
      const pointer = f.db.prepare('SELECT scorm_package_r2_prefix FROM lms_cursos WHERE id=15').get() as {scorm_package_r2_prefix:string|null};
      expect(pointer.scorm_package_r2_prefix).toBeNull();
    } finally { f.db.close(); }
  });
  it('fails closed on forged request, tenant drift, non-synthetic fixture and pre-existing CMI', async () => {
    for (const scenario of [
      (f:ReturnType<typeof fixture>) => { f.db.exec(`UPDATE lms_matriculas SET observacoes='not synthetic'`); },
      (f:ReturnType<typeof fixture>) => { f.db.exec(`UPDATE funcionarios SET nome='Employee Real'`); },
      (f:ReturnType<typeof fixture>) => { f.db.exec(`UPDATE lms_cursos SET publicado=1`); },
      (f:ReturnType<typeof fixture>) => { f.db.exec(`INSERT INTO lms_progresso_scorm VALUES(111,23)`); },
      (f:ReturnType<typeof fixture>) => { f.db.exec(`UPDATE lms_scorm_package_versions SET status='ACTIVE'`); },
    ]) {
      const f = fixture();
      try {
        scenario(f);
        await expect(provisionScormF0QaBinding(f.shim, request, now))
          .rejects.toThrow('SCORM_F0_SYNTHETIC_ENROLLMENT_NOT_ELIGIBLE');
        expect(f.count('lms_scorm_qa_evidence_bindings')).toBe(0);
        expect(f.count('audit_logs')).toBe(0);
      } finally { f.db.close(); }
    }
    const f = fixture();
    try {
      await expect(provisionScormF0QaBinding(f.shim, { ...request, tenantId: 112 }, now))
        .rejects.toThrow('SCORM_F0_SYNTHETIC_ENROLLMENT_NOT_ELIGIBLE');
      await expect(provisionScormF0QaBinding(f.shim,
        { ...request, expiresAt: new Date(now - 60_000).toISOString() }, now))
        .rejects.toThrow('SCORM_F0_PROVISION_SCOPE_OR_EXPIRY_INVALID');
      expect(f.count('lms_scorm_qa_evidence_bindings')).toBe(0);
      expect(f.count('audit_logs')).toBe(0);
    } finally { f.db.close(); }
  });
  it('replay cannot duplicate binding or audit; DB trigger prevents forged edition mutation', async () => {
    const f = fixture();
    try {
      await provisionScormF0QaBinding(f.shim, request, now);
      await expect(provisionScormF0QaBinding(f.shim, request, now)).rejects.toThrow();
      expect(f.count('lms_scorm_qa_evidence_bindings')).toBe(1);
      expect(f.count('audit_logs')).toBe(1);
      expect(() => f.db.exec(
        `UPDATE lms_scorm_qa_evidence_bindings SET package_sha256='${'d'.repeat(64)}'`,
      )).toThrow('SCORM_QA_BINDING_IMMUTABLE_OR_UNVERIFIED');
    } finally { f.db.close(); }
  });
});
