// Read-only evidence classifications are not equivalent to learner completion.
// An asset loading says nothing about the LMS status, cycle, examination,
// qualification history or certificate produced after a full learner journey.
export function classifyPptxAssetProbe({ httpStatus, assetBytes, generatesQualification }) {
  const assetLoadPass = httpStatus === 200 &&
    Number.isSafeInteger(assetBytes) && assetBytes > 100;
  return {
    status: assetLoadPass ? 'INCONCLUSIVE' : 'FAIL',
    reason: !assetLoadPass ? `PPTX_ASSET_HTTP_${httpStatus}` :
      generatesQualification ? 'PPTX_QUALIFYING_COMPLETION_EVIDENCE_REQUIRED' :
      'PPTX_COMPLETION_LIFECYCLE_NOT_TESTED',
    assetLoadPass,
    functionalCompletionCertified: false,
  };
}

// A missing format-specific certifier is a coverage gap, not evidence that
// a published PDF, H5P or video is defective; it still must block release.
export function classifyUncoveredContentType(type) {
  return {
    status: 'INCONCLUSIVE',
    reason: 'CONTENT_TYPE_FUNCTIONAL_CERTIFIER_NOT_IMPLEMENTED',
    tipo_conteudo: String(type || '').toLowerCase(),
    functional_completion_certified: false,
  };
}
