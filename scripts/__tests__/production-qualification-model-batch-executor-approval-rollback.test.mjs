import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-qualification-model-batch-executor.yml', 'utf8');
const guardSection = workflow.slice(workflow.indexOf('\n  guard:'), workflow.indexOf('\n  execute:'));
const executeSection = workflow.slice(workflow.indexOf('\n  execute:'));
const executeSteps = executeSection.split(/\n      - /).slice(1);

test('owner approval is verified in the credential-free guard job, bound to mode+sha+plan+count, before any write', () => {
  assert.match(workflow, /\n  issues: read\n/);
  const approval = guardSection.slice(guardSection.indexOf('Verify exact owner approval'));
  assert.match(approval, /if: \$\{\{ inputs\.mode != 'dry-run' \}\}/);
  assert.match(approval, /approval="\/qualification-model-batch \$MODE sha=\$SOURCE_SHA plan=\$bound_hash count=\$EXPECTED_COUNT"/);
  assert.match(approval, /\.author=="isaeldaumas" and \.body==\$expected/);
  assert.match(approval, /OWNER_APPROVAL_MISSING/);
  assert.match(approval, /rollback \]\]; then bound_hash="\$ROLLBACK_PLAN_SHA256"; else bound_hash="\$PLAN_SHA256"/);
  // guard holds no credentials; the execute job (credentials, writes) cannot start without guard success
  assert.doesNotMatch(guardSection, /secrets\./);
  assert.match(executeSection, /needs: guard/);
  assert.doesNotMatch(executeSection.slice(0, executeSection.indexOf('steps:')), /if:/);
  // approval is the last guard step: every write path depends on it
  assert.ok(guardSection.indexOf('verify-release-gates.mjs') < guardSection.indexOf('Verify exact owner approval'));
  assert.ok(guardSection.trimEnd().endsWith('OWNER_APPROVAL_MISSING >&2; exit 1; }'));
  // the only steps passing --apply are mode-conditioned; dry-run never needs the approval
  const writers = executeSteps.filter((s) => s.includes('--apply'));
  assert.equal(writers.length, 2);
  for (const w of writers) assert.match(w, /if: \$\{\{ inputs\.mode == '(apply|rollback)' \}\}/);
  assert.ok(executeSteps.filter((s) => !s.includes('--apply')).every((s) => !s.includes('_APPLY_2158')));
});

test('rollback after main advances: runs pinned to the ORIGINAL apply SHA, gates and approval bound to it', () => {
  assert.match(workflow, /\n      source_sha:\n/);
  assert.match(guardSection, /ROLLBACK_SOURCE_SHA_REQUIRED/);
  assert.match(guardSection, /if \[\[ "\$MODE" == rollback \]\]; then src="\$ROLLBACK_SOURCE_SHA"; else src="\$GITHUB_SHA"; fi/);
  // reachable from protected main, but not required to equal the current dispatch SHA
  assert.match(guardSection, /merge-base --is-ancestor "\$SOURCE_SHA" origin\/main/);
  assert.doesNotMatch(guardSection, /is-ancestor "\$GITHUB_SHA"/);
  // 8 gates verified for the original SHA
  assert.match(guardSection, /RELEASE_SHA: \$\{\{ steps\.source\.outputs\.source_sha \}\}/);
  assert.doesNotMatch(workflow, /RELEASE_SHA: \$\{\{ github\.sha \}\}/);
  // executor code checked out at the original SHA and attested as EXPECTED_SOURCE_SHA
  assert.match(executeSection, /ref: \$\{\{ needs\.guard\.outputs\.source_sha \}\}/);
  assert.equal(executeSection.split('EXPECTED_SOURCE_SHA: ${{ needs.guard.outputs.source_sha }}').length - 1, 2);
  assert.doesNotMatch(workflow, /EXPECTED_SOURCE_SHA: \$\{\{ github\.sha \}\}/);
  // artifact must be the apply artifact of the original SHA, produced by a run at that SHA
  assert.match(executeSection, /qualification-model-batch-executor-apply-\$SOURCE_SHA/);
  assert.match(executeSection, /workflow_run\.head_sha <<<"\$meta"\)" == "\$SOURCE_SHA"/);
  assert.doesNotMatch(executeSection, /apply-\$GITHUB_SHA/);
  // the dispatch itself must still be current main HEAD
  assert.match(guardSection, /EXPECTED_SHA" == "\$GITHUB_SHA"/);
});
