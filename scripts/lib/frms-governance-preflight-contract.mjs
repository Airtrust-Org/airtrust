// Pure, testable decision logic for the FRMS governance deploy preflight.
//
// Whether the readiness guard is REQUIRED is derived from the release itself
// (does this SHA's migration set include FRMS parameter governance?), never
// from an opt-in environment variable. An env var may still override *which*
// D1 database is queried (for local/manual runs), but it can never be used to
// skip the guard on a governed SHA — that path always fails closed instead.

export const GOVERNANCE_MIGRATION_FILENAME = '0464_frms_parameter_governance_recalc.sql';

/**
 * A release "contains FRMS governance" iff its migration set includes the
 * governance migration. This is determined by the SHA's own file tree, not by
 * configuration, so there is no way to accidentally omit the check for a
 * governed release.
 */
export function releaseContainsFrmsGovernance(migrationFilenames) {
  return migrationFilenames.includes(GOVERNANCE_MIGRATION_FILENAME);
}

/**
 * Resolves the production D1 database name from the official wrangler config
 * (the same source of truth the real deploy uses), optionally overridden for
 * local/manual runs. Throws (fail-closed) rather than returning a fallback
 * when the config can't be parsed — an unresolved database is never treated
 * as "nothing to check".
 */
export function resolveProductionD1Name(wranglerTomlText, envOverride) {
  if (envOverride) return envOverride;
  const d1SectionMatch = wranglerTomlText.match(
    /\[\[env\.production\.d1_databases\]\][\s\S]*?(?=\n\[|$)/,
  );
  if (!d1SectionMatch) {
    throw new Error('FRMS_GOVERNANCE_PREFLIGHT: could not locate [[env.production.d1_databases]] in wrangler.toml.');
  }
  const dbNameMatch = d1SectionMatch[0].match(/database_name\s*=\s*"([^"]+)"/);
  if (!dbNameMatch) {
    throw new Error('FRMS_GOVERNANCE_PREFLIGHT: could not resolve database_name for [[env.production.d1_databases]].');
  }
  return dbNameMatch[1];
}

/**
 * Combines governance-detection with the readiness result into a single
 * preflight verdict. `tenantResults` is undefined only when the readiness
 * check itself could not be run (D1 unresolved, query failed) — that is
 * always a FAIL, never a silent pass, whenever governance is required.
 */
export function evaluateFrmsGovernancePreflight({ required, tenantResults }) {
  if (!required) {
    return { status: 'SKIPPED', reason: 'SHA does not include FRMS parameter governance.' };
  }
  if (!tenantResults) {
    return {
      status: 'FAIL',
      reason: 'FRMS governance is present in this SHA but readiness could not be determined (D1 unresolved or query failed).',
    };
  }
  const notReady = tenantResults.filter((r) => !r.ready);
  if (notReady.length > 0) {
    return {
      status: 'FAIL',
      reason: `${notReady.length} tenant(s) with FRMS activity are not governance-ready.`,
      notReady,
    };
  }
  return { status: 'PASS', reason: 'All tenants with FRMS activity are governance-ready.' };
}
