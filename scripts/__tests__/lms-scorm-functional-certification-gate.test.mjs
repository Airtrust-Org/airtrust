import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateScormFunctionalCertification, classifyScormProbeResult } from '../validation/lms-scorm-functional-certification-gate.mjs';

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

describe('read-only certification classification distinguishes incomplete probe from proven failure', () => {
  const safePhase = () => ({
    initialized: true, commit_observed: true, finish_observed: true,
    calls_after_finish: false, last_error: '0', asset_failures: [], page_errors: [],
    completion_reached: false,
  });
  it('never treats a bounded preview ending before completion as a certified course or package defect', () => {
    assert.deepEqual(classifyScormProbeResult({
      verdict: { pass: false, reason: 'COMPLETION_NOT_REACHED' },
      complete: safePhase(),
    }), { status: 'INCONCLUSIVE', evidence: 'BROWSER_PROBE_DID_NOT_REACH_COMPLETION' });
  });
  it('keeps explicitly broken assets and runtime protocol failures as FAIL', () => {
    for (const broken of [
      { ...safePhase(), asset_failures: [{ status: 404 }] },
      { ...safePhase(), page_errors: ['Unhandled exception'] },
      { ...safePhase(), calls_after_finish: true },
      { ...safePhase(), last_error: '301' },
    ]) {
      assert.equal(classifyScormProbeResult({
        verdict: { pass: false, reason: 'COMPLETION_NOT_REACHED' },
        complete: broken,
      }).status, 'FAIL');
    }
  });
  it('does not hide explicit score/mastery or downgrade failures as inconclusive', () => {
    for (const reason of ['MASTERY_SCORE_NOT_REACHED', 'CERTIFYING_SCORE_MISSING', 'STATUS_DOWNGRADE_AFTER_REOPEN']) {
      assert.equal(classifyScormProbeResult({
        verdict: { pass: false, reason }, complete: safePhase(),
      }).status, 'FAIL');
    }
  });
  it('returns PASS only after the complete certification verdict passes', () => {
    assert.deepEqual(classifyScormProbeResult({ verdict: { pass: true, reason: null }, complete: safePhase() }),
      { status: 'PASS', evidence: 'PREVIEW_LIFECYCLE_PASSED' });
  });
});
