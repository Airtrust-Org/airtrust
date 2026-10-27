import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { fixtureKindsForQaScope, resolveQaScope, assertQaScopeReadyForStaging } from '../staging/lms-scorm-qa-scope.mjs';

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

test('QA_SCOPE only defaults when absent, never when explicitly empty', () => {
  assert.equal(resolveQaScope(undefined), 'all');
  for (const scope of ['all', 'resume-inactive-preview', 'candidate-first-no-grant']) {
    assert.equal(resolveQaScope(scope), scope);
  }
  for (const invalid of ['', ' ', 'ALL', 'unknown', '__proto__', null, 0]) {
    assert.throws(() => resolveQaScope(invalid), {
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

// Catch accidental duplicate/partial cleanup blocks at PR-test time, before
// the staging workflow receives credentials or reaches a disposable course.
test('SCORM QA entrypoint parses before any staging request', () => {
  const entrypoint = fileURLToPath(new URL('../staging/lms-scorm-staging-qa.mjs', import.meta.url));
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', entrypoint], {
    timeout: 10_000,
    stdio: 'pipe',
  }), 'SCORM QA prepare/cleanup entrypoint must pass node --check');
});


test('legacy full positive QA is blocked before any staging write, while focused negatives remain available', () => {
  assert.throws(() => assertQaScopeReadyForStaging('all'), {
    message: 'QA_SCORM_POSITIVE_SCOPE_BLOCKED_PENDING_EXACT_F5_GRANT_AND_CANDIDATE_FIRST',
  });
  assert.throws(() => assertQaScopeReadyForStaging(undefined), {
    message: 'QA_SCORM_POSITIVE_SCOPE_BLOCKED_PENDING_EXACT_F5_GRANT_AND_CANDIDATE_FIRST',
  });
  for (const scope of ['candidate-first-no-grant', 'resume-inactive-preview']) {
    assert.equal(assertQaScopeReadyForStaging(scope), scope);
  }
  assert.throws(() => assertQaScopeReadyForStaging(''), /QA_SCORM_SCOPE_NOT_SUPPORTED/);
});

test('workflow and prepare runner enforce positive-scope block before staging operations', () => {
  const runner = readFileSync(fileURLToPath(new URL('../staging/lms-scorm-staging-qa.mjs', import.meta.url)), 'utf8');
  const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/staging-lms-scorm-qa.yml', import.meta.url)), 'utf8');
  assert.match(runner, /const qaScope = assertQaScopeReadyForStaging\(process\.env\.QA_SCOPE\);/);
  assert.ok(runner.indexOf('assertQaScopeReadyForStaging(process.env.QA_SCOPE)') <
    runner.indexOf('await assertPinnedStagingRelease();'));
  const guardStep = workflow.indexOf('Block ungranted legacy positive QA before staging access');
  const liveStep = workflow.indexOf('Require live Worker and frontend provenance');
  assert.ok(guardStep > 0 && guardStep < liveStep);
  assert.match(workflow, /assertQaScopeReadyForStaging\(process\.env\.QA_SCOPE\)/);
});

import { assertInactiveF5CandidateTrace } from '../staging/lms-scorm-qa-scope.mjs';

test('future positive F5 candidate QA accepts only ordered inactive multipart intake', () => {
  const operationId = '123e4567-e89b-42d3-a456-426614174000';
  const packageSha256 = 'a'.repeat(64);
  const base = 'https://airtrust-api-staging.airtrust.workers.dev/api/lms/cursos/101/scorm-upload/streamed';
  const req = (method, suffix, details = {}) => ({ method, url: base + suffix, ...details });
  const valid = {
    tenantId: 9201, courseId: 101, operationId, partCount: 2, packageSha256,
    zipBytes: 8 * 1024 * 1024 + 1,
    receipt: {
      packageId: '223e4567-e89b-42d3-a456-426614174000',
      r2Prefix: 'lms/scorm/9201/101/_candidates/223e4567-e89b-42d3-a456-426614174000/',
      launchFile: 'index.html',
      packageSha256, zipBytes: 8 * 1024 * 1024 + 1,
      status: 'VALIDATED', scormVersion: '1.2',
      createdByOperation: true, alreadyExisted: false, active: false,
      completionWritten: false, certificateIssued: false,
      structural: { status: 'PASS' }, completionManifest: { status: 'PASS' },
      diagnostics: { status: 'PASS' },
      r2Readback: { source: 'WORKER_R2_STREAMED_ZIP_READBACK',
        zipSha256: packageSha256, zipBytes: 8 * 1024 * 1024 + 1,
        launchAssetSha256: 'c'.repeat(64), etagStable: true,
        memberIntegrityVerified: true, rangeRequests: 2 },
    },
    requests: [
      req('POST', '/init', { responseStatus: 201, contentType: 'application/json',
        body: { operation_id: operationId, expected_sha256: packageSha256,
          zip_bytes: 8 * 1024 * 1024 + 1,
          arquivo_nome: `f5-${packageSha256}-${operationId}.zip` } }),
      req('PUT', `/${operationId}/parts/1`, { responseStatus: 200,
        contentType: 'application/octet-stream',
        contentLength: 8 * 1024 * 1024, byteLength: 8 * 1024 * 1024 }),
      req('PUT', `/${operationId}/parts/2`, { responseStatus: 200,
        contentType: 'application/octet-stream', contentLength: 1, byteLength: 1 }),
      req('POST', `/${operationId}/complete`, { responseStatus: 202, byteLength: 0 }),
    ],
  };
  assert.deepEqual(assertInactiveF5CandidateTrace(valid), {
    candidate: 'VALIDATED', workerReceiptInactive: true,
    activationRequestObserved: false, independentReadbackVerified: false,
    functionalCertificationVerified: false, uploadParts: 2,
  });
  const bad = [
    { requests: [...valid.requests, req('POST', '/activate')] },
    { requests: [valid.requests[0], valid.requests[2], valid.requests[1], valid.requests[3]] },
    { requests: [valid.requests[0], valid.requests[0], valid.requests[2], valid.requests[3]] },
    { requests: valid.requests.map((x, i) => i === 1 ? { ...x, method: 'POST' } : x) },
    { requests: valid.requests.map((x, i) => i === 2 ? { ...x, url: x.url.replace('https:', 'http:') } : x) },
    { requests: valid.requests.map((x, i) => i === 2 ? { ...x, url: x.url.replace('airtrust-api-staging', 'other') } : x) },
    { requests: valid.requests.map((x, i) => i === 2 ? { ...x, url: x.url + '?bypass=1' } : x) },
    { requests: valid.requests.map((x, i) => i === 2 ? { ...x, url: x.url.replace('/cursos/101/', '/cursos/102/') } : x) },
    { requests: valid.requests.map((x, i) => i === 2 ? { ...x, url: x.url.replace('/parts/2', '/activate') } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, responseStatus: 403 } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, contentType: 'text/plain' } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, body: undefined } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, body: { ...x.body, operation_id: 'other' } } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, body: { ...x.body, expected_sha256: 'b'.repeat(64) } } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, body: { ...x.body, zip_bytes: 22 } } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, body: { ...x.body, arquivo_nome: 'unrelated.zip' } } : x) },
    { requests: valid.requests.map((x, i) => i === 0 ? { ...x, body: { ...x.body, grant_override: true } } : x) },
    { requests: valid.requests.map((x, i) => i === 1 ? { ...x, responseStatus: 403 } : x) },
    { requests: valid.requests.map((x, i) => i === 1 ? { ...x, contentType: 'application/json' } : x) },
    { requests: valid.requests.map((x, i) => i === 1 ? { ...x, contentLength: 1 } : x) },
    { requests: valid.requests.map((x, i) => i === 1 ? { ...x, byteLength: 1 } : x) },
    { requests: valid.requests.map((x, i) => i === 2 ? { ...x, contentLength: 0 } : x) },
    { requests: valid.requests.map((x, i) => i === 2 ? { ...x, byteLength: 0 } : x) },
    { requests: valid.requests.map((x, i) => i === 3 ? { ...x, responseStatus: 200 } : x) },
    { requests: valid.requests.map((x, i) => i === 3 ? { ...x, byteLength: 1 } : x) },
    { receipt: { ...valid.receipt, status: 'ACTIVE' } },
    { receipt: { ...valid.receipt, packageSha256: 'b'.repeat(64) } },
    { receipt: { ...valid.receipt, zipBytes: valid.zipBytes - 1 } },
    { receipt: { ...valid.receipt, packageId: operationId } },
    { receipt: { ...valid.receipt, packageId: 'not-a-uuid' } },
    { receipt: { ...valid.receipt, active: true } },
    { receipt: { ...valid.receipt, active: undefined } },
    { receipt: { ...valid.receipt, createdByOperation: false } },
    { receipt: { ...valid.receipt, alreadyExisted: true } },
    { receipt: { ...valid.receipt, completionWritten: true } },
    { receipt: { ...valid.receipt, certificateIssued: true } },
    { receipt: { ...valid.receipt, scormVersion: '2004' } },
    { receipt: { ...valid.receipt, structural: { status: 'FAIL' } } },
    { receipt: { ...valid.receipt, completionManifest: undefined } },
    { receipt: { ...valid.receipt, diagnostics: { status: 'FAIL' } } },
    { receipt: { ...valid.receipt, r2Readback: undefined } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, zipSha256: 'b'.repeat(64) } } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, zipBytes: valid.zipBytes - 1 } } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, etagStable: false } } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, memberIntegrityVerified: false } } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, rangeRequests: 0 } } },
    { tenantId: 0 }, { tenantId: 9202 },
    { receipt: { ...valid.receipt, r2Prefix: 'lms/scorm/9202/101/_candidates/223e4567-e89b-42d3-a456-426614174000/' } },
    { receipt: { ...valid.receipt, r2Prefix: 'lms/scorm/9201/102/_candidates/223e4567-e89b-42d3-a456-426614174000/' } },
    { receipt: { ...valid.receipt, r2Prefix: 'lms/scorm/9201/101/_candidates/other/' } },
    { receipt: { ...valid.receipt, launchFile: '../index.html' } },
    { receipt: { ...valid.receipt, launchFile: '/index.html' } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, launchAssetSha256: undefined } } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, launchAssetSha256: 'not-a-sha' } } },
    { receipt: { ...valid.receipt, r2Readback: { ...valid.receipt.r2Readback, rangeRequests: 7 } } },
    { partCount: 1 }, { partCount: 11 }, { zipBytes: 1234 },
    { courseId: 0 }, { operationId: 'not-a-uuid' },
  ];
  for (const override of bad) {
    assert.throws(() => assertInactiveF5CandidateTrace({ ...valid, ...override }),
      { message: 'QA_SCORM_F5_POSITIVE_TRACE_INVALID' });
  }
});
