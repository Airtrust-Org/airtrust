import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {validateNavigationDiagnostic} from '../qa/scorm-navigation-diagnostic-driver.mjs';
import {buildResumeDriver,RESUME_ZIP_SHA} from '../qa/make-scorm-resume-local-driver.mjs';
test('scoped navigation driver matches deterministic ZIP and cannot certify',()=>{
 const dir=mkdtempSync(join(tmpdir(),'airtrust-resume-'));
 try{
  const zip=join(dir,'candidate.zip'),out=join(dir,'driver.json');
  execFileSync('python3',['scripts/qa/build-scorm-resume-synthetic.py',
    '--output',zip,'--json-output',join(dir,'metadata.json')]);
  const bytes=new Uint8Array(readFileSync(zip));
  const d=buildResumeDriver(bytes);
  assert.equal(d.packageSha256,RESUME_ZIP_SHA);
  assert.equal(d.kind,'LOCAL_NAVIGATION_DIAGNOSTIC_ONLY');
  assert.equal(d.activationAuthorized,false);
  assert.deepEqual(d.resume.actions.map(x=>x.selector),['#next','#finish']);
  assert.equal(validateNavigationDiagnostic(d,RESUME_ZIP_SHA,unzipSync(bytes)),true);
  execFileSync(process.execPath,['scripts/qa/make-scorm-resume-local-driver.mjs',zip,out],
    {env:{...process.env,CLOUDFLARE_API_TOKEN:'',AIRTRUST_REMOTE_DB:''}});
  assert.deepEqual(JSON.parse(readFileSync(out,'utf8')),d);
  assert.throws(()=>buildResumeDriver(new Uint8Array([...bytes,0])),/SHA_DRIFT/);
  for(const field of ['certified','requiresAssessment','pass','fail'])
   assert.equal(Object.hasOwn(d,field),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
