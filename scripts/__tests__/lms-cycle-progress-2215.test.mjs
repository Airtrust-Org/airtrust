import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCOPE,validateBefore,validateAfter,checkChangedIds} from '../production/lms-cycle-progress-2215.mjs';

const rows=[
 {m:385,tenant:6,course:34,c:508,ms:'EM_ANDAMENTO',mp:58,mi:'2026-06-30 16:12:59',cs:'EM_ANDAMENTO',cp:100,ci:'2026-06-30 16:12:59',score:100,tries:3,qual:null},
 {m:1390,tenant:6,course:22,c:2671,ms:'EM_ANDAMENTO',mp:2,mi:'2026-11-13 01:43:21',cs:'NAO_INICIADO',cp:0,ci:null,score:null,tries:0,qual:null},
 {m:2057,tenant:6,course:68,c:2305,ms:'EM_ANDAMENTO',mp:5,mi:'2026-10-16 15:08:46',cs:'EM_ANDAMENTO',cp:2,ci:'2026-10-16 15:08:46',score:0,tries:1,qual:null},
];
function copy(){return structuredClone(rows);}
test('scope contains only tenant6 three known cycles',()=>{
 assert.match(SCOPE,/TENANT6/);
 assert.equal(validateBefore(copy()).length,64);
 for(const index of [0,1,2]){
  const altered=copy();altered[index].tenant=7;
  assert.throws(()=>validateBefore(altered),/CYCLE2215_PRESTATE_DRIFT/);
 }
});
test('reject prestate drift, enrollment status changed or missing starts',()=>{
 for(const change of [
  a=>a[0].cp=99,a=>a[1].mp=5,a=>a[2].cs='CONCLUIDO',
  a=>a[1].mi=null,a=>a.pop(),
 ]){
  const altered=copy();change(altered);
  assert.throws(()=>validateBefore(altered));
 }
});
test('accept exact monotonic reconciliation while retaining score, attempts and history',()=>{
 const before=copy(),after=copy();
 after[1].cp=2;after[1].cs='EM_ANDAMENTO';after[1].ci=before[1].mi;
 after[2].cp=5;
 validateAfter(after,before);
 assert.equal(after[0].cp,100);
});
test('never downgrade SCORM cycle 508 or forge completed state',()=>{
 const before=copy(),after=copy();
 after[1].cp=2;after[1].cs='EM_ANDAMENTO';
 after[2].cp=5;
 after[0].cp=58;
 assert.throws(()=>validateAfter(after,before));
 after[0].cp=100;after[0].cs='CONCLUIDO';
 assert.throws(()=>validateAfter(after,before));
});
test('reject unscoped or partial D1 writes',()=>{
 checkChangedIds([{id:2671},{id:2305}]);
 for(const bad of [[{id:2671}],[{id:2671},{id:9999}],[]])
  assert.throws(()=>checkChangedIds(bad));
});
