/**
 * Diagnostic classification for an independent browser producer, never an
 * authorization to certify or activate a ZIP.
 *
 * Failures without sufficient observations stay inconclusive. A timeout or
 * missing automation selector must not be represented as a broken package.
 */
export const SCORM_QA_DIAGNOSTIC_CATEGORIES = [
  'PACKAGE_DEFECT','CONTENT_MISSING','TEST_TIMEOUT','DRIVER_UNSUPPORTED',
  'INFRASTRUCTURE_ERROR','FUNCTIONAL_NOT_PROVEN',
];

export function classifyScormQaFailure(observation){
  const inconclusive=(category,reason)=>({
    certification:'UNCERTIFIED',category,reason,
    packageFaultConfirmed:false,activationAuthorized:false,
  });
  if(!observation || observation.source!=='GOVERNED_STAGING_AUTHENTICATED_QA_V1')
    return inconclusive('INFRASTRUCTURE_ERROR','UNTRUSTED_OR_MISSING_QA_SOURCE');
  const code=String(observation.failureCode??'');
  if(['BROWSER_MISSING','BROWSER_START_FAILED','NETWORK_UNAVAILABLE',
    'QA_AUTH_FAILED','STAGING_SHA_MISMATCH'].includes(code))
    return inconclusive('INFRASTRUCTURE_ERROR',code);
  if(['TEST_DEADLINE','PAGE_TIMEOUT','SESSION_TIMEOUT'].includes(code))
    return inconclusive('TEST_TIMEOUT',code);
  if(['NO_AUTOMATION_ADAPTER','UNSUPPORTED_INTERACTION',
    'SELECTOR_NOT_STABLE','ASSISTED_REVIEW_REQUIRED'].includes(code))
    return inconclusive('DRIVER_UNSUPPORTED',code);
  if(['REQUIRED_SLIDE_MISSING','REQUIRED_INTERACTION_MISSING',
    'ASSESSMENT_ABSENT','REFERENCED_ASSET_MISSING'].includes(code) &&
    observation.contentInventoryVerified===true) {
    return inconclusive('CONTENT_MISSING',code);
  }
  // A package fault is asserted only for a reproduced, well-localized
  // behavioral deviation with proven runtime, content and driver readiness.
  if(['SCORM_STATE_INCORRECT','PERSISTENCE_REGRESSION',
    'ASSESSMENT_THRESHOLD_BYPASS'].includes(code) &&
    observation.packageExecutionReproduced===true &&
    observation.runtimeHealthy===true &&
    observation.contentInventoryVerified===true &&
    observation.driverSupported===true) {
    return {
      certification:'UNCERTIFIED',category:'PACKAGE_DEFECT',reason:code,
      packageFaultConfirmed:true,activationAuthorized:false,
    };
  }
  return inconclusive('FUNCTIONAL_NOT_PROVEN',
    code||'EVIDENCE_INCOMPLETE');
}
