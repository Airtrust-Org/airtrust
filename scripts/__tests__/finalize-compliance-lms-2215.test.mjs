import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=readFileSync('scripts/production/finalize-compliance-lms-2215.mjs','utf8');
const workflow=readFileSync('.github/workflows/production-compliance-lms-finalize-2215.yml','utf8');
const ids=JSON.parse(script.match(/const REVIEWED = Object\.freeze\((\[[^\n]+\])\)/)[1]);
test('exact approved 124 rule IDs, no duplicate or archived/appointment overlap',()=>{
  assert.equal(ids.length,124);
  assert.equal(new Set(ids).size,124);
  for(const id of [104,237,240,242,244,256,480,665,666,667,668,677,678,703])
    assert.equal(ids.includes(id),false);
});
test('must preserve four unpublished course drafts with exact qualifications',()=>{
  assert.match(script,/75:189,80:45,81:120,82:203/);
  assert.match(script,/Number\(row\.publicado\)!==0/);
  assert.match(script,/scorm_package_r2_prefix!=null/);
  assert.match(script,/DRAFT_CONTENT_OR_MAPPING_DRIFT/);
});
test('persist opt-in only in reviewed rules, preserve manual credential appointment',()=>{
  assert.match(script,/AND id IN \(\$\{csv\}\) AND ativo=1 AND deleted_at IS NULL/);
  assert.match(script,/AND modalidade_requerida IS NULL AND auto_matricular_ead=0/);
  assert.doesNotMatch(script,/SET modalidade_requerida='EAD'/);
  assert.match(script,/if\(solo\.escopo!=='FUNCIONARIO'\)/);
  assert.match(script,/examiner_credential_remains_manual:true/);
});
test('historical qualification evidence preserved; only archived rule references retired',()=>{
  assert.match(script,/ARCHIVED = Object\.freeze\(\[237,240,242,244,256,665,666,667\]\)/);
  assert.match(script,/SET ativo=0,updated_at=datetime\('now'\)/);
  assert.match(script,/qt\.deleted_at IS NOT NULL/);
  assert.doesNotMatch(script,/UPDATE qualificacoes_historico|DELETE FROM qualificacoes_historico/);
});
test('production plan requires exact reviewed hash and verifies postconditions',()=>{
  assert.match(script,/COMPLIANCE_2215_EXPECTED_HASH!==beforeHash/);
  assert.match(script,/verify\(after,true\)/);
  assert.match(script,/audit_records:audited\.changes/);
  assert.match(script,/certifications_created:0/);
  assert.match(script,/content_published:0/);
  assert.match(script,/created_enrollments:0/);
  assert.match(script,/emails_sent:0/);
});
test('workflow pins approved source plus eight gates, D1 recovery, reviewed dry-run',()=>{
  assert.match(workflow,/RELEASE_SHA="\$EXPECTED_SHA" node scripts\/ci\/verify-release-gates.mjs/);
  assert.match(workflow,/RELEASE_SHA="\$GITHUB_SHA" node scripts\/ci\/verify-release-gates.mjs/);
  assert.match(workflow,/reviewed_dry_run_run_id/);
  assert.match(workflow,/\.before_hash/);
  assert.match(workflow,/d1 time-travel info airtrust-db/);
  assert.match(workflow,/CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
});
test('wrong confirmation fails before any database call',()=>{
  const p=spawnSync(process.execPath,['scripts/production/finalize-compliance-lms-2215.mjs','apply'],{
    encoding:'utf8',env:{...process.env,COMPLIANCE_2215_CONFIRMATION:'INVALID'}});
  assert.notEqual(p.status,0);
  assert.match(p.stderr,/CONFIRMATION_MISMATCH/);
});
