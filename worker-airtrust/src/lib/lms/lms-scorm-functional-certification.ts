/**
 * Functional LMS/SCORM certification is a separate release gate.
 *
 * A syntactically valid ZIP and a passing Initialize/Commit/Finish trace are
 * NOT proof that a real learner can resume, fail/retry an assessment, finalize,
 * reopen or preserve a completed enrollment. Only the trusted browser test
 * harness may supply these attestations; ZIP metadata and client payloads
 * must never be used as inputs to this evaluator.
 */
export const SCORM_FUNCTIONAL_HARNESS = 'AIRTRUST_SCORM_FUNCTIONAL_HARNESS_V1' as const;
export const REQUIRED_SCORM_FUNCTIONAL_CASES = [
  'FIRST_ACCESS',
  'SUSPEND_RESUME',
  'ASSESSMENT_INSUFFICIENT',
  'ASSESSMENT_APPROVED',
  'EXPLICIT_FINALIZATION',
  'REOPEN_COMPLETED',
  'NO_STATUS_DOWNGRADE',
  'TENANT_CYCLE_ISOLATION',
] as const;
export type ScormFunctionalCase = typeof REQUIRED_SCORM_FUNCTIONAL_CASES[number];
export type ScormFunctionalBrowser = 'CHROMIUM' | 'WEBKIT';
export type ScormFunctionalBrowserRun = {
  harness: typeof SCORM_FUNCTIONAL_HARNESS;
  browser: ScormFunctionalBrowser;
  packageSha256: string;
  /** Every check comes from an actual browser + isolated test enrollment. */
  cases: Array<{ name: ScormFunctionalCase; status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' }>;
};
export type ScormFunctionalCertification = {
  status: 'CERTIFIED' | 'UNCERTIFIED';
  packageSha256: string;
  missing: string[];
};

/** Fail closed on missing/duplicate runs, incomplete cases, SHA drift or failures.
 * This verifies the shape of trusted harness results, not their provenance.
 * Callers MUST NOT pass attestations supplied by a SCORM ZIP or learner. */
export function evaluateScormFunctionalCertification(
  expectedSha256: string,
  trustedRuns: readonly ScormFunctionalBrowserRun[],
): ScormFunctionalCertification {
  const missing: string[] = [];
  for (const browser of ['CHROMIUM', 'WEBKIT'] as const) {
    const runs = trustedRuns.filter(run => run.browser === browser);
    if (runs.length !== 1) {
      missing.push(`${browser}:RUN_REQUIRED_UNIQUE`);
      continue;
    }
    const run = runs[0];
    if (run.harness !== SCORM_FUNCTIONAL_HARNESS ||
        !expectedSha256 || run.packageSha256 !== expectedSha256) {
      missing.push(`${browser}:PACKAGE_SHA_OR_HARNESS_INVALID`);
      continue;
    }
    for (const name of REQUIRED_SCORM_FUNCTIONAL_CASES) {
      const checks = run.cases.filter(test => test.name === name);
      if (checks.length !== 1 || checks[0].status !== 'PASS') {
        missing.push(`${browser}:${name}`);
      }
    }
  }
  return {
    status: missing.length === 0 ? 'CERTIFIED' : 'UNCERTIFIED',
    packageSha256: expectedSha256,
    missing,
  };
}
