import assert from 'node:assert/strict';
import test from 'node:test';

import { fixtureKindsForQaScope } from '../staging/lms-scorm-qa-scope.mjs';

test('full SCORM staging QA retains all four synthetic scenarios', () => {
  assert.deepEqual(fixtureKindsForQaScope('all'),
    ['success', 'reject', 'timeout', 'resume']);
  assert.deepEqual(fixtureKindsForQaScope(),
    ['success', 'reject', 'timeout', 'resume']);
});

test('negative-only SCORM QA creates only its resume fixture', () => {
  for (const scope of ['resume-inactive-preview', 'candidate-first-no-grant']) {
    assert.deepEqual(fixtureKindsForQaScope(scope), ['resume']);
  }
});

test('unknown and prototype-key scopes fail closed before staging writes', () => {
  for (const scope of ['unknown', '', '__proto__', 'constructor', null, 1]) {
    assert.throws(() => fixtureKindsForQaScope(scope), {
      message: 'QA_SCORM_SCOPE_NOT_SUPPORTED',
    });
  }
});

test('caller cannot mutate the canonical scope fixture list', () => {
  const selected = fixtureKindsForQaScope('candidate-first-no-grant');
  selected.push('success');
  assert.deepEqual(fixtureKindsForQaScope('candidate-first-no-grant'), ['resume']);
});
