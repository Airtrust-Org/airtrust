/**
 * Pre-signing validation for a real immutable SCORM ZIP and its external,
 * human-reviewed learner journey. No browser, backend or EAD answer extraction.
 * Signer MUST NOT attest a hash of arbitrary bytes or an empty driver.
 */
import {unzipSync} from 'fflate';
import {validateScormLearnerCompletionPlan} from '../qa/scorm-real-learner-completion.mjs';

const bad=code=>{throw Error('SCORM_GOVERNED_DRIVER_'+code);};
const validPath=name=>typeof name==='string'&&name.length>0&&name.length<350&&
  !name.startsWith('/')&&!name.includes('\\')&&!name.includes('\0')&&
  !name.split('/').includes('..');
const validSelector=s=>typeof s==='string'&&s.trim().length>0&&s.length<=240&&
  !/[\u0000-\u001f]/.test(s);
const SHA=/^[a-f0-9]{64}$/;

export function validateGovernedScormZipDriver(zipBytes,driver,candidate){
  if(!Buffer.isBuffer(zipBytes)&&!(zipBytes instanceof Uint8Array))
    bad('ZIP_BYTES_MISSING');
  if(zipBytes.length<32||zipBytes.length>80*1024*1024)bad('ZIP_SIZE_INVALID');
  if(!driver||!candidate||driver.schemaVersion!==1||
    !SHA.test(driver.packageSha256)||
    driver.packageSha256!==candidate.packageSha256||
    driver.requiresAssessment!==candidate.requiresAssessment)
    bad('PACKAGE_OR_ASSESSMENT_PROFILE_MISMATCH');
  let total=0,count=0,files;
  try{
    files=unzipSync(new Uint8Array(zipBytes),{filter:entry=>{
      if(!validPath(entry.name))bad('ZIP_ENTRY_PATH_UNSAFE');
      count++;total+=Number(entry.originalSize||0);
      if(count>2500||total>250*1024*1024||
        Number(entry.originalSize||0)>75*1024*1024)
        bad('ZIP_UNCOMPRESSED_LIMIT');
      return true;
    }});
  }catch(error){
    if(String(error?.message||'').startsWith('SCORM_GOVERNED_DRIVER_'))throw error;
    bad('ZIP_PARSE_FAILED');
  }
  const manifest=files['imsmanifest.xml'];
  if(!manifest||!/<(?:[a-zA-Z0-9_-]+:)?manifest\b/i.test(
    Buffer.from(manifest).toString('utf8'))||
    !/<(?:[a-zA-Z0-9_-]+:)?resources\b/i.test(
      Buffer.from(manifest).toString('utf8')))bad('SCORM_MANIFEST_MISSING');
  if(!validPath(driver.launchFile)||!files[driver.launchFile]||
    !/\.(?:html|htm)$/i.test(driver.launchFile))bad('LAUNCH_FILE_NOT_IN_ZIP');
  if(!Array.isArray(driver.requiredContent)||driver.requiredContent.length===0||
    driver.requiredContent.length>120||
    driver.requiredContent.some(x=>!x||!validSelector(x.selector)))
    bad('REQUIRED_CONTENT_PLAN_MISSING');
  if(!driver.resume||!driver.resume.assertion||
    !validSelector(driver.resume.assertion.selector)||
    !['visible','hidden','enabled','text'].includes(driver.resume.assertion.state)||
    driver.resume.assertion.state==='text'&&
    (typeof driver.resume.assertion.value!=='string'||
      driver.resume.assertion.value.length===0))
    bad('RESUME_OBSERVATION_MISSING');
  const stages=['resume','pass',...(candidate.requiresAssessment?['fail']:[])];
  let countActions=0;
  for(const stage of stages){
    const actions=driver[stage]?.actions;
    if(!Array.isArray(actions)||actions.length===0)bad('LEARNER_JOURNEY_MISSING_'+stage.toUpperCase());
    countActions+=actions.length;
    for(const action of actions){
      const keys=action&&Object.keys(action).sort().join(',');
      if(!action||!validSelector(action.selector)||
        !['click','fill','press'].includes(action.op)||
        (action.op==='click'?keys!=='op,selector':
          keys!=='op,selector,value'||typeof action.value!=='string'))
        bad('UNSAFE_LEARNER_ACTION');
    }
  }
  if(countActions>120)bad('DRIVER_TOO_LARGE');
  if(candidate.requiresAssessment&&
    (!Number.isFinite(driver.masteryScore)||driver.masteryScore<0||
      driver.masteryScore>100))bad('ASSESSMENT_THRESHOLD_MISSING');
  if(driver.replayCompletion===undefined)
    bad('REPLAY_LEARNER_UI_MISSING');
  validateScormLearnerCompletionPlan(driver);
  return true;
}
