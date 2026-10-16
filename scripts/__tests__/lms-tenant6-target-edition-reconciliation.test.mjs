import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const wf=readFileSync(new URL('../../.github/workflows/production-lms-tenant6-governed-edition-review.yml',import.meta.url),'utf8');
const source=readFileSync(new URL('../production/lms-tenant6-target-edition-reconciliation.mjs',import.meta.url),'utf8');
test('release SHA gates, admin RBAC, preflight proof, recovery and canonical mutation',()=>{
 for(const term of ['verify-release-gates.mjs','d1 time-travel info','reviewed_preflight_run_id','environment: production'])assert.ok(wf.includes(term),term);
 for(const term of ['ADMIN_REQUIRED','TENANT_CONTEXT','/nova-edicao','ROW_CHANGED','POSTCHECK','REVIEWED_LMS_EDITION_TARGET_PROOF'])assert.ok((wf+source).includes(term),term);
 assert.doesNotMatch(source,/(UPDATE|DELETE|INSERT)\s+.*lms_(matriculas|progresso_scorm)/i);
});
test('private individual progress is encrypted with public key and no names in source',()=>{
 assert.ok(source.includes('createCipheriv')&&source.includes('publicEncrypt')&&source.includes('createHmac'));
 assert.doesNotMatch(wf+source,/\bFilipe\b|\bDaumas\b/i);
});
