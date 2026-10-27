'use strict';
// Synthetic local runtime contract only. NOT functional SCORM certification.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,webkit}=require('playwright');
const core=path.resolve(__dirname,'../learning-factory/cores/AIRTRUST_FORMATIVE_V3_CORE.app.js.txt');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airtrust-factory-v3-'));
const slide=(id,kind,extra={})=>({id,kind,title:id,module:'Synthetic',eyebrow:'Test',lead:'Test',media:'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E',visualAlt:'Test',...extra});
const course={courseId:'synthetic-only',title:'Synthetic only',packageVersion:'SYNTHETIC-V3-1',assessmentMode:'NONE',slides:[
  slide('intro','lesson',{body:['Test screen']}),
  slide('question','scenario',{question:'Choose the second option',options:[['Wrong',false,'Retry'],['Right',true,'Accepted']]}),
  slide('hotspot','lesson',{family:'hotspot',gateItems:[['First','FIRST_EXPLANATION'],['Second','SECOND_EXPLANATION'],['Third','THIRD_EXPLANATION']]}),
  slide('end','study_end',{body:['Explicit terminal action']})
]};
const ids=['viewport','next','prev','menuBtn','drawerClose','backdrop','drawer','drawerList','drawerProgress','refBtn','modalClose','modalBg','refList','topProgressText','topProgressFill','count','gateStatus','qPrev','qNext'];
const html=ids.map(id=>'<'+(/next|prev|Btn|Close|qPrev|qNext/.test(id)?'button':'div')+' id="'+id+'"></'+(/next|prev|Btn|Close|qPrev|qNext/.test(id)?'button':'div')+'>').join('');
const mock=[
  'window.COURSE_DATA='+JSON.stringify(course)+';',
  "const state=JSON.parse(sessionStorage.getItem('scorm')||'{}');",
  'window.__writes=0;',
  'window.Scorm={',
  'isInitialized:()=>true,',
  "get:k=>state[k]||'',",
  "set:(k,v)=>{window.__writes++;state[k]=String(v);sessionStorage.setItem('scorm',JSON.stringify(state));return true;},",
  'commit:()=>true,',
  "finish:()=>{if(state['cmi.core.lesson_status']!=='completed')return true;const n=Number(sessionStorage.getItem('finishTries')||0)+1;sessionStorage.setItem('finishTries',String(n));return n>1;}",
  '};'
].join('\n');
fs.copyFileSync(core,path.join(dir,'engine.js'));
fs.writeFileSync(path.join(dir,'index.html'),'<html><body>'+html+'<script>'+mock+'</script><script src="engine.js"></script></body></html>');
const url=pathToFileURL(path.join(dir,'index.html')).href;
async function run(engine,label){
  const browser=await engine.launch({headless:true}),context=await browser.newContext();
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const get=()=>page.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState());
  const {captureFactoryV3VisualState,requireFactoryV3VisualState,
    requireFactoryV3ResumeMatch} = await import('../staging/f5-factory-v3-visual-witness.mjs');
  const witness=async()=>{
    const screen=await page.evaluate(captureFactoryV3VisualState);
    const cmi=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('scorm')));
    return requireFactoryV3VisualState(screen,
      cmi['cmi.core.lesson_location'],cmi['cmi.suspend_data'],{
        expectedPackageVersion:course.packageVersion,
      });
  };
  try {
    await page.goto(url);await page.waitForFunction(()=>!!window.__AIRTRUST_PLAYER_TEST__);
    let s=await get();assert.equal(s.active,0);assert.equal(s.courseCompleted,false);
    await page.locator('#next').click();
    s=await get();assert.equal(s.active,1);
    const scenarioWitness=await witness();
    assert.equal(scenarioWitness.unitId,'question');
    assert.equal(await page.locator('#next').isDisabled(),true);
    await page.locator('[data-opt="1"]').click();
    await page.locator('#next').click();
    s=await get();assert.equal(s.active,2);assert.equal(s.courseCompleted,false);
    const hotspotWitness=await witness();
    assert.equal(hotspotWitness.unitId,'hotspot');
    assert.equal(await page.locator('#next').isDisabled(),true);
    await page.locator('[data-gate="2"]').first().click();
    assert.match(await page.locator('.hotspot-detail').textContent(),/THIRD_EXPLANATION/);
    await page.locator('[data-gate="0"]').first().click();
    assert.match(await page.locator('.hotspot-detail').textContent(),/FIRST_EXPLANATION/);
    assert.equal(await page.locator('#next').isDisabled(),true);
    await page.locator('[data-gate="1"]').first().click();
    assert.match(await page.locator('.hotspot-detail').textContent(),/SECOND_EXPLANATION/);
    assert.equal(await page.locator('#next').isDisabled(),false);
    await page.locator('#next').click();
    s=await get();assert.equal(s.active,3);assert.equal(s.courseCompleted,false);
    const finalBeforeResume=await witness();
    assert.equal(finalBeforeResume.unitId,'end');
    await page.reload();await page.waitForFunction(()=>!!window.__AIRTRUST_PLAYER_TEST__);
    s=await get();assert.equal(s.active,3);assert.equal(s.courseCompleted,false);
    const finalAfterResume=await witness();
    assert.equal(requireFactoryV3ResumeMatch(finalBeforeResume,finalAfterResume),true);
    await page.locator('#next').click();
    s=await get();assert.equal(s.courseCompleted,false);
    assert.equal(await page.locator('#next').isDisabled(),false);
    let status=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('scorm'))['cmi.core.lesson_status']);
    assert.equal(status,'incomplete',label+' failed LMSFinish must rollback');
    await page.locator('#next').click();
    s=await get();assert.equal(s.courseCompleted,true);
    status=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('scorm'))['cmi.core.lesson_status']);
    assert.equal(status,'completed');
    await page.reload();await page.waitForFunction(()=>!!window.__AIRTRUST_PLAYER_TEST__);
    s=await get();assert.equal(s.courseCompleted,true);assert.equal(s.mode,'review');
    await page.locator('#prev').click();
    assert.equal(await page.evaluate(()=>window.__writes),0);
    await page.evaluate(()=>sessionStorage.setItem('scorm',JSON.stringify({
      'cmi.suspend_data':JSON.stringify({v:4,p:'OTHER-EDITION',a:2,d:[0,1,2],c:true}),
      'cmi.core.lesson_status':'completed','cmi.core.lesson_location':'3/3',
    })));
    await page.reload();await page.waitForFunction(()=>!!window.__AIRTRUST_PLAYER_TEST__);
    s=await get();assert.equal(s.invalidEditionState,true);assert.equal(s.courseCompleted,false);
    assert.deepEqual(errors,[]);
    console.log(label+': PASS (synthetic browser, not Worker or D1)');
  }finally{await context.close();await browser.close();}
}
(async()=>{try{await run(chromium,'CHROMIUM');await run(webkit,'WEBKIT')}finally{fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e.stack);process.exitCode=1});
