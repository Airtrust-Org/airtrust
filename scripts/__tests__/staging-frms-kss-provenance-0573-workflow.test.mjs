import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml', 'utf8');
const manifest = JSON.parse(readFileSync('worker-airtrust/schema-v2/frms-checkin-kss-provenance-0573.json', 'utf8'));
const sha = (text) => createHash('sha256').update(text).digest('hex');

test('FRMS 0573 staging changes only via approved, exact hash-pinned Schema V2 manifest', () => {
  assert.equal(manifest.changeId, 'frms-checkin-kss-provenance-0573');
  assert.equal(manifest.filePath, 'worker-airtrust/schema-v2/changes/0573_frms_checkin_kss_provenance.sql');
  assert.equal(sha(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha(readFileSync(manifest.planPath)), manifest.planHash);
  assert.match(workflow, /- frms-checkin-kss-provenance-0573\n/);
  assert.match(workflow, /REVIEWED_SQL_HASH:.*frms-checkin-kss-provenance-0573[^\n]*06fa491147a5898b334abbe12610befc58f2f483ac6d1eecb03b957adc8ec34d/);
  assert.ok(workflow.includes(manifest.planHash));
  assert.ok(workflow.includes(manifest.filePath));
  assert.match(workflow, /TRUSTED_MAIN_REQUIRED/);
  assert.match(workflow, /REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH/);
  assert.match(workflow, /STAGING_DB_ID.*PRODUCTION_DB_ID/);
});

test('FRMS 0573 staging preflight must prove original columns, no existing new column/index, and rollback bookmark', () => {
  const preflight = workflow.split('      - name: Check staging Schema V2 baseline and preconditions')[1]
    ?? workflow.split('      - name: Run staging schema preflight')[1];
  assert.ok(preflight || workflow.includes('FRMS_0573_SOURCE_COLUMNS_MISSING'));
  assert.match(workflow, /FRMS_0573_SOURCE_COLUMNS_MISSING/);
  assert.match(workflow, /FRMS_0573_COLUMN_ALREADY_PRESENT_WITHOUT_LEDGER/);
  assert.match(workflow, /FRMS_0573_INDEX_ALREADY_PRESENT_WITHOUT_LEDGER/);
  assert.match(workflow, /STAGING_TIME_TRAVEL_BOOKMARK_MISSING/);
  assert.match(workflow, /SCHEMA_V2_EXACT_LEDGER_POSTCONDITION_FAILED/);
});

test('FRMS 0573 staging readback requires column, index, preserved rows and NULL legacy provenance', () => {
  assert.match(workflow, /FRMS_0573_PROVENANCE_COLUMN_MISSING/);
  assert.match(workflow, /FRMS_0573_INDEX_MISSING/);
  assert.match(workflow, /FRMS_0573_CHECKINS_CHANGED/);
  assert.match(workflow, /FRMS_0573_UNEXPECTED_HISTORICAL_BACKFILL/);
  assert.match(workflow, /kss_provenance IS NOT NULL/);
  assert.doesNotMatch(readFileSync(manifest.filePath, 'utf8'), /\bUPDATE\s+frms_fadiga_checkin\b/i);
});
