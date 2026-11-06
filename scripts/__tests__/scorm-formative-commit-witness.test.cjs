'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {matchesScormEvent,observeScormCommit}=require('../qa/scorm-formative-commit-witness.cjs');

const response=(event,status=200,finishError=null)=>({
  url:()=> 'http://127.0.0.1:8787/api/lms/matriculas/scorm/commit',
  request:()=>({method:()=> 'POST',postDataJSON:()=>({commit_event:event})}),
  status:()=>status,ok:()=>status>=200&&status<300,
  finished:async()=>finishError,
});
function fakePage(){
  let watches=[];
  return {
    waitForResponse(predicate,{timeout}){
      return new Promise((resolve,reject)=>{
        const watcher={predicate,resolve,reject};
        watcher.timer=setTimeout(()=>{watches=watches.filter(w=>w!==watcher);
          reject(Error('QA_WAIT_TIMEOUT'));},timeout);
        watches.push(watcher);
      });
    },
    send(res){
      for(const watch of [...watches]){
        if(!watch.predicate(res))continue;
        clearTimeout(watch.timer);
        watches=watches.filter(w=>w!==watch);
        watch.resolve(res);
      }
    },
  };
}
test('waits for the actual passive HTTP response, not merely the action',async()=>{
  const page=fakePage();
  let finished=false;
  const witness=observeScormCommit(page,'SCORM_FINISH',async()=>{
    setTimeout(()=>{finished=true;page.send(response('SCORM_FINISH'));},20);
  },{timeoutMs:150});
  assert.equal(finished,false);
  assert.equal(await witness,200);
  assert.equal(finished,true);
});
test('an unrelated SCORM_FINISH never satisfies user confirmation',async()=>{
  const page=fakePage();
  await assert.rejects(
    observeScormCommit(page,'SCORM_USER_FINALIZE',async()=>{
      page.send(response('SCORM_FINISH'));
    },{timeoutMs:35}),
    /QA_WAIT_TIMEOUT/,
  );
});
test('refuses a non-2xx explicit finalization response',async()=>{
  const page=fakePage();
  await assert.rejects(
    observeScormCommit(page,'SCORM_USER_FINALIZE',async()=>{
      page.send(response('SCORM_USER_FINALIZE',409));
    },{timeoutMs:120}),
    /SCORM_QA_SCORM_USER_FINALIZE_HTTP_409/,
  );
});
test('never accepts a response whose body failed to finish',async()=>{
  const page=fakePage();
  await assert.rejects(
    observeScormCommit(page,'SCORM_FINISH',async()=>{
      page.send(response('SCORM_FINISH',200,new Error('stream abort')));
    },{timeoutMs:120}),
    /SCORM_QA_SCORM_FINISH_NETWORK_FAILED/,
  );
});
test('exactly matches POST commit endpoint and recognized events',()=>{
  assert.equal(matchesScormEvent(response('SCORM_FINISH'),'SCORM_FINISH'),true);
  assert.equal(matchesScormEvent(response('SCORM_FINISH'),'SCORM_USER_FINALIZE'),false);
  assert.equal(matchesScormEvent({
    ...response('SCORM_FINISH'),
    url:()=> 'http://127.0.0.1:8787/api/lms/cursos/1',
  },'SCORM_FINISH'),false);
});
test('does not permit arbitrary event names or invalid timeouts',async()=>{
  await assert.rejects(observeScormCommit(fakePage(),'SCORM_COMMIT',()=>{}),
    /SCORM_QA_OBSERVATION_SCOPE_INVALID/);
  await assert.rejects(observeScormCommit(fakePage(),'SCORM_FINISH',()=>{},{timeoutMs:0}),
    /SCORM_QA_OBSERVATION_SCOPE_INVALID/);
});
