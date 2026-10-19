// source_reference: Pilot Offline Fueling Identity Schema V2 0563
// operational_decision: reject duplicate physical events across different operation receipts
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('0563 manifest pins additive, tenant-bound, immutable fueling identity', () => {
  const m = JSON.parse(readFileSync('worker-airtrust/schema-v2/controle-voos-pilot-fueling-identity-0563.json','utf8'));
  const ddl=readFileSync(m.filePath,'utf8'),plan=readFileSync(m.planPath,'utf8');
  const hash = (s) => createHash('sha256').update(s).digest('hex');
  assert.equal(m.changeId,'controle-voos-pilot-fueling-identity-0563');
  assert.equal(m.baselineId,'production-d1-baseline-v2-20260714');
  assert.equal(hash(ddl),m.fileHash);
  assert.equal(hash(plan),m.planHash);
  assert.match(ddl,/ALTER TABLE cv_voo_abastecimentos ADD COLUMN client_local_id TEXT/);
  assert.match(ddl,/CREATE UNIQUE INDEX uq_cv_voo_abastecimentos_client_event/);
  assert.match(ddl,/ON cv_voo_abastecimentos \(empresa_id, voo_id, client_local_id\)/);
  assert.match(ddl,/WHERE client_local_id IS NOT NULL/);
  assert.match(ddl,/CREATE TRIGGER trg_cv_voo_abastecimentos_client_id_immutable/);
  assert.doesNotMatch(ddl,/(?:^|\n)\s*(?:UPDATE|DELETE FROM|DROP TABLE|INSERT INTO)\s/i);
});
