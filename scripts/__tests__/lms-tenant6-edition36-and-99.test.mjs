import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
const workflow=readFileSync(new URL('../../.github/workflows/production-lms36-governed-edition-and-99-roster.yml',import.meta.url),'utf8');
const executor=readFileSync(new URL('../production/lms-tenant6-edition36-and-99.mjs',import.meta.url),'utf8');
test('immutable scope, release gates, review and D1 recovery before single administrative API mutation',()=>{
 for(const s of ['verify-release-gates.mjs','reviewed_preflight_run_id','d1 time-travel info','environment: production','REVIEWED_LMS36_FINGERPRINT']) assert.ok(workflow.includes(s),s);
 for(const s of ['course:3','matricula_id:36','old_total:84','new_total:70','/nova-edicao','ADMIN_RBAC','POSTCHECK']) assert.ok(executor.includes(s),s);
 assert.doesNotMatch(executor,/(UPDATE|DELETE|INSERT)\s+.*(lms_matriculas|lms_progresso_scorm)/i);
});
test('roster names are encrypted and never in action summaries',()=>{
 for(const s of ['createCipheriv','publicEncrypt','funcionario_nome','lms99-encrypted.json','roster_public_key_der_b64']) assert.ok((executor+workflow).includes(s),s);
 assert.doesNotMatch(workflow, /jq '.*aluno|cat .*lms99-encrypted\.json/);
});
