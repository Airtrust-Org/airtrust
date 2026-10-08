import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROOF_SQL, FDM_HISTORY_SQL, FDM_REENROLLMENT_SQL, validate, validateHistory, validateReenrollment, summarize } from '../production/lms-scorm99-proof-readonly.mjs';

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
 assert.match(PROOF_SQL,/NULLIF\(TRIM\(f\.funcao\)/);
 assert.match(PROOF_SQL,/NULLIF\(TRIM\(f\.cargo\)/);
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


test('FDM legacy history preserves cancelled/soft-deleted records and checks destination counts',()=>{
 const row={
  curso_id:13,audience:'tripulacao',history_rows:11,non_cancelled:0,
  cancelled_or_soft_deleted:11,soft_deleted:11,cancelled_status:11,
  concluded_status_any:0,raw_99_any:8,raw_100_any:8,
  raw_99_with_explicit_scorm_end:3,inactive_or_missing_employee:0,
 };
 const dest={...row,curso_id:71,audience:'destination',
   history_rows:0,non_cancelled:0,cancelled_or_soft_deleted:0,
   soft_deleted:0,cancelled_status:0,raw_99_any:0,raw_100_any:0,
   raw_99_with_explicit_scorm_end:0};
 assert.equal(validateHistory([row,dest]).length,2);
 assert.throws(()=>validateHistory([{...row,non_cancelled:1}]),/FDM_HISTORY_PARTITION_INVALID/);
 assert.throws(()=>validateHistory([{...row,raw_100_any:9}]),/FDM_HISTORY_PROGRESS_INVALID/);
 assert.match(FDM_HISTORY_SQL,/m\.curso_id IN \(13,71,72,73\)/);
 assert.match(FDM_HISTORY_SQL,/SUM\(soft_deleted\) soft_deleted/);
 assert.match(FDM_HISTORY_SQL,/cancelled_or_soft_deleted/);
 assert.match(FDM_HISTORY_SQL,/raw_99_with_explicit_scorm_end/);
 assert.match(FDM_HISTORY_SQL,/f\.funcao/);
 assert.match(FDM_HISTORY_SQL,/f\.cargo/);
 assert.match(FDM_HISTORY_SQL,/MECâNICO/);
 assert.match(FDM_HISTORY_SQL,/AUXILIAR DE MANUTENçãO/);
 assert.doesNotMatch(FDM_HISTORY_SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s/i);
 assert.doesNotMatch(FDM_HISTORY_SQL,/SELECT\s+(?:m\.\*|f\.nome|f\.id|m\.id|ps\.cmi_json)/i);
});


test('canceled legacy cohort yields disjoint pilot/MNT/excluded buckets and never credits automatically',()=>{
 const row={
  audience:'tripulacao',source_canceled_rows:11,unique_staff:11,
  active_staff_rows:11,inactive_staff_rows:0,duplicate_source_rows:0,
  already_active_at_target:0,any_target_history:0,linked_target_rows:0,
  legacy_raw99:9,legacy_below99:2,raw99_explicit_end:7,
  raw99_no_explicit_end:2,raw99_explicit_failure:0,
  raw99_no_scorm:0,raw99_no_commit:0,
  raw99_explicit_mastery_met:6,raw99_explicit_mastery_unproven:1,
  raw99_explicit_no_mastery_requirement:0,
 };
 const excluded={...row,audience:'excluded',source_canceled_rows:6,unique_staff:6,
  active_staff_rows:6,legacy_raw99:0,legacy_below99:6,
  raw99_explicit_end:0,raw99_no_explicit_end:0,
  raw99_explicit_mastery_met:0,raw99_explicit_mastery_unproven:0};
 assert.equal(validateReenrollment([row,excluded]).length,2);
 assert.throws(()=>validateReenrollment([{...row,legacy_below99:3}]),/FDM_REENROLLMENT_PROGRESS_PARTITION/);
 assert.throws(()=>validateReenrollment([{...row,raw99_explicit_end:8}]),/FDM_REENROLLMENT_COMPLETION_PARTITION/);
 assert.throws(()=>validateReenrollment([{...row,raw99_explicit_mastery_met:7}]),/FDM_REENROLLMENT_MASTERY_PARTITION/);
 assert.match(FDM_REENROLLMENT_SQL,/m\.curso_id=13 AND m\.deleted_at IS NULL/);
 assert.match(FDM_REENROLLMENT_SQL,/CANCELADO/);
 assert.match(FDM_REENROLLMENT_SQL,/COUNT\(DISTINCT funcionario_id\)/);
 assert.match(FDM_REENROLLMENT_SQL,/already_active_at_target/);
 assert.match(FDM_REENROLLMENT_SQL,/FDM-TRIPULACAO/);
 assert.match(FDM_REENROLLMENT_SQL,/FDM-MECANICO/);
 assert.match(FDM_REENROLLMENT_SQL,/legacy_mastery/);
 assert.match(FDM_REENROLLMENT_SQL,/progresso_pct,0\)>=99/);
 assert.match(FDM_REENROLLMENT_SQL,/progresso_pct,0\)<99/);
 assert.doesNotMatch(FDM_REENROLLMENT_SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH)\s/i);
 assert.doesNotMatch(FDM_REENROLLMENT_SQL,/SELECT\s+(?:m\.\*|f\.nome|f\.id|m\.id|ps\.cmi_json)/i);
 const code=readFileSync(new URL('../production/lms-scorm99-proof-readonly.mjs',import.meta.url),'utf8');
 assert.match(code,/reenrollment_writes:0/);
 assert.match(code,/administrative_completions_issued:0/);
});
