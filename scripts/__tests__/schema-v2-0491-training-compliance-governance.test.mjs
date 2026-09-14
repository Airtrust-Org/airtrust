// source_reference: training compliance 0491 Schema V2 governance and reviewed migration artifacts
// operational_decision: verify fail-closed production/staging wiring without executing remote writes
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST='worker-airtrust/schema-v2/training-compliance-requirements-0491.json';
const MIGRATION='worker-airtrust/migrations/0491_training_compliance_requirements.sql';
const CHANGE_ID='training-compliance-requirements-0491';
const sha256=(v)=>createHash('sha256').update(v).digest('hex');

test('0491 reviewed hashes and builder remain pinned',()=>{
  const m=JSON.parse(readFileSync(MANIFEST,'utf8'));
  assert.equal(m.changeId,CHANGE_ID);
  assert.equal(m.baselineId,'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(m.filePath)),m.fileHash);
  assert.equal(sha256(readFileSync(m.planPath)),m.planHash);
  assert.equal(readFileSync(m.filePath,'utf8'),readFileSync(MIGRATION,'utf8'));
  const out=path.join(mkdtempSync(path.join(tmpdir(),'airtrust-0491-')),'apply.sql');
  const result=buildReviewedSchemaApply({manifestPath:MANIFEST,outputPath:out,expectedChangeId:CHANGE_ID,githubSha:'cccccccccccccccccccccccccccccccccccccccc'});
  assert.equal(result.changeId,CHANGE_ID);
  assert.equal((readFileSync(out,'utf8').match(/INSERT INTO airtrust_schema_changes_v2/g)??[]).length,1);
});

test('production Schema V2 workflow wires dedicated 0491 read-only guards',()=>{
  const workflow=readFileSync('.github/workflows/apply-schema-change-v2.yml','utf8');
  assert.match(workflow,/inputs\.change_id == 'training-compliance-requirements-0491'/);
  assert.match(workflow,/validate-0491-production-preflight\.sh/);
  assert.match(workflow,/validate-0491-production-postconditions\.sh/);
});

test('0491 production guards are syntactically valid, target-locked and mutation-free',()=>{
  for(const file of ['scripts/schema-v2/validate-0491-production-preflight.sh','scripts/schema-v2/validate-0491-production-postconditions.sh']){
    const src=readFileSync(file,'utf8');
    assert.match(src,/ALLOWED_DB_NAME="airtrust-db"/);
    assert.match(src,/training-compliance-requirements-0491/);
    assert.doesNotMatch(src,/wrangler[^\n]+(--file|migrations apply)/i);
    execFileSync('bash',['-n',file]);
    assert.throws(()=>execFileSync('bash',[file,'--target=airtrust-db-staging-baseline-20260701'],{stdio:'pipe'}));
  }
});

test('staging release path allowlists and routes 0491 through its dedicated guarded runner',()=>{
  const outer=readFileSync('scripts/staging/apply-approved-migrations.sh','utf8');
  assert.match(outer,/"0491_training_compliance_requirements\.sql"/);
  assert.match(outer,/apply-0491-training-compliance-requirements\.sh/);
  const runner=readFileSync('scripts/staging/apply-0491-training-compliance-requirements.sh','utf8');
  assert.match(runner,/SCHEMA_CHANGE_ID="training-compliance-requirements-0491"/);
  assert.match(runner,/CONFIRMATION_PHRASE="AIRTRUST_STAGING_SCHEMA_CHANGE"/);
  assert.match(runner,/BLOCKED_PRODUCTION_DB_ID/);
  assert.match(runner,/REMOTE_WRITE_EXECUTED=false/);
  execFileSync('bash',['-n','scripts/staging/apply-0491-training-compliance-requirements.sh']);
});

test('staging 0491 postconditions are read-only and reject production',()=>{
  const file='scripts/staging/validate-0491-postconditions.sh';
  const src=readFileSync(file,'utf8');
  assert.match(src,/ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"/);
  assert.doesNotMatch(src,/wrangler[^\n]+--file/i);
  assert.match(src,/legacy-backfill-missing/);
  execFileSync('bash',['-n',file]);
  assert.throws(()=>execFileSync('bash',[file,'--target=airtrust-db'],{stdio:'pipe'}));
});
