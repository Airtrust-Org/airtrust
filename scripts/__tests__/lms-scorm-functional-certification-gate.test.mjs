import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateScormFunctionalCertification } from '../validation/lms-scorm-functional-certification-gate.mjs';

const manifest = { masteryScore: 70, requiredInteractions: 8 };
const phasePass = (phase) => phase.protocol_ok === true;
const base = () => ({
  manifest,
  suspend: { protocol_ok: true, completion_reached: false },
  complete: { protocol_ok: true, completion_reached: true, score_raw: 100 },
  reopen: { protocol_ok: true, completion_reached: true, score_raw: 100 },
  phasePass,
});
const evaluate = (changes = {}) => evaluateScormFunctionalCertification({ ...base(), ...changes });

describe('P0 read-only LMS functional certification verdict', () => {
  it('accepts completion only when lifecycle, mastery and reopened score persist', () => {
    assert.deepEqual(evaluate(), { pass: true, reason: null });
  });
  it('rejects technical conformance without pedagogical completion', () => {
    assert.equal(evaluate({ complete: { protocol_ok: true, completion_reached: false, score_raw: 100 }, reopen: null }).reason, 'COMPLETION_NOT_REACHED');
  });
  it('rejects missing certifying score when assessment/mastery is declared', () => {
    assert.equal(evaluate({ complete: { protocol_ok: true, completion_reached: true, score_raw: null } }).reason, 'CERTIFYING_SCORE_MISSING');
  });
  it('rejects below-mastered result with a terminal status', () => {
    assert.equal(evaluate({ complete: { protocol_ok: true, completion_reached: true, score_raw: 69 } }).reason, 'MASTERY_SCORE_NOT_REACHED');
  });
  it('rejects a completed session with no completed reopen', () => {
    assert.equal(evaluate({ reopen: null }).reason, 'STATUS_DOWNGRADE_AFTER_REOPEN');
    assert.equal(evaluate({ reopen: { protocol_ok: true, completion_reached: false, score_raw: 0 } }).reason, 'STATUS_DOWNGRADE_AFTER_REOPEN');
  });
  it('rejects reopening that silently erases an approved score', () => {
    assert.equal(evaluate({ reopen: { protocol_ok: true, completion_reached: true, score_raw: 85 } }).reason, 'SCORE_DOWNGRADE_AFTER_REOPEN');
    assert.equal(evaluate({ reopen: { protocol_ok: true, completion_reached: true, score_raw: null } }).reason, 'SCORE_DOWNGRADE_AFTER_REOPEN');
  });
  it('rejects lifecycle/API or protected-asset errors even with pass and score', () => {
    assert.equal(evaluate({ complete: { protocol_ok: false, completion_reached: true, score_raw: 100 } }).reason, 'SCORM_LIFECYCLE_OR_ASSET_FAILURE');
  });
  it('permits terminal no-score SCORM only if there is no mastery or required assessment', () => {
    assert.deepEqual(evaluate({
      manifest: { masteryScore: null, requiredInteractions: 0 },
      complete: { protocol_ok: true, completion_reached: true, score_raw: null },
      reopen: { protocol_ok: true, completion_reached: true, score_raw: null },
    }), { pass: true, reason: null });
  });
});
