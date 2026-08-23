// Pure provisioning-safety logic for FRMS_HELICOPTER_OFFSHORE_BASELINE_V1.
//
// This does not touch any database. It decides, given what already exists,
// whether it is safe to apply the seed:
//
//   NOT_PROVISIONED         — the revision does not exist yet. Safe to apply.
//   ALREADY_PROVISIONED_IDENTICAL
//                            — the revision exists and every parameter value
//                              matches exactly. Safe no-op (already done).
//   DIVERGENT                — the revision exists but at least one parameter
//                              differs, or the parameter set is incomplete.
//                              FAIL CLOSED — never silently overwritten.
//
// Never use INSERT OR IGNORE / INSERT OR REPLACE to paper over this decision
// — a REPLACE would silently discard a manually-edited or since-diverged row,
// and an IGNORE would silently accept a stale/incomplete existing row as if
// it were correct.

export const REVISION_ID = 'frms-helicopter-offshore-baseline-v1';

/**
 * @param {{ id: string, status: string } | null} existingRevision
 * @param {Array<{ parameter_key: string, numeric_value: number | null, json_value: string | null }>} existingParameters
 * @param {Record<string, number>} desiredParameters
 */
export function planFrmsHelicopterOffshoreProvisioning(existingRevision, existingParameters, desiredParameters) {
  if (!existingRevision) {
    return { decision: 'NOT_PROVISIONED', reason: 'No revision row found for ' + REVISION_ID + '.' };
  }

  const desiredKeys = Object.keys(desiredParameters).sort();
  const existingByKey = new Map(existingParameters.map((p) => [p.parameter_key, p]));

  const missing = desiredKeys.filter((key) => !existingByKey.has(key));
  if (missing.length > 0) {
    return {
      decision: 'DIVERGENT',
      reason: `Revision exists but is missing ${missing.length} parameter(s): ${missing.join(', ')}.`,
      missing,
    };
  }

  const extra = existingParameters
    .map((p) => p.parameter_key)
    .filter((key) => !Object.hasOwn(desiredParameters, key));
  if (extra.length > 0) {
    return {
      decision: 'DIVERGENT',
      reason: `Revision has ${extra.length} unexpected parameter(s) not in the baseline: ${extra.join(', ')}.`,
      extra,
    };
  }

  const mismatches = [];
  for (const key of desiredKeys) {
    const existing = existingByKey.get(key);
    const desiredValue = desiredParameters[key];
    if (existing.numeric_value !== desiredValue) {
      mismatches.push({ key, existing: existing.numeric_value, desired: desiredValue });
    }
  }
  if (mismatches.length > 0) {
    return {
      decision: 'DIVERGENT',
      reason: `${mismatches.length} parameter(s) differ from the baseline.`,
      mismatches,
    };
  }

  if (existingRevision.status !== 'ACTIVE') {
    return {
      decision: 'DIVERGENT',
      reason: `Revision exists with matching parameters but status is '${existingRevision.status}', not 'ACTIVE'.`,
    };
  }

  return { decision: 'ALREADY_PROVISIONED_IDENTICAL', reason: 'Revision and all parameters already match the baseline exactly.' };
}
