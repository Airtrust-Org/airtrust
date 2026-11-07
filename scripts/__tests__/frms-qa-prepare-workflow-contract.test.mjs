import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runPrepareAdminPreflight} from '../../ops/frms-qa-repair/run-prepare-admin-preflight.mjs';

const workflowPath='.github/workflows/staging-frms-qa-private-prepare.yml';
const workflow=readFileSync(workflowPath,'utf8');
const runner=readFileSync('ops/frms-qa-repair/run-prepare-admin-preflight.mjs','utf8');

test('prepare workflow pins manual main, exact input, protected staging and shared mutex',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  for(const input of ['confirmation','expected_main_sha','grant_id'])
    assert.match(workflow,new RegExp('^      '+input+':','m'));
  assert.match(workflow,/environment: staging/);
  assert.match(workflow,/group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/contents: read/);
  assert.match(workflow,/checks: read/);
  assert.match(workflow,/actions: read/);
  assert.match(workflow,/issues: read/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/FRMS_QA_PREPARE_CONFIRM: \${{ inputs\.confirmation }}/);
  assert.match(workflow,/FRMS_QA_PREPARE_EXPECTED_SHA: \${{ inputs\.expected_main_sha }}/);
  assert.match(workflow,/FRMS_QA_PREPARE_GRANT_ID: \${{ inputs\.grant_id }}/);
  assert.match(workflow,/node ops\/frms-qa-repair\/run-prepare-admin-preflight\.mjs/);
});

test('workflow attests grant only: no Cloudflare runtime token, mutating command or implicit prepare',()=>{
  assert.doesNotMatch(workflow,/secrets\./);
  assert.doesNotMatch(workflow,/\bwrangler\b/);
  assert.doesNotMatch(workflow,/\bbinding\.prepare\s*\(/);
  assert.doesNotMatch(workflow,/\b(?:curl|wget)\s.*api\.cloudflare\.com/);
  assert.doesNotMatch(workflow,/\b(?:gh|git)\s+(?:workflow run|push|merge)\b/);
  assert.match(workflow,/No private caller, no Worker RPC, no encrypted preimage R2 write/);
  assert.doesNotMatch(runner,/['"]https:\/\/api\.cloudflare\.com/);
  assert.doesNotMatch(runner,/\.prepare\s*\(/);
  assert.doesNotMatch(runner,/\.apply\s*\(/);
});

test('preflight rejects missing runner token or external API before any operation',async()=>{
  const fake={GITHUB_TOKEN:''};
  let called=false;
  await assert.rejects(runPrepareAdminPreflight({env:fake,api:async()=>{
    called=true;return {};
  }}),/FRMS_QA_PREPARE_PREFLIGHT_DENIED/);
  assert.equal(called,false);
  await assert.rejects(runPrepareAdminPreflight({
    env:{GITHUB_TOKEN:'synthetic-token'},api:null,
  }),/FRMS_QA_PREPARE_PREFLIGHT_DENIED/);
});

test('an untrusted fake GitHub event cannot obtain a successful grant attestation',async()=>{
  let called=false;
  await assert.rejects(runPrepareAdminPreflight({
    env:{GITHUB_TOKEN:'synthetic-token',GITHUB_ACTIONS:'false'},
    api:async()=>{called=true;return {};},
  }),/FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
  assert.equal(called,false);
});
