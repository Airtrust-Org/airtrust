import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-qualification-evidence-comment-dispatch-20261004.yml', 'utf8');

test('comment bridge is locked to the reviewed PR, actor and current main', () => {
  assert.match(workflow, /issue\.number == 1162/);
  assert.match(workflow, /github\.actor == 'isaeldaumas'/);
  assert.match(workflow, /git\/ref\/heads\/main/);
  assert.match(workflow, /COMMENT_COMMAND_REJECTED/);
});

test('comment bridge hard-locks plan, candidate hash and count', () => {
  assert.match(workflow, /bb4aaadfce1c5ae9ed9fa4ae8723f3126103f5edbd048dff46d0ef8dffa900cc/);
  assert.match(workflow, /3797b28d538ba6cd810ee9334755012b9df54b4134e94c0cfc29b9ab3cfab6d0/);
  assert.match(workflow, /expected_candidate_count=13/);
});

test('apply requires reviewed predecessor id and the governed confirmation', () => {
  assert.match(workflow, /reviewed_run=/);
  assert.match(workflow, /\(\[1-9\]\[0-9\]\*\)/);
  assert.match(workflow, /reviewed_dry_run_run_id/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_RECONCILE_QUALIFICATION_EVIDENCE_20261004/);
});
