import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPptxAssetProbe, classifyReadOnlyContentAssetProbe, classifyUncoveredContentType, summarizeCourseFormatCoverage,
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

test('format coverage counts certified, proven failures and untested separately', () => {
  const summary = summarizeCourseFormatCoverage([
    { tipo_conteudo:'scorm', status:'PASS',
      certification_evidence:'PREVIEW_LIFECYCLE_PASSED', enrolled_learner_end_to_end_tested:false },
    { tipo_conteudo:'scorm', status:'INCONCLUSIVE', functional_completion_certified:false },
    { tipo_conteudo:'pptx', status:'INCONCLUSIVE', asset_load_pass:true,
      functional_completion_certified:false },
    { tipo_conteudo:'pdf', status:'INCONCLUSIVE', functional_completion_certified:false },
    { tipo_conteudo:'h5p', status:'INCONCLUSIVE', functional_completion_certified:false },
    { tipo_conteudo:'video', status:'INCONCLUSIVE', functional_completion_certified:false },
    { tipo_conteudo:'video', status:'FAIL', functional_completion_certified:false },
  ]);
  assert.equal(summary.format_count, 5);
  assert.equal(summary.scorm_preview_pass_count, 1);
  assert.equal(summary.enrolled_learner_end_to_end_tested, false);
  assert.deepEqual(summary.formats.map(({tipo_conteudo,course_count,pass_count,
    fail_count,inconclusive_count,scorm_preview_pass_count}) =>
    [tipo_conteudo,course_count,pass_count,fail_count,inconclusive_count,scorm_preview_pass_count]), [
    ['h5p',1,0,0,1,0],
    ['pdf',1,0,0,1,0],
    ['pptx',1,0,0,1,0],
    ['scorm',2,1,0,1,1],
    ['video',2,0,1,1,0],
  ]);
});

test('unproven PASS or unsupported status can never inflate SCORM preview counts', () => {
  assert.equal(summarizeCourseFormatCoverage([
    { tipo_conteudo:'pdf', status:'PASS', functional_completion_certified:false },
    { tipo_conteudo:'scorm', status:'FAIL', certification_evidence:'PREVIEW_LIFECYCLE_PASSED' },
    { tipo_conteudo:'video', status:'PASS' },
  ]).scorm_preview_pass_count,0);
  assert.throws(() => summarizeCourseFormatCoverage([
    { tipo_conteudo:'pdf', status:'SUCCESS' },
  ]), /LMS_CERTIFICATION_UNKNOWN_STATUS/);
});

test('valid PDF asset is accessible but never a completed enrollment',()=>{
  const verdict=classifyReadOnlyContentAssetProbe({format:'pdf',samples:[{status:200,valid:true}]});
  assert.deepEqual(verdict,{status:'INCONCLUSIVE',reason:'PDF_COMPLETION_LIFECYCLE_NOT_TESTED',
    assetLoadPass:true,functionalCompletionCertified:false});
  assert.equal(classifyReadOnlyContentAssetProbe({format:'pdf',samples:[{status:404,valid:false}]}).status,'FAIL');
  assert.equal(classifyReadOnlyContentAssetProbe({format:'pdf',samples:[{status:200,valid:false}]}).status,'FAIL');
  assert.equal(classifyReadOnlyContentAssetProbe({format:'pdf',samples:[{status:503,valid:false}]}).status,'INCONCLUSIVE');
});

test('H5P requires two intact JSON entrypoints, without claiming xAPI completion',()=>{
  const samples=[{status:200,valid:true},{status:200,valid:true}];
  const verdict=classifyReadOnlyContentAssetProbe({format:'h5p',samples});
  assert.equal(verdict.assetLoadPass,true);
  assert.equal(verdict.status,'INCONCLUSIVE');
  assert.equal(verdict.functionalCompletionCertified,false);
  for (const bad of [
    [{status:200,valid:true},{status:404,valid:false}],
    [{status:200,valid:true},{status:200,valid:false}],
  ]) assert.equal(classifyReadOnlyContentAssetProbe({format:'h5p',samples:bad}).status,'FAIL');
  assert.equal(classifyReadOnlyContentAssetProbe({format:'h5p',samples:[
    {status:403,valid:false},{status:200,valid:true},
  ]}).status,'INCONCLUSIVE');
  assert.equal(classifyReadOnlyContentAssetProbe({format:'h5p',samples:[
    {status:200,valid:null},{status:200,valid:true},
  ]}).status,'INCONCLUSIVE');
  assert.throws(()=>classifyReadOnlyContentAssetProbe({format:'h5p',samples:[samples[0]]}),/LMS_ASSET_PROBE_SCOPE_INVALID/);
});

test('media asset probes do not inflate SCORM preview completion',()=>{
  const summary=summarizeCourseFormatCoverage([
    {tipo_conteudo:'pdf',status:'INCONCLUSIVE',asset_load_pass:true},
    {tipo_conteudo:'h5p',status:'INCONCLUSIVE',asset_load_pass:true},
    {tipo_conteudo:'pptx',status:'INCONCLUSIVE',asset_load_pass:true},
  ]);
  assert.equal(summary.asset_probe_pass_count,3);
  assert.equal(summary.scorm_preview_pass_count,0);
  assert.equal(summary.enrolled_learner_end_to_end_tested,false);
});
