// source_reference: staging Simulator Individual Check QA workflow, synthetic fixture and Playwright spec (issue #1548).
// operational_decision: static contract test only; referenced DML belongs exclusively to the isolated staging QA fixture/rollback.
// dry_run_required: not applicable; this test reads source text and runs local syntax validation, with no remote D1 mutation.
// rollback_plan_required: the governed workflow always rolls back its synthetic fixture; this test performs no write.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-simulator-individual-check-qa.yml', 'utf8');
const seed = readFileSync('scripts/staging/seed-qa-simulator-individual-check.mjs', 'utf8');
const spec = readFileSync('e2e/simuladores/individual-check-homologation.spec.ts', 'utf8');
const config = readFileSync('e2e/simuladores-individual-check.config.ts', 'utf8');

test('workflow is main-only, staging-only, SHA-guarded, serialized and always cleans up', () => {
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /AIRTRUST_STAGING_SIMULATOR_INDIVIDUAL_CHECK_QA/);
  assert.match(workflow, /group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /OPEN_REVIEWED_PR_SHA_OR_SCOPE_MISMATCH/);
  assert.match(workflow, /airtrust-api-staging\.airtrust\.workers\.dev/);
  assert.doesNotMatch(workflow, /api\.airtrust\.online|airtrust\.online/);
  assert.match(workflow, /if: always\(\) && needs\.d1_fixture\.result != 'skipped'/);
  assert.match(workflow, /--rollback --apply/);
  assert.match(workflow, /production writes: `none`/);
});

test('workflow never applies Schema V2 and never exposes traces or credentials', () => {
  assert.doesNotMatch(workflow, /staging-apply-schema-v2|apply-schema-change|wrangler d1 migrations/);
  assert.doesNotMatch(workflow, /trace: 'on'|--trace|screenshot: 'on'/);
  assert.match(config, /trace: 'off'/);
  assert.match(config, /screenshot: 'off'/);
  assert.match(config, /video: 'off'/);
  assert.match(config, /PRODUCTION_TARGET_REJECTED/);
});

test('fixture is bound to the synthetic tenant and refuses without physical 0554+0560 ledger', () => {
  assert.match(seed, /qa_examiner_training/);
  assert.match(seed, /airtrust-db-staging-baseline-20260701/);
  assert.match(seed, /simulator-individual-check-evidence-0554/);
  assert.match(seed, /simulator-individual-check-delete-guard-0560/);
  assert.match(seed, /STAGING_CONFIRMATION_MISSING/);
  assert.match(seed, /QA-SIM-IND-/);
  // Evidence is immutable: the fixture must never try to physically delete or update it.
  assert.doesNotMatch(seed, /DELETE FROM sessoes_checks_resultados_individuais/);
  assert.doesNotMatch(seed, /UPDATE sessoes_checks_resultados_individuais/);
  execFileSync('node', ['--check', 'scripts/staging/seed-qa-simulator-individual-check.mjs']);
});

test('Playwright spec covers A/B/C, modal+inline signing, reload, new session, RBAC and recovery', () => {
  for (const token of [
    'PENDENTE_AVALIACAO', 'APROVADO', 'REPROVADO', 'aprovado_comprovado',
    'Assinatura Digital', 'mode=sign&papel=INSTRUTOR', 'inline-check-',
    'Confirmar resultados individuais', 'page.reload()', 'route.abort',
    'persistência em nova sessão', 'RBAC/cross-tenant', 'checks-individuais',
    '/pdf', 'PRODUCTION_API_TARGET_REJECTED', 'Promise.all',
  ]) assert.ok(spec.includes(token), `missing spec token: ${token}`);
});
