import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyReleaseGatePayloads } from './verify-release-gates.mjs';

const greenChecks = [
  { name: 'lint', status: 'completed', conclusion: 'success' },
  { name: 'build-content-gates', status: 'completed', conclusion: 'success' },
  { name: 'worker-typecheck', status: 'completed', conclusion: 'success' },
  { name: 'frontend-coverage', status: 'completed', conclusion: 'success' },
  { name: 'worker-tests-1', status: 'completed', conclusion: 'success' },
  { name: 'worker-tests-2', status: 'completed', conclusion: 'success' },
  { name: 'lms-smoke', status: 'completed', conclusion: 'success' },
  { name: 'public-e2e', status: 'completed', conclusion: 'success' },
];

test('accepts the eight official GitHub Actions gates and ignores optional noise', () => {
  assert.deepEqual(
    verifyReleaseGatePayloads({
      checkRuns: [
        ...greenChecks,
        { name: 'airtrust-gcb', status: 'completed', conclusion: 'failure' },
        { name: 'optional-experiment', status: 'completed', conclusion: 'failure' },
      ],
      statuses: [],
    }),
    {
      githubActions: [
        'lint',
        'build-content-gates',
        'worker-typecheck',
        'frontend-coverage',
        'worker-tests-1',
        'worker-tests-2',
        'lms-smoke',
        'public-e2e',
      ],
      gcbStatus: 'airtrust-gcb',
    },
  );
});

test('fails when any official gate is missing', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.filter((check) => check.name !== 'worker-tests-2'),
        statuses: [],
      }),
    /worker-tests-2:missing/,
  );
});

test('fails when an official gate is not green', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.map((check) =>
          check.name === 'public-e2e' ? { ...check, conclusion: 'failure' } : check,
        ),
        statuses: [],
      }),
    /public-e2e:not-success/,
  );
});

test('legacy aggregate cannot substitute for a missing heavy gate', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: [
          ...greenChecks.filter((check) => check.name !== 'frontend-coverage'),
          { name: 'airtrust-gcb', status: 'completed', conclusion: 'success' },
        ],
        statuses: [],
      }),
    /frontend-coverage:missing/,
  );
});


test('fails closed when a classic airtrust-gcb status exists and is red', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks,
        statuses: [{ context: 'airtrust-gcb', state: 'failure' }],
      }),
    /airtrust-gcb:not-success/,
  );
});

test('accepts a green classic airtrust-gcb status when present', () => {
  assert.doesNotThrow(() =>
    verifyReleaseGatePayloads({
      checkRuns: greenChecks,
      statuses: [{ context: 'airtrust-gcb', state: 'success' }],
    }),
  );
});
