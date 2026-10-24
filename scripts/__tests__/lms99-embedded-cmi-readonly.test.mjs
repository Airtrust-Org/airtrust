import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SQL,validate,assertStaticSql} from '../production/lms99-embedded-cmi-readonly.mjs';

test('production D1 query is static aggregate scoped to tenant 6',()=>{
 assert.doesNotThrow(()=>assertStaticSql(SQL));
 assert.match(SQL,/m\.empresa_id=6/);
 assert.match(SQL,/m\.deleted_at IS NULL/);
 assert.match(SQL,/GROUP BY curso_id/);
 assert.match(SQL,/json_valid/);
 assert.doesNotMatch(SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\s/i);
});
test('only aggregate counts, never student identifiers or grades, leave the runner',()=>{
 const row={curso_id:47,pending_99:2,json_present:2,formative:0,embedded_terminal_drift:1,
  embedded_score_above_mastery_drift:0,embedded_numeric_score:1,normalized_score_missing:1,
  normalized_score_below_mastery:1,explicit_failed:0};
 assert.deepEqual(validate([row]),[row]);
 assert.throws(()=>validate([{...row,embedded_numeric_score:3}]),/METRIC_INVALID/);
 assert.throws(()=>validate([row,{...row}]),/COURSE_INVALID/);
});
test('protected workflow is read-only and enforces release gates',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/production-lms99-embedded-cmi-readonly.yml',import.meta.url),'utf8');
 assert.match(wf,/workflow_dispatch:/);
 assert.match(wf,/environment: production/);
 assert.match(wf,/verify-release-gates\.mjs/);
 assert.match(wf,/AIRTRUST_LMS99_EMBEDDED_CMI_READONLY/);
 assert.doesNotMatch(wf,/\bpush:|\bpull_request:/);
 const script=readFileSync(new URL('../production/lms99-embedded-cmi-readonly.mjs',import.meta.url),'utf8');
 assert.match(script,/DIAGNOSTIC_ONLY_NOT_PROOF_OF_PASS/);
 assert.doesNotMatch(script,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
});
