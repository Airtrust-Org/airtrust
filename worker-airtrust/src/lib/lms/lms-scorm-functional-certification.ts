/**
 * Functional LMS/SCORM certification is a separate release gate.
 *
 * A syntactically valid ZIP and a passing Initialize/Commit/Finish trace are
 * NOT proof that a real learner can resume, fail/retry an assessment, finalize,
 * reopen or preserve a completed enrollment. Only the trusted browser test
 * harness may supply these attestations; ZIP metadata and client payloads
 * must never be used as inputs to this evaluator.
 */
export const SCORM_FUNCTIONAL_HARNESS = 'AIRTRUST_SCORM_FUNCTIONAL_HARNESS_V2' as const;
export const REQUIRED_SCORM_FUNCTIONAL_CASES = [
  'FIRST_ACCESS',
  'REQUIRED_CONTENT_COVERAGE',
  'REQUIRED_INTERACTIONS',
  'PERSISTENCE_VERIFIED',
  'SUSPEND_RESUME',
  'ASSESSMENT_INSUFFICIENT',
  'ASSESSMENT_APPROVED',
  'ASSESSMENT_THRESHOLD',
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
  requiresAssessment: boolean;
  /** Sanitized independent browser verdicts; never store answers or learner identities. */
  runs: ScormFunctionalBrowserRun[];
};

/** Fail closed on missing/duplicate runs, incomplete cases, SHA drift or failures.
 * This verifies the shape of trusted harness results, not their provenance.
 * Callers MUST NOT pass attestations supplied by a SCORM ZIP or learner. */
export function evaluateScormFunctionalCertification(
  expectedSha256: string,
  trustedRuns: readonly ScormFunctionalBrowserRun[],
  policy: { requiresAssessment: boolean } = { requiresAssessment: true },
): ScormFunctionalCertification {
  const missing: string[] = [];
  if (!Array.isArray(trustedRuns) || trustedRuns.length !== 2) {
    missing.push('BROWSER_RUN_COUNT_INVALID');
  }
  // Formative courses may have no scored assessment. The declared and
  // validated course policy determines whether these two tests apply.
  const requiredCases = REQUIRED_SCORM_FUNCTIONAL_CASES.filter(name =>
    policy.requiresAssessment ||
    (name !== 'ASSESSMENT_INSUFFICIENT' && name !== 'ASSESSMENT_APPROVED' &&
      name !== 'ASSESSMENT_THRESHOLD'));

  for (const browser of ['CHROMIUM', 'WEBKIT'] as const) {
    const runs = Array.isArray(trustedRuns) ? trustedRuns.filter(run => run?.browser === browser) : [];
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
    if (!Array.isArray(run.cases) || run.cases.some((test: ScormFunctionalBrowserRun['cases'][number]) =>
      !test || !REQUIRED_SCORM_FUNCTIONAL_CASES.includes(test.name) ||
      !['PASS', 'FAIL', 'INCONCLUSIVE'].includes(test.status))) {
      missing.push(`${browser}:INVALID_CASE_SET`);
      continue;
    }
    if (run.cases.length !== new Set(run.cases.map((test: ScormFunctionalBrowserRun['cases'][number]) => test.name)).size) {
      missing.push(`${browser}:DUPLICATE_CASE`);
    }
    if (run.cases.some((test: ScormFunctionalBrowserRun['cases'][number]) => !requiredCases.includes(test.name) && test.status !== 'PASS')) {
      missing.push(`${browser}:OPTIONAL_CASE_FAILED`);
    }
    for (const name of requiredCases) {
      const checks = run.cases.filter((test: ScormFunctionalBrowserRun['cases'][number]) => test.name === name);
      if (checks.length !== 1 || checks[0].status !== 'PASS') {
        missing.push(`${browser}:${name}`);
      }
    }
  }
  return {
    status: missing.length === 0 ? 'CERTIFIED' : 'UNCERTIFIED',
    packageSha256: expectedSha256,
    missing,
    requiresAssessment: policy.requiresAssessment,
    runs: Array.isArray(trustedRuns) ? trustedRuns.filter(Boolean).map(run => ({
      harness: run.harness, browser: run.browser, packageSha256: run.packageSha256,
      cases: Array.isArray(run.cases) ? run.cases.filter(Boolean).map((item: ScormFunctionalBrowserRun['cases'][number]) => ({
        name: item.name, status: item.status,
      })) : [],
    })) : [],
  };
}
