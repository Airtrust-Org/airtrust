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
});

test('lifecycle fixture is reserved to the canonical synthetic tenant and fails closed', () => {
  assert.match(seed, /qa_examiner_training/);
  assert.match(seed, /AIRTRUST_STAGING_TRAINING_COMPLIANCE_LIFECYCLE_QA/);
  assert.match(seed, /QA-COMP-LIFE-/);
  assert.match(seed, /airtrust-db-staging-baseline-20260701/);
  assert.match(seed, /DELETE FROM lms_xapi_statements/);
  assert.match(seed, /scorm_package_r2_prefix/);
  execFileSync('node', ['--check', 'scripts/staging/seed-qa-training-compliance-lifecycle.mjs']);
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
  assert.match(spec, /mandatory alone cannot auto-enroll/);
  assert.match(spec, /NULL modality must fail closed/);
  assert.match(spec, /opt-in=0 must fail closed/);
  assert.match(spec, /setExplicitEadEnrollment\(page, sectorRuleId, true, 'EAD'\)/);
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
});
