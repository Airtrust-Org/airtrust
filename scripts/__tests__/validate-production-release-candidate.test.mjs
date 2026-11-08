import { describe, it, expect } from 'vitest';
import {
  validateProductionReleaseCandidate,
  resolvePagesSourceSha,
} from '../ci/validate-production-release-candidate.mjs';

const shaA = '1'.repeat(40);
const shaB = '2'.repeat(40);
const shaC = '3'.repeat(40);
const chain = [shaA, shaB, shaC];
const isAncestor = (older, newer) =>
  chain.indexOf(older) >= 0 && chain.indexOf(newer) >= chain.indexOf(older);

describe('immutable production release candidate (target-aware rollback protection)', () => {
  const base = { releaseSha: shaB, workflowSha: shaC, isAncestor };

  it('publishes historical approved SHA after main advances when both predecessors are older', () => {
    expect(validateProductionReleaseCandidate({
      ...base, deployWorker: true, deployPages: true,
      deployedWorkerSha: shaA, deployedPagesSha: shaA,
    }).releaseSha).toBe(shaB);
  });

  it('accepts Pages-only A -> B even if Worker is already at C', () => {
    expect(validateProductionReleaseCandidate({
      ...base, deployWorker: false, deployPages: true,
      deployedWorkerSha: shaC, deployedPagesSha: shaA,
    }).releaseSha).toBe(shaB);
  });

  it('blocks Pages-only downgrade C -> B even if Worker is at A', () => {
    expect(() => validateProductionReleaseCandidate({
      ...base, deployWorker: false, deployPages: true,
      deployedWorkerSha: shaA, deployedPagesSha: shaC,
    })).toThrow(/ROLL_BACK_PAGES/);
  });

  it('accepts Worker-only A -> B even if Pages is already at C', () => {
    expect(validateProductionReleaseCandidate({
      ...base, deployWorker: true, deployPages: false,
      deployedWorkerSha: shaA, deployedPagesSha: shaC,
    }).releaseSha).toBe(shaB);
  });

  it('blocks Worker-only downgrade C -> B even if Pages is at A', () => {
    expect(() => validateProductionReleaseCandidate({
      ...base, deployWorker: true, deployPages: false,
      deployedWorkerSha: shaC, deployedPagesSha: shaA,
    })).toThrow(/ROLL_BACK_WORKER/);
  });

  it('blocks dual-target release if either target has newer production code', () => {
    expect(() => validateProductionReleaseCandidate({
      ...base, deployWorker: true, deployPages: true,
      deployedWorkerSha: shaA, deployedPagesSha: shaC,
    })).toThrow(/ROLL_BACK_PAGES/);
  });

  it('rejects an unmerged SHA even when target predecessor is older', () => {
    expect(() => validateProductionReleaseCandidate({
      ...base, workflowSha: shaA, deployWorker: true, deployPages: false,
      deployedWorkerSha: shaA,
    })).toThrow(/NOT_MERGED_MAIN_ANCESTOR/);
  });

  it('fails closed if the selected target source cannot be confirmed', () => {
    expect(() => validateProductionReleaseCandidate({
      ...base, deployWorker: false, deployPages: true, deployedPagesSha: null,
    })).toThrow(/DEPLOYED_PAGES_SOURCE_SHA_INVALID/);
  });

  it('extracts uniquely resolvable Pages source from the verified build-version meta', () => {
    const html = '<meta name="build-version" content="2026-11-08T03:01:45Z-00da69b" />';
    expect(resolvePagesSourceSha(html, (prefix) =>
      prefix === '00da69b' ? '00da69b7e017aaf6c28131c36344a688f9e7113e' : null
    )).toBe('00da69b7e017aaf6c28131c36344a688f9e7113e');
    expect(() => resolvePagesSourceSha(html, () => null)).toThrow(/NOT_UNIQUELY_RESOLVED/);
  });

  it('rejects missing or tampered Pages build markers', () => {
    expect(() => resolvePagesSourceSha('<html></html>', () => shaA))
      .toThrow(/BUILD_VERSION_UNAVAILABLE/);
    expect(() => resolvePagesSourceSha(
      '<meta name="build-version" content="latest" />', () => shaA))
      .toThrow(/BUILD_VERSION_UNAVAILABLE/);
  });
});
