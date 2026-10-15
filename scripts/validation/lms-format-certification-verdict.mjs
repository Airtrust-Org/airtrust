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

/**
 * Portable, deterministic readiness ledger, derived only from actual probe
 * results for the pinned runtime and browser. An asset HTTP 200 and an
 * isolated SCORM preview are NOT end-to-end enrollment/certificate evidence.
 */
export function summarizeCourseFormatCoverage(results) {
  const groups = new Map();
  for (const result of results) {
    const format = String(result.tipo_conteudo || 'unknown').trim().toLowerCase() || 'unknown';
    const group = groups.get(format) || {
      tipo_conteudo: format, course_count: 0, pass_count: 0,
      fail_count: 0, inconclusive_count: 0, scorm_preview_pass_count: 0,
    };
    group.course_count += 1;
    if (result.status === 'PASS') group.pass_count += 1;
    else if (result.status === 'FAIL') group.fail_count += 1;
    else if (result.status === 'INCONCLUSIVE') group.inconclusive_count += 1;
    else throw new Error('LMS_CERTIFICATION_UNKNOWN_STATUS');
    // The SCORM preview is an isolated synthetic runtime. It does NOT
    // exercise an enrolled learner's persisted qualification/certificate.
    if (format === 'scorm' && result.status === 'PASS' &&
        result.certification_evidence === 'PREVIEW_LIFECYCLE_PASSED') {
      group.scorm_preview_pass_count += 1;
    }
    groups.set(format, group);
  }
  const formats = [...groups.values()].sort((a, b) =>
    a.tipo_conteudo.localeCompare(b.tipo_conteudo, 'en'));
  return {
    format_count: formats.length,
    scorm_preview_pass_count: formats.reduce((n, item) => n + item.scorm_preview_pass_count, 0),
    // This workflow forbids LMS writes and cannot validate terminal lifecycle
    // or certificate provenance of any real enrollment. Never imply otherwise.
    enrolled_learner_end_to_end_tested: false,
    formats,
  };
}
