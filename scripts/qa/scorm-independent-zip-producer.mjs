#!/usr/bin/env node
/**
 * Independent, offline, per-ZIP browser probe. Real ZIP bytes are served from
 * a loopback-only host, never the learner's published course or staging D1/R2.
 * The author-reviewed driver is OUTSIDE the ZIP and cannot write CMI directly.
 * This is diagnostic evidence only, never the trusted staging attestation.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {unzipSync} from 'fflate';
import {chromium,webkit,expect} from '@playwright/test';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const SHA=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error('SCORM_ZIP_PROBE_'+code);};
// Only deterministic observations after the real SCO has loaded may prove a
// package defect. Browser crashes, timeouts, missing UI/driver selectors and
// unavailable engines remain inconclusive (never FAIL or PASS).
const CONFIRMED_PACKAGE_DEFECTS=new Set([
  'INITIALIZE_MISSING','RESUME_INITIALIZE_MISSING','SUSPEND_COMMIT_MISSING',
  'PASS_INITIALIZE_MISSING','PASS_COMMIT_MISSING','PASS_STATUS_NOT_COMMITTED',
  'PASS_SCORE_NOT_COMMITTED','TERMINAL_STATUS_DOWNGRADE',
]);
export function classifyIndependentProbeError(error){
  const diagnostic=String(error?.message||error);
  const match=/^SCORM_ZIP_PROBE_([A-Z_]+)$/.exec(diagnostic);
  return match&&CONFIRMED_PACKAGE_DEFECTS.has(match[1])?'FAIL':'INCONCLUSIVE';
}
/** This is a local observation classification, not an activation decision.
 * FUNCTIONAL_CERTIFIED is reserved for the separately signed/staging-verified
 * Worker attestation. This offline producer can NEVER return that status. */
export function classifyIndependentProbeRuns(runs){
  if(!Array.isArray(runs)||runs.length!==2)return 'INCONCLUSIVE';
  for(const browser of ['CHROMIUM','WEBKIT']){
    if(runs.filter(run=>run?.browser===browser).length!==1)return 'INCONCLUSIVE';
  }
  if(runs.some(run=>run.classification==='FAIL'))return 'FAIL';
  if(runs.every(run=>run.outcome==='OBSERVED_IN_LOCAL_EMULATOR'&&
    run.classification==='PROTOCOL_PASS'&&run.checks?.finishObserved===true))
    return 'PROTOCOL_PASS';
  return 'INCONCLUSIVE';
}
const check=(yes,code)=>{if(!yes)fail(code);};
const statusOf=values=>{
  const success=String(values['cmi.success_status']||'').toLowerCase();
  if(success==='passed'||success==='failed')return success;
  const lesson=String(values['cmi.core.lesson_status']||'').toLowerCase();
  if(['passed','failed','completed'].includes(lesson))return lesson;
  return String(values['cmi.completion_status']||lesson).toLowerCase();
};
const scoreOf=values=>{
  const raw=values['cmi.score.raw'];
  return Number(raw!==undefined&&raw!==''?raw:values['cmi.core.score.raw']);
};
const safeName=name=>typeof name==='string'&&name.length>0&&name.length<350&&
  !name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..')&&
  !name.includes('\0');
const launchPath=name=>'/'+name.split('/').map(encodeURIComponent).join('/');
const MIME={html:'text/html',htm:'text/html',js:'application/javascript',
  css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png',
  jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',woff:'font/woff',
  woff2:'font/woff2',mp4:'video/mp4',mp3:'audio/mpeg',pdf:'application/pdf',xml:'application/xml'};

export function validateIndependentDriver(driver,sha,files){
  check(driver&&driver.schemaVersion===1,'DRIVER_SCHEMA_INVALID');
  check(SHA.test(driver.packageSha256)&&driver.packageSha256===sha,'DRIVER_ZIP_SHA_MISMATCH');
  check(safeName(driver.launchFile)&&files[driver.launchFile],'LAUNCH_FILE_NOT_IN_ZIP');
  check(driver.scormVersion===undefined||['1.2','2004'].includes(driver.scormVersion),
    'SCORM_VERSION_UNSUPPORTED');
  check(typeof driver.requiresAssessment==='boolean','ASSESSMENT_PROFILE_MISSING');
  check(Array.isArray(driver.requiredContent)&&driver.requiredContent.length>0,
    'REQUIRED_CONTENT_INVENTORY_MISSING');
  check(driver.resume&&Array.isArray(driver.resume.actions)&&
    driver.resume.actions.length>0&&driver.resume.assertion?.selector,
    'RESUME_DRIVER_MISSING');
  check(driver.pass&&Array.isArray(driver.pass.actions)&&driver.pass.actions.length>0,
    'PASS_DRIVER_MISSING');
  if(driver.requiresAssessment){
    check(Number.isFinite(driver.masteryScore)&&driver.masteryScore>=0&&
      driver.masteryScore<=100,'MASTERY_SCORE_MISSING');
    check(driver.fail&&Array.isArray(driver.fail.actions)&&
      driver.fail.actions.length>0,'FAIL_DRIVER_MISSING');
  }
  const actions=[...driver.resume.actions,...driver.pass.actions,
    ...(driver.fail?.actions||[])];
  for(const a of actions){
    check(a&&typeof a.selector==='string'&&a.selector.length>0&&
      a.selector.length<=240&&['click','fill','press'].includes(a.op),
      'UNSUPPORTED_ACTION');
    if(a.op!=='click')check(typeof a.value==='string','ACTION_VALUE_MISSING');
  }
  check(actions.length<=120&&driver.requiredContent.length<=120,'DRIVER_TOO_LARGE');
  for(const entry of driver.requiredContent){
    check(typeof entry.selector==='string'&&entry.selector.length>0,'CONTENT_SELECTOR_MISSING');
  }
  check(['visible','enabled','hidden','text'].includes(driver.resume.assertion.state),
    'RESUME_ASSERTION_INVALID');
  if(driver.resume.assertion.state==='text')
    check(typeof driver.resume.assertion.value==='string','RESUME_ASSERTION_TEXT_MISSING');
  return true;
}

export function unzipCandidate(bytes){
  check(bytes.length>0&&bytes.length<=80*1024*1024,'ZIP_SIZE_INVALID');
  let count=0,total=0;
  const files=unzipSync(new Uint8Array(bytes),{filter:info=>{
    check(safeName(info.name),'ZIP_ENTRY_PATH_UNSAFE');
    count++;total+=Number(info.originalSize||0);
    check(count<=2500&&total<=250*1024*1024&&Number(info.originalSize||0)<=75*1024*1024,
      'ZIP_UNCOMPRESSED_LIMIT');
    return true;
  }});
  check(Object.keys(files).length>0,'ZIP_EMPTY');
  return files;
}

function htmlFor(seed,launch){
  // Emulated SCORM API deliberately lives outside the ZIP. Events originate
  // from calls made by real SCO JavaScript after actual Playwright interactions.
  const script=[
    '(function(){',
    'const values=Object.assign({"cmi.core.lesson_status":"not attempted",',
    '"cmi.completion_status":"unknown","cmi.success_status":"unknown",',
    '"cmi.core.score.raw":"","cmi.score.raw":"","cmi.suspend_data":""},',
    JSON.stringify(seed).replace(/</g,'\\u003c'),');',
    'let committed=Object.assign({},values);',
    'const events=[];let initialized=false;',
    'function log(type,k,v){events.push({type,key:k||"",value:v===undefined?"":String(v)});}',
    'function init(){initialized=true;log("Initialize");return "true";}',
    'function get(k){log("GetValue",k);return String(values[k]??"");}',
    'function set(k,v){values[k]=String(v);log("SetValue",k,v);return "true";}',
    'function commit(){if(!initialized)return "false";committed=Object.assign({},values);log("Commit");return "true";}',
    'function finish(){if(!initialized)return "false";committed=Object.assign({},values);log("Finish");initialized=false;return "true";}',
    'window.__QA_SCORM__={values,events,get committed(){return committed;}};',
    'window.API={LMSInitialize:init,LMSGetValue:get,LMSSetValue:set,',
    'LMSCommit:commit,LMSFinish:finish,LMSGetLastError:()=>"0",',
    'LMSGetErrorString:()=>"No error",LMSGetDiagnostic:()=>""};',
    'window.API_1484_11={Initialize:init,GetValue:get,SetValue:set,',
    'Commit:commit,Terminate:finish,GetLastError:()=>"0",',
    'GetErrorString:()=>"No error",GetDiagnostic:()=>""};',
    '})();'
  ].join('');
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script>'+script+'</script><iframe id="sco" title="Independent SCORM ZIP probe" '+
    'src="'+launchPath(launch)+'" style="width:100vw;height:96vh"></iframe></body></html>';
}

async function startServer(files,launch){
  const seeds=new Map();
  const server=createServer((req,res)=>{
    const u=new URL(req.url||'/', 'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(u.pathname==='/__qa__/host'){
      const seed=seeds.get(u.searchParams.get('id'));seeds.delete(u.searchParams.get('id'));
      if(!seed){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(htmlFor(seed,launch));return;
    }
    let name;
    try{name=decodeURIComponent(u.pathname.slice(1));}catch{res.writeHead(400);res.end();return;}
    if(!safeName(name)||!files[name]){res.writeHead(404);res.end();return;}
    const ext=name.split('.').pop()?.toLowerCase()||'';
    res.writeHead(200,{'Content-Type':(MIME[ext]||'application/octet-stream')});
    res.end(Buffer.from(files[name]));
  });
  await new Promise((ok,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',ok);
  });
  const addr=server.address();
  const base='http://127.0.0.1:'+addr.port;
  return {seeds,base,close:()=>new Promise(ok=>server.close(ok))};
}

async function exercise(browserName,browserType,driver,host){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(host.base+'/'))return route.continue();
    return route.abort('blockedbyclient'); // No CDN, telemetry or external credentials
  });
  let page;
  const open=async seed=>{
    const id=randomUUID();host.seeds.set(id,seed);
    page=await context.newPage();
    await page.goto(host.base+'/__qa__/host?id='+id,{waitUntil:'load',timeout:30000});
    const frame=page.frameLocator('#sco');
    await frame.locator('body').waitFor({state:'attached',timeout:20000});
    return frame;
  };
  const snapshot=async()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__QA_SCORM__)));
  const actions=async (frame,rows)=>{
    for(const action of rows){
      const el=frame.locator(action.selector);
      if(action.op==='click')await el.click({timeout:20000});
      else if(action.op==='fill')await el.fill(action.value,{timeout:20000});
      else await el.press(action.value,{timeout:20000});
    }
  };
  const awaitStatus=async wanted=>{
    await expect.poll(async()=>statusOf((await snapshot()).values),{timeout:20000}).toBe(wanted);
  };
  try{
    let frame=await open({});
    for(const item of driver.requiredContent)
      await expect(frame.locator(item.selector)).toBeVisible({timeout:20000});
    const initial=await snapshot();
    check(initial.events.some(e=>e.type==='Initialize'),'INITIALIZE_MISSING');
    const baseline=String(initial.committed['cmi.suspend_data']||'');
    await actions(frame,driver.resume.actions);
    try{
      await expect.poll(async()=>{
        const value=String((await snapshot()).committed['cmi.suspend_data']||'');
        return value!==''&&value!==baseline;
      },{timeout:20000}).toBe(true);
    }catch{
      fail('SUSPEND_ACTION_NOT_COMMITTED_OR_TIMEOUT');
    }
    const before=await snapshot();
    const suspend=before.committed['cmi.suspend_data'];
    check(before.events.some(e=>e.type==='Commit'),'SUSPEND_COMMIT_MISSING');
    check(suspend!==baseline,'SUSPEND_ACTION_NOT_COMMITTED');
    await page.close();
    frame=await open(before.committed);
    const assertion=driver.resume.assertion;
    const node=frame.locator(assertion.selector);
    if(assertion.state==='visible')await expect(node).toBeVisible();
    if(assertion.state==='enabled')await expect(node).toBeEnabled();
    if(assertion.state==='hidden')await expect(node).toBeHidden();
    if(assertion.state==='text')await expect(node).toContainText(assertion.value);
    const resumed=await snapshot();
    check(resumed.events.some(e=>e.type==='Initialize'),'RESUME_INITIALIZE_MISSING');
    check(resumed.values['cmi.suspend_data']===suspend,'RESUME_CMI_CHANGED');
    await page.close();
    let failure=null;
    if(driver.requiresAssessment){
      frame=await open({});
      await actions(frame,driver.fail.actions);
      await awaitStatus(driver.fail.expectedStatus||'failed');
      const observed=await snapshot();
      check(Number.isFinite(scoreOf(observed.values))&&
        scoreOf(observed.values)<driver.masteryScore,'FAILURE_THRESHOLD_NOT_PROVEN');
      failure={status:statusOf(observed.values),score:scoreOf(observed.values)};
      await page.close();
    }
    frame=await open({});
    await actions(frame,driver.pass.actions);
    await awaitStatus(driver.pass.expectedStatus||
      (driver.requiresAssessment?'passed':'completed'));
    const passed=await snapshot();
    const terminal=statusOf(passed.values);
    if(driver.requiresAssessment)
      check(Number.isFinite(scoreOf(passed.values))&&
        scoreOf(passed.values)>=driver.masteryScore,'PASS_THRESHOLD_NOT_PROVEN');
    check(passed.events.some(e=>e.type==='Initialize'),'PASS_INITIALIZE_MISSING');
    check(passed.events.some(e=>e.type==='Commit'),'PASS_COMMIT_MISSING');
    check(statusOf(passed.committed)===terminal,'PASS_STATUS_NOT_COMMITTED');
    if(driver.requiresAssessment)
      check(scoreOf(passed.committed)===scoreOf(passed.values),'PASS_SCORE_NOT_COMMITTED');
    await page.close();
    frame=await open(passed.committed);
    await frame.locator('body').waitFor({state:'attached'});
    const reopened=await snapshot();
    check(statusOf(reopened.values)===terminal,'TERMINAL_STATUS_DOWNGRADE');
    // Teardown is initiated by the outside harness, not by injecting a SCORM
    // status or finish call. Observe that the SCO itself invokes Finish.
    await page.evaluate(()=>document.getElementById('sco')?.remove());
    let finishObserved=false;
    try{
      await expect.poll(async()=> (await snapshot()).events.filter(e=>e.type==='Finish').length,
        {timeout:3000}).toBe(1);
      finishObserved=true;
    }catch{ /* No conformance PASS without an observed Finish. */ }
    check(finishObserved,'FINISH_NOT_OBSERVED');
    await page.close();
    return {browser:browserName,outcome:'OBSERVED_IN_LOCAL_EMULATOR',
      classification:'PROTOCOL_PASS',
      checks:{requiredContent:true,suspendResume:true,assessmentFailure:failure,
        assessmentPass:{status:terminal,score:scoreOf(passed.values)},
        reopenWithoutDowngrade:true,finishObserved:true},
      apiTraceSha256:hash(Buffer.from(JSON.stringify(passed.events))),
      limitations:['NO_AUTHENTICATED_STAGING_WORKER','NO_BACKEND_CMI_READBACK',
        'NO_CYCLE_ROTATION','NO_QUALIFICATION_OR_CERTIFICATE_PDF']};
  }finally{
    await context.close();await browser.close();
  }
}

export async function runIndependentZipProbe({zipPath,driverPath,outputPath}){
  const bytes=readFileSync(zipPath);
  const packageSha256=hash(bytes);
  const driverBytes=readFileSync(driverPath);
  const driver=JSON.parse(driverBytes.toString('utf8'));
  const files=unzipCandidate(bytes);
  validateIndependentDriver(driver,packageSha256,files);
  const host=await startServer(files,driver.launchFile);
  const runs=[];
  try{
    for(const [browserName,browser] of [['CHROMIUM',chromium],['WEBKIT',webkit]]){
      try {runs.push(await exercise(browserName,browser,driver,host));}
      catch(error){
        const classification=classifyIndependentProbeError(error);
        runs.push({browser:browserName,outcome:classification,
          classification,
          diagnostic:String(error?.message||error).slice(0,350),
          limitations:['NO_AUTHENTICATED_STAGING_WORKER','NO_BACKEND_CMI_READBACK']});
      }
    }
  }finally{await host.close();}
  const report={schemaVersion:1,source:'AIRTRUST_LOCAL_INDEPENDENT_ZIP_PROBE_V1',
    scope:'LOCAL_SCORM_API_EMULATOR',status:'UNCERTIFIED',activationAuthorized:false,
    classification:classifyIndependentProbeRuns(runs),
    packageSha256,zipBytes:bytes.length,driverSha256:hash(driverBytes),
    launchFile:driver.launchFile,requiresAssessment:driver.requiresAssessment,
    harnessSourceSha:/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')?process.env.GITHUB_SHA:null,
    browsers:runs,missing:['GOVERNED_STAGING_EXACT_PACKAGE_LAUNCH',
      'AUTHENTICATED_BACKEND_PERSISTENCE','GOVERNED_CYCLE_AND_TENANT_PROOF',
      'DISTINCT_BACKEND_CERTIFICATE_PDFS','TRUSTED_STAGING_SIGNATURE']};
  mkdirSync(dirname(outputPath),{recursive:true});
  writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [zipPath,driverPath,outputPath]=process.argv.slice(2);
  if(!zipPath||!driverPath||!outputPath)fail('USAGE_ZIP_DRIVER_OUTPUT');
  runIndependentZipProbe({zipPath,driverPath,outputPath}).then(r=>{
    console.log(JSON.stringify({status:r.status,classification:r.classification,sha256:r.packageSha256,
      browsers:r.browsers.map(x=>({browser:x.browser,outcome:x.outcome})),
      output:outputPath}));
  }).catch(e=>{console.error(String(e.message).slice(0,300));process.exitCode=1;});
}
