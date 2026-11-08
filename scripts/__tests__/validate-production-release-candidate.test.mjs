import { describe, it, expect } from 'vitest';
import { validateProductionReleaseCandidate } from '../ci/validate-production-release-candidate.mjs';

const production = '1'.repeat(40);
const release = '2'.repeat(40);
const main = '3'.repeat(40);

describe('immutable production release candidate', () => {
  const valid = { deployedSha: production, releaseSha: release, workflowSha: main };

  it('accepts an approved past main commit after main has advanced', () => {
    const ancestry = (a, b) => (a === release && b === main) ||
      (a === production && b === release);
    expect(validateProductionReleaseCandidate({ ...valid, isAncestor: ancestry }))
      .toMatchObject(valid);
  });

  it('rejects unmerged or arbitrary commit even when production precedes it', () => {
    expect(() => validateProductionReleaseCandidate({
      ...valid,
      isAncestor: (a, b) => a === production && b === release,
    })).toThrow(/NOT_MERGED_MAIN_ANCESTOR/);
  });

  it('rejects stale release older than current production', () => {
    expect(() => validateProductionReleaseCandidate({
      ...valid,
      isAncestor: (a, b) => a === release && b === main,
    })).toThrow(/ROLL_BACK_PRODUCTION/);
  });

  it('fails closed when production source SHA cannot be read', () => {
    expect(() => validateProductionReleaseCandidate({
      ...valid, deployedSha: '',
      isAncestor: () => true,
    })).toThrow(/DEPLOYED_SOURCE_SHA_INVALID/);
  });

  it('permits revalidation of the exact currently deployed candidate', () => {
    expect(validateProductionReleaseCandidate({
      deployedSha: production, releaseSha: production, workflowSha: main,
      isAncestor: (a, b) => (a === production && b === main) || a === b,
    }).releaseSha).toBe(production);
  });
});
