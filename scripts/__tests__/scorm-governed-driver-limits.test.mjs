import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { strToU8, zipSync, unzipSync } from 'fflate';
import { scormGovernedDriverLimits } from '../qa/scorm-governed-driver-limits.mjs';
import { validateGovernedScormZipDriver } from '../ci/validate-scorm-governed-driver.mjs';
import { validateIndependentDriver } from '../qa/scorm-independent-zip-producer.mjs';

function specimen(withContract=true, tamper=false) {
  const slides=Array.from({length:101},(_,i)=>({id:'slide-'+(i+1)}));
  const files={
    'imsmanifest.xml':strToU8('<manifest><resources><resource href="index.html"/></resources></manifest>'),
    'index.html':strToU8('<html><h1>MGM</h1></html>'),
  };
  if(withContract) {
    files['content.js']=strToU8('window.AIRTRUST_CONTENT = '+JSON.stringify({slides})+';\n');
    files['airtrust-completion-manifest.json']=strToU8(JSON.stringify({
      content:{requiredSlides:slides.map(s=>s.id).map((id,i)=>tamper&&i===55?'other':id)},
    }));
  }
  const zip=zipSync(files);
  const sha=createHash('sha256').update(zip).digest('hex');
  const driver={
    schemaVersion:1,packageSha256:sha,requiresAssessment:false,
    launchFile:'index.html',scormVersion:'1.2',
    requiredContent:[{selector:'h1'}],
    resume:{actions:[{op:'click',selector:'#next'}],
      assertion:{selector:'h1',state:'visible'}},
    pass:{actions:Array.from({length:160},()=>({op:'click',selector:'#next'}))},
    completion:{actions:[{op:'click',surface:'sco',selector:'#completeStudy'}]},
    replayCompletion:{actions:[{op:'click',surface:'sco',selector:'#completeStudy'}]},
  };
  return {zip,sha,driver,files:unzipSync(zip),
    candidate:{packageSha256:sha,requiresAssessment:false}};
}

test('101-slide formative package permits authentic 161-step learner journey',()=>{
  const v=specimen();
  const limits=scormGovernedDriverLimits(v.files);
  assert.deepEqual(limits,{maxActions:505,maxContent:120,authoredSlides:101});
  assert.equal(validateGovernedScormZipDriver(v.zip,v.driver,v.candidate),true);
  assert.equal(validateIndependentDriver(v.driver,v.sha,v.files),true);
});

test('hard per-slide bound rejects excessive or forged journeys',()=>{
  const v=specimen();
  v.driver.pass.actions=Array.from({length:550},()=>({op:'click',selector:'#next'}));
  assert.throws(()=>validateGovernedScormZipDriver(v.zip,v.driver,v.candidate),/DRIVER_TOO_LARGE/);
  assert.throws(()=>validateIndependentDriver(v.driver,v.sha,v.files),/DRIVER_TOO_LARGE/);
});

test('missing or inconsistent ZIP content contract never expands limits',()=>{
  for(const v of [specimen(false),specimen(true,true)]) {
    assert.deepEqual(scormGovernedDriverLimits(v.files),
      {maxActions:120,maxContent:120,authoredSlides:null});
    assert.throws(()=>validateGovernedScormZipDriver(v.zip,v.driver,v.candidate),/DRIVER_TOO_LARGE/);
    assert.throws(()=>validateIndependentDriver(v.driver,v.sha,v.files),/DRIVER_TOO_LARGE/);
  }
});
