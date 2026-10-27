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

import { assertDisposableQaCleanupState, assertDisposableQaCourseReadback } from '../staging/lms-scorm-qa-scope.mjs';

const marker = '40471008003-1';
const makeState = (scope = 'candidate-first-no-grant') => ({
  schema_version: 1,
  run_marker: marker,
  courses: Object.fromEntries(fixtureKindsForQaScope(scope).map((kind, index) => {
    const label = { success: 'Success', reject: 'Reject', timeout: 'Timeout', resume: 'Resume' }[kind];
    return [kind, {
      id: index + 101,
      kind,
      title: 'QA SCORM ' + label + ' ' + marker,
      zip_name: 'qa-scorm-' + kind + '-' + marker + '.zip',
    }];
  })),
});

test('cleanup only accepts the exact run-scoped synthetic fixtures', () => {
  assert.deepEqual(assertDisposableQaCleanupState(makeState(), 'candidate-first-no-grant', marker),
    [{ id: 101, kind: 'resume', title: 'QA SCORM Resume ' + marker }]);
  assert.equal(assertDisposableQaCleanupState(makeState('all'), 'all', marker).length, 4);
});

test('cleanup fails closed for stale run, extra course and wrong identity', () => {
  const cases = [
    { state: { ...makeState(), run_marker: 'older-1' }, scope: 'candidate-first-no-grant' },
    { state: { ...makeState(), courses: { ...makeState().courses, other: { id: 9 } } }, scope: 'candidate-first-no-grant' },
    { state: { ...makeState(), courses: { resume: { ...makeState().courses.resume, id: 0 } } }, scope: 'candidate-first-no-grant' },
    { state: { ...makeState(), courses: { resume: { ...makeState().courses.resume, title: 'Real course' } } }, scope: 'candidate-first-no-grant' },
    { state: { ...makeState(), courses: { resume: { ...makeState().courses.resume, zip_name: 'other.zip' } } }, scope: 'candidate-first-no-grant' },
    { state: makeState('all'), scope: 'candidate-first-no-grant' },
  ];
  for (const { state, scope } of cases) {
    assert.throws(() => assertDisposableQaCleanupState(state, scope, marker),
      /QA_SCORM_CLEANUP_(STATE|FIXTURE_IDENTITY)_MISMATCH/);
  }
});

test('cleanup rejects duplicate IDs before any deletion', () => {
  const state = makeState('all');
  state.courses.reject.id = state.courses.success.id;
  assert.throws(() => assertDisposableQaCleanupState(state, 'all', marker),
    /QA_SCORM_CLEANUP_FIXTURE_IDENTITY_MISMATCH/);
});

test('cleanup and failed-prepare rollback reject non-synthetic Worker readbacks', () => {
  const expected = { id: 101, title: 'QA SCORM Resume ' + marker };
  const valid = { id: 101, titulo: expected.title, categoria: 'QA Synthetic',
    tipo_conteudo: 'scorm', publicado: 0 };
  assert.equal(assertDisposableQaCourseReadback(valid, expected), true);
  assert.equal(assertDisposableQaCourseReadback({ ...valid, publicado: false }, expected), true);
  for (const candidate of [null, { ...valid, id: 102 },
    { ...valid, titulo: 'Real course' }, { ...valid, categoria: 'Operacional' },
    { ...valid, tipo_conteudo: 'pdf' }, { ...valid, publicado: 1 },
    { ...valid, publicado: undefined }]) {
    assert.throws(() => assertDisposableQaCourseReadback(candidate, expected),
      /QA_SCORM_CLEANUP_TARGET_IDENTITY_MISMATCH/);
  }
  assert.throws(() => assertDisposableQaCourseReadback(valid,
    { ...expected, title: 'QA SCORM Resume stale-run' }),
    /QA_SCORM_CLEANUP_TARGET_IDENTITY_MISMATCH/);
});
