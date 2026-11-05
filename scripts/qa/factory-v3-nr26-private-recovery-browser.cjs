'use strict';
// Real NR26 ZIP, disposable local HTTP and browser; zero production calls/writes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),http=require('node:http');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium,webkit}=require('playwright');
const zip=process.env.AIRTRUST_NR26_PRIVATE_ZIP_PATH;
const zipSha='6a354bc290b60855e4fd6834acded23372d3beafcd7f5f5581bb1c0034e3cee1';
const coreSha='abf5b151561ca6f362f98b6c12faf98ec9893de56455be8c112a064c5e8a995f';
const core=path.resolve(__dirname,'../learning-factory/cores/AIRTRUST_FORMATIVE_V3_RECOVERY_CANDIDATE.app.js.txt');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.ok(zip&&fs.existsSync(zip),'PRIVATE_NR26_ZIP_REQUIRED');
assert.equal(sha(fs.readFileSync(zip)),zipSha,'PRIVATE_NR26_ZIP_SHA_MISMATCH');
const coreBytes=fs.readFileSync(core);
assert.equal(sha(coreBytes),coreSha,'RECOVERY_CANDIDATE_CORE_SHA_MISMATCH');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'airtrust-nr26-recovery-')),dir=path.join(tmp,'course');
fs.mkdirSync(dir);execFileSync('unzip',['-q',zip,'-d',dir]);fs.writeFileSync(path.join(dir,'app.js'),coreBytes);
const sandbox={window:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir,'course-model.js'),'utf8'),sandbox);
const model=sandbox.window.COURSE_DATA;
assert.equal(model.slides.length,29);assert.equal(model.assessmentMode,'NONE');
const scenarios=model.slides.filter(s=>s.kind==='scenario');assert.equal(scenarios.length,10);
const missing=[scenarios[0],scenarios[8]],indices=missing.map(s=>model.slides.findIndex(x=>x.id===s.id));
const initial={
 v:4,p:model.packageVersion,a:28,d:Array.from({length:28},(_,i)=>i),
 s:Object.fromEntries(scenarios.filter(s=>!missing.includes(s)).map(s=>[s.id,0])),
 g:[],h:{},vs:{},q:{answers:[],evaluated:false,score:0,passed:false,q:0},c:false
};
const cmi={'cmi.core.lesson_status':'incomplete','cmi.core.lesson_location':'29/29','cmi.suspend_data':JSON.stringify(initial)};
const harness='<!doctype html><meta charset="utf-8"><title>NR26 local proof</title><script>'+
 'window.CMI='+JSON.stringify(cmi)+';window.SCORM_CALLS=[];window.API={'+
 'LMSInitialize:()=>{SCORM_CALLS.push("init");return "true"},'+
 'LMSGetValue:k=>CMI[k]??"",'+
 'LMSSetValue:(k,v)=>{CMI[k]=String(v);return "true"},'+
 'LMSCommit:()=>{SCORM_CALLS.push("commit");return "true"},'+
 'LMSFinish:()=>{SCORM_CALLS.push("finish");return "true"},'+
 'LMSGetLastError:()=>"0"};</script>'+
 '<iframe id="sco" src="/course/index.html" style="width:1400px;height:900px"></iframe>';
fs.writeFileSync(path.join(tmp,'index.html'),harness);
const mime=f=>f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'application/javascript; charset=utf-8':
 f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.jpg')?'image/jpeg':'application/octet-stream';
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 const absolute=path.resolve(tmp,'.'+pathname,pathname.endsWith('/')?'index.html':'');
 if(!absolute.startsWith(tmp+path.sep)){res.writeHead(403);res.end();return}
 try{const bytes=fs.readFileSync(absolute);res.setHeader('Content-Type',mime(absolute));res.end(bytes)}
 catch{res.writeHead(404);res.end()}
});
async function exercise(engine,name,port,viewport){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  const sco=page.frameLocator('#sco');
  await sco.locator('#next').waitFor({timeout:15000});
  const get=()=>sco.locator('body').evaluate(()=>window.__AIRTRUST_PLAYER_TEST__?.getState());
  const read=()=>page.evaluate(()=>({cmi:{...window.CMI},calls:[...window.SCORM_CALLS]}));
  let st=await get();
  assert.equal(st.active,28);assert.equal(st.done.length,28);assert.equal(st.courseCompleted,false);
  for(let i=0;i<missing.length;i++){
    assert.equal(await sco.locator('#next').isDisabled(),false);
    assert.match(await sco.locator('#next').textContent(),new RegExp('tela '+(indices[i]+1)));
    await sco.locator('#next').click();
    st=await get();assert.equal(st.view,indices[i]);assert.equal(st.mode,'review');
    assert.equal(st.scenario[missing[i].id],undefined);
    await sco.locator('[data-opt="0"]').first().click();
    st=await get();assert.equal(st.active,28);assert.equal(st.view,28);assert.equal(st.mode,'journey');
    assert.equal(st.scenario[missing[i].id],0);
    const saved=(await read()).cmi;
    assert.equal(saved['cmi.core.lesson_status'],'incomplete');
    assert.ok(saved['cmi.suspend_data'].length<3900);
    assert.equal(JSON.parse(saved['cmi.suspend_data']).d.length,28);
  }
  assert.match(await sco.locator('#next').textContent(),/Confirmar encerramento/);
  assert.equal((await read()).cmi['cmi.core.lesson_status'],'incomplete');
  assert.equal((await get()).courseCompleted,false);
  await sco.locator('#next').click();
  const after=await read();
  assert.equal(after.cmi['cmi.core.lesson_status'],'completed');
  assert.equal(JSON.parse(after.cmi['cmi.suspend_data']).c,true);
  assert.equal(after.calls.filter(x=>x==='finish').length,1);
  assert.equal((await get()).courseCompleted,true);
  assert.ok(indices.every(i=>Number.isInteger(i)&&i>=0&&i<29));
  const reviewMeta=await sco.locator('body').evaluate(i=>({requested:i,total:window.COURSE_DATA.slides.length,mode:window.__AIRTRUST_PLAYER_TEST__.getState().mode}),indices[0]);
  assert.equal(reviewMeta.requested,indices[0]);
  assert.equal(reviewMeta.total,29);
  await sco.locator('body').evaluate(i=>window.__AIRTRUST_PLAYER_TEST__.show(Number(i)),indices[0]);
  await sco.locator('[data-opt="1"]').first().click();
  assert.equal((await get()).scenario[missing[0].id],0,'completed review cannot mutate evidence');
  assert.deepEqual(errors,[]);await page.close();
  return {browser:name,slideCount:29,missingRecovered:2,finishCalls:1,errors:0};
 }finally{await browser.close()}
}
(async()=>{
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port,outcomes=[];
  outcomes.push(await exercise(chromium,'CHROMIUM',port,{width:1536,height:1000}));
  outcomes.push(await exercise(webkit,'WEBKIT',port,{width:1536,height:1000}));
  outcomes.push(await exercise(chromium,'CHROMIUM_MOBILE',port,{width:390,height:844}));
  console.log(JSON.stringify({scope:'PRIVATE_LOCAL_ZIP_NO_LMS_SERVER',certified:false,zipSha256:zipSha,coreSha256:coreSha,outcomes},null,2));
 }finally{await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e.stack);process.exitCode=1});