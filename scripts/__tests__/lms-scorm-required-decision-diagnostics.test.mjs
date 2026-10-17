import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  collectRequiredDecisionSlideIndices,
  classifyRequiredDecisionStall,
} from '../validation/lms-scorm-required-decision-diagnostics.mjs';

test('only explicit authored requiredDecision slides enter the special driver policy', () => {
  assert.deepEqual(collectRequiredDecisionSlideIndices({
    slides: [null, { requiredDecision: false }, { requiredDecision: true }, { requiredDecision: 'true' }, { requiredDecision: true }],
  }), [3, 5]);
  assert.deepEqual(collectRequiredDecisionSlideIndices({}), []);
});

test('repeated Next before mandatory answer is a driver diagnostic, not a package FAIL', () => {
  assert.deepEqual(classifyRequiredDecisionStall({
    stalledSlide: { required_decision: true, location: '9/126' },
    driverState: { recent_actions: Array.from({ length: 5 }, () => ({ location: '9/126', type: 'next' })) },
    driveDiagnostics: {},
  }), {
    code: 'DRIVER_NAVIGATED_BEFORE_REQUIRED_DECISION',
    navigation_attempts: 5,
    decision_attempts: 0,
    package_defect_proven: false,
  });
});

test('no visible required decision is inconclusive, not a fabricated learner answer', () => {
  const result = classifyRequiredDecisionStall({
    stalledSlide: { required_decision: true, location: '3/40' },
    driveDiagnostics: { required_decision_block: 'required-decision-unresolved' },
  });
  assert.equal(result.code, 'DRIVER_REQUIRED_DECISION_CONTROL_UNRESOLVED');
  assert.equal(result.package_defect_proven, false);
});

test('choice attempted but no progression remains ambiguous and not a ZIP defect', () => {
  const result = classifyRequiredDecisionStall({
    stalledSlide: { required_decision: true, location: '9/102' },
    driverState: { recent_actions: [{ location: '9/102', type: 'required-decision-choice' }] },
    driveDiagnostics: { required_decision_block: 'required-decision-navigation-stall', required_decision_choice_attempts: 1 },
  });
  assert.equal(result.code, 'REQUIRED_DECISION_NO_ADVANCE_AFTER_LEARNER_CHOICE');
  assert.equal(result.decision_attempts, 1);
  assert.equal(result.package_defect_proven, false);
});

test('other slides and terminal CMI do not inherit a required-decision error', () => {
  const input = {
    stalledSlide: { required_decision: true, location: '9/102' },
    driverState: { recent_actions: Array.from({ length: 7 }, () => ({ location: '9/102', type: 'next' })) },
  };
  assert.equal(classifyRequiredDecisionStall({ ...input, completionReached: true }), null);
  assert.equal(classifyRequiredDecisionStall({ ...input, stalledSlide: { required_decision: false, location: '9/102' } }), null);
});

test('required decision selection precedes Next in executable preview driver', () => {
  const source = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../validation/production-lms-active-course-certification-readonly.mjs'), 'utf8');
  const guardIndex = source.indexOf('if (requiresAuthoredDecision) {');
  const nextIndex = source.indexOf('const exactNext = items.find(', guardIndex);
  assert.ok(guardIndex > 0 && nextIndex > guardIndex, 'mandatory decision must precede Next');
  assert.match(source.slice(guardIndex, nextIndex), /markAndClick\(target, 'required-decision-choice'\)/);
  assert.match(source, /required_decision_diagnostic: requiredDecisionDiagnostic/);
  assert.match(source, /requiredDecisionSlideIndices,/);
});
