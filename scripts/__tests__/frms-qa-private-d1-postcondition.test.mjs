// Pure synthetic entry contracts; no Cloudflare query or R2/Queue operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateD1PostconditionEntry as verify} from
  '../../ops/frms-qa-repair/run-protected-private-d1-readback.mjs';

const SHA='a'.repeat(40);
const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REPOSITORY:'Airtrust-Org/airtrust',
  GITHUB_REF:'refs/heads/main',
  GITHUB_WORKFLOW_REF:
    'Airtrust-Org/airtrust/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main',
  GITHUB_SHA:SHA,FRMS_QA_EXPECTED_APPLY_SHA:SHA,
  FRMS_QA_APPLY_STAGE_RESULT:'APPLY_REPORTED_PENDING_INDEPENDENT_READBACK',
  CLOUDFLARE_ACCOUNT_ID:'f'.repeat(32),
  CLOUDFLARE_D1_MIGRATION_API_TOKEN:'synthetic-existing-d1-read-token',
};
test('D1-only physical postcondition accepts a success dependency without claiming 4/4',()=>{
  const verified=verify(env);
  assert.deepEqual(verified,{sha:SHA,phase:'d1-readonly-postcondition',d1Writes:0});
  assert.equal(JSON.stringify(verified).includes(env.CLOUDFLARE_D1_MIGRATION_API_TOKEN),false);
});
test('no apply, wrong SHA/branch/workflow or worker bearer fail before D1 read',()=>{
  for(const changes of [
    {FRMS_QA_APPLY_STAGE_RESULT:''},
    {FRMS_QA_APPLY_STAGE_RESULT:'STAGING_FRMS_F0_4_OF_4_READONLY_VERIFIED'},
    {FRMS_QA_EXPECTED_APPLY_SHA:'b'.repeat(40)},
    {GITHUB_SHA:'b'.repeat(40)},
    {GITHUB_REF:'refs/heads/staging'},
    {GITHUB_EVENT_NAME:'push'},
    {GITHUB_WORKFLOW_REF:'Airtrust-Org/airtrust/.github/workflows/other.yml@refs/heads/main'},
    {CLOUDFLARE_WORKER_API_TOKEN:'forbidden-cross-scope'},
    {CLOUDFLARE_D1_MIGRATION_API_TOKEN:''},
    {FRMS_QA_CALLER_KEY_HEX:'forbidden'},
    {FRMS_QA_APPROVAL_PRIVATE_KEY_PEM:'forbidden'},
  ]){
    assert.throws(()=>verify({...env,...changes}),
      /FRMS_QA_POSTCONDITION_DENIED/);
  }
});
