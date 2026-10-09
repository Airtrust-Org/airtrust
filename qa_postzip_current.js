const {chromium}=require('/Users/filipedaumas/SAAS/Airtrust/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('fs');
const BASE='http://127.0.0.1:8819/index.html';
const css=fs.readFileSync(__dirname+'/styles.css','utf8'),sizes=[...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1]));
assert(sizes.every(x=>x>=14),'CSS font-size under 14px');
assert(!css.includes('!important'),'CSS !important forbidden');
let errors=[];
(async()=>{
const browser=await chromium.launch({headless:true});
async function launch(w=1468,h=836,values=null,url=BASE){
 const page=await browser.newPage({viewport:{width:w,height:h}});
 await page.addInitScript(v=>{
   window.__scorm={values:v||{'cmi.core.lesson_status':'incomplete'},initialize:0,writes:0,commits:0,finishes:0,afterFinish:0};
   window.API={
    LMSInitialize(){window.__scorm.initialize++;return 'true'},
    LMSGetValue(k){return window.__scorm.values[k]||''},
    LMSSetValue(k,v){if(window.__scorm.finishes){window.__scorm.afterFinish++;return 'false'};window.__scorm.writes++;window.__scorm.values[k]=String(v);return 'true'},
    LMSCommit(){if(window.__scorm.finishes){window.__scorm.afterFinish++;return 'false'};window.__scorm.commits++;return 'true'},
    LMSFinish(){window.__scorm.finishes++;return 'true'},
    LMSGetLastError(){return '0'},LMSGetErrorString(){return 'No Error'},LMSGetDiagnostic(){return ''}
   };
 },values);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'load'});
 return page;
}
const main=await launch(), slides=await main.evaluate(()=>window.COURSE_DATA.slides);
assert.equal(slides.length,37);
assert.equal(slides.filter(s=>s.kind==='assessment').length,4);
assert.equal(slides.reduce((n,s)=>n+(s.questions?.length||0),0),40);
const st=await main.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState());
assert.equal(st.active,0);assert.equal(st.mode,'journey');
assert.equal(await main.evaluate(()=>window.__scorm.initialize),1);
await main.locator('#menuBtn').click();
const zero=await main.evaluate(()=>window.__scorm.writes);
await main.locator('#drawerList [data-i="14"]').click();
assert.equal((await main.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState())).mode,'preview');
assert.equal(await main.evaluate(()=>window.__scorm.writes),zero);
assert(await main.locator('#returnJourney').isVisible());
await main.locator('#drawerClose').click();
await main.locator('#returnJourney').click();
assert.equal((await main.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState())).view,0);
console.log('PREVIEW_READONLY_PASS');
let snapshots={};
for(let i=0;i<slides.length;i++){
 const s=slides[i],state=await main.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState());
 assert.equal(state.view,i,'view mismatch '+i);assert.equal(state.active,i,'active mismatch '+i);
 assert.equal(state.mode,'journey','journey mismatch '+i);
 if(s.kind==='scenario'){
  const wrong=s.options.findIndex(o=>!o[1]),correct=s.options.findIndex(o=>o[1]);
  await main.locator('#viewport [data-opt="'+wrong+'"]').click();
  assert(await main.locator('#next').isDisabled(),'must gate wrong decision');
  await main.locator('#viewport [data-opt="'+correct+'"]').click();
  assert(await main.locator('#next').isEnabled(),'last action unlock');
 }else if(s.kind==='assessment'){
  assert(await main.locator('#viewport .assessment-photo img').isVisible(),'assessment media absent');
  for(let j=0;j<10;j++){
    const a=s.questions[j].answer;
    await main.locator('#viewport [data-answer="'+a+'"]').click();
    if(j<9)await main.locator('#qNext').click();
  }
  assert(await main.locator('#next').isEnabled());
  await main.locator('#next').click();
  assert.equal((await main.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState())).quizzes[s.id].score,100);
 }
 if(i===11||i===20)snapshots[i]=await main.evaluate(()=>structuredClone(window.__scorm.values));
 await main.locator('#next').click();
}
const end=await main.evaluate(()=>({course:window.__AIRTRUST_PLAYER_TEST__.getState(),api:window.__scorm}));
console.log('END_STATUS',JSON.stringify({status:end.api.values['cmi.core.lesson_status'],score:end.api.values['cmi.core.score.raw'],commits:end.api.commits,finishes:end.api.finishes,afterFinish:end.api.afterFinish,ready:end.course.completionReady}));
assert.equal(end.api.values['cmi.core.lesson_status'],'passed');
assert.equal(end.api.values['cmi.core.score.raw'],'100');
assert.equal(end.api.finishes,1);
assert.equal(end.api.afterFinish,0);
assert.equal(end.course.completionReady,true);
assert.equal(end.course.courseCompleted,true);
for(const [i,snapshot] of Object.entries(snapshots)){
 const p=await launch(1468,836,snapshot),state=await p.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState());
 assert.equal(state.active,Number(i));assert.equal(state.mode,'journey');
 assert.equal(await p.evaluate(()=>window.__scorm.initialize),1);
 await p.close();
}
console.log('FULL_JOURNEY_RESUME_PASS');
await main.close();
const viewports=[[1468,836],[1366,768],[1024,768],[768,1024],[390,844],[360,800]];
let fold={};
for(const [w,h] of viewports){
 let fits=0,seen=0,min=999,overflow=0;
 for(let i=1;i<=37;i++){
  const p=await launch(w,h,null,BASE+'?qa=1&slide='+i);
  const metrics=await p.evaluate(()=>{
   const e=document.querySelector('.screen.active'), style=getComputedStyle(e);
   const fonts=[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none').map(el=>Number.parseFloat(getComputedStyle(el).fontSize));
   return {bodyWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,fit:e.scrollHeight<=e.clientHeight+1,fonts:Math.min(...fonts),screenHeight:e.clientHeight};
  });
  min=Math.min(min,metrics.fonts);
  if(metrics.scrollWidth>metrics.bodyWidth+1)overflow++;
  if(slides[i-1].kind!=='assessment'&&slides[i-1].kind!=='scenario'){seen++;if(metrics.fit)fits++;}
  if(w===1468&&i===1)await p.screenshot({path:__dirname+'/qa-cover-desktop.png',fullPage:false});
  if(w===390&&i===15)await p.screenshot({path:__dirname+'/qa-scenario-mobile.png',fullPage:false});
  await p.close();
 }
 fold[w+'x'+h]={fits,seen,pct:Math.round(100*fits/seen),min,overflow};
 assert.equal(overflow,0,'horizontal overflow '+w);
 assert(min>=14,'rendered text under 14 at '+w);
}
console.log('VIEWPORTS',JSON.stringify(fold));
console.log('PAGE_ERRORS',errors.length,errors.slice(0,4));
assert.equal(errors.length,0);
console.log('CFIT_NEW_RC1_PLAYWRIGHT_PASS');
await browser.close();
})().catch(e=>{console.error('QA_FAIL',e.stack);process.exit(1)});
