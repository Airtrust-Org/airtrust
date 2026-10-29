import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { commitCertifiedScormActivation } from '../../lib/lms/lms-scorm-package-activation';
import { EFFECTIVE_ASSESSMENT_POLICY_SQL } from '../../lib/lms/lms-effective-assessment-policy';
import {
  approveFormativePackage, evaluateFormativeActivation, importFormativeAttestation,
  rollbackScormPackageVersion,
} from '../../lib/lms/lms-scorm-formative-service';
import { activateScormPackageVersion } from '../../lib/lms/lms-scorm-package-version-service';
import {
  FORMATIVE_ATTESTATION_KIND, FORMATIVE_PROFILE, FORMATIVE_REQUIRED_CASES,
  serializeFormativeAttestation, type FormativeAttestationPayload,
} from '../../lib/lms/lms-scorm-formative-profile';
import { SCORM_FUNCTIONAL_HARNESS } from '../../lib/lms/lms-scorm-functional-certification';

const root = resolve(__dirname, '../../..');
const ddl0465 = readFileSync(resolve(root, 'migrations/0465_lms_scorm_package_quality_gate_v1.sql'), 'utf8');
const ddl0569 = readFileSync(resolve(root, 'schema-v2/changes/0569_lms_scorm_edition_policy_approvals.sql'), 'utf8');
const ddl0570 = readFileSync(resolve(root, 'schema-v2/changes/0570_lms_scorm_formative_approval_renewals.sql'), 'utf8');

const opened: SqliteD1Database[] = [];
afterEach(() => { vi.useRealTimers(); for (const db of opened.splice(0)) db.close(); });

const secret = 'test-only-secret-with-length-above-thirty-two-characters';
const runtimeSha = 'b'.repeat(40);
const SCORED_ID = '00000000-0000-4000-8000-00000000000a';
const FORM_ID = '00000000-0000-4000-8000-00000000000b';
const FORM_SHA = 'f'.repeat(64);
const OLD_SHA = 'e'.repeat(64);
const prefix = (id: string, tenant = 6) => `lms/scorm/${tenant}/26/_candidates/${id}/`;

const formativeQuality = {
  validatorVersion: 'AIRTRUST_SCORM_PACKAGE_QUALITY_GATE_V1',
  structural: { status: 'PASS', errors: [], warnings: [] },
  completionManifest: { status: 'PASS', errors: [], warnings: [] },
  diagnostics: { status: 'PASS', errors: [], warnings: [] },
  certificationProfile: FORMATIVE_PROFILE, assessmentPolicy: 'FORMATIVE',
  formativeContract: { eligible: true, errors: [], requiredSlides: 101, requiredActivities: 14 },
};

function fixture(opts: { formativeActive?: boolean } = {}) {
  const db = new SqliteD1Database();
  opened.push(db);
  // The fixture's tenant-scoped lms_cursos key is not FK-addressable; real FKs are not under test here.
  db.database.exec('PRAGMA foreign_keys=OFF');
  db.database.exec(`
    CREATE TABLE lms_cursos (
      id INTEGER, empresa_id INTEGER, titulo TEXT, tipo_conteudo TEXT, publicado INTEGER DEFAULT 1,
      scorm_package_r2_prefix TEXT, scorm_launch_file TEXT, scorm_versao TEXT,
      conteudo_arquivo_nome TEXT, updated_at TEXT, deleted_at TEXT, scorm_mastery_score INTEGER,
      scorm_assessment_policy TEXT NOT NULL DEFAULT 'SCORED', PRIMARY KEY(empresa_id,id));
    CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER, deleted_at TEXT);
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER, matricula_id INTEGER,
      ciclo_atual INTEGER, status TEXT, deleted_at TEXT);
    CREATE TABLE lms_completion_diagnostics_snapshots (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER, matricula_id INTEGER);
  `);
  db.database.exec(ddl0465);
  db.database.exec(ddl0569);
  db.database.exec(ddl0570);
  const policy = opts.formativeActive ? 'FORMATIVE' : 'SCORED';
  db.database.prepare(`INSERT INTO lms_cursos (id,empresa_id,titulo,tipo_conteudo,scorm_package_r2_prefix,
    scorm_launch_file,scorm_versao,scorm_mastery_score,scorm_assessment_policy)
    VALUES (26,6,'MGM','scorm',?, 'index.html','1.2',70,?),(26,7,'MGM outro tenant','scorm',?, 'index.html','1.2',70,'SCORED')`)
    .run(prefix(SCORED_ID), policy, prefix('x', 7));
  const insert = db.database.prepare(`INSERT INTO lms_scorm_package_versions
    (id,empresa_id,curso_id,package_version,package_sha256,zip_size_bytes,r2_prefix,launch_file,scorm_versao,
     uploaded_at,status,validation_result_json,assessment_policy,certification_profile)
    VALUES (?,?,?,?,?,1,?,'index.html','1.2','2026-10-28',?,?,?,?)`);
  insert.run(SCORED_ID, 6, 26, 'v1', OLD_SHA, prefix(SCORED_ID), 'ACTIVE', '{"legacy":true}', null, null);
  insert.run(FORM_ID, 6, 26, 'v2', FORM_SHA, prefix(FORM_ID), 'VALIDATED', JSON.stringify(formativeQuality),
    'FORMATIVE', FORMATIVE_PROFILE);
  // Cycles: one ended under the scored course, one still open, one never started, one other tenant.
  db.database.exec(`
    INSERT INTO lms_matriculas VALUES (10,6,26,NULL),(11,6,26,NULL),(12,6,26,NULL),(20,7,26,NULL);
    INSERT INTO lms_matricula_ciclos (id,empresa_id,curso_id,matricula_id,ciclo_atual,status,deleted_at) VALUES
      (100,6,26,10,1,'CONCLUIDO',NULL),
      (101,6,26,11,1,'EM_ANDAMENTO',NULL),
      (102,6,26,12,1,'NAO_INICIADO',NULL),
      (200,7,26,20,1,'CONCLUIDO',NULL);
    INSERT INTO lms_completion_diagnostics_snapshots VALUES (1,6,26,10),(2,7,26,20);
  `);
  return db;
}

function attestation(sha = FORM_SHA, overrides: Partial<FormativeAttestationPayload> = {}, key = secret) {
  const payload: FormativeAttestationPayload = {
    kind: FORMATIVE_ATTESTATION_KIND, profile: FORMATIVE_PROFILE, scope: 'GOVERNED_STAGING_SYNTHETIC',
    packageSha256: sha, runtimeSha, harnessSha: 'c'.repeat(40),
    issuedAt: new Date().toISOString(), requiredSlides: 101, requiredActivities: 14,
    driverSha256: '5'.repeat(64), browserEvidenceSha256: '1'.repeat(64), backendWitnessSha256: '2'.repeat(64),
    certificateDocument: { enrollmentId: 1001, cycleId: 2001, qualificationHistoryId: 3001,
      documentId: 'qa-doc-1', sha256: '3'.repeat(64) },
    run: { harness: SCORM_FUNCTIONAL_HARNESS, browser: 'CHROMIUM', packageSha256: sha,
      cases: FORMATIVE_REQUIRED_CASES.map(name => ({ name, status: 'PASS' as const })) },
    ...overrides,
  };
  return { payload, signature: createHmac('sha256', key).update(serializeFormativeAttestation(payload)).digest('hex') };
}

const base = (db: SqliteD1Database) => ({
  db: db.asD1(), empresaId: 6, cursoId: 26, userId: 77,
  attestationSecret: secret, runtimeSha,
});
const confirm = { cursoId: 26, packageSha256: FORM_SHA };
const row = <T,>(db: SqliteD1Database, sql: string, ...args: unknown[]) =>
  db.database.prepare(sql).get(...(args as never[])) as T;
const cyclePolicy = (db: SqliteD1Database, id: number) =>
  row<{ assessment_policy: string | null }>(db, 'SELECT assessment_policy FROM lms_matricula_ciclos WHERE id=?', id).assessment_policy;

async function certifyAndApprove(db: SqliteD1Database) {
  await importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: attestation() });
  return approveFormativePackage({ ...base(db), packageId: FORM_ID, confirm,
    note: 'Revisão editorial e jornada real conferidas', editorialReviewRef: 'rev-editorial-01' });
}

describe('atomic activation with edition-pinned assessment policy', () => {
  const activation = (db: SqliteD1Database, json: string) => ({
    db: db.asD1(), empresaId: 6, cursoId: 26, packageId: FORM_ID, packageSha256: FORM_SHA,
    prefix: prefix(FORM_ID), launchFile: 'index.html', originalFilename: 'mgm.zip', actorId: 77,
    auditId: 'audit-1', validationJson: json,
    policy: { incoming: 'FORMATIVE' as const },
  });

  it('freezes ended cycles with the outgoing policy and moves course policy with the pointer', async () => {
    const db = fixture();
    const json = JSON.stringify(formativeQuality);
    expect(await commitCertifiedScormActivation(activation(db, json))).toBe(true);
    expect(cyclePolicy(db, 100)).toBe('SCORED');      // ended before: keeps scored rules
    expect(cyclePolicy(db, 101)).toBeNull();          // open: follows the active edition
    expect(cyclePolicy(db, 102)).toBeNull();
    expect(cyclePolicy(db, 200)).toBeNull();          // other tenant untouched
    expect(row<{ s: string }>(db, `SELECT scorm_assessment_policy s FROM lms_cursos WHERE empresa_id=6 AND id=26`).s).toBe('FORMATIVE');
    expect(row<{ s: string }>(db, `SELECT scorm_assessment_policy s FROM lms_cursos WHERE empresa_id=7 AND id=26`).s).toBe('SCORED');
    expect(row<{ p: string | null }>(db, `SELECT assessment_policy p FROM lms_scorm_package_versions WHERE id=?`, SCORED_ID).p).toBe('SCORED');
    expect(row<{ p: string | null }>(db, `SELECT previous_active_package_id p FROM lms_scorm_package_versions WHERE id=?`, FORM_ID).p).toBe(SCORED_ID);
  });

  it('stamps a scored successor and restores FORMATIVE on rollback without reclassifying terminal cycles', async () => {
    const db = fixture({ formativeActive: true });
    // A formative predecessor may have been introduced before edition-pinning.
    // Stamp its policy exactly as the policy-aware activation does for outgoing editions.
    db.database.prepare('UPDATE lms_scorm_package_versions SET assessment_policy=? WHERE id=?')
      .run('FORMATIVE', SCORED_ID);
    const nextId = '00000000-0000-4000-8000-00000000000c';
    const nextSha = 'd'.repeat(64);
    const nextJson = '{"regularScored":true}';
    db.database.prepare(`INSERT INTO lms_scorm_package_versions
      (id,empresa_id,curso_id,package_version,package_sha256,zip_size_bytes,r2_prefix,
       launch_file,scorm_versao,uploaded_at,status,validation_result_json)
      VALUES (?,?,26,'v3',?,1,?,'index.html','1.2','2026-10-28','VALIDATED',?)`)
      .run(nextId, 6, nextSha, prefix(nextId), nextJson);
    expect(await commitCertifiedScormActivation({
      db: db.asD1(), empresaId: 6, cursoId: 26, packageId: nextId,
      packageSha256: nextSha, prefix: prefix(nextId), launchFile: 'index.html',
      originalFilename: 'scored.zip', actorId: 77, auditId: 'scored-audit',
      validationJson: nextJson, policy: { incoming: 'SCORED' },
    })).toBe(true);
    expect(row<{ p: string }>(db, 'SELECT assessment_policy p FROM lms_scorm_package_versions WHERE id=?', nextId).p)
      .toBe('SCORED');
    expect(row<{ p: string }>(db, 'SELECT scorm_assessment_policy p FROM lms_cursos WHERE empresa_id=6 AND id=26').p)
      .toBe('SCORED');
    expect(cyclePolicy(db, 100)).toBe('FORMATIVE');
    db.database.prepare("UPDATE lms_matricula_ciclos SET status='CONCLUIDO' WHERE id=101").run();
    const restored = await rollbackScormPackageVersion({
      db: db.asD1(), bucket: { head: async () => ({}) } as never,
      empresaId: 6, cursoId: 26, userId: 77,
      confirm: { cursoId: 26, restorePackageId: SCORED_ID },
    });
    expect(restored).toMatchObject({ restoredPackageId: SCORED_ID, rolledBackPackageId: nextId });
    expect(row<{ p: string }>(db, 'SELECT scorm_assessment_policy p FROM lms_cursos WHERE empresa_id=6 AND id=26').p)
      .toBe('FORMATIVE');
    expect(cyclePolicy(db, 100)).toBe('FORMATIVE');
    expect(cyclePolicy(db, 101)).toBe('SCORED');
    expect(cyclePolicy(db, 200)).toBeNull();
    expect(row<{ s: string }>(db, 'SELECT status s FROM lms_scorm_package_versions WHERE id=?', nextId).s)
      .toBe('SUPERSEDED');
  });

  it('a stale or tampered validation JSON changes nothing — not even the cycle freeze', async () => {
    const db = fixture();
    expect(await commitCertifiedScormActivation(activation(db, '{"tampered":true}'))).toBe(false);
    expect(cyclePolicy(db, 100)).toBeNull();
    expect(row<{ s: string }>(db, `SELECT status s FROM lms_scorm_package_versions WHERE id=?`, SCORED_ID).s).toBe('ACTIVE');
    expect(row<{ s: string }>(db, `SELECT scorm_assessment_policy s FROM lms_cursos WHERE empresa_id=6 AND id=26`).s).toBe('SCORED');
  });

  it('the historical completion is never reclassified while the open cycle follows the new edition', async () => {
    const db = fixture();
    await commitCertifiedScormActivation(activation(db, JSON.stringify(formativeQuality)));
    const effective = (matricula: number) => row<{ scorm_assessment_policy: string }>(db,
      `SELECT ${EFFECTIVE_ASSESSMENT_POLICY_SQL} FROM lms_matriculas m
         JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id WHERE m.id=? AND m.empresa_id=6`,
      matricula).scorm_assessment_policy;
    expect(effective(10)).toBe('SCORED');
    expect(effective(11)).toBe('FORMATIVE');
    expect(effective(12)).toBe('FORMATIVE');
  });

  it('a frozen cycle policy and a stamped edition policy are write-once', async () => {
    const db = fixture();
    await commitCertifiedScormActivation(activation(db, JSON.stringify(formativeQuality)));
    expect(() => db.database.prepare(`UPDATE lms_matricula_ciclos SET assessment_policy='FORMATIVE' WHERE id=100`).run())
      .toThrow(/LMS_CYCLE_POLICY_IMMUTABLE/);
    expect(() => db.database.prepare(`UPDATE lms_scorm_package_versions SET assessment_policy='FORMATIVE' WHERE id=?`).run(SCORED_ID))
      .toThrow(/SCORM_EDITION_POLICY_IMMUTABLE/);
  });
});

describe('formative evidence, administrative approval and activation', () => {
  it('requires journey evidence AND admin approval before the preflight allows activation', async () => {
    const db = fixture();
    let pre = await evaluateFormativeActivation({ ...base(db), packageId: FORM_ID });
    expect(pre.canActivate).toBe(false);
    expect(pre.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['JOURNEY_EVIDENCE', 'ADMIN_APPROVAL']);
    await importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: attestation() });
    pre = await evaluateFormativeActivation({ ...base(db), packageId: FORM_ID });
    expect(pre.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['ADMIN_APPROVAL']);
    await approveFormativePackage({ ...base(db), packageId: FORM_ID, confirm, note: 'Revisão editorial e jornada real conferidas' });
    pre = await evaluateFormativeActivation({ ...base(db), packageId: FORM_ID });
    expect(pre.canActivate).toBe(true);
    expect(pre.incomingPolicy).toBe('FORMATIVE');
    expect(pre.impact).toEqual({ terminalToFreeze: 1, inProgress: 1, notStarted: 1 });
  });

  it('rejects wrong SHA, wrong runtime, wrong signature and tampered cases', async () => {
    const db = fixture();
    const attempts = [
      attestation('a'.repeat(64)),
      attestation(FORM_SHA, { runtimeSha: 'd'.repeat(40) }),
      attestation(FORM_SHA, {}, 'another-secret-with-length-above-thirty-two-chars'),
      attestation(FORM_SHA, { run: { harness: SCORM_FUNCTIONAL_HARNESS, browser: 'CHROMIUM', packageSha256: FORM_SHA,
        cases: FORMATIVE_REQUIRED_CASES.map((name, i) => ({ name, status: i === 4 ? 'FAIL' as const : 'PASS' as const })) } }),
    ];
    for (const bad of attempts) {
      await expect(importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: bad }))
        .rejects.toMatchObject({ statusCode: 409 });
    }
    await expect(importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: { payload: {}, signature: 'x' } }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('never exposes a package of another tenant or course', async () => {
    const db = fixture();
    await expect(importFormativeAttestation({ ...base(db), empresaId: 7, packageId: FORM_ID, attestation: attestation() }))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(approveFormativePackage({ ...base(db), cursoId: 27, packageId: FORM_ID, confirm: { cursoId: 27, packageSha256: FORM_SHA },
      note: 'Revisão editorial e jornada real conferidas' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('approval needs exact course+SHA confirmation, a real note, an admin identity and stored evidence', async () => {
    const db = fixture();
    const approve = (extra: Record<string, unknown>) => approveFormativePackage({ ...base(db), packageId: FORM_ID,
      confirm, note: 'Revisão editorial e jornada real conferidas', ...extra } as never);
    await expect(approve({})).rejects.toMatchObject({ code: 'FORMATIVE_ATTESTATION_MISSING' });
    await importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: attestation() });
    await expect(approve({ confirm: { cursoId: 26, packageSha256: 'a'.repeat(64) } })).rejects.toMatchObject({ code: 'ACTIVATION_CONFIRMATION_REQUIRED' });
    await expect(approve({ confirm: { cursoId: 99, packageSha256: FORM_SHA } })).rejects.toMatchObject({ code: 'ACTIVATION_CONFIRMATION_REQUIRED' });
    await expect(approve({ note: 'curto' })).rejects.toMatchObject({ code: 'FORMATIVE_NOTE_INVALID' });
    await expect(approve({ userId: null })).rejects.toMatchObject({ code: 'FORMATIVE_APPROVER_REQUIRED' });
    expect(row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_scorm_package_approvals').n).toBe(0);
  });

  it('approval is idempotent, append-only, and freezes the evidence', async () => {
    const db = fixture();
    const first = await certifyAndApprove(db);
    const again = await approveFormativePackage({ ...base(db), packageId: FORM_ID, confirm, note: 'Revisão editorial e jornada real conferidas' });
    expect(again).toMatchObject({ approvalId: first.approvalId, alreadyApproved: true });
    expect(row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_scorm_package_approvals').n).toBe(1);
    const alreadyStored = row<{ validation_result_json: string }>(db,
      'SELECT validation_result_json FROM lms_scorm_package_versions WHERE id=?', FORM_ID);
    const sameEnvelope = JSON.parse(alreadyStored.validation_result_json).formativeAttestation;
    await expect(importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: sameEnvelope }))
      .rejects.toMatchObject({ code: 'FORMATIVE_ALREADY_APPROVED' });
    expect(() => db.database.prepare(`DELETE FROM lms_scorm_package_approvals`).run()).toThrow(/SCORM_APPROVAL_IMMUTABLE/);
  });

  it('renews expired evidence only with a fresh signed journey and a NEW admin approval, preserving history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    const db = fixture();
    const initial = await certifyAndApprove(db);
    const before = row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_matricula_ciclos').n;
    vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
    let pre = await evaluateFormativeActivation({ ...base(db), packageId: FORM_ID });
    expect(pre.checks.find(c => c.id === 'JOURNEY_EVIDENCE')).toMatchObject({ ok: false });
    expect(pre.canActivate).toBe(false);

    const fresh = attestation();
    await importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: fresh });
    pre = await evaluateFormativeActivation({ ...base(db), packageId: FORM_ID });
    expect(pre.checks.find(c => c.id === 'JOURNEY_EVIDENCE')).toMatchObject({ ok: true });
    expect(pre.checks.find(c => c.id === 'ADMIN_APPROVAL')).toMatchObject({ ok: false });
    expect(pre.canActivate).toBe(false);

    const renewal = await approveFormativePackage({ ...base(db), packageId: FORM_ID,
      confirm, note: 'Renovação editorial após novo QA real assinado' });
    expect(renewal).toMatchObject({ approvalId: initial.approvalId, renewed: true, alreadyApproved: false });
    expect(renewal.renewalId).toBeTruthy();
    const repeated = await approveFormativePackage({ ...base(db), packageId: FORM_ID,
      confirm, note: 'Renovação editorial após novo QA real assinado' });
    expect(repeated).toMatchObject({ approvalId: initial.approvalId, alreadyApproved: true });
    expect((await evaluateFormativeActivation({ ...base(db), packageId: FORM_ID })).canActivate).toBe(true);
    expect(row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_scorm_package_approvals').n).toBe(1);
    expect(row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_scorm_package_approval_renewals').n).toBe(1);
    expect(row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_matricula_ciclos').n).toBe(before);
    expect(cyclePolicy(db, 100)).toBeNull();
    expect(() => db.database.prepare('DELETE FROM lms_scorm_package_approval_renewals').run())
      .toThrow(/SCORM_RENEWAL_IMMUTABLE/);
    expect(() => db.database.prepare(
      `UPDATE lms_scorm_package_approval_renewals SET approval_note='tampered'`).run())
      .toThrow(/SCORM_RENEWAL_IMMUTABLE/);
  });

  it('runtime SHA change requires signed re-certification and renewed admin approval, not old grants', async () => {
    const db = fixture();
    const initial = await certifyAndApprove(db);
    const next = { ...base(db), runtimeSha: 'd'.repeat(40) };
    expect((await evaluateFormativeActivation({ ...next, packageId: FORM_ID })).canActivate).toBe(false);
    await expect(importFormativeAttestation({ ...next, packageId: FORM_ID, attestation: attestation() }))
      .rejects.toMatchObject({ code: 'FORMATIVE_ATTESTATION_RUNTIME_SHA_MISMATCH' });
    await importFormativeAttestation({ ...next, packageId: FORM_ID,
      attestation: attestation(FORM_SHA, { runtimeSha: next.runtimeSha }) });
    expect((await evaluateFormativeActivation({ ...next, packageId: FORM_ID })).canActivate).toBe(false);
    await expect(approveFormativePackage({ ...next, packageId: FORM_ID, userId: null,
      confirm, note: 'Aprovação administrativa com nova evidência' }))
      .rejects.toMatchObject({ code: 'FORMATIVE_APPROVER_REQUIRED' });
    const renewed = await approveFormativePackage({ ...next, packageId: FORM_ID,
      confirm, note: 'Aprovação administrativa com nova evidência' });
    expect(renewed).toMatchObject({ approvalId: initial.approvalId, renewed: true });
    expect((await evaluateFormativeActivation({ ...next, packageId: FORM_ID })).canActivate).toBe(true);
    expect((await evaluateFormativeActivation({ ...base(db), packageId: FORM_ID })).canActivate).toBe(false);
    expect(row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_scorm_package_approvals').n).toBe(1);
  });

  it('rejects forged cross-tenant renewal, wrong predecessor and duplicate sequence in the database', async () => {
    const db = fixture();
    await certifyAndApprove(db);
    const current = row<{ id: string; attestation_sha256: string }>(db,
      'SELECT id,attestation_sha256 FROM lms_scorm_package_approvals');
    const insert = (empresa: number, previous: string, sequence: number) => db.database.prepare(
      `INSERT INTO lms_scorm_package_approval_renewals
      (id,approval_id,empresa_id,curso_id,package_id,package_sha256,sequence,
      previous_attestation_sha256,attestation_sha256,approver_id,approval_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), current.id, empresa, 26,
        FORM_ID, FORM_SHA, sequence, previous, 'a'.repeat(64), 77, 'Revisão editorial registrada');
    expect(() => insert(7, current.attestation_sha256, 1)).toThrow(/SCORM_RENEWAL_SCOPE_INVALID/);
    expect(() => insert(6, '0'.repeat(64), 1)).toThrow(/SCORM_RENEWAL_SCOPE_INVALID|SCORM_RENEWAL_CHAIN_INVALID/);
    expect(() => insert(6, current.attestation_sha256, 2)).toThrow(/SCORM_RENEWAL_SCOPE_INVALID|SCORM_RENEWAL_SEQUENCE_INVALID/);
    expect(row<{ n: number }>(db, 'SELECT COUNT(*) n FROM lms_scorm_package_approval_renewals').n).toBe(0);
  });

  it('refuses activation without approval, without confirmation or without acknowledging in-progress learners', async () => {
    const db = fixture();
    await importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: attestation() });
    await expect(activateScormPackageVersion({ ...base(db), packageId: FORM_ID, confirm }))
      .rejects.toMatchObject({ code: 'ACTIVATION_PREFLIGHT_FAILED' });
    await approveFormativePackage({ ...base(db), packageId: FORM_ID, confirm, note: 'Revisão editorial e jornada real conferidas' });
    await expect(activateScormPackageVersion({ ...base(db), packageId: FORM_ID }))
      .rejects.toMatchObject({ code: 'ACTIVATION_CONFIRMATION_REQUIRED' });
    await expect(activateScormPackageVersion({ ...base(db), packageId: FORM_ID, confirm: { ...confirm, packageSha256: OLD_SHA } }))
      .rejects.toMatchObject({ code: 'ACTIVATION_CONFIRMATION_REQUIRED' });
    await expect(activateScormPackageVersion({ ...base(db), packageId: FORM_ID, confirm }))
      .rejects.toMatchObject({ code: 'ACTIVATION_IN_PROGRESS_ACK_REQUIRED' });
    expect(row<{ s: string }>(db, `SELECT status s FROM lms_scorm_package_versions WHERE id=?`, SCORED_ID).s).toBe('ACTIVE');
    expect(cyclePolicy(db, 100)).toBeNull();
  });

  it('activates end to end, keeps the previous edition recoverable, and a second activation is refused', async () => {
    const db = fixture();
    await certifyAndApprove(db);
    const done = await activateScormPackageVersion({ ...base(db), packageId: FORM_ID, confirm: { ...confirm, acknowledgeInProgress: 1 } });
    expect(done).toMatchObject({ status: 'ACTIVE', assessmentPolicy: 'FORMATIVE', certificationProfile: FORMATIVE_PROFILE });
    expect(cyclePolicy(db, 100)).toBe('SCORED');
    expect(row<{ s: string }>(db, `SELECT status s FROM lms_scorm_package_versions WHERE id=?`, SCORED_ID).s).toBe('SUPERSEDED');
    expect(row<{ n: number }>(db, `SELECT COUNT(*) n FROM lms_scorm_package_audit_log WHERE action='ACTIVATED'`).n).toBe(1);
    expect(row<{ n: number }>(db, `SELECT COUNT(*) n FROM lms_completion_diagnostics_snapshots WHERE empresa_id=6`).n).toBe(0);
    expect(row<{ n: number }>(db, `SELECT COUNT(*) n FROM lms_completion_diagnostics_snapshots WHERE empresa_id=7`).n).toBe(1);
    await expect(activateScormPackageVersion({ ...base(db), packageId: FORM_ID, confirm: { ...confirm, acknowledgeInProgress: 1 } }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('a formative ZIP cannot ride on a package that never earned the profile', async () => {
    const db = fixture();
    db.database.prepare(`UPDATE lms_scorm_package_versions SET validation_result_json=? WHERE id=?`)
      .run(JSON.stringify({ ...formativeQuality, formativeContract: { ...formativeQuality.formativeContract, eligible: false } }), FORM_ID);
    await expect(importFormativeAttestation({ ...base(db), packageId: FORM_ID, attestation: attestation() }))
      .rejects.toMatchObject({ code: 'FORMATIVE_PROFILE_NOT_ELIGIBLE' });
  });
});

describe('rollback to the previous edition', () => {
  const bucket = (present = true) => ({ head: async () => (present ? {} : null) }) as never;
  const rollbackBase = (db: SqliteD1Database, present = true) => ({
    db: db.asD1(), bucket: bucket(present), empresaId: 6, cursoId: 26, userId: 77,
    confirm: { cursoId: 26, restorePackageId: SCORED_ID },
  });

  async function activated() {
    const db = fixture();
    await certifyAndApprove(db);
    await activateScormPackageVersion({ ...base(db), packageId: FORM_ID, confirm: { ...confirm, acknowledgeInProgress: 1 } });
    return db;
  }

  it('restores the previous edition and its policy, freezing cycles ended under the formative edition', async () => {
    const db = await activated();
    db.database.prepare(`UPDATE lms_matricula_ciclos SET status='CONCLUIDO' WHERE id=101`).run();
    const result = await rollbackScormPackageVersion(rollbackBase(db));
    expect(result).toMatchObject({ restoredPackageId: SCORED_ID, rolledBackPackageId: FORM_ID });
    expect(row<{ s: string }>(db, `SELECT status s FROM lms_scorm_package_versions WHERE id=?`, SCORED_ID).s).toBe('ACTIVE');
    expect(row<{ s: string }>(db, `SELECT status s FROM lms_scorm_package_versions WHERE id=?`, FORM_ID).s).toBe('SUPERSEDED');
    expect(row<{ s: string }>(db, `SELECT scorm_assessment_policy s FROM lms_cursos WHERE empresa_id=6 AND id=26`).s).toBe('SCORED');
    expect(row<{ p: string }>(db, `SELECT scorm_package_r2_prefix p FROM lms_cursos WHERE empresa_id=6 AND id=26`).p).toBe(prefix(SCORED_ID));
    expect(cyclePolicy(db, 100)).toBe('SCORED');
    expect(cyclePolicy(db, 101)).toBe('FORMATIVE');   // ended under the formative edition: stays formative
    expect(row<{ n: number }>(db, `SELECT COUNT(*) n FROM lms_scorm_package_audit_log WHERE action='ROLLED_BACK'`).n).toBe(1);
  });

  it('needs exact confirmation, a recoverable target and intact stored assets', async () => {
    const db = await activated();
    await expect(rollbackScormPackageVersion({ ...rollbackBase(db), confirm: { cursoId: 26, restorePackageId: FORM_ID } }))
      .rejects.toMatchObject({ code: 'ROLLBACK_CONFIRMATION_REQUIRED' });
    await expect(rollbackScormPackageVersion(rollbackBase(db, false)))
      .rejects.toMatchObject({ code: 'ROLLBACK_TARGET_ASSETS_MISSING' });
    expect(row<{ s: string }>(db, `SELECT status s FROM lms_scorm_package_versions WHERE id=?`, FORM_ID).s).toBe('ACTIVE');
    const fresh = fixture();
    await expect(rollbackScormPackageVersion(rollbackBase(fresh))).rejects.toMatchObject({ code: 'ROLLBACK_NO_PREVIOUS' });
  });

  it('refuses to restore a scored edition without a positive mastery score', async () => {
    const db = await activated();
    db.database.prepare(`UPDATE lms_cursos SET scorm_mastery_score=NULL WHERE empresa_id=6 AND id=26`).run();
    await expect(rollbackScormPackageVersion(rollbackBase(db))).rejects.toMatchObject({ code: 'ROLLBACK_THRESHOLD_MISSING' });
    expect(row<{ s: string }>(db, `SELECT status s FROM lms_scorm_package_versions WHERE id=?`, FORM_ID).s).toBe('ACTIVE');
  });
});

describe('a regular scored edition replacing a formative one', () => {
  it('restores SCORED with a positive threshold and freezes formative history first', async () => {
    const db = fixture({ formativeActive: true });
    db.database.prepare(`UPDATE lms_scorm_package_versions SET status='SUPERSEDED' WHERE id=?`).run(SCORED_ID);
    db.database.prepare(`UPDATE lms_scorm_package_versions SET status='ACTIVE', assessment_policy='FORMATIVE', certification_profile=? WHERE id=?`)
      .run(FORMATIVE_PROFILE, FORM_ID);
    const pre = await evaluateFormativeActivation({ ...base(db), packageId: SCORED_ID });
    expect(pre.incomingPolicy).toBe('SCORED');
    expect(pre.checks.find(c => c.id === 'SCORED_THRESHOLD_PRESENT')?.ok).toBe(true);
    db.database.prepare(`UPDATE lms_cursos SET scorm_mastery_score=NULL WHERE empresa_id=6 AND id=26`).run();
    const blocked = await evaluateFormativeActivation({ ...base(db), packageId: SCORED_ID });
    expect(blocked.canActivate).toBe(false);
  });
});

describe('history preservation (full-row snapshot)', () => {
  // Every column of the historical rows except the single write-once freeze column must be byte-identical
  // after activation and after rollback. Concluded work is never rewritten, only stamped with its own policy.
  const snapshot = (db: SqliteD1Database) => ({
    matriculas: db.database.prepare('SELECT * FROM lms_matriculas ORDER BY id').all(),
    ciclos: (db.database.prepare('SELECT * FROM lms_matricula_ciclos ORDER BY id').all() as Record<string, unknown>[])
      .map(cycle => { const snapshot = { ...cycle }; delete snapshot.assessment_policy; return snapshot; }),
    otherTenantCourse: db.database.prepare(`SELECT * FROM lms_cursos WHERE empresa_id=7`).all(),
    otherTenantDiag: db.database.prepare(`SELECT * FROM lms_completion_diagnostics_snapshots WHERE empresa_id=7`).all(),
  });

  it('activation and rollback leave every historical row and other tenants untouched', async () => {
    const db = fixture();
    const before = snapshot(db);
    await certifyAndApprove(db);
    await activateScormPackageVersion({ ...base(db), packageId: FORM_ID, confirm: { ...confirm, acknowledgeInProgress: 1 } });
    expect(snapshot(db)).toEqual(before);
    await rollbackScormPackageVersion({
      db: db.asD1(), bucket: ({ head: async () => ({}) }) as never, empresaId: 6, cursoId: 26, userId: 77,
      confirm: { cursoId: 26, restorePackageId: SCORED_ID },
    });
    expect(snapshot(db)).toEqual(before);
    // the one allowed difference: ended cycle 100 is stamped with the policy it ended under, forever
    expect(cyclePolicy(db, 100)).toBe('SCORED');
    expect(() => db.database.prepare(`UPDATE lms_matricula_ciclos SET assessment_policy='FORMATIVE' WHERE id=100`).run()).toThrow();
  });
});
