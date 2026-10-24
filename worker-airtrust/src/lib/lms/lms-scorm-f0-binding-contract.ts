import { ApiError } from '../../middleware/error-handler';

/**
 * Candidate-scoped F0 witness. This is a *validation* contract, not a grant
 * to provision, write, certify or activate any LMS record.
 */
export interface ScormF0BindingWitness {
  ciclo_id: number;
  staging_runtime_sha: string;
  approval_receipt_sha256: string;
  run_id: string;
  expires_at: string;
  launched_package_sha256: string | null;
  last_committed_package_sha256: string | null;
}

const hex64 = /^[a-f0-9]{64}$/;
const hex40 = /^[a-f0-9]{40}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertScormF0BindingWitness(
  witness: ScormF0BindingWitness | null,
  expected: { packageSha256: string; runtimeSha: string; observedAt: number },
): asserts witness is ScormF0BindingWitness {
  if (!hex64.test(expected.packageSha256) || !hex40.test(expected.runtimeSha) ||
      !Number.isFinite(expected.observedAt) ||
      !witness || !Number.isSafeInteger(witness.ciclo_id) || witness.ciclo_id <= 0 ||
      !hex40.test(witness.staging_runtime_sha) ||
      witness.staging_runtime_sha !== expected.runtimeSha ||
      !hex64.test(witness.approval_receipt_sha256) ||
      !uuid.test(witness.run_id) ||
      typeof witness.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(witness.expires_at)) ||
      Date.parse(witness.expires_at) <= expected.observedAt ||
      (witness.launched_package_sha256 !== null &&
       witness.launched_package_sha256 !== expected.packageSha256) ||
      (witness.last_committed_package_sha256 !== null &&
       (witness.launched_package_sha256 !== expected.packageSha256 ||
        witness.last_committed_package_sha256 !== expected.packageSha256))) {
    throw new ApiError('SCORM_QA_F0_BINDING_WITNESS_INVALID', 409);
  }
}
