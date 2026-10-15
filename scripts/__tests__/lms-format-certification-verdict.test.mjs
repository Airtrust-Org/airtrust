import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPptxAssetProbe, classifyUncoveredContentType,
} from '../validation/lms-format-certification-verdict.mjs';

test('a PPTX asset alone never certifies a nonqualifying enrollment', () => {
  assert.deepEqual(classifyPptxAssetProbe({
    httpStatus: 200, assetBytes: 1200, generatesQualification: false,
  }), {
    status: 'INCONCLUSIVE', reason: 'PPTX_COMPLETION_LIFECYCLE_NOT_TESTED',
    assetLoadPass: true, functionalCompletionCertified: false,
  });
});

test('qualifying PPTX requires server-owned history and completion evidence', () => {
  const verdict = classifyPptxAssetProbe({
    httpStatus: 200, assetBytes: 1200, generatesQualification: true,
  });
  assert.equal(verdict.status, 'INCONCLUSIVE');
  assert.equal(verdict.reason, 'PPTX_QUALIFYING_COMPLETION_EVIDENCE_REQUIRED');
  assert.equal(verdict.functionalCompletionCertified, false);
});

test('PPTX missing, denied, or empty asset is an explicit failure', () => {
  for (const [httpStatus,assetBytes] of [[404,0],[403,0],[200,0],[200,100]]) {
    const verdict=classifyPptxAssetProbe({
      httpStatus, assetBytes, generatesQualification: false,
    });
    assert.equal(verdict.status,'FAIL');
    assert.equal(verdict.functionalCompletionCertified,false);
  }
});

test('H5P, PDF, video and unknown course types stay uncertified, not falsely defective', () => {
  for (const type of ['h5p','pdf','video','unknown']) {
    assert.deepEqual(classifyUncoveredContentType(type), {
      status:'INCONCLUSIVE',
      reason:'CONTENT_TYPE_FUNCTIONAL_CERTIFIER_NOT_IMPLEMENTED',
      tipo_conteudo:type,
      functional_completion_certified:false,
    });
  }
});
