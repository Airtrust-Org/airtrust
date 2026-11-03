// source_reference: staging Training Compliance lifecycle QA workflow, synthetic fixture, and browser spec.
// operational_decision: static contract test only; referenced DML belongs exclusively to the isolated staging QA fixture/rollback.
// dry_run_required: not applicable; this test reads source text and executes only local syntax validation, with no remote D1 mutation.
// rollback_plan_required: the governed staging lifecycle workflow always rolls back its synthetic fixture; this test performs no write.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-training-compliance-lifecycle-qa.yml', 'utf8');
const seed = readFileSync('scripts/staging/seed-qa-training-compliance-lifecycle.mjs', 'utf8');
const spec = readFileSync('e2e/frontend-pr-ui-qa/training-compliance-lifecycle.spec.ts', 'utf8');
const cycleEvidence = readFileSync('scripts/staging/qa-training-compliance-cycle-evidence.mjs', 'utf8');
const certificateWriteRoutes = readFileSync('worker-airtrust/src/routes/qualificacoes-certificados-write.ts', 'utf8');
const workerIndex = readFileSync('worker-airtrust/src/index.ts', 'utf8');
const certificateFrontendHook = readFileSync('src/react-app/hooks/useCertificados.ts', 'utf8');

test('lifecycle workflow is main-only, staging-only, exact-SHA guarded and always cleans up', () => {
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /expected_deployed_sha/);
  assert.match(workflow, /pr_number:/);
  assert.match(workflow, /OPEN_REVIEWED_PR_REQUIRED/);
  assert.match(workflow, /OPEN_REVIEWED_PR_SHA_OR_SCOPE_MISMATCH/);
  assert.match(workflow, /pr\.state !== 'open'/);
  assert.match(workflow, /pr\.head\?\.repo\?\.full_name !== repo/);
  assert.match(workflow, /pr\.head\?\.sha\?\.toLowerCase\(\) !== expected/);
  assert.match(workflow, /group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /airtrust-api-staging\.airtrust\.workers\.dev/);
  assert.doesNotMatch(workflow, /api\.airtrust\.online/);
  assert.match(workflow, /if: always\(\) && needs\.d1_fixture\.result != 'skipped'/);
  assert.match(workflow, /--rollback --apply/);
  assert.match(workflow, /airtrust-staging-mutations-and-scorm-qa/);
  assert.match(workflow, /expired synthetic evidence renews cycle two and issues an authorized PDF/);
  assert.match(workflow, /needs\.d1_renewal_browser\.result/);
});

test('lifecycle fixture is reserved to the canonical synthetic tenant and fails closed', () => {
  assert.match(seed, /qa_examiner_training/);
  assert.match(seed, /AIRTRUST_STAGING_TRAINING_COMPLIANCE_LIFECYCLE_QA/);
  assert.match(seed, /QA-COMP-LIFE-/);
  assert.match(seed, /airtrust-db-staging-baseline-20260701/);
  assert.match(seed, /DELETE FROM lms_xapi_statements/);
  assert.match(seed, /scorm_package_r2_prefix/);
  assert.match(seed, /'--command', sql, '--json'/);
  assert.doesNotMatch(seed, /`--file=\$\{file\}`/);
  assert.match(seed, /lms_integrada=1 AND ativo=1 AND deleted_at IS NULL/);
  assert.match(seed, /const lmsCategoryId =/);
  assert.doesNotMatch(seed, /INSERT INTO qualificacoes_categorias/);
  assert.doesNotMatch(seed, /UPDATE qualificacoes_categorias/);
  execFileSync('node', ['--check', 'scripts/staging/seed-qa-training-compliance-lifecycle.mjs']);
  execFileSync('node', ['--check', 'scripts/staging/qa-training-compliance-cycle-evidence.mjs']);
});

test('controlled expiry is limited to this synthetic E1 LMS qualification and cycle proof is read-only', () => {
  assert.match(cycleEvidence, /airtrust-db-staging-baseline-20260701/);
  assert.match(cycleEvidence, /AIRTRUST_STAGING_TRAINING_COMPLIANCE_LIFECYCLE_QA/);
  assert.match(cycleEvidence, /qa_examiner_training/);
  assert.match(cycleEvidence, /f\.matricula=\$\{q\(\`\$\{code\}-E1\`\)\}/);
  assert.match(cycleEvidence, /c\.observacoes=\$\{q\(marker\)\}/);
  assert.match(cycleEvidence, /AUTO_RENOVACAO/);
  assert.match(cycleEvidence, /archived_xapi/);
  assert.match(cycleEvidence, /lms_ciclo_evidencias/);
  assert.match(cycleEvidence, /certificate_count/);
  assert.match(workflow, /--expire --apply/);
  assert.match(workflow, /--verify/);
});

test('staging fixture binds both QA courses to manager-visible sector and cleans them up', () => {
  // The catalog must stay scoped by RBAC. The fixture, not the LMS handler,
  // supplies the two course-sector links for the synthetic Gestor identity.
  assert.match(seed, /INSERT INTO lms_cursos_setores\(curso_id,setor_id,empresa_id/);
  assert.match(seed, /course_sector_count INTEGER NOT NULL CHECK\(course_sector_count=2\)/);
  assert.match(seed, /SELECT COUNT\(\*\) FROM lms_cursos_setores lcs JOIN lms_cursos c/);
  assert.match(seed, /UPDATE lms_cursos_setores\s+SET deleted_at=COALESCE/);
  assert.match(seed, /AND curso_id IN \(\s+SELECT id FROM lms_cursos WHERE empresa_id=/);
  assert.match(seed, /AND c\.observacoes=\$\{esc\(marker\)\} AND lcs\.deleted_at IS NULL/);
});

test('EAD lifecycle explicitly opts in after proving defaults and NULL modality do not enroll', () => {
  assert.equal((seed.match(/qc\.id,'EAD',1,12/g) || []).length, 2);
  assert.equal((seed.match(/,'EAD',60,/g) || []).length, 2);
  assert.match(spec, /mandatory alone cannot auto-enroll/);
  assert.match(spec, /NULL modality must fail closed/);
  assert.match(spec, /opt-in=0 must fail closed/);
  assert.match(spec, /setExplicitEadEnrollment\(page, sectorRuleId, true, 'EAD',/);
  assert.match(spec, /repeated eligible rule must not duplicate/);
  assert.match(spec, /orphanOptIn\.json\.data\.auto_enrollment\.created\)\.toBe\(1\)/);
  assert.match(spec, /evidencia_modalidade\)\.toBe\('EAD'\)/);
  assert.match(spec, /data_validade\)\.toMatch/);
});

test('browser simulation covers organization, enrollment, progress, completion and reconciliation transitions', () => {
  for (const token of [
    'OBRIGATORIA',
    'NAO_APLICA',
    'RECOMENDADA',
    'automaticRows',
    'completion_intent',
    'USER_COMPLETION_REQUIRED',
    'EM_ANDAMENTO',
    '/progresso',
    'progresso_pct: 50',
    '/api/lms/assets/session',
    '/api/lms/xapi/statements',
    'completion: true',
    'MANTER_AVULSA',
    'REABRIR',
    'VINCULAR_SETOR_FUNCAO',
  ]) assert.ok(spec.includes(token), `missing lifecycle token: ${token}`);
  assert.doesNotMatch(spec, /getByRole\('button', \{ name: 'Matricular gaps \(sem e-mail\)'/);
  assert.match(spec, /PRODUCTION_TARGET_REJECTED/);
  assert.match(spec, /describe\.configure\(\{ retries: 0 \}\)/);
  assert.match(spec, /status_compliance: 'VENCIDO'/);
  assert.match(spec, /reactivated: 1, created: 0/);
  assert.match(spec, /%PDF-/);
  assert.match(spec, /application\/pdf/);
  assert.match(spec, /SHA-256/);
  assert.match(spec, /renewal-cycle-2/);
});

test('renewal PDF QA targets the canonical Worker certificate routes, not the qualifications namespace', () => {
  // The Worker mounts its historical certificate router under /api/certificados.
  // Keeping a source-contract guard prevents test-only 404s that hide whether
  // genuine R2 PDF generation, tenant-scoped listing and streaming still work.
  assert.match(workerIndex, /app\.route\('\/api\/certificados', qualificacoesCertificadosRoutes\)/);
  assert.match(certificateWriteRoutes, /app\.post\(\s*'\/historico\/:id\/certificados\/gerar'/);
  assert.match(certificateFrontendHook, /\/certificados\/historico\/\$\{qualificacao_id\}\/certificados\/gerar/);
  assert.match(spec, /\/api\/certificados\/historico\/\$\{secondHistoryId\}\/certificados\/gerar/);
  assert.match(spec, /\/api\/certificados\/historico\/\$\{secondHistoryId\}\/certificados\x60/);
  assert.doesNotMatch(spec, /\/api\/qualificacoes\/historico\/\$\{secondHistoryId\}\/certificados/);
  assert.match(spec, /\/api\/pasta-virtual\/stream\/\$\{documentId\}/);
  assert.match(spec, /application\/pdf/);
  assert.match(spec, /%PDF-/);
  assert.match(spec, /SHA-256/);
});


test('synthetic lifecycle certificate CPF input is per-run, tenant-scoped and never a real identity', () => {
  const renderSeed = (runId) => {
    const code = 'QA-COMP-LIFE-' + runId;
    return execFileSync(process.execPath, [
      'scripts/staging/seed-qa-training-compliance-lifecycle.mjs',
      '--code=' + code,
      '--marker=QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_' + runId,
      '--print-sql-for-qa-test',
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        STAGING_D1_NAME: 'airtrust-db-staging-baseline-20260701',
      },
    });
  };
  const extract = (sql) => [...sql.matchAll(
    /VALUES \('QA-COMP-LIFE-\d+ Pessoa ([12])','QA-COMP-LIFE-\d+-E[12]','(000\d{8})'/g,
  )].map((m) => ({ employee: Number(m[1]), cpf: m[2] }));
  const a = extract(renderSeed('41734167941'));
  const b = extract(renderSeed('41731014198'));
  assert.equal(a.length, 2, 'both run-owned employees require synthetic CPF digits');
  assert.equal(b.length, 2);
  assert.deepEqual(a.map((x) => x.employee), [1, 2]);
  assert.equal(new Set(a.map((x) => x.cpf)).size, 2);
  assert.ok(a.every((x) => /^[0-9]{11}$/.test(x.cpf)));
  assert.ok(a.every((x) => !b.some((y) => x.cpf === y.cpf)), 'different runs must not reuse CPF placeholders');
  assert.match(seed, /employee_cpf_count INTEGER NOT NULL CHECK\(employee_cpf_count=2\)/);
  assert.match(seed, /AND cpf=\$\{esc\(syntheticCpfE1\)\}/);
  assert.match(seed, /AND cpf=\$\{esc\(syntheticCpfE2\)\}/);
  // A real certificate requires all fields; do not weaken public hash/QR validation.
  const validation = readFileSync('worker-airtrust/src/utils/certificate-validation-hash.ts', 'utf8');
  assert.match(validation, /CERTIFICATE_VALIDATION_HASH_INPUT_INCOMPLETE/);
  assert.match(validation, /funcionarioCpf/);
});
