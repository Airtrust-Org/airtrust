'use strict';
/**
 * PRIVATE, DISPOSABLE-ONLY end-to-end learner probe for exact MGM ZIP.
 * No fake certificate, no production, no staging attestations, no credentials in logs.
 */
const fs=require('fs');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {chromium,webkit}=require('@playwright/test');
const root=require('node:path').resolve('worker-airtrust/.wrangler/scorm-browser-qa');
const fixture=JSON.parse(fs.readFileSync(root+'/fixture.json'));
const auth=JSON.parse(fs.readFileSync(root+'/local-auth.json'));
const SHA=process.env.AIRTRUST_SCORM_QA_EXPECTED_SHA||'';
if(!/^[0-9a-f]{64}$/.test(SHA))throw Error('EXPECTED_PRIVATE_ZIP_SHA_REQUIRED');
if(process.env.CLOUDFLARE_API_TOKEN||process.env.AIRTRUST_REMOTE_DB||
  process.env.CLOUDFLARE_ACCOUNT_ID)throw Error('REMOTE_CREDENTIALS_FORBIDDEN');
const digest=createHash('sha256').update(fs.readFileSync(fixture.zipPath)).digest('hex');
if(digest!==SHA||fixture.packageSha256!==SHA||
   fixture.fixtureKind!=='LOCAL_DISPOSABLE_REAL_ZIP'||
   fixture.origin!=='http://127.0.0.1:8787'||
   !require('node:path').resolve(fixture.zipPath).startsWith(root+'/')||
   !fixture.dbFile.includes('/.wrangler/state/')||
   auth.packageSha256!==SHA||auth.origin!==fixture.origin)
   throw Error('DISPOSABLE_SHA_SCOPE_DENIED');
const driver=JSON.parse(fs.readFileSync(root+'/driver.json','utf8'));
if(driver.kind!=='LOCAL_NAVIGATION_DIAGNOSTIC_ONLY'||
   driver.activationAuthorized!==false||driver.packageSha256!==SHA)
   throw Error('UNTRUSTED_DRIVER_DENIED');
const api=fixture.origin+'/api';
const report={scope:'LOCAL_DISPOSABLE_D1_R2_ONLY',packageSha256:SHA,certified:false,source:'MGM_FULL_FORMATIVE_LOCAL_PROBE_V1',browsers:[]};
const read=(id)=>{
 const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
 try{return {
  enrollment:db.prepare('SELECT status,progresso_pct,qualificacao_historico_id FROM lms_matriculas WHERE id=? AND empresa_id=?').get(id,fixture.companyId),
  scorm:db.prepare('SELECT lesson_status,suspend_data,cmi_json,score_raw FROM lms_progresso_scorm WHERE matricula_id=? AND empresa_id=?').get(id,fixture.companyId),
  histories:db.prepare('SELECT COUNT(*) AS n FROM qualificacoes_historico WHERE empresa_id=? AND lms_matricula_id=? AND deleted_at IS NULL').get(fixture.companyId,id).n
 };}finally{db.close()}
};
async function exercise(name,browserType,enrollment){
 const result={browser:name,steps:0,scenarios:0,gateClicks:0,format:'FORMATIVE',
    initial:null,afterFinish:null,afterExplicitRequest:null,errors:[],outcome:'INCONCLUSIVE'};
 let browser;
 try{
  browser=await browserType.launch({headless:true});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1320,height:790}});
  await ctx.route('**/*',r=>r.request().url().startsWith(fixture.origin+'/')?r.continue():r.abort('blockedbyclient'));
  const page=await ctx.newPage();
  page.on('pageerror',e=>result.errors.push(String(e.message).slice(0,220)));
  const headers={Authorization:'Bearer '+auth.accessToken};
  const makeSession=async()=>{
    const r=await page.request.post(api+'/lms/assets/session',{headers,data:{matricula_id:enrollment}});
    if(!r.ok())throw Error('ASSET_SESSION_HTTP_'+r.status());
    await page.goto(api+'/health');
    await page.setContent('<iframe id="outer" title="Test MGM" src="'+api+'/lms/scorm/launch/'+enrollment+'" style="width:100vw;height:90vh"></iframe>');
    const sco=page.frameLocator('#outer').frameLocator('#scorm-frame');
    await sco.locator('#viewport .screen').waitFor({state:'visible',timeout:25000});
    await page.waitForTimeout(200);
    return sco;
  };
  let sco=await makeSession();
  result.initial=read(enrollment).enrollment;
  let counter=0;
  for(;counter<101;counter++){
    const state=await sco.locator('body').evaluate(()=>window.__AIRTRUST_PLAYER_TEST__?.getState());
    if(!state)throw Error('NO_FACTORY_STATE_'+counter);
    if(state.active!==counter)throw Error('MGM_CURSOR_DRIFT_'+counter+'_ACTUAL_'+state.active);
    const meta=await sco.locator('body').evaluate(()=>({
      index:window.__AIRTRUST_PLAYER_TEST__.getState().active,
      kind:window.COURSE_DATA.slides[window.__AIRTRUST_PLAYER_TEST__.getState().active].kind,
      options:window.COURSE_DATA.slides[window.__AIRTRUST_PLAYER_TEST__.getState().active].options||[]
    }));
    const gates=sco.locator('#viewport [data-gate]');
    const n=await gates.count();
    for(let i=0;i<n;i++){await gates.nth(i).click();result.gateClicks++;}
    const options=sco.locator('#viewport [data-opt]');
    if(await options.count()){
       const correct=meta.options.findIndex(o=>o[1]===true);
       if(correct<0)throw Error('NO_CORRECT_SCENARIO_OPTION_'+counter);
       await options.nth(correct).click();
       result.scenarios++;
    }
    const next=sco.locator('#next');
    if(await next.isDisabled())throw Error('ADVANCE_DISABLED_'+counter+'_KIND_'+meta.kind);
    await next.click();
    result.steps++;
  }
  result.afterFinish=read(enrollment);
  // The SCO's final action is explicit, but the React player has a separate
  // "Confirm course completion" message. Test that separately; do NOT
  // classify this synthetic UI request as trusted certification.
  await page.evaluate(id=>{
    const outer=document.getElementById('outer');
    outer.contentWindow.postMessage({type:'lms:request-completion',matriculaId:id},location.origin);
  },enrollment);
  await page.waitForTimeout(2500);
  result.afterExplicitRequest=read(enrollment);
  result.outcome=(
    result.afterFinish.enrollment?.status!=='CONCLUIDO'&&
    result.afterExplicitRequest.enrollment?.status==='CONCLUIDO'&&
    Number(result.afterExplicitRequest.enrollment?.progresso_pct)===100&&
    result.afterExplicitRequest.histories===0&&
    result.afterExplicitRequest.scorm?.lesson_status==='completed'&&
    result.steps===101&&result.scenarios===14&&result.errors.length===0
  )?'LOCAL_FORMATIVE_COMPLETION_OBSERVED_NOT_CERTIFIED':'LOCAL_COMPLETION_NOT_OBSERVED';
  await ctx.close();
 }catch(e){result.error=String(e.message||e).slice(0,420)}
 finally{if(browser)await browser.close()}
 return result;
}
(async()=>{
  const db=new DatabaseSync(fixture.dbFile);
  try{
    // LOCAL DISPOSABLE COURSE ONLY; never change remote policy.
    const affected=db.prepare("UPDATE lms_cursos SET scorm_assessment_policy='FORMATIVE',scorm_mastery_score=NULL,gerar_qualificacao_ao_concluir=0 WHERE id=? AND empresa_id=? AND titulo='SCORM Browser QA'").run(fixture.courseId,fixture.companyId).changes;
    if(affected!==1)throw Error('SYNTHETIC_LOCAL_POLICY_GUARD');
  }finally{db.close()}
  for(const [name,browser,id] of [['CHROMIUM',chromium,fixture.enrollments.chromium],['WEBKIT',webkit,fixture.enrollments['webkit-ipad']]]){
    report.browsers.push(await exercise(name,browser,id));
  }
  fs.writeFileSync(root+'/mgm-formative-completion-local-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({sha:SHA,certified:false,results:report.browsers.map(x=>({
    browser:x.browser,steps:x.steps,scenarios:x.scenarios,gateClicks:x.gateClicks,
    afterFinishStatus:x.afterFinish?.enrollment?.status,afterExplicitStatus:x.afterExplicitRequest?.enrollment?.status,
    outcome:x.outcome,error:x.error,jsErrors:x.errors?.length
  }))},null,2));
  if(report.browsers.some(x=>x.error||x.outcome!=='LOCAL_FORMATIVE_COMPLETION_OBSERVED_NOT_CERTIFIED'))process.exitCode=1;
})().catch(e=>{console.error(String(e));process.exitCode=1});
