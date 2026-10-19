import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {buildInteractiveM8QaFiles} from '../staging/lms-scorm-m8-fixture.mjs';
import {validateIndependentDriver,runIndependentZipProbe,
  classifyIndependentProbeError,classifyIndependentProbeRuns
} from '../qa/scorm-independent-zip-producer.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const driverFor=packageSha256=>({
  schemaVersion:1,packageSha256,launchFile:'index.html',requiresAssessment:true,
  masteryScore:70,
  requiredContent:[{selector:'h1'},{selector:'img[alt="Fluxo de verificação"]'}],
  resume:{actions:[{op:'click',selector:'button[data-answer="1"]'}],
    assertion:{selector:'#submitAssessment',state:'enabled'}},
  fail:{actions:[{op:'click',selector:'button[data-answer="0"]'},
    {op:'click',selector:'#submitAssessment'}],expectedStatus:'failed'},
  pass:{actions:[{op:'click',selector:'button[data-answer="1"]'},
    {op:'click',selector:'#submitAssessment'},
    {op:'click',selector:'#completeCourse'}],expectedStatus:'passed'},
});
function fixture({uncommittedResume=false}={}){
  const content=buildInteractiveM8QaFiles('qa-browser','probe-v1');
  if(uncommittedResume){
    const original=new TextDecoder().decode(content['app.js']);
    const committed="modelState.q['qa-interaction-1'] = selected;\n      persistModelState();";
    assert.ok(original.includes(committed));
    content['app.js']=strToU8(original.replace(committed,
      "modelState.q['qa-interaction-1'] = selected;\n      api.LMSSetValue('cmi.suspend_data', JSON.stringify(modelState));"));
  }
  const manifest='<manifest xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" '+
    'xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><organizations/><resources>'+
    '<resource identifier="R" type="webcontent" adlcp:scormtype="sco" href="index.html"/>'+
    '</resources></manifest>';
  const zip=zipSync({...content,'imsmanifest.xml':strToU8(manifest)},{level:6});
  return {zip,driver:driverFor(sha(zip))};
}
test('driver is tied to immutable ZIP SHA and reviewed DOM script',()=>{
  const {zip,driver}=fixture();
  assert.equal(validateIndependentDriver(driver,sha(zip),{'index.html':Buffer.from('ok')}),true);
  assert.throws(()=>validateIndependentDriver({...driver,packageSha256:'a'.repeat(64)},
    sha(zip),{'index.html':Buffer.from('ok')}),/ZIP_SHA_MISMATCH/);
  assert.throws(()=>validateIndependentDriver({...driver,fail:null},
    sha(zip),{'index.html':Buffer.from('ok')}),/FAIL_DRIVER_MISSING/);
  assert.throws(()=>validateIndependentDriver({...driver,resume:{actions:[],assertion:{selector:'#x',state:'visible'}}},
    sha(zip),{'index.html':Buffer.from('ok')}),/RESUME_DRIVER_MISSING/);
});
test('uncommitted suspend changes cannot be reported as persisted or resumed',async()=>{
  const {zip,driver}=fixture({uncommittedResume:true});
  const dir=mkdtempSync(join(tmpdir(),'scorm-uncommitted-probe-'));
  try{
    const z=join(dir,'candidate.zip'),d=join(dir,'driver.json'),o=join(dir,'report.json');
    writeFileSync(z,zip);writeFileSync(d,JSON.stringify(driver));
    const report=await runIndependentZipProbe({zipPath:z,driverPath:d,outputPath:o});
    assert.equal(report.status,'UNCERTIFIED');
    assert.equal(report.activationAuthorized,false);
    assert.equal(report.classification,'INCONCLUSIVE');
    for(const run of report.browsers){
      assert.equal(run.outcome,'INCONCLUSIVE');
      assert.equal(run.classification,'INCONCLUSIVE');
      assert.match(run.diagnostic,/SUSPEND_ACTION_NOT_COMMITTED/);
      assert.equal(run.checks?.suspendResume,undefined);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('real ZIP bytes yield browser observations without a forged staging certificate',async()=>{
  const {zip,driver}=fixture();
  const dir=mkdtempSync(join(tmpdir(),'scorm-real-zip-probe-'));
  try{
    const z=join(dir,'candidate.zip'),d=join(dir,'driver.json'),o=join(dir,'report.json');
    writeFileSync(z,zip);writeFileSync(d,JSON.stringify(driver));
    const report=await runIndependentZipProbe({zipPath:z,driverPath:d,outputPath:o});
    assert.equal(report.status,'UNCERTIFIED');
    assert.equal(report.activationAuthorized,false);
    assert.equal(report.packageSha256,sha(readFileSync(z)));
    assert.equal(report.classification,'PROTOCOL_PASS');
    assert.deepEqual(report.browsers.map(r=>r.browser),['CHROMIUM','WEBKIT']);
    for(const run of report.browsers){
      assert.equal(run.outcome,'OBSERVED_IN_LOCAL_EMULATOR',
        run.browser+': '+String(run.diagnostic||''));
      assert.equal(run.checks.suspendResume,true);
      assert.equal(run.checks.assessmentFailure.score,0);
      assert.equal(run.checks.assessmentPass.score,100);
      assert.equal(run.checks.reopenWithoutDowngrade,true);
      assert.equal(run.checks.finishObserved,true);
      assert.equal(run.classification,'PROTOCOL_PASS');
    }
    assert.ok(report.missing.includes('GOVERNED_STAGING_EXACT_PACKAGE_LAUNCH'));
    assert.equal(JSON.parse(readFileSync(o,'utf8')).status,'UNCERTIFIED');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('infra, missing engine and incomplete browser evidence are never promoted to FAIL or PASS',()=>{
  assert.equal(classifyIndependentProbeError(Error('browserType.launch: Executable does not exist')),
    'INCONCLUSIVE');
  assert.equal(classifyIndependentProbeError(Error('Timeout 30000ms exceeded')),'INCONCLUSIVE');
  assert.equal(classifyIndependentProbeError(Error('SCORM_ZIP_PROBE_FINISH_NOT_OBSERVED')),
    'INCONCLUSIVE');
  assert.equal(classifyIndependentProbeError(Error('SCORM_ZIP_PROBE_PASS_SCORE_NOT_COMMITTED')),
    'FAIL');
  const good=browser=>({browser,outcome:'OBSERVED_IN_LOCAL_EMULATOR',
    classification:'PROTOCOL_PASS',checks:{finishObserved:true}});
  assert.equal(classifyIndependentProbeRuns([good('CHROMIUM')]),'INCONCLUSIVE');
  assert.equal(classifyIndependentProbeRuns([good('CHROMIUM'),good('CHROMIUM')]),
    'INCONCLUSIVE');
  assert.equal(classifyIndependentProbeRuns([good('CHROMIUM'),
    {browser:'WEBKIT',outcome:'INCONCLUSIVE',classification:'INCONCLUSIVE'}]),'INCONCLUSIVE');
  assert.equal(classifyIndependentProbeRuns([good('CHROMIUM'),
    {browser:'WEBKIT',outcome:'FAIL',classification:'FAIL'}]),'FAIL');
  assert.equal(classifyIndependentProbeRuns([good('CHROMIUM'),good('WEBKIT')]),
    'PROTOCOL_PASS');
  assert.equal(classifyIndependentProbeRuns([good('CHROMIUM'),{
    ...good('WEBKIT'),checks:{finishObserved:false}}]),'INCONCLUSIVE');
});
