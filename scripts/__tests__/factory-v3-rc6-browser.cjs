'use strict';
// Synthetic local runtime contract for the Factory V3 RC6 CANDIDATE core only.
// NOT functional SCORM certification and NOT an activation proof.
// The Scorm mock reproduces the guard of the pinned scorm_api.js: after
// finish() every set/get/commit is refused, which is what made RC5 lose progress.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const cores={
  rc5:path.resolve(__dirname,'../learning-factory/cores/AIRTRUST_FORMATIVE_V3_RECOVERY_CANDIDATE.app.js.txt'),
  rc6:path.resolve(__dirname,'../learning-factory/cores/AIRTRUST_FORMATIVE_V3_RC6_CANDIDATE.app.js.txt'),
};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airtrust-factory-v3-rc6-'));
const pixel='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E';
const slide=(id,kind,extra={})=>({id,kind,title:id,module:'Synthetic',eyebrow:'Test',lead:'Test',media:pixel,visualAlt:'Test',...extra});
const opts=(n,right)=>Array.from({length:n},(_,i)=>['Opt '+i,i===right,(i===right?'Certo ':'Errado ')+i]);
const baseCourse=(over={})=>({courseId:'synthetic-only',title:'Synthetic only',packageVersion:'SYNTHETIC-V3-RC6-1',assessmentMode:'NONE',enLangMarking:true,slides:[
  slide('intro','lesson',{columns:[{title:'Leitura em inglês',items:['Termos: torque, seal','Check the seal']},{title:'Interpretação em português',items:['Verifique a vedação']}],note:'Exemplo de leitura: Replace the filter — Substitua o filtro'}),
  slide('s1','scenario',{question:'O que significa “Do not operate”?',options:[['Significa “Do not operate”',false,'Errado A'],['Não operar',true,'Certo B'],['Operar com cautela',false,'Errado C']]}),
  slide('hot','lesson',{family:'hotspot',gateItems:[['First','F1'],['Second','F2']]}),
  slide('s2','scenario',{question:'Choose',options:[['x',false,'no1'],['y',false,'no2'],['z',true,'yes'],['w',false,'no3']],enOpts:[2]}),
  slide('end','study_end',{body:['EN — Read the manual.','Fim']}),
]  ,...over});
const manyScenarios=n=>({...baseCourse(),packageVersion:'SYNTHETIC-V3-RC6-MANY',slides:[
  ...Array.from({length:n},(_,i)=>slide('m'+String(i+1).padStart(2,'0'),'scenario',{question:'Q'+i,options:opts(3,2)})),
  slide('end','study_end',{body:['Fim']})]});
const examCourse=()=>({...baseCourse(),packageVersion:'SYNTHETIC-V3-RC6-EXAM',assessmentMode:'EXAM',masteryScore:50,slides:[
  slide('intro','lesson',{body:['Intro']}),
  slide('exam','assessment',{questions:[
    {q:'Q1',options:['a','b','c','d'],answer:1,explain:'e1'},
    {q:'Q2',options:['a','b','c','d'],answer:2,explain:'e2'}]})]});
const ids=['viewport','next','prev','menuBtn','drawerClose','backdrop','drawer','drawerList','drawerProgress','refBtn','modalClose','modalBg','refList','topProgressText','topProgressFill','count','gateStatus'];
const tag=id=>/next|prev|Btn|Close/.test(id)?'button':'div';
const body=(live)=>ids.map(id=>'<'+tag(id)+' id="'+id+'"'+(id==='viewport'?' aria-live="polite"':'')+'></'+tag(id)+'>').join('')+(live?'<div id="liveMsg" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>':'');
function mockFor(name,course){return [
  'window.COURSE_DATA='+JSON.stringify(course)+';',
  'const NS='+JSON.stringify(name)+',ss=k=>JSON.parse(localStorage.getItem(k+NS)||"null");',
  'const store=ss("cmi")||{};let finished=false;',
  'const log=t=>{const l=ss("log")||[];l.push(t);localStorage.setItem("log"+NS,JSON.stringify(l));try{if(parent!==window&&parent.__pflog)parent.__pflog.push(t)}catch(e){}};',
  'window.__refused=0;window.__sets=0;',
  'window.Scorm={isInitialized:()=>true,isFinished:()=>finished,',
  'get:k=>finished?"":(store[k]||""),',
  'set:(k,v)=>{if(finished){window.__refused++;return "false"}window.__sets++;store[k]=String(v);localStorage.setItem("cmi"+NS,JSON.stringify(store));return "true"},',
  'commit:()=>{if(finished)return "false";log("commit");localStorage.setItem("committed"+NS,JSON.stringify(store));return "true"},',
  'finish:()=>{if(finished)return "true";log("finish");finished=true;localStorage.setItem("committed"+NS,JSON.stringify(store));return "true"}};',
].join('\n')}
function writePages(name,course,core,{live=false}={}){
  const eng=name+'.'+core+'.engine.js';
  fs.copyFileSync(cores[core],path.join(dir,eng));
  fs.writeFileSync(path.join(dir,name+'.'+core+'.html'),'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>'+body(live)+'<script>'+mockFor(name+'.'+core,course)+'</script><script src="'+eng+'"></script></body></html>');
  fs.writeFileSync(path.join(dir,name+'.'+core+'.host.html'),'<!doctype html><meta charset="utf-8"><script>window.__pflog=[]</script><iframe id="sco" src="'+name+'.'+core+'.html" style="width:1200px;height:800px"></iframe>');
  return {page:name+'.'+core+'.html',host:name+'.'+core+'.host.html',ns:name+'.'+core};
}
const mime=f=>f.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8';
const server=http.createServer((req,res)=>{
  const f=path.join(dir,path.basename(new URL(req.url,'http://x').pathname));
  try{const b=fs.readFileSync(f);res.setHeader('Content-Type',mime(f));res.end(b)}catch{res.writeHead(404);res.end()}
});
const listen=()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port)));
const jparse=s=>JSON.parse(s||'null');
async function run(engine,label,port){
  const browser=await engine.launch({headless:true});
  const url=f=>'http://127.0.0.1:'+port+'/'+f;
  const fresh=async(pages,query='')=>{
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url(pages.page)+query);await page.waitForFunction(()=>!!window.__AIRTRUST_PLAYER_TEST__);
    const api={context,page,errors,
      get:()=>page.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState()),
      committed:()=>page.evaluate(ns=>JSON.parse(localStorage.getItem('committed'+ns)||'{}'),pages.ns),
      log:()=>page.evaluate(ns=>JSON.parse(localStorage.getItem('log'+ns)||'[]'),pages.ns),
      reload:async()=>{await page.reload();await page.waitForFunction(()=>!!window.__AIRTRUST_PLAYER_TEST__)},
      leave:()=>page.evaluate(()=>{window.dispatchEvent(new Event('beforeunload'));window.dispatchEvent(new Event('pagehide'));
        Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))}),
      live:()=>page.locator('#liveMsg').textContent(),
      close:()=>context.close()};
    return api;
  };
  const finishes=l=>l.filter(x=>x==='finish').length;
  try{
    // ---- Control: RC5 really loses progress after a mid-course pagehide (T1) ----
    {
      const p5=writePages('t1',baseCourse(),'rc5');const s=await fresh(p5);
      await s.page.locator('#next').click();
      await s.leave();
      assert.equal(finishes(await s.log()),1,label+' control: RC5 finishes on leave');
      await s.page.locator('[data-opt="1"]').click();
      assert.equal((await s.committed()).hasOwnProperty('cmi.suspend_data')&&jparse((await s.committed())['cmi.suspend_data']).s.s1,undefined,label+' control: RC5 loses the answer after Finish');
      await s.close();
    }
    // ---- T1: RC6 leave/hide never finishes an incomplete course; later work is still saved ----
    const p6=writePages('t1',baseCourse(),'rc6');
    {
      const s=await fresh(p6);
      await s.page.locator('#next').click();
      let st=await s.get();assert.equal(st.active,1);
      await s.leave();
      assert.equal(finishes(await s.log()),0,label+' leaving mid-course must not call LMSFinish');
      assert.equal(await s.page.evaluate(()=>window.Scorm.isFinished()),false);
      assert.equal((await s.committed())['cmi.core.lesson_status'],'incomplete');
      assert.equal(jparse((await s.committed())['cmi.suspend_data']).a,1);
      // came back (bfcache / tab visible again): progress keeps being written and committed
      await s.page.locator('[data-opt="1"]').click();
      assert.equal(jparse((await s.committed())['cmi.suspend_data']).s.s1,1,label+' answer after leave must be committed');
      assert.equal(await s.page.evaluate(()=>window.__refused),0,label+' no write may be refused');
      // real reload mid-course: still no Finish and the cursor resumes
      await s.page.locator('#next').click();
      await s.reload();
      st=await s.get();assert.equal(st.active,2);assert.equal(finishes(await s.log()),0);
      // complete: exactly one Finish, status completed
      await s.page.locator('[data-gate="0"]').first().click();await s.page.locator('[data-gate="1"]').first().click();
      await s.page.locator('#next').click();
      for(let i=0;!(await s.page.locator('#next').isEnabled());i++){await s.page.locator('[data-opt]:not([disabled])').first().click();assert.ok(i<4)}
      await s.page.locator('#next').click();
      assert.equal(finishes(await s.log()),0,label+' reaching the last slide is not completion');
      assert.match(await s.page.locator('#next').textContent(),/Confirmar encerramento/);
      await s.page.locator('#next').click();
      st=await s.get();assert.equal(st.courseCompleted,true);
      assert.equal(finishes(await s.log()),1,label+' completion calls LMSFinish exactly once');
      assert.equal((await s.committed())['cmi.core.lesson_status'],'completed');
      await s.leave();await s.leave();
      assert.equal(finishes(await s.log()),1,label+' leaving after completion must not Finish again');
      // reopening the completed course is a new SCORM session: writes nothing, Finishes once on teardown
      await s.reload();
      st=await s.get();assert.equal(st.mode,'review');
      assert.equal(await s.page.evaluate(()=>window.__sets),0);
      await s.leave();await s.leave();
      assert.equal(finishes(await s.log()),2,label+' terminal review session finishes once per session');
      assert.deepEqual(s.errors,[]);
      await s.close();
    }
    // iframe teardown (what the independent producer / host do): a completed course Finishes once on removal
    {
      const context=await browser.newContext(),page=await context.newPage();
      const ptp=writePages('t1if',baseCourse(),'rc6');
      await page.goto(url(ptp.page));await page.waitForFunction(()=>!!window.__AIRTRUST_PLAYER_TEST__);
      const click=sel=>page.locator(sel).first().click();
      const solve=async()=>{for(let i=0;!(await page.locator('#next').isEnabled());i++){await page.locator('[data-opt]:not([disabled])').first().click();assert.ok(i<4)}};
      await click('#next');await solve();await click('#next');await click('[data-gate="0"]');await click('[data-gate="1"]');await click('#next');await solve();await click('#next');await click('#next');
      assert.equal((await page.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState())).courseCompleted,true);
      // reopen inside a host iframe sharing the same origin/storage, then remove the frame
      const host=await context.newPage();
      await host.goto(url(ptp.host));
      await host.frameLocator('#sco').locator('#next').waitFor();
      assert.equal(await host.frameLocator('#sco').locator('#next').textContent(),'Estudo enviado; confira situação no AirTrust');
      await host.evaluate(()=>{window.__pflog.length=0});
      await host.evaluate(()=>document.getElementById('sco').remove());
      await host.waitForFunction(()=>window.__pflog.includes('finish'),null,{timeout:5000});
      assert.equal(await host.evaluate(()=>window.__pflog.filter(x=>x==='finish').length),1,label+' iframe teardown of a completed course finishes once');
      await context.close();
    }
    // iframe teardown of an INCOMPLETE course must not Finish
    {
      const context=await browser.newContext(),host=await context.newPage();
      await host.goto(url(p6.host));
      const f=host.frameLocator('#sco');await f.locator('#next').waitFor();await f.locator('#next').click();
      await host.evaluate(()=>{window.__pflog.length=0});
      await host.evaluate(()=>document.getElementById('sco').remove());
      await host.waitForTimeout(400);
      assert.equal(await host.evaluate(()=>window.__pflog.includes('finish')),false,label+' incomplete iframe teardown must not Finish');
      await context.close();
    }

    // ---- A2: advance only with the correct option; compatible with sequential clicking ----
    {
      const s=await fresh(writePages('gate',baseCourse(),'rc6'));
      await s.page.locator('#next').click();
      assert.equal(await s.page.locator('#next').isDisabled(),true);
      assert.match(await s.page.locator('#next').textContent(),/Responda ao cenário/);
      await s.page.locator('[data-opt="0"]').click();
      assert.equal(await s.page.locator('#next').isDisabled(),true,label+' wrong option must not advance');
      assert.match(await s.page.locator('#next').textContent(),/Escolha a alternativa adequada/);
      assert.equal(await s.page.locator('[data-opt="0"]').isDisabled(),true);
      assert.match(await s.page.locator('.feedback').textContent(),/Errado A/);
      let st=await s.get();assert.equal(st.scenario.s1,undefined,label+' wrong option is never the accepted answer');
      assert.equal(jparse((await s.committed())['cmi.suspend_data']).s.s1,undefined);
      await s.reload();
      assert.equal(await s.page.locator('#next').isDisabled(),true);
      assert.equal(await s.page.locator('[data-opt="0"]').isDisabled(),false,label+' retry after reload is possible');
      await s.page.locator('[data-opt="2"]').click();
      assert.equal(await s.page.locator('#next').isDisabled(),true);
      await s.page.locator('[data-opt="1"]').click();
      assert.equal(await s.page.locator('#next').isEnabled(),true);
      assert.equal((await s.get()).scenario.s1,1);
      assert.equal(await s.page.locator('[data-opt]:not([disabled])').count(),0,label+' options lock after the correct answer');
      assert.equal(jparse((await s.committed())['cmi.suspend_data']).s.s1,1);
      // the Worker functional driver / homologation tools pick authored correct option: first click is accepted
      await s.page.locator('#next').click();await s.page.locator('[data-gate="0"]').first().click();await s.page.locator('[data-gate="1"]').first().click();await s.page.locator('#next').click();
      await s.page.locator('[data-opt="2"]').click();
      assert.equal(await s.page.locator('#next').isEnabled(),true);
      // study_end keeps the RC5 rule: only accepted answers count
      await s.page.locator('#next').click();
      assert.equal((await s.get()).active,4);
      assert.equal(await s.page.locator('#next').isEnabled(),true);
      // RC5-era state with a wrong answer persisted on the active scenario is not accepted
      await s.page.evaluate(ns=>{
        const raw=JSON.parse(localStorage.getItem('cmi'+ns)),snap=JSON.parse(raw['cmi.suspend_data']);
        snap.a=1;snap.d=[0];snap.s={s1:0};delete snap.x;snap.c=false;
        raw['cmi.suspend_data']=JSON.stringify(snap);raw['cmi.core.lesson_location']='2/5';raw['cmi.core.lesson_status']='incomplete';
        localStorage.setItem('cmi'+ns,JSON.stringify(raw));
        window.Scorm.set=()=>'true'; // the unloading page must not overwrite the injected RC5-era state
      },'gate.rc6');
      await s.reload();
      st=await s.get();assert.equal(st.active,1);assert.equal(st.scenario.s1,undefined);assert.equal(st.interactionCount,0);
      assert.equal(await s.page.locator('#next').isDisabled(),true);
      assert.equal(await s.page.locator('[data-opt="0"]').isDisabled(),true);
      assert.deepEqual(s.errors,[]);
      await s.close();
    }

    // repair of a missing earlier scenario answer (RC5 recovery path) also requires the correct option
    {
      const pages=writePages('repair',baseCourse(),'rc6');const s=await fresh(pages);
      await s.page.evaluate(ns=>{
        const raw={'cmi.core.lesson_status':'incomplete','cmi.core.lesson_location':'5/5',
          'cmi.suspend_data':JSON.stringify({v:4,p:'SYNTHETIC-V3-RC6-1',a:4,d:[0,1,2,3],s:{s2:2},g:[],h:{},vs:{},q:{answers:[],evaluated:false,score:0,passed:false,q:0},c:false})};
        localStorage.setItem('cmi'+ns,JSON.stringify(raw));window.Scorm.set=()=>'true';
      },'repair.rc6');
      await s.reload();
      assert.match(await s.page.locator('#next').textContent(),/Revisar cenário pendente/);
      await s.page.locator('#next').click();
      let st=await s.get();assert.equal(st.view,1);assert.equal(st.mode,'review');
      await s.page.locator('[data-opt="0"]').click();
      st=await s.get();assert.equal(st.view,1,label+' wrong option does not complete the repair');assert.equal(st.mode,'review');assert.equal(st.scenario.s1,undefined);
      await s.page.locator('[data-opt="1"]').click();
      st=await s.get();assert.equal(st.view,4);assert.equal(st.mode,'journey');assert.equal(st.scenario.s1,1);
      assert.equal(await s.page.locator('#next').isEnabled(),true);
      assert.deepEqual(s.errors,[]);await s.close();
    }

    // ---- A3: SCORM 1.2 interactions per attempt ----
    {
      const pages=writePages('ix',baseCourse(),'rc6');const s=await fresh(pages);
      await s.page.locator('#next').click();
      await s.page.locator('[data-opt="0"]').click();await s.page.locator('[data-opt="2"]').click();await s.page.locator('[data-opt="1"]').click();
      let c=await s.committed();
      const row=n=>({id:c['cmi.interactions.'+n+'.id'],type:c['cmi.interactions.'+n+'.type'],resp:c['cmi.interactions.'+n+'.student_response'],
        result:c['cmi.interactions.'+n+'.result'],pat:c['cmi.interactions.'+n+'.correct_responses.0.pattern'],time:c['cmi.interactions.'+n+'.time']});
      assert.deepEqual([0,1,2].map(n=>{const r=row(n);return [r.id,r.type,r.resp,r.result,r.pat].join('|')}),
        ['s1|choice|a|wrong|b','s1|choice|c|wrong|b','s1|choice|b|correct|b']);
      assert.match(row(0).time,/^\d\d:\d\d:\d\d$/);
      assert.equal(c['cmi.interactions.3.id'],undefined);
      assert.equal(c['cmi.core.lesson_status'],'incomplete',label+' interactions must not alter completion status');
      assert.equal((await s.get()).interactionCount,3);
      await s.reload();
      assert.equal((await s.get()).interactionCount,3,label+' counter survives resume');
      await s.page.locator('#next').click();await s.page.locator('[data-gate="0"]').first().click();await s.page.locator('[data-gate="1"]').first().click();await s.page.locator('#next').click();
      await s.page.locator('[data-opt="3"]').click();
      c=await s.committed();assert.equal(c['cmi.interactions.3.id'],'s2');assert.equal(c['cmi.interactions.3.student_response'],'d');assert.equal(c['cmi.interactions.3.result'],'wrong');assert.equal(c['cmi.interactions.3.correct_responses.0.pattern'],'c');
      assert.ok(String(c['cmi.suspend_data']).length<3900);
      // no extra interaction for a click on an option that was already tried
      await s.page.locator('[data-opt="3"]').click({force:true}).catch(()=>{});
      assert.equal((await s.get()).interactionCount,4);
      // the course still completes and the terminal status is not disturbed
      await s.page.locator('[data-opt="2"]').click();await s.page.locator('#next').click();await s.page.locator('#next').click();
      c=await s.committed();assert.equal(c['cmi.core.lesson_status'],'completed');assert.equal(c['cmi.interactions.4.result'],'correct');
      // review mode never records or writes
      await s.reload();
      const sets=await s.page.evaluate(()=>window.__sets);
      await s.page.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.show(1));
      await s.page.locator('[data-opt="0"]').click({force:true}).catch(()=>{});
      assert.equal(await s.page.evaluate(()=>window.__sets),sets);assert.equal((await s.get()).interactionCount,5);
      assert.deepEqual(s.errors,[]);
      await s.close();
      // preview mode (?qa=1) never writes
      const q=await fresh(pages,'?qa=1&slide=2');
      await q.page.locator('[data-opt="0"]').click();
      assert.equal(await q.page.evaluate(()=>window.__sets),0);assert.equal(await q.page.evaluate(()=>window.__refused),0);
      await q.close();
    }
    // interaction cap: never grows the payload without bound, never breaks completion
    {
      const n=50,pages=writePages('cap',manyScenarios(n),'rc6');const s=await fresh(pages);
      for(let i=0;i<n;i++){for(const o of [0,1,2])await s.page.locator('[data-opt="'+o+'"]').click();await s.page.locator('#next').click()}
      let st=await s.get();assert.equal(st.interactionCount,140,label+' cap (50 scenarios x 3 attempts = 150 > 140)');
      assert.ok(st.snapshotLength<3900,'suspend_data snapshot '+st.snapshotLength);
      await s.page.locator('#next').click();
      st=await s.get();assert.equal(st.courseCompleted,true);
      const c=await s.committed();assert.equal(c['cmi.core.lesson_status'],'completed');
      assert.equal(c['cmi.interactions.140.id'],undefined);assert.equal(c['cmi.interactions.139.id'].length>0,true);
      const bytes=JSON.stringify(c).length;
      assert.ok(bytes<40000,'cmi payload '+bytes);
      console.log(label+': cap payload '+bytes+' bytes for the 140-interaction cap, suspend_data '+st.snapshotLength+' chars');
      assert.deepEqual(s.errors,[]);await s.close();
    }
    // scored assessment: one interaction per question per evaluation
    {
      const pages=writePages('exam',examCourse(),'rc6');const s=await fresh(pages);
      await s.page.locator('#next').click();
      await s.page.locator('[data-answer="1"]').click();await s.page.locator('#qNext').click();await s.page.locator('[data-answer="0"]').click();
      await s.page.locator('#next').click();
      const c=await s.committed();
      assert.deepEqual([0,1].map(n=>[c['cmi.interactions.'+n+'.id'],c['cmi.interactions.'+n+'.student_response'],c['cmi.interactions.'+n+'.result'],c['cmi.interactions.'+n+'.correct_responses.0.pattern']].join('|')),
        ['exam_q1|b|correct|b','exam_q2|a|wrong|c']);
      assert.equal(c['cmi.core.score.raw'],'50');
      await s.page.locator('#next').click();
      assert.equal((await s.committed())['cmi.core.lesson_status'],'passed');
      assert.equal(finishes(await s.log()),1);
      assert.deepEqual(s.errors,[]);await s.close();
    }

    // ---- A4: live region and lang="en" ----
    for(const live of [false,true]){
      const s=await fresh(writePages('a11y'+(live?'h':'c'),baseCourse(),'rc6',{live}));
      assert.equal(await s.page.locator('#liveMsg').count(),1,label+' exactly one live region (core-created or host-provided)');
      assert.equal(await s.page.locator('#viewport').getAttribute('aria-live'),null,label+' viewport must not be live');
      assert.equal(await s.page.locator('#liveMsg').getAttribute('aria-live'),'polite');
      assert.equal(await s.page.locator('#liveMsg').getAttribute('role'),'status');
      await s.page.waitForFunction(()=>/Tela 1 de 5: intro/.test(document.querySelector('#liveMsg').textContent));
      assert.equal(await s.page.locator('.columns li span[lang="en"]').count(),2,label+' English column items');
      assert.match(await s.page.locator('.columns li span[lang="en"]').first().textContent(),/torque, seal/);
      assert.equal(await s.page.locator('.screen p span[lang="en"]').count(),1);
      assert.equal(await s.page.locator('.columns section:nth-child(2) [lang="en"]').count(),0,label+' Portuguese column stays unmarked');
      await s.page.locator('#next').click();
      await s.page.waitForFunction(()=>/Tela 2 de 5: s1/.test(document.querySelector('#liveMsg').textContent));
      assert.equal(await s.page.locator('.decision h2 span[lang="en"]').count(),1);
      assert.equal(await s.page.locator('.option span[lang="en"]').count(),1);
      await s.page.locator('[data-opt="0"]').click();
      await s.page.waitForFunction(()=>/Revise a decisão\. Errado A/.test(document.querySelector('#liveMsg').textContent));
      await s.page.locator('[data-opt="1"]').click();
      await s.page.waitForFunction(()=>/Resposta adequada\. Certo B/.test(document.querySelector('#liveMsg').textContent));
      await s.page.evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.show(4));
      assert.equal(await s.page.locator('.body-item span[lang="en"]').count(),1,label+' EN body item');
      assert.equal(await s.page.locator('.body-item').count(),2);
      assert.deepEqual(s.errors,[]);await s.close();
    }
    {
      const off=baseCourse();delete off.enLangMarking;
      const s=await fresh(writePages('a11yoff',off,'rc6'));
      assert.equal(await s.page.locator('[lang="en"]').count(),0,label+' lang marking is opt-in');
      await s.page.locator('#next').click();assert.equal(await s.page.locator('[lang="en"]').count(),0);
      assert.deepEqual(s.errors,[]);await s.close();
    }
    console.log(label+': PASS (synthetic browser, not Worker or D1)');
  }finally{await browser.close()}
}
(async()=>{
  const port=await listen();
  try{await run(chromium,'CHROMIUM',port);await run(webkit,'WEBKIT',port)}
  finally{server.close();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
