// FRMS Schema V2 0573 staging admission: current-main ancestry and exact reviewed PR.
// Static regression only; never accesses Cloudflare or writes a remote D1 database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml', 'utf8');
const manifest = JSON.parse(readFileSync('worker-airtrust/schema-v2/frms-checkin-kss-provenance-0573.json', 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const includes = (fragment) => assert.ok(workflow.includes(fragment), 'missing workflow guard: ' + fragment);

test('0573 is allowlisted with immutable SQL and plan hashes and staging-only recovery', () => {
  assert.equal(manifest.changeId, 'frms-checkin-kss-provenance-0573');
  assert.equal(manifest.fileHash, sha256(manifest.filePath));
  assert.equal(manifest.planHash, sha256(manifest.planPath));
  for (const token of [
    'frms-checkin-kss-provenance-0573', manifest.fileHash, manifest.planHash,
    'STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS', 'PRODUCTION_TARGET_REJECTED',
    'SCHEMA_V2_EXACT_LEDGER_POSTCONDITION_FAILED',
    'airtrust-staging-mutations-and-scorm-qa',
  ]) includes(token);
});

test('0573 accepts only merged FRMS #1922 source anchored in current protected main', () => {
  for (const token of [
    "number === '1922'",
    "process.env.CHANGE_ID === 'frms-checkin-kss-provenance-0573'",
    "pr.merge_commit_sha?.toLowerCase() === 'f293ad21b5a57a291122aef477cc1a5600beebf2'",
    "pr.base?.ref === 'main'",
    "pr.head?.repo?.full_name === repo && !pr.head?.repo?.fork",
    "await github('/git/refs/heads/main')",
    "mainRef.object?.sha?.toLowerCase() === sha",
    "await github('/compare/f293ad21b5a57a291122aef477cc1a5600beebf2...' + sha)",
    "ancestry.status === 'ahead' || ancestry.status === 'identical'",
    "ancestry.behind_by === 0",
    'reviewedMergedFrms0573',
    'REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH',
    'WORKFLOW_ACTOR_NOT_AUTHORIZED',
    'verify-release-gates.mjs',
  ]) includes(token);
});

test('0573 does not remove legacy reviewed PR guards or weaken release protections', () => {
  for (const token of [
    'reviewedOpenHead || reviewedMergedHfa || reviewedMergedMgm0570 || reviewedMergedFrms0573',
    "pr.merged === true && pr.merge_commit_sha?.toLowerCase() === sha",
    "number === '1855'",
    "process.env.CHANGE_ID === 'hfa-integration-bridge-0529'",
    'PRODUCTION_TARGET_REJECTED',
    'STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS',
    'Verify eight required GitHub release gates for exact SHA',
  ]) includes(token);
  assert.ok(!workflow.includes('cancel-in-progress: true'));
});
