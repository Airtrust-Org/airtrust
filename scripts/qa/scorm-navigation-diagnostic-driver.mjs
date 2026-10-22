/**
 * Deliberately NON-CERTIFYING local navigation profile for an exact SCORM ZIP.
 * Never declares assessment status, qualification, PDF or activation readiness.
 * Signer and production intake must not accept this profile.
 */
export function validateNavigationDiagnostic(driver,expectedSha,files){
 const fail=reason=>{throw Error('LOCAL_SCORM_DIAGNOSTIC_'+reason);};
 const valid=x=>typeof x==='string'&&x.length>0&&x.length<241;
 if(!driver||driver.kind!=='LOCAL_NAVIGATION_DIAGNOSTIC_ONLY'||
  driver.activationAuthorized!==false||driver.packageSha256!==expectedSha||
  !/^[a-f0-9]{64}$/.test(expectedSha)||!valid(driver.launchFile)||
  driver.launchFile.startsWith('/')||driver.launchFile.includes('..')||
  !files[driver.launchFile])fail('PACKAGE_SHA_OR_SCOPE');
 if('requiresAssessment' in driver||'fail' in driver||'pass' in driver||
  'scoredOutcome' in driver||'certified' in driver)fail('FAKE_CERTIFICATION_FIELDS');
 if(!Array.isArray(driver.requiredContent)||
  driver.requiredContent.length<1||driver.requiredContent.length>8||
  !driver.requiredContent.every(x=>valid(x?.selector)))
  fail('CONTENT_REQUIRED');
 const validAction=x=>{
  if(x?.op==='click')return valid(x.selector);
  if(x?.op==='fill')return /^#score-reflection-[0-9]{1,4}$/.test(x.selector||'')&&
   typeof x.value==='string'&&x.value.length>=20&&x.value.length<=120;
  if(x?.op==='click_text')return valid(x.value);
  return false;
 };
 if(!Array.isArray(driver.resume?.actions)||
  driver.resume.actions.length<1||driver.resume.actions.length>8||
  !driver.resume.actions.every(validAction)||
  !['visible','text'].includes(driver.resume?.assertion?.state)||
  (driver.resume.assertion.state==='text'&&
   !valid(driver.resume.assertion.value))||
  !valid(driver.resume.assertion.selector))fail('SAFE_NAVIGATION_ONLY');
 return true;
}
