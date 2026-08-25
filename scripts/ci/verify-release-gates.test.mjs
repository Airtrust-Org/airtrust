import { describe, expect, it } from 'vitest';
import { verifyReleaseGatePayloads } from './verify-release-gates.mjs';

const greenChecks = [
  { name: 'lint', status: 'completed', conclusion: 'success' },
  { name: 'build-content-gates', status: 'completed', conclusion: 'success' },
  { name: 'worker-typecheck', status: 'completed', conclusion: 'success' },
];
const greenStatuses = [{ context: 'airtrust-gcb', state: 'success' }];

describe('verifyReleaseGatePayloads', () => {
  it('accepts exactly the official GHA checks plus the GCB aggregate status', () => {
    expect(
      verifyReleaseGatePayloads({
        checkRuns: [...greenChecks, { name: 'optional-experiment', status: 'completed', conclusion: 'failure' }],
        statuses: [...greenStatuses, { context: 'optional-status', state: 'failure' }],
      }),
    ).toEqual({
      githubActions: ['lint', 'build-content-gates', 'worker-typecheck'],
      googleCloudBuild: 'airtrust-gcb',
    });
  });

  it('fails when an official GHA gate is missing', () => {
    expect(() =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.filter((check) => check.name !== 'worker-typecheck'),
        statuses: greenStatuses,
      }),
    ).toThrow('worker-typecheck:missing');
  });

  it('fails when an official GHA gate is not green', () => {
    expect(() =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.map((check) =>
          check.name === 'lint' ? { ...check, conclusion: 'failure' } : check,
        ),
        statuses: greenStatuses,
      }),
    ).toThrow('lint:not-success');
  });

  it('fails when the GCB aggregate gate is missing or red', () => {
    expect(() =>
      verifyReleaseGatePayloads({ checkRuns: greenChecks, statuses: [] }),
    ).toThrow('airtrust-gcb:missing');

    expect(() =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks,
        statuses: [{ context: 'airtrust-gcb', state: 'failure' }],
      }),
    ).toThrow('airtrust-gcb:not-success');
  });
});
