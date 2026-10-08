import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROOF_SQL, validate, summarize } from '../production/lms-scorm99-proof-readonly.mjs';

const example={
 curso_id:13,audience:'tripulacao',enrolled:4,employee_active_enrollments:3,concluded:1,
 incomplete_99:3,incomplete_raw100:2,no_runtime:1,has_runtime:2,
 explicit_but_pending:1,failed:0,mastery_met_missing_final:1,mastery_unproven:1,
 no_commit:1,inactive_employee_99:1,
};

test('scope: a documented SCORM 99% is never automatically a completion',()=>{
 const rows=validate([example]);
 assert.equal(rows[0].concluded,1);
 assert.equal(rows[0].incomplete_99,3);
 assert.equal(rows[0].mastery_unproven,1);
 assert.deepEqual(summarize(rows).fdm13,[example]);
 assert.throws(()=>validate([{...example,concluded:2}]),/TOTAL_INVALID/);
 assert.throws(()=>validate([{...example,mastery_unproven:0}]),/STATUS_PARTITION_INVALID/);
});

test('require aggregate-only static production query and explicit inactive coverage',()=>{
 assert.match(PROOF_SQL,/m\.empresa_id=6/);
 assert.match(PROOF_SQL,/m\.curso_id=13 OR COALESCE\(m\.progresso_pct,0\)>=99/);
 assert.match(PROOF_SQL,/LEFT JOIN funcionarios f/);
 assert.match(PROOF_SQL,/LEFT JOIN lms_progresso_scorm ps/);
 assert.match(PROOF_SQL,/MECâNICO/);
 assert.match(PROOF_SQL,/explicit_but_pending/);
 assert.match(PROOF_SQL,/mastery_unproven/);
 assert.doesNotMatch(PROOF_SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH)\s/i);
 assert.doesNotMatch(PROOF_SQL,/SELECT\s+(?:m\.\*|f\.nome|f\.id|m\.id|ps\.cmi_json)/i);
 const src=readFileSync(new URL('../production/lms-scorm99-proof-readonly.mjs',import.meta.url),'utf8');
 assert.match(src,/EXACT_SHA_REQUIRED/);
 assert.match(src,/--remote','--json','--command'/);
 assert.match(src,/CONFIRMATION_REQUIRED/);
 assert.doesNotMatch(src,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});

test('workflow only runs by governed dispatch with canonical gates and no production mutations',()=>{
 const y=readFileSync(new URL('../../.github/workflows/production-lms-scorm99-proof-readonly.yml',import.meta.url),'utf8');
 assert.match(y,/workflow_dispatch:/);
 assert.match(y,/environment: production/);
 assert.match(y,/verify-release-gates\.mjs/);
 assert.match(y,/AIRTRUST_PRODUCTION_LMS_SCORM99_PROOF_READONLY/);
 assert.match(y,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(y,/actions\/upload-artifact@v7/);
 assert.doesNotMatch(y,/\bpush:/);
 assert.doesNotMatch(y,/\bpull_request:/);
 assert.doesNotMatch(y,/\bwrangler\s+(?:deploy|d1\s+execute.+(?:INSERT|UPDATE|DELETE))\b/i);
});
