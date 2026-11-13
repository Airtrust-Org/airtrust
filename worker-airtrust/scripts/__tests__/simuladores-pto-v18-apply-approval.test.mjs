import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNewPtoV18ApplyReady } from '../lib/simuladores-pto-v18-apply-approval.mjs';

const source = '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912';
const plan = Object.freeze({
  schema_version: 2,
  approved_source_sha256: source,
  canonical_contract_sha256: 'a'.repeat(64),
  plan_sha256: 'b'.repeat(64),
});
const approval = Object.freeze({
  status: 'VALIDADO_PARA_PRODUCAO',
  pto_sha256: source,
  contract_sha256: 'a'.repeat(64),
  plan_sha256: 'b'.repeat(64),
  guide_count: 82,
  technical_items_verified: 1476,
  notechs_verified: 15,
  functional_guides_verified: 6,
  functional_technical_items_verified: 108,
  functional_notechs_links_verified: 90,
  reviewer: 'responsavel-tecnico',
  reviewed_at: '2026-11-12T21:00:00Z',
  evidence_ref: 'auditoria/versao-controlada',
});

test('legacy schema is refused for any new import', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan: { ...plan, schema_version: 1 }, existingState: 'NEW', dryRun: false,
  }), /plano curricular legado/);
});

test('old imports may be recognized as already applied without rewriting history', () => {
  assert.equal(assertNewPtoV18ApplyReady({
    plan: { schema_version: 1 }, existingState: 'IDEMPOTENT_APPLIED', dryRun: false,
  }).mode, 'HISTORICAL_READBACK');
});

test('new v18 plan can dry-run without operational approval', () => {
  assert.equal(assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: true,
  }).mode, 'CURRICULAR_DRY_RUN_ONLY');
});

test('new v18 plan may not apply a review-only package', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, status: 'NAO_APROVADO_NAO_IMPORTAVEL_NAO_PUBLICAVEL' },
  }), /aprovação técnica/);
});

test('technical approval is tied to exact plan hash', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, plan_sha256: 'c'.repeat(64) },
  }), /plano exato/);
});

test('incomplete guide approval blocks application', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, guide_count: 51 },
  }), /não abrange integralmente/);
});

test('six functional instructor/examiner guides are also mandatory', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, functional_guides_verified: 0 },
  }), /não abrange integralmente/);
});

test('missing 90 functional NOTECHS links blocks production', () => {
  assert.throws(() => assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false,
    technicalApproval: { ...approval, functional_notechs_links_verified: 0 },
  }), /não abrange integralmente/);
});

test('complete technical approval accepts the exact sealed plan gate', () => {
  assert.equal(assertNewPtoV18ApplyReady({
    plan, existingState: 'NEW', dryRun: false, technicalApproval: approval,
  }).mode, 'TECHNICALLY_APPROVED_EXACT_PLAN');
});
