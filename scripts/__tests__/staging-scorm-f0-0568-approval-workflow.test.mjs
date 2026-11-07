// 0568 staging-only approval follows project branch protection and an exact-SHA environment grant.
// This regression test does not authorize database writes or relax recovery/tenant controls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml', 'utf8');
const includes = value => assert.ok(workflow.includes(value), value);

test('SCORM 0568 requires a protected exact-SHA grant, trusted PR and canonical CI', () => {
  for (const term of [
    'refs/heads/main',
    'AIRTRUST_STAGING_SCHEMA_V2',
    'lms-scorm-qa-evidence-bindings-0568',
    'SCORM_F0_SCHEMA_0568_APPROVED_SHA',
    'process.env.SCORM_F0_SCHEMA_0568_APPROVED_SHA !== sha',
    'SCORM_F0_0568_EXACT_SHA_GRANT_REQUIRED',
    'REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH',
    'WORKFLOW_ACTOR_NOT_AUTHORIZED',
    'verify-release-gates.mjs',
    'STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS',
    'airtrust-staging-mutations-and-scorm-qa',
    '6f85d5e3d141e140c54ea5b62c2dc3143447187960b8d89d7b6ed6dc4f3eb197',
    'ff0e971ac739846159651689d3604c3a3bbea8add204fda1c49bbcdcb9261696',
  ]) includes(term);
});

test('SCORM 0568 retains physical fail-closed and no-learner-write postchecks', () => {
  for (const term of [
    'SCORM_0568_SOURCE_TABLES_MISSING',
    'SCORM_0568_TABLE_ALREADY_PRESENT',
    'SCORM_0568_TABLE_MISSING',
    'SCORM_0568_FOREIGN_KEYS_MISSING',
    'SCORM_0568_UNEXPECTED_BINDING_DATA',
    'SCORM_0568_COURSES_CHANGED',
    'SCORM_0568_ENROLLMENTS_CHANGED',
    'SCORM_0568_PROGRESS_CHANGED',
    'SCORM_0568_QUALIFICATIONS_CHANGED',
  ]) includes(term);
});

test('SCORM 0568 does not require a reviewer beyond the actual GitHub protection', () => {
  assert.doesNotMatch(workflow, /SCORM_F0_0568_INDEPENDENT_REVIEW_REQUIRED/);
  assert.doesNotMatch(workflow, /const independentApproval\s*=/);
  assert.doesNotMatch(workflow, /github\('\/pulls\/'.*'\/reviews'\)/);
});
