'use strict';
// Private, local-only exercise of a REAL Factory V3 formative package with the RC6 CANDIDATE core.
// Usage: AIRTRUST_RC6_PACKAGE_ZIP_PATH=/path/package.zip node scripts/qa/factory-v3-rc6-package-browser.cjs
// The ZIP is only read (unzipped into a temp dir, app.js replaced by RC6 there). Zero network, zero
// production calls. Uses the package's own scorm_api.js against a window.API emulator, so the
// "Finish blocks later writes" behaviour of the real wrapper is what is being exercised.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),vm=require('node:vm');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{chromium,webkit}=require('playwright');
const zip=process.env.AIRTRUST_RC6_PACKAGE_ZIP_PATH;
assert.ok(zip&&fs.existsSync(zip),'AIRTRUST_RC6_PACKAGE_ZIP_PATH_REQUIRED');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const core=fs.readFileSync(path.resolve(__dirname,'../learning-factory/cores/AIRTRUST_FORMATIVE_V3_RC6_CANDIDATE.app.js.txt'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'airtrust-rc6-pkg-')),dir=path.join(tmp,'course');
fs.mkdirSync(dir);execFileSync('unzip',['-q',zip,'-d',dir]);
fs.writeFileSync(path.join(dir,'app.js'),core);
const modelPath=path.join(dir,'course-model.js');
const sandbox={window:{}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(modelPath,'utf8'),sandbox);
const model=sandbox.window.COURSE_DATA;
assert.equal(model.assessmentMode,'NONE');
const scenarios=model.slides.filter(s=>s.kind==='scenario');
const markedModel=fs.readFileSync(modelPath,'utf8')+'\nwindow.COURSE_DATA.enLangMarking=true;\n';
fs.writeFileSync(path.join(dir,'course-model.marked.js'),markedModel);
fs.writeFileSync(path.join(dir,'index.marked.html'),fs.readFileSync(path.join(dir,'index.html'),'utf8').replace('course-model.js','course-model.marked.js'));
const harness='<!doctype html><meta charset="utf-8"><script>(()=>{const q=new URLSearchParams(location.search);'+
 'const NS="rc6pkg",CMI=JSON.parse(localStorage.getItem("cmi"+NS)||"{}");let COMMITTED=JSON.parse(localStorage.getItem("committed"+NS)||"{}");'+
 'const LOG=JSON.parse(localStorage.getItem("log"+NS)||"[]");const rec=t=>{LOG.push(t);localStorage.setItem("log"+NS,JSON.stringify(LOG))};'+
 'window.API={LMSInitialize:()=>{rec("init");return "true"},LMSGetValue:k=>CMI[k]??"",'+
 'LMSSetValue:(k,v)=>{CMI[k]=String(v);localStorage.setItem("cmi"+NS,JSON.stringify(CMI));return "true"},'+
 'LMSCommit:()=>{rec("commit");COMMITTED={...CMI};localStorage.setItem("committed"+NS,JSON.stringify(COMMITTED));return "true"},'+
 'LMSFinish:()=>{rec("finish");COMMITTED={...CMI};localStorage.setItem("committed"+NS,JSON.stringify(COMMITTED));return "true"},LMSGetLastError:()=>"0"};'+
 'window.snap=()=>({log:LOG.slice(),committed:COMMITTED,cmi:{...CMI}});})()</script>'+
 '<iframe id="sco" style="width:1400px;height:900px"></iframe><script>document.getElementById("sco").src=new URLSearchParams(location.search).get("f")||"/course/index.html"</script>';
fs.writeFileSync(path.join(tmp,'index.html'),harness);
const mime=f=>f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'application/javascript; charset=utf-8':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.jpg')||f.endsWith('.jpeg')?'image/jpeg':f.endsWith('.png')?'image/png':f.endsWith('.webp')?'image/webp':f.endsWith('.mp4')?'video/mp4':'application/octet-stream';
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const absolute=path.resolve(tmp,'.'+pathname,pathname.endsWith('/')?'index.html':'');
  if(!absolute.startsWith(tmp+path.sep)){res.writeHead(403);res.end();return}
  try{const b=fs.readFileSync(absolute);res.setHeader('Content-Type',mime(absolute));res.end(b)}catch{res.writeHead(404);res.end()}
});
async function journey(engine,name,port,marked){
  const browser=await engine.launch({headless:true});
  try{
    const ctx=await browser.newContext({viewport:{width:1400,height:900}}),page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+port+'/?f='+(marked?'/course/index.marked.html':'/course/index.html'));
    const sco=page.frameLocator('#sco');await sco.locator('#next').waitFor({timeout:15000});
    const st=()=>sco.locator('body').evaluate(()=>window.__AIRTRUST_PLAYER_TEST__.getState());
    let attempts=0,gates=0,maxSnapshot=0,langSpans=0;
    const T=model.slides.length;
    for(let i=0;i<T;i++){
      const s=await st();assert.equal(s.active,i);
      maxSnapshot=Math.max(maxSnapshot,s.snapshotLength);
      langSpans+=await sco.locator('#viewport [lang="en"]').count();
      const g=sco.locator('#viewport [data-gate]');const n=await g.count();for(let k=0;k<n;k++){await g.nth(k).click();gates++}
      if(model.slides[i].kind==='scenario'){
        // The signed-journey constraint: a roteiro that keeps trying alternatives in sequence must converge.
        for(let k=0;await sco.locator('#next').isDisabled();k++){
          assert.ok(k<model.slides[i].options.length,'scenario did not converge '+model.slides[i].id);
          await sco.locator('#viewport [data-opt]:not([disabled])').first().click();attempts++;
        }
      }
      if(i===Math.floor(T/2)){
        // mid-course leave: must commit and must not Finish
        await page.evaluate(()=>{document.getElementById('sco').contentWindow.dispatchEvent(new Event('pagehide'))});
        const mid=await page.evaluate(()=>window.snap());
        assert.equal(mid.log.filter(x=>x==='finish').length,0,name+' mid-course leave must not Finish');
        assert.equal(JSON.parse(mid.committed['cmi.suspend_data']).a,i);
      }
      await sco.locator('#next').click();
    }
    const end=await st();assert.equal(end.courseCompleted,true);
    const snap=await page.evaluate(()=>window.snap());
    assert.equal(snap.log.filter(x=>x==='finish').length,1,name+' exactly one Finish');
    assert.equal(snap.committed['cmi.core.lesson_status'],'completed');
    const interactions=Object.keys(snap.committed).filter(k=>/^cmi\.interactions\.\d+\.id$/.test(k)).length;
    const bytes=JSON.stringify(snap.committed).length;
    assert.ok(maxSnapshot<3900);assert.ok(bytes<65535);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({engine:name,marked,slides:T,scenarios:scenarios.length,clicksToConverge:attempts,gates,
      interactions,committedBytes:bytes,maxSuspendChars:maxSnapshot,langEnSpansSeen:langSpans,finish:1}));
    await ctx.close();
  }finally{await browser.close()}
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  console.log('package_zip_sha256='+sha(fs.readFileSync(zip))+' core_sha256='+sha(core));
  try{
    for(const marked of [false,true]){await journey(chromium,'CHROMIUM',port,marked);await journey(webkit,'WEBKIT',port,marked)}
  }finally{server.close();fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
