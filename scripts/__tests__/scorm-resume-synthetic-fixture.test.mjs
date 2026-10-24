// Local SCORM 1.2 protocol unit test (synthetic API/DOM, NOT Worker/browser QA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runtime = fs.readFileSync(new URL('../qa/fixtures/scorm-resume/resume-runtime.js', import.meta.url), 'utf8');
function open(store, faults = {}) {
  const elements = new Map();
  for (const id of ['position-title','position-description','diagnostic','error','previous','next','finish'])
    elements.set(id, { id, dataset:{}, textContent:'', hidden:id==='error', disabled:true,
      addEventListener(type,fn){ this.handlers[type]=fn; }, handlers:{},
      click(){assert.equal(this.disabled,false,`unexpected disabled ${id}`);this.handlers.click();} });
  const calls=[]; let pending={...store}, last='0'; let done=false;
  const API = {
    LMSInitialize(){calls.push('Initialize'); last='0';return 'true';},
    LMSGetValue(key){calls.push('Get:'+key);if(faults.read===key){last='301';return '';}
      last='0';return store[key]??'';},
    LMSGetLastError(){return last;},
    LMSSetValue(key,value){calls.push('Set:'+key);if(faults.write===key||done){last='101';return 'false';}
      pending[key]=value; last='0';return 'true';},
    LMSCommit(){calls.push('Commit');if(faults.commit){last='101';return 'false';}
      Object.assign(store,pending);last='0';return 'true';},
    LMSFinish(){calls.push('Finish');if(faults.finish){last='101';return 'false';}
      done=true;last='0';return 'true';}
  };
  const window={API};window.parent=window;
  const document={getElementById(id){if(!elements.has(id))throw Error(`unknown ${id}`);return elements.get(id);}};
  vm.runInNewContext(runtime,{window,document,JSON,Error,Number,String});
  return {nodes:elements, calls,store, click(id){elements.get(id).click();},position(){return elements.get('position-title').dataset.qaPosition},error(){return elements.get('error').textContent}};
}
test('initialize -> 2 positions -> Commit -> Finish -> reopen restores persisted CMI',()=>{
  const store={};const one=open(store);
  assert.equal(one.position(),'1');one.click('next');assert.equal(one.position(),'2');
  assert.equal(store['cmi.core.lesson_location'],'2');
  assert.equal(JSON.parse(store['cmi.suspend_data']).position,2);
  assert.deepEqual(one.calls.filter(x=>x==='Commit'),['Commit']);
  one.click('finish');assert.equal(one.nodes.get('finish').disabled,true);
  assert.equal(store['cmi.core.lesson_status'],undefined);
  assert.equal(store['cmi.core.score.raw'],undefined);
  const two=open(store);assert.equal(two.position(),'2');two.click('previous');assert.equal(two.position(),'1');
  assert.equal(store['cmi.core.lesson_location'],'1');
});
test('a different synthetic enrollment has independent position',()=>{
  const a={},b={};open(a).click('next');assert.equal(open(a).position(),'2');assert.equal(open(b).position(),'1');
});
test('read 301 fails closed with no calls to Set/Commit',()=>{
  const s={'cmi.core.lesson_location':'2'}; const ctx=open(s,{read:'cmi.suspend_data'});
  assert.match(ctx.error(),/READ_FAILED/);assert.equal(ctx.nodes.get('next').disabled,true);
  assert.equal(ctx.calls.some(x=>x.startsWith('Set:')||x==='Commit'),false);
});
test('commit rejection cannot advance UI or update persisted state',()=>{
  const s={};const ctx=open(s,{commit:true});ctx.click('next');assert.equal(ctx.position(),'1');
  assert.match(ctx.error(),/COMMIT_FAILED/);assert.equal(s['cmi.core.lesson_location'],undefined);
});
test('suspend/location divergence fails closed',()=>{
  const s={'cmi.core.lesson_location':'2','cmi.suspend_data':JSON.stringify({scope:'AIRTRUST_SCORM_RESUME_QA_V1',position:1})};
  const ctx=open(s);assert.match(ctx.error(),/PERSISTENCE_CONFLICT/);assert.equal(ctx.nodes.get('finish').disabled,true);
});
test('cross-scope forged suspend data fails closed',()=>{
  const s={'cmi.suspend_data':JSON.stringify({scope:'ANOTHER_TENANT',position:2})};
  const ctx=open(s);assert.match(ctx.error(),/SUSPEND_SCOPE_INVALID/);assert.equal(ctx.nodes.get('next').disabled,true);
});
test('failed LMSFinish retains explicit failure; no terminal status sent',()=>{
  const ctx=open({}, {finish:true});ctx.click('finish');assert.match(ctx.error(),/FINISH_FAILED/);
  assert.equal(ctx.calls.includes('Finish'),true);assert.equal(ctx.calls.some(x=>x.startsWith('Set:')),false);
});
