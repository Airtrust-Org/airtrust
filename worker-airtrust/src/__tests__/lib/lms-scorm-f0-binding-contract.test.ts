import { describe, expect, it } from 'vitest';
import { assertScormF0BindingWitness, type ScormF0BindingWitness } from '../../lib/lms/lms-scorm-f0-binding-contract';

const now = Date.parse('2026-10-23T23:00:00Z');
const sha = 'a'.repeat(64);
const runtime = 'b'.repeat(40);
const base: ScormF0BindingWitness = {
  ciclo_id: 42, staging_runtime_sha: runtime,
  approval_receipt_sha256: 'c'.repeat(64),
  run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  expires_at: '2026-10-24T00:00:00Z',
  launched_package_sha256: null,
  last_committed_package_sha256: null,
};
const expected = { packageSha256: sha, runtimeSha: runtime, observedAt: now };

describe('F0 candidate-run-cycle immutable witness', () => {
  it('accepts only authorized pre-launch and actual same-candidate commit witnesses', () => {
    expect(() => assertScormF0BindingWitness(base, expected)).not.toThrow();
    expect(() => assertScormF0BindingWitness({
      ...base, launched_package_sha256: sha, last_committed_package_sha256: sha,
    }, expected)).not.toThrow();
  });

  it.each([
    [null, 'missing'],
    [{ ...base, staging_runtime_sha: 'd'.repeat(40) }, 'runtime drift'],
    [{ ...base, expires_at: '2026-10-23T22:00:00Z' }, 'expired'],
    [{ ...base, expires_at: 'invalid' }, 'invalid expiry'],
    [{ ...base, ciclo_id: 0 }, 'bad cycle'],
    [{ ...base, run_id: 'not-an-uuid' }, 'forged run'],
    [{ ...base, launched_package_sha256: 'd'.repeat(64) }, 'foreign launch'],
    [{ ...base, last_committed_package_sha256: sha }, 'commit without launch'],
    [{ ...base, launched_package_sha256: sha, last_committed_package_sha256: 'd'.repeat(64) }, 'wrong commit SHA'],
    [{ ...base, approval_receipt_sha256: 'not-a-receipt' }, 'missing grant receipt'],
  ])('rejects %s (%s) without treating it as evidence', (row, _reason) => {
    expect(() => assertScormF0BindingWitness(row as ScormF0BindingWitness | null, expected))
      .toThrow('SCORM_QA_F0_BINDING_WITNESS_INVALID');
  });
});
