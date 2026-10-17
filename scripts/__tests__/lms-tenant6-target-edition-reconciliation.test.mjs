import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import { checkWorkflowContent } from '../ci/cloudflare-secret-contract-lib.mjs';
const wf=readFileSync(new URL('../../.github/workflows/production-lms-tenant6-governed-edition-review.yml',import.meta.url),'utf8');
const source=readFileSync(new URL('../production/lms-tenant6-target-edition-reconciliation.mjs',import.meta.url),'utf8');
test('release SHA gates, admin RBAC, preflight proof, recovery and canonical mutation',()=>{
 for(const term of ['verify-release-gates.mjs','d1 time-travel info','reviewed_preflight_run_id','environment: production'])assert.ok(wf.includes(term),term);
 for(const term of ['ADMIN_REQUIRED','TENANT_CONTEXT','/nova-edicao','ROW_CHANGED','POSTCHECK','REVIEWED_LMS_EDITION_TARGET_PROOF'])assert.ok((wf+source).includes(term),term);
 assert.doesNotMatch(source,/(UPDATE|DELETE|INSERT)\s+.*lms_(matriculas|progresso_scorm)/i);
});
test('production apply requires a separate authorized human from the reviewed preflight',()=>{
 const privileged = wf.split('  govern:')[1] ?? '';
 assert.match(privileged,/\.event <<< "\$run"\) == workflow_dispatch/);
 assert.match(privileged,/\.head_branch <<< "\$run"\) == main/);
 assert.match(privileged,/\.actor\.type <<< "\$run"\) == User/);
 assert.match(privileged,/preflight_actor=/);
 assert.match(privileged,/preflight_trigger=/);
 assert.match(privileged,/caller" != "\$preflight_actor"/);
 assert.match(privileged,/caller" != "\$preflight_trigger"/);
 assert.match(privileged,/collaborators\/\$reviewer\/permission/);
 assert.match(privileged,/permission" == write/);
 assert.match(privileged,/needs\.d1_recovery\.result == 'success'/);
});
test('private individual progress is encrypted with public key and no names in source',()=>{
 assert.ok(source.includes('createCipheriv')&&source.includes('publicEncrypt')&&source.includes('createHmac'));
 assert.doesNotMatch(wf+source,/\bFilipe\b|\bDaumas\b/i);
});

test('D1 migration credential is isolated from admin mutation, and apply cannot skip recovery',()=>{
  assert.deepEqual(checkWorkflowContent('.github/workflows/production-lms-tenant6-governed-edition-review.yml',wf),[]);
  const recovery = wf.split('  d1_recovery:')[1]?.split('  govern:')[0] ?? '';
  const admin = wf.split('  govern:')[1] ?? '';
  assert.ok(recovery.includes('CLOUDFLARE_D1_MIGRATION_API_TOKEN'));
  assert.ok(!recovery.includes('PROD_SMOKE_PASSWORD'));
  assert.ok(!recovery.includes('PROD_PASSWORD'));
  assert.ok(!admin.includes('CLOUDFLARE_D1_MIGRATION_API_TOKEN'));
  assert.match(admin,/needs:\s*\[d1_recovery\]/);
  assert.match(admin,/needs\.d1_recovery\.result == 'success'/);
  assert.match(recovery,/EXPECTED_PRODUCTION_SHA/);
  assert.match(recovery,/verify-release-gates\.mjs/);
});
