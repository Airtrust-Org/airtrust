import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaV2RuntimeReadiness } from '../production/lib/schema-v2-runtime-readiness.mjs';

const manifests = ['frms-checkin-kss-provenance-0573', 'lms-pptx-slide-evidence-0574']
  .map((name) => JSON.parse(readFileSync(new URL(`../../worker-airtrust/schema-v2/${name}.json`, import.meta.url))));
const objects = [
  ['index', 'idx_frms_checkin_kss_provenance_scope'],
  ['table', 'lms_pptx_slide_evidences'],
  ['index', 'idx_lms_pptx_slide_evidences_scope'],
  ['trigger', 'trg_lms_pptx_evidence_insert_scope'],
  ['trigger', 'trg_lms_pptx_evidence_immutable_update'],
  ['trigger', 'trg_lms_pptx_evidence_immutable_delete'],
].map(([type, name]) => ({ type, name }));
const ledger = manifests.map((m) => ({ change_id: m.changeId, baseline_id: m.baselineId,
  file_hash: m.fileHash, plan_hash: m.planHash }));
const input = () => ({ objects, checkinColumns: ['kss_provenance'], ledger, manifests });

test('accepts only complete objects and exact governed ledger', () => {
  assert.equal(schemaV2RuntimeReadiness(input()).ready, true);
  assert.equal(schemaV2RuntimeReadiness({ ...input(), objects: objects.slice(1) }).ready, false);
  assert.equal(schemaV2RuntimeReadiness({ ...input(), checkinColumns: [] }).ready, false);
  assert.equal(schemaV2RuntimeReadiness({ ...input(), ledger: ledger.slice(0, 1) }).ready, false);
  assert.equal(schemaV2RuntimeReadiness({ ...input(), ledger: [ledger[0], { ...ledger[1], file_hash: 'wrong' }] }).ready, false);
  assert.equal(schemaV2RuntimeReadiness({ ...input(), ledger: [ledger[0], { ...ledger[1], plan_hash: 'wrong' }] }).ready, false);
});
