import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {buildInteractiveM8QaFiles} from '../staging/lms-scorm-m8-fixture.mjs';
import {validateIndependentDriver,runIndependentZipProbe} from '../qa/scorm-independent-zip-producer.mjs';

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
function fixture(){
  const content=buildInteractiveM8QaFiles('qa-browser','probe-v1');
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
    assert.deepEqual(report.browsers.map(r=>r.browser),['CHROMIUM','WEBKIT']);
    for(const run of report.browsers){
      assert.equal(run.outcome,'OBSERVED_IN_LOCAL_EMULATOR',
        run.browser+': '+String(run.diagnostic||''));
      assert.equal(run.checks.suspendResume,true);
      assert.equal(run.checks.assessmentFailure.score,0);
      assert.equal(run.checks.assessmentPass.score,100);
      assert.equal(run.checks.reopenWithoutDowngrade,true);
    }
    assert.ok(report.missing.includes('GOVERNED_STAGING_EXACT_PACKAGE_LAUNCH'));
    assert.equal(JSON.parse(readFileSync(o,'utf8')).status,'UNCERTIFIED');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
