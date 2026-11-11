import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-qualification-cma-age-executor.yml', 'utf8');
const APPLY = 'AIRTRUST_PRODUCTION_QUALIFICATION_CMA_AGE_EXECUTOR_APPLY';

function steps(source) {
  const body = source.slice(source.indexOf('\n  execute:'));
  return body.split(/\n      - /).slice(1);
}

test('workflow is dispatch-only, main-only and bound to the production environment', () => {
  const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /\b(push|pull_request|pull_request_target|schedule|workflow_run|workflow_call):/);
  assert.match(workflow, /GITHUB_REF" == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /concurrency:\n\s+group: production-qualification-cma-age-executor\n\s+cancel-in-progress: false/);
  assert.match(workflow, /\npermissions:\n\s+contents: read\n\s+actions: read\n\s+checks: read\n\s+statuses: read\n/);
  assert.doesNotMatch(workflow, /(contents|actions|pull-requests|id-token): write/);
});

test('required inputs are declared and validated before any production access', () => {
  for (const input of ['mode', 'expected_sha', 'plan_sha256', 'expected_count', 'recovery_bookmark',
    'confirm_production', 'rollback_artifact_id', 'rollback_plan_sha256']) {
    assert.match(workflow, new RegExp(`\\n      ${input}:`));
  }
  assert.match(workflow, /CONFIRM_PRODUCTION" == AIRTRUST_PRODUCTION/);
  assert.match(workflow, /EXPECTED_SHA" == "\$GITHUB_SHA"/);
  assert.match(workflow, /merge-base --is-ancestor "\$SOURCE_SHA" origin\/main/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /RECOVERY_BOOKMARK_REQUIRED/);
  assert.match(workflow, /ROLLBACK_ARTIFACT_ID_REQUIRED/);
  assert.match(workflow, /ROLLBACK_PLAN_SHA256_REQUIRED/);
  assert.match(workflow, /needs: guard/);
  assert.match(workflow, /PLAN_HASH_MISMATCH/);
  assert.match(workflow, /PLAN_COUNT_MISMATCH/);
});

test('inputs never reach shell run blocks through direct interpolation', () => {
  const lines = workflow.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s+run:\s*[|>-]?\s*$/.test(lines[i])) continue;
    const indent = lines[i].search(/\S/);
    for (let j = i + 1; j < lines.length && (!lines[j].trim() || lines[j].search(/\S/) > indent); j += 1) {
      assert.doesNotMatch(lines[j], /\$\{\{\s*(inputs|github\.event\.inputs)\./);
    }
  }
});

test('apply confirmation and recovery attestation exist only in apply/rollback steps', () => {
  const all = steps(workflow);
  const withApply = all.filter((s) => s.includes(APPLY));
  assert.equal(withApply.length, 2);
  const [forward, rollback] = withApply;
  assert.match(forward, /if: \$\{\{ inputs\.mode == 'apply' \}\}/);
  assert.match(rollback, /if: \$\{\{ inputs\.mode == 'rollback' \}\}/);
  for (const s of withApply) {
    assert.match(s, /AIRTRUST_CMA_AGE_RECOVERY_READY: 'yes'/);
    assert.match(s, /AIRTRUST_CMA_AGE_ACTOR: \$\{\{ github\.actor \}\}/);
    assert.match(s, /EXPECTED_SOURCE_SHA: \$\{\{ needs\.guard\.outputs\.source_sha \}\}/);
    assert.match(s, /--apply/);
  }
  assert.equal(workflow.split('AIRTRUST_CMA_AGE_RECOVERY_READY').length - 1, 2);
  assert.equal(workflow.split('--apply').length - 1, 2);
  // no step other than the two above may pass --apply
  for (const s of all.filter((x) => !withApply.includes(x))) assert.doesNotMatch(s, /--apply/);
});

test('dry-run steps use the dry-run confirmation and the readback demands pending=0', () => {
  assert.match(workflow, /EXECUTOR_DRY_RUN/);
  assert.match(workflow, /--emit-rollback=/);
  assert.match(workflow, /DRY_RUN_CONFLICTS_ABORT/);
  assert.match(workflow, /READBACK_PENDING_NOT_ZERO/);
  assert.match(workflow, /READBACK_ALREADY_APPLIED_MISMATCH/);
  assert.match(workflow, /\.already_applied \+ \.skipped_not_applied/);
  assert.match(workflow, /READBACK_CONFLICTS/);
  assert.match(workflow, /ROLLBACK_HASH_INPUT_MISMATCH/);
});

test('no git writes, no raw wrangler shortcuts and artifacts hold only generated evidence', () => {
  assert.doesNotMatch(workflow, /git (add|commit|push)/);
  assert.doesNotMatch(workflow, /wrangler/);
  assert.doesNotMatch(workflow, /d1 execute/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/cmaagebatch\/out\/\*\.json/);
  assert.match(workflow, /rm -f "\$RUNNER_TEMP\/cmaagebatch\/plan\.json"/);
  for (const action of workflow.match(/^\s+(?:- )?uses: [^\n]+/gm)) assert.match(action, /@v\d+/);
});

test('CMA age workflow targets its own scripts, the #2158 approval thread and tenant-6 batch artifacts', () => {
  assert.match(workflow, /issues\/2158\/comments/);
  assert.match(workflow, /scripts\/production\/qualification-cma-age-governed-executor\.mjs/);
  assert.match(workflow, /scripts\/production\/qualification-cma-age-readonly-plan\.mjs/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_QUALIFICATION_CMA_AGE_READONLY/);
  assert.doesNotMatch(workflow, /issues\/2068|qualification-expiry-legacy/);
  assert.match(workflow, /name: Governed production D1 qualification CMA age batch apply/);
});
