#!/usr/bin/env node
/**
 * Offline browser protocol smoke for the disposable Player 3 technical ZIP.
 * Tests iframe transport only. Never connects to Cloudflare or certifies users.
 * Invoke explicitly: node scripts/learning-factory/test_player3_technical_browser.cjs
 */
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium,webkit}=require('playwright');

const P='https://qa-parent.airtrust.example';
const C='https://qa-content.airtrust.example';
const EDITION='a'.repeat(64);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'player3-synthetic-browser-qa-'));
async function verify(name,engine,html,script){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage();
    // All network requests are handled by the test process, never remotely.
    await page.route('**/*',route=>route.abort('blockedbyclient'));
    const parent='<html><body><iframe id="qa" src="'+C+'/index.html"></iframe>'+
      '<script>window.events=[];addEventListener("message",e=>window.events.push(e.data));</script>'+
      '</body></html>';
    await page.route(P+'/**',route=>route.fulfill({
      status:200,contentType:'text/html',body:parent,
    }));
    await page.route(C+'/**',route=>route.fulfill({
      status:200,
      contentType:route.request().url().endsWith('.js')?'application/javascript':'text/html',
      body:route.request().url().endsWith('.js')?script:html,
    }));
    await page.goto(P+'/qa',{waitUntil:'load'});
    const frame=page.frameLocator('#qa');
    await frame.locator('#count').waitFor();
    assert.equal(await frame.locator('#count').innerText(),'1/5');
    const send=async data=>page.evaluate(payload=>{
      document.querySelector('#qa').contentWindow.postMessage(payload,
        'https://qa-content.airtrust.example');
    },data);
    const last=async type=>page.evaluate(t=>
      (window.events||[]).filter(e=>e.type===t).at(-1),type);
    await send({type:'AIRTRUST_PLAYER3_RESUME_CURSOR_V1',
      editionSha256:EDITION,nextUnitId:'qa-unit-1'});
    await page.waitForFunction(()=>window.events?.some(e=>e.type==='AIRTRUST_PLAYER3_RESUME_ACK_V1'));
    assert.equal((await last('AIRTRUST_PLAYER3_RESUME_ACK_V1')).unitId,'qa-unit-1');
    assert.equal(await frame.locator('#next').isDisabled(),true);
    await frame.locator('[data-opt="1"]').click();
    await frame.locator('#next').click();
    assert.equal(await frame.locator('#count').innerText(),'2/5');
    await frame.locator('#next').click();
    assert.equal(await frame.locator('#count').innerText(),'3/5');
    async function attempt(label){
      for(let i=0;i<10;i++){
        await frame.locator('[data-answer]',{hasText:label}).click();
        if(i<9)await frame.locator('#qNext').click();
      }
      const count=await page.evaluate(()=>
        window.events.filter(e=>e.type==='AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1').length);
      await frame.locator('#next').click();
      await page.waitForFunction(n=>window.events.filter(e=>
        e.type==='AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1').length>n,count);
      return last('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1');
    }
    const failed=await attempt('Option Alpha');
    assert.equal(failed.answers.length,10);
    assert.equal(failed.stageId,'qa-stage-1');
    assert.equal(await frame.locator('#next').isDisabled(),true);
    // A forged or incomplete backend verdict must not unlock navigation.
    await send({type:'AIRTRUST_PLAYER3_STAGE_VERDICT_V1',editionSha256:EDITION,
      stageId:'qa-stage-1',requestId:failed.requestId,persisted:false,
      stage_passed:true,score_pct:100});
    assert.equal(await frame.locator('#next').isDisabled(),true);
    await send({type:'AIRTRUST_PLAYER3_STAGE_VERDICT_V1',editionSha256:EDITION,
      stageId:'qa-stage-1',requestId:failed.requestId,persisted:true,
      stage_passed:false,score_pct:0});
    await frame.locator('#next').filter({hasText:'Nova tentativa'}).click();
    const passed=await attempt('Option Beta');
    assert.notEqual(passed.requestId,failed.requestId);
    await send({type:'AIRTRUST_PLAYER3_STAGE_VERDICT_V1',editionSha256:EDITION,
      stageId:'qa-stage-1',requestId:passed.requestId,persisted:true,
      stage_passed:true,score_pct:100});
    await frame.locator('#next').filter({hasText:'Continuar'}).click();
    assert.equal(await frame.locator('#count').innerText(),'4/5');
    await frame.locator('#next').click();
    assert.equal(await frame.locator('#count').innerText(),'5/5');
    await frame.locator('#next').click();
    await page.waitForFunction(()=>window.events?.some(e=>e.type==='AIRTRUST_PLAYER3_CONTENT_END_HINT_V1'));
    assert.equal((await last('AIRTRUST_PLAYER3_CONTENT_END_HINT_V1')).unitId,'qa-unit-5');
    assert.equal(await page.evaluate(()=>window.events.some(e=>
      String(e.type).toLowerCase().includes('complete'))),false);
    console.log(name.toUpperCase()+'_OFFLINE_TRANSPORT=PASS');
  }finally{await browser.close();}
}
(async()=>{
  try{
    const output=path.join(temp,'build');
    execFileSync('python3',[path.join(__dirname,'generate_player3_technical_zip.py'),
      '--out',output,'--parent-origin',P,'--edition-sha256',EDITION],
      {stdio:'pipe'});
    const archive=path.join(output,'player3-technical-only.zip');
    const html=execFileSync('unzip',['-p',archive,'index.html'],{encoding:'utf8'});
    const js=execFileSync('unzip',['-p',archive,'app.js'],{encoding:'utf8'});
    await verify('chromium',chromium,html,js);
    await verify('webkit',webkit,html,js);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(err=>{console.error(err);process.exitCode=1});
