const {chromium}=require('/Users/filipedaumas/SAAS/Airtrust/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({headless:true});
 async function phase(label,options={}){
  const p=await b.newPage();
  await p.addInitScript(()=>{
   const trace=[],values={},state={init:0,commit:0,finish:0,lastError:'0'};
   window.API={
    LMSInitialize(){trace.push({method:'LMSInitialize'});if(state.init||state.finish){state.lastError='101';return'false'}state.init++;return'true'},
    LMSGetValue(key){trace.push({method:'LMSGetValue',key});return values[key]||''},
    LMSSetValue(key,value){trace.push({method:'LMSSetValue',key,value});if(!state.init||state.finish){state.lastError='301';return'false'}values[key]=String(value);return'true'},
    LMSCommit(){trace.push({method:'LMSCommit'});if(!state.init||state.finish){state.lastError='301';return'false'}state.commit++;return'true'},
    LMSFinish(){trace.push({method:'LMSFinish'});if(!state.init||state.finish){state.lastError='301';return'false'}state.finish++;return'true'},
    LMSGetLastError(){trace.push({method:'LMSGetLastError'});return state.lastError},
    LMSGetErrorString(){return''},LMSGetDiagnostic(){return''}
   };window.__TRACE=()=>({trace,values,state});
  });
  const err=[];p.on('pageerror',e=>err.push(e.message));
  await p.goto('http://127.0.0.1:8819/index.html',{waitUntil:'networkidle'});
  let before=await p.evaluate(()=>window.__TRACE());
  if(options.preview){await p.locator('#menuBtn').click();await p.locator('#drawerList [data-i="14"]').click();}
  if(options.complete){
    const slides=await p.evaluate(()=>window.COURSE_DATA.slides);
    for(let i=0;i<slides.length;i++){
      const s=slides[i];
      if(s.kind==='scenario'){await p.locator('[data-opt="'+s.options.findIndex(o=>o[1])+'"]').click()}
      if(s.kind==='assessment'){for(let q=0;q<10;q++){await p.locator('[data-answer="'+s.questions[q].answer+'"]').click();if(q<9)await p.locator('#qNext').click()}await p.locator('#next').click()}
      await p.locator('#next').click();
    }
  }
  await p.evaluate(()=>{window.dispatchEvent(new Event('beforeunload'));window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('unload'));});
  let after=await p.evaluate(()=>window.__TRACE());
  const first=after.trace.findIndex(x=>x.method==='LMSFinish'),later=after.trace.slice(first+1).filter(x=>['LMSCommit','LMSSetValue','LMSFinish'].includes(x.method));
  const data={label,beforeInit:before.state.init,beforeCommit:before.state.commit,finish:after.state.finish,commits:after.state.commit,exit:after.values['cmi.core.exit']||'',status:after.values['cmi.core.lesson_status']||'',errors:err,lastError:after.state.lastError,afterFinishMutations:later.length,traceTail:after.trace.slice(-10)};
  console.log('QA_LIFECYCLE',JSON.stringify(data));
  if(after.state.init!==1||after.state.commit<1||after.state.finish!==1||after.state.lastError!=='0'||later.length||err.length)throw Error('FAIL '+label);
  if(!options.complete&&(after.values['cmi.core.lesson_status']!=='incomplete'||after.values['cmi.core.exit']!=='suspend'))throw Error('FAIL INCOMPLETE '+label);
  if(options.complete&&after.values['cmi.core.lesson_status']!=='passed')throw Error('FAIL PASS '+label);
  await p.close()
 }
 await phase('startup-exit');
 await phase('preview-exit',{preview:true});
 await phase('full-course-complete',{complete:true});
 await b.close();
})().catch(e=>{console.error('QA_LIFECYCLE_FAIL',e.stack);process.exit(1)});
