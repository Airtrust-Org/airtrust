import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const script=readFileSync(new URL('../production/lms384-cancelled-progress-evidence-readonly.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/production-lms384-archived-evidence-readonly.yml',import.meta.url),'utf8');
test('limited D1 SELECT-only, tenant/course/enrollment 6/34/384',()=>{
 assert.match(script,/SELECT m\\.id/);
 assert.match(script,/WHERE m\.empresa_id=6 AND m\.id=384 AND m\.curso_id=34/);
 assert.match(script,/WHERE empresa_id=6 AND matricula_id=384 AND curso_id=34/);
 assert.match(script,/WHERE empresa_id=6 AND entity_type='lms_matriculas' AND entity_id=384/);
 assert.match(script,/READONLY_SQL_/);
 assert.doesNotMatch(script,/mode.?=.?apply/i);
});
test('no exposure of learner PII, CMI or suspend data',()=>{
 assert.match(script,/cmi_hash/);
 assert.match(script,/suspend_hash/);
 assert.match(script,/personal_data:false/);
 assert.match(script,/writes:0/);
 assert.match(script,/summaryScorm/);
 assert.doesNotMatch(script,/process\.stdout\.write\(r\.stdout\)/);
});
test('source, production and official gates are immutable in workflow',()=>{
 assert.match(workflow,/AIRTRUST_LMS384_READONLY_EVIDENCE/);
 assert.match(workflow,/verify-release-gates.mjs/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/EXPECTED_MAIN_SHA/);
 assert.match(workflow,/EXPECTED_PRODUCTION_SHA/);
 assert.match(workflow,/CLOUDFLARE_D1_READONLY_API_TOKEN/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.doesNotMatch(workflow,/wrangler d1 execute.*--file/);
});
