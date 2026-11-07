// source_reference: 0566 immutable same-cycle SCORM handoff, candidate PR #1681
// operational_decision: allow only reviewed SQL/plan hashes on trusted main; no deployment
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml','utf8');
const check = (term)=>assert.ok(workflow.includes(term),term);
test('SCORM 0566 exact trusted-main and hash-bound candidate',()=>{
 for(const term of ['refs/heads/main','AIRTRUST_STAGING_SCHEMA_V2','REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH','WORKFLOW_ACTOR_NOT_AUTHORIZED','verify-release-gates.mjs','STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS','airtrust-staging-mutations-and-scorm-qa','lms-scorm-edition-handoff-0566','ebfcb95de6f2a6fee7e07e155697d67157ed96821f23c1cc36b15c5caf352fba','2dba1565554ae6c1a1bd8bfac803a227affa01332d46ede08408af9fb1308f2b','0566_lms_scorm_edition_handoffs.sql']) check(term);
});
test('SCORM 0566 pre/postconditions fail closed and never backfill learner records',()=>{
 for(const term of ['SCORM_0566_REQUIRED_SOURCE_TABLES_MISSING','SCORM_0566_ARCHIVE_ALREADY_PRESENT_WITHOUT_LEDGER','SCORM_0566_INDEX_ALREADY_PRESENT_WITHOUT_LEDGER','SCORM_0566_TRIGGERS_ALREADY_PRESENT_WITHOUT_LEDGER','SCORM_0566_ARCHIVE_TABLE_MISSING','SCORM_0566_SCOPE_INDEX_MISSING','SCORM_0566_IMMUTABLE_SCOPE_TRIGGERS_MISSING','SCORM_0566_UNEXPECTED_BACKFILL','SCORM_0566_ENROLLMENT_ROWS_CHANGED','SCORM_0566_PROGRESS_ROWS_CHANGED','SCORM_0566_DIAGNOSTICS_ROWS_CHANGED','SCORM_ENROLLMENT_COUNT_BEFORE:','SCORM_PROGRESS_COUNT_BEFORE:','SCORM_DIAGNOSTICS_COUNT_BEFORE:']) check(term);
});
