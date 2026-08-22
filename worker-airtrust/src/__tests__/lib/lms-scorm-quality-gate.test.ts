import { describe, expect, it } from 'vitest';

import { applyRuntimeConformance, validateScormPackageQuality } from '../../lib/lms/lms-scorm-quality-gate';
import type { ValidatedLmsPackage } from '../../lib/lms/lms-package-validator';

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
    expect(applyRuntimeConformance(staticResult, runtime, 'sha-a').publishable).toBe(true);
    expect(applyRuntimeConformance(staticResult, runtime, 'sha-b').publishable).toBe(false);
  });
});
