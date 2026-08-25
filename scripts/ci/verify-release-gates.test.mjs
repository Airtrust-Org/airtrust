import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyReleaseGatePayloads } from './verify-release-gates.mjs';

const greenChecks = [
  { name: 'lint', status: 'completed', conclusion: 'success' },
  { name: 'build-content-gates', status: 'completed', conclusion: 'success' },
  { name: 'worker-typecheck', status: 'completed', conclusion: 'success' },
];
const greenStatuses = [{ context: 'airtrust-gcb', state: 'success' }];

test('accepts the official GHA checks plus the GCB aggregate and ignores optional noise', () => {
  assert.deepEqual(
    verifyReleaseGatePayloads({
      checkRuns: [
        ...greenChecks,
        { name: 'optional-experiment', status: 'completed', conclusion: 'failure' },
      ],
      statuses: [...greenStatuses, { context: 'optional-status', state: 'failure' }],
    }),
    {
      githubActions: ['lint', 'build-content-gates', 'worker-typecheck'],
      googleCloudBuild: 'airtrust-gcb',
    },
  );
});

test('fails when an official GHA gate is missing', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.filter((check) => check.name !== 'worker-typecheck'),
        statuses: greenStatuses,
      }),
    /worker-typecheck:missing/,
  );
});

test('fails when an official GHA gate is not green', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.map((check) =>
          check.name === 'lint' ? { ...check, conclusion: 'failure' } : check,
        ),
        statuses: greenStatuses,
      }),
    /lint:not-success/,
  );
});

test('fails when the GCB aggregate gate is missing or red', () => {
  assert.throws(
    () => verifyReleaseGatePayloads({ checkRuns: greenChecks, statuses: [] }),
    /airtrust-gcb:missing/,
  );
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks,
        statuses: [{ context: 'airtrust-gcb', state: 'failure' }],
      }),
    /airtrust-gcb:not-success/,
  );
});
