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
  });
});
