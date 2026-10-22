import { describe, expect, it } from 'vitest';

import { applyRuntimeConformance, canActivateCertifiedScormPackage, validateScormPackageQuality } from '../../lib/lms/lms-scorm-quality-gate';
import type { ValidatedLmsPackage } from '../../lib/lms/lms-package-validator';
import {
  REQUIRED_SCORM_FUNCTIONAL_CASES, SCORM_FUNCTIONAL_HARNESS,
  type ScormFunctionalBrowserRun,
} from '../../lib/lms/lms-scorm-functional-certification';

const encoder = new TextEncoder();

function pkg(completionManifest: unknown): ValidatedLmsPackage {
  return {
    tipoConteudo: 'scorm', totalUncompressedBytes: 1, launchFile: 'index.html', scormVersao: '1.2', tipoH5p: null,
    entries: [{ path: 'imsmanifest.xml', data: encoder.encode('<manifest/>') }, { path: 'index.html', data: encoder.encode('ok') }, { path: 'airtrust-completion-manifest.json', data: encoder.encode(JSON.stringify(completionManifest)) }],
  };
}

const validManifest = {
  schemaVersion: 1, diagnosticsVersion: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1', scormVersion: '1.2', courseId: 'course-1', packageVersion: 'v1',
  content: { requiredSlides: ['slide-1'] }, assessment: { requiredInteractions: ['q-1'], masteryScore: 70, successStatus: 'passed', failureStatus: 'failed' },
  completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1' }, diagnostics: { currentSlide: true, slides: true, assessment: true, packageStatus: true, updatedAt: true },
};

describe('SCORM package quality gate', () => {
  it('recognizes a valid static contract but never fabricates conformance PASS', () => {
    const result = validateScormPackageQuality(pkg(validManifest));
    expect(result.structural.status).toBe('PASS');
    expect(result.completionManifest.status).toBe('PASS');
    expect(result.diagnostics.status).toBe('PASS');
    expect(result.conformance.status).toBe('NOT_SUPPORTED');
    expect(result.publishable).toBe(false);
  });

  it('accepts an external-exam formative package only with Worker-owned completion', () => {
    const formative = {
      ...validManifest,
      assessment: {
        mode: 'EXTERNAL', requiredInteractions: [], scoringBySCORM: false, externalExamIssue: 1661,
      },
      completion: {
        strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1', passStatusFromSCORM: false,
        workerApprovalRequired: true,
      },
    };
    const valid = validateScormPackageQuality(pkg(formative));
    expect(valid.completionManifest.status).toBe('PASS');
    expect(valid.publishable).toBe(false); // Static evidence never certifies a course.

    const cases = [
      { assessment: { ...formative.assessment, scoringBySCORM: true } },
      { assessment: { ...formative.assessment, scoringBySCORM: undefined } },
      { assessment: { ...formative.assessment, requiredInteractions: ['quiz-1'] } },
      { assessment: { ...formative.assessment, masteryScore: 80 } },
      { completion: { ...formative.completion, passStatusFromSCORM: true } },
      { completion: { ...formative.completion, workerApprovalRequired: false } },
    ];
    for (const change of cases) {
      const invalid = validateScormPackageQuality(pkg({ ...formative, ...change }));
      expect(invalid.completionManifest.status).toBe('FAIL');
      expect(invalid.publishable).toBe(false);
    }
  });

  it('rejects duplicate required IDs and diagnostics that expose answers', () => {
    const result = validateScormPackageQuality(pkg({ ...validManifest, content: { requiredSlides: ['slide-1', 'SLIDE-1'] }, diagnostics: { ...validManifest.diagnostics, correctAnswers: true } }));
    expect(result.completionManifest.status).toBe('FAIL');
    expect(result.diagnostics.status).toBe('FAIL');
  });

  it('only publishes matching SHA with static and runtime PASS', () => {
    const staticResult = validateScormPackageQuality(pkg(validManifest));
    const runtime = { status: 'PASS' as const, candidateSha256: 'sha-a', startedAt: '', finishedAt: '', initializeObserved: true, commitObserved: true, finishObserved: true, completionReached: false, lessonStatus: 'incomplete', scoreRaw: null, masteryScore: null, lessonLocation: null, trace: [], errors: [], runnerVersion: 'v1' };
    // SCORM Initialize/Commit/Finish with incomplete coursework is a
    // protocol PASS, never permission to publish a certifying ZIP.
    expect(applyRuntimeConformance(staticResult, runtime, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, runtime, 'sha-a').conformance.status).toBe('FAIL');
    expect(applyRuntimeConformance(staticResult, runtime, 'sha-b').publishable).toBe(false);
    const passed = {
      ...runtime, lessonStatus: 'passed', completionReached: true,
      functionalCompletionVerified: true, functionalCompletionReason: null,
      scoreRaw: '85', masteryScore: '70',
    };
    // A one-session browser drive is protocol/assessment proof, never full E2E certification.
    expect(applyRuntimeConformance(staticResult, passed, 'sha-a').conformance.status).toBe('PASS');
    expect(applyRuntimeConformance(staticResult, passed, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, { ...passed, scoreRaw: '69' }, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, { ...passed, functionalCompletionVerified: false }, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, { ...passed, masteryScore: null }, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, { ...passed, scoreRaw: null }, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, { ...passed, lessonStatus: 'completed', expectedSuccessStatus: 'passed' }, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, { ...passed, requiresAssessmentEvidence: false, masteryScore: null, scoreRaw: null, lessonStatus: 'completed', expectedSuccessStatus: 'completed' }, 'sha-a').publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, { ...passed, requiresAssessmentEvidence: true, masteryScore: null, scoreRaw: null }, 'sha-a').publishable).toBe(false);
  });

  it('requires both browser engines, all functional cases and exact ZIP SHA', () => {
    const staticResult = validateScormPackageQuality(pkg(validManifest));
    const passed = {
      status: 'PASS' as const, candidateSha256: 'sha-a', startedAt: '',
      finishedAt: '', initializeObserved: true, commitObserved: true, finishObserved: true,
      completionReached: true, lessonStatus: 'passed', scoreRaw: '85', masteryScore: '70',
      lessonLocation: '1/1', trace: [], errors: [], runnerVersion: 'v1',
      functionalCompletionVerified: true,
    };
    const makeRun = (browser: 'CHROMIUM' | 'WEBKIT'): ScormFunctionalBrowserRun => ({
      harness: SCORM_FUNCTIONAL_HARNESS, browser, packageSha256: 'sha-a',
      cases: REQUIRED_SCORM_FUNCTIONAL_CASES.map(name => ({ name, status: 'PASS' })),
    });
    const chromium = makeRun('CHROMIUM');
    const webkit = makeRun('WEBKIT');
    expect(applyRuntimeConformance(staticResult, passed, 'sha-a', [chromium])
      .functionalCertification.missing).toContain('WEBKIT:RUN_REQUIRED_UNIQUE');
    const fullyCertified = applyRuntimeConformance(staticResult, passed, 'sha-a', [chromium, webkit]);
    expect(fullyCertified.publishable).toBe(true);
    expect(canActivateCertifiedScormPackage(fullyCertified, 'sha-a')).toBe(true);
    expect(canActivateCertifiedScormPackage(fullyCertified, 'sha-b')).toBe(false);
    // A CERTIFIED summary is not sufficient if the stored browser ledger
    // is absent or has been altered.
    expect(canActivateCertifiedScormPackage({
      ...fullyCertified, functionalCertification: {
        ...fullyCertified.functionalCertification, runs: [],
      },
    }, 'sha-a')).toBe(false);
    expect(canActivateCertifiedScormPackage({
      ...fullyCertified, functionalCertification: {
        ...fullyCertified.functionalCertification,
        runs: [chromium, { ...webkit, cases: webkit.cases.map(item =>
          item.name === 'SUSPEND_RESUME' ? { ...item, status: 'FAIL' as const } : item) }],
      },
    }, 'sha-a')).toBe(false);
    expect(canActivateCertifiedScormPackage({
      ...fullyCertified, functionalCertification: {
        ...fullyCertified.functionalCertification,
        runs: [chromium, { ...webkit, packageSha256: 'another-zip' }],
      },
    }, 'sha-a')).toBe(false);
    const mismatchedPolicy = {
      ...fullyCertified, functionalCertification: {
        ...fullyCertified.functionalCertification, requiresAssessment: false,
      },
      runtime: { ...passed, requiresAssessmentEvidence: true },
    };
    expect(canActivateCertifiedScormPackage(mismatchedPolicy, 'sha-a')).toBe(false);
    // Old stored JSON may still contain publishable=true with no functional gate.
    const legacyResult = { ...fullyCertified, functionalCertification: undefined };
    expect(canActivateCertifiedScormPackage(
      legacyResult as unknown as typeof fullyCertified, 'sha-a',
    )).toBe(false);
    expect(canActivateCertifiedScormPackage({
      ...fullyCertified, conformance: { ...fullyCertified.conformance, status: 'FAIL' },
    }, 'sha-a')).toBe(false);
    expect(applyRuntimeConformance(staticResult, passed, 'sha-b', [chromium, webkit])
      .publishable).toBe(false);
    expect(applyRuntimeConformance(staticResult, passed, 'sha-a', [chromium, chromium, webkit])
      .publishable).toBe(false);
    const missingResume: ScormFunctionalBrowserRun = {
      ...webkit,
      cases: webkit.cases.filter(test => test.name !== 'SUSPEND_RESUME'),
    };
    expect(applyRuntimeConformance(staticResult, passed, 'sha-a', [chromium, missingResume])
      .publishable).toBe(false);
    const formative = {
      ...passed, requiresAssessmentEvidence: false,
      lessonStatus: 'completed', expectedSuccessStatus: 'completed',
      scoreRaw: null, masteryScore: null,
    };
    const withoutScoredAssessment = [chromium, webkit].map(run => ({
      ...run, cases: run.cases.filter(test =>
        test.name !== 'ASSESSMENT_INSUFFICIENT' &&
        test.name !== 'ASSESSMENT_APPROVED' &&
        test.name !== 'ASSESSMENT_THRESHOLD'),
    }));
    expect(applyRuntimeConformance(staticResult, formative, 'sha-a', withoutScoredAssessment)
      .publishable).toBe(true);
    expect(applyRuntimeConformance(staticResult, passed, 'sha-a', withoutScoredAssessment)
      .publishable).toBe(false);

    const externalManifest = {
      ...validManifest,
      assessment: { mode: 'EXTERNAL', scoringBySCORM: false, requiredInteractions: [] },
      completion: {
        strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1',
        passStatusFromSCORM: false, workerApprovalRequired: true,
      },
      release: { status: 'PRIVATE_CANDIDATE_DO_NOT_ACTIVATE', reviewed: false },
    };
    const unreviewed = validateScormPackageQuality(pkg(externalManifest));
    expect(unreviewed.completionManifest.status).toBe('PASS'); // QA intake remains possible.
    expect(unreviewed.authoringReview).toEqual({ externalExam: true, reviewed: false });
    const tested = applyRuntimeConformance(unreviewed, formative, 'sha-a', withoutScoredAssessment);
    expect(tested.functionalCertification.status).toBe('CERTIFIED');
    expect(tested.publishable).toBe(false);
    // An old persisted or forged publishable bit must not bypass the review flag.
    expect(canActivateCertifiedScormPackage({ ...tested, publishable: true }, 'sha-a')).toBe(false);

    const declaredReviewed = validateScormPackageQuality(pkg({
      ...externalManifest, release: { reviewed: true },
    }));
    expect(declaredReviewed.authoringReview).toEqual({ externalExam: true, reviewed: true });
    expect(applyRuntimeConformance(declaredReviewed, formative, 'sha-a', withoutScoredAssessment)
      .publishable).toBe(true); // Still needs all browser cases and governed SME approval.
    const missingReview = validateScormPackageQuality(pkg({
      ...externalManifest, release: undefined,
    }));
    expect(missingReview.authoringReview?.reviewed).toBe(false);
  });
});
