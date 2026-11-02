import test from 'node:test';
import assert from 'node:assert/strict';
import {observeMonotonicSuspend} from '../qa/scorm-suspend-monotonic.mjs';
const state=(overrides={})=>JSON.stringify({
 v:2,s:1,d:[],sc:[],mq:{},...overrides,
});
test('accepts a byte-identical suspend checkpoint',()=>{
 assert.deepEqual(observeMonotonicSuspend(state(),state()),{
  ok:true,reason:'BYTE_IDENTICAL'});
});
test('accepts a reserialized checkpoint that adds completed slide progress',()=>{
 assert.deepEqual(observeMonotonicSuspend(state(),state({d:[0]})),{
  ok:true,reason:'MONOTONIC_CHECKPOINT'});
});
test('rejects cursor drift, including return to the first slide',()=>{
 for(const current of [0,2,-1,'1',null]){
  assert.equal(observeMonotonicSuspend(state(),state({s:current})).ok,false);
 }
});
test('accepts the real F5 Unified numeric c cursor without confusing CFIT boolean c',()=>{
 const f5=(overrides={})=>JSON.stringify({
  v:1,p:'AIRTRUST-F5-V4D',c:1,a:1,m:1,d:[0,1],f:[],study:false,...overrides,
 });
 assert.deepEqual(observeMonotonicSuspend(f5(),f5()),{
  ok:true,reason:'BYTE_IDENTICAL'});
 assert.equal(observeMonotonicSuspend(f5(),f5({d:[0,1,2]})).ok,true);
 for(const current of [0,2,-1,'1',null,true,false])
  assert.equal(observeMonotonicSuspend(f5(),f5({c:current})).ok,false);
 // A silent switch from F5's c cursor schema to the s cursor schema is unsafe.
 const switched=JSON.stringify({v:1,p:'AIRTRUST-F5-V4D',s:1,d:[0,1],f:[],study:false});
 assert.equal(observeMonotonicSuspend(f5(),switched).ok,false);
});

test('rejects loss of completed slides or scenarios',()=>{
 for(const key of ['d','sc']){
  const initial=state({[key]:[0,1]});
  assert.equal(observeMonotonicSuspend(initial,state({[key]:[0]})).ok,false);
 }
});
test('rejects a stored passed score or result downgrade on reopen',()=>{
 const old=state({mq:{m1:{passed:true,resultShown:true,score:100,attempts:2,answers:[1,0]}}});
 for(const q of [
  {},{passed:false,resultShown:true,score:100,attempts:2,answers:[1,0]},
  {passed:true,resultShown:false,score:100,attempts:2,answers:[1,0]},
  {passed:true,resultShown:true,score:0,attempts:2,answers:[1,0]},
  {passed:true,resultShown:true,score:100,attempts:1,answers:[1,0]},
  {passed:true,resultShown:true,score:100,attempts:2,answers:[1]},
 ]){
  assert.equal(observeMonotonicSuspend(old,state({mq:{m1:q}})).ok,false);
 }
});
test('rejects corrupted, invalid or incompatible suspend state',()=>{
 assert.equal(observeMonotonicSuspend(state(),'{broken').ok,false);
 assert.equal(observeMonotonicSuspend(state(),state({v:3})).ok,false);
 assert.equal(observeMonotonicSuspend(state({d:[0]}),state({d:'0'})).ok,false);
});

test('preserves CFIT keyed scenario state and rejects missing entries',()=>{
 const first=state({p:'course41',cv:'RC8',sc:{s7:true},g:[1],c:false});
 const advanced=state({p:'course41',cv:'RC8',sc:{s7:true,s8:false},g:[1,2],c:false});
 assert.equal(observeMonotonicSuspend(first,advanced).ok,true);
 for(const bad of [
  state({p:'course41',cv:'RC8',sc:{},g:[1],c:false}),
  state({p:'course41',cv:'RC8',sc:{s7:false},g:[1],c:false}),
  state({p:'course41',cv:'RC8',sc:{s7:true},g:[],c:false}),
  state({p:'course41',cv:'RC7',sc:{s7:true},g:[1],c:false}),
 ]){
  assert.equal(observeMonotonicSuspend(first,bad).ok,false);
 }
});
test('never downgrades the CFIT completed flag',()=>{
 const first=state({sc:{scenario7:true},c:true});
 assert.equal(observeMonotonicSuspend(first,state({sc:{scenario7:true},c:false})).ok,false);
});

test('keeps synthetic navigation fixture cursor strict without broadening F5/CFIT schemas',()=>{
 const qa=(position,scope='AIRTRUST_SCORM_RESUME_QA_V1')=>JSON.stringify({scope,position});
 assert.deepEqual(observeMonotonicSuspend(qa(2),qa(2)),{
  ok:true,reason:'BYTE_IDENTICAL'});
 assert.deepEqual(observeMonotonicSuspend(qa(2),JSON.stringify({
  position:2,scope:'AIRTRUST_SCORM_RESUME_QA_V1'})),{
  ok:true,reason:'MONOTONIC_CHECKPOINT'});
 for(const changed of [
  qa(1),qa(0),qa(3),qa('2'),qa(null),qa(2,'BAD_SCOPE'),
  JSON.stringify({scope:'AIRTRUST_SCORM_RESUME_QA_V1',position:2,completed:true}),
  state({s:2}),
 ]){
  assert.equal(observeMonotonicSuspend(qa(2),changed).ok,false);
 }
 assert.equal(observeMonotonicSuspend(state(),qa(2)).ok,false);
});

test('Factory V3 MGM v4 treats a as cursor and s as scenario state',()=>{
 const v4=(overrides={})=>JSON.stringify({
  v:4,p:'MGM_RC4_SHA_BOUND',a:1,d:[0],s:{},g:[],h:{},
  vs:{},q:{answers:[null,null],passed:false},c:false,...overrides,
 });
 assert.deepEqual(observeMonotonicSuspend(v4(),v4()),{
  ok:true,reason:'BYTE_IDENTICAL'});
 const advanced=v4({d:[0,1],s:{scenario03:1},g:['hotspot:1'],
   h:{hotspot:1},q:{answers:[1,null],passed:false}});
 assert.deepEqual(observeMonotonicSuspend(v4(),advanced),{
  ok:true,reason:'MONOTONIC_CHECKPOINT'});
 // The actual on-wire "s" is an object, never a numeric cursor.
 assert.equal(observeMonotonicSuspend(v4(),v4({a:2})).reason,'RESUME_CURSOR_DRIFT');
 assert.equal(observeMonotonicSuspend(v4(),v4({a:0})).ok,false);
 assert.equal(observeMonotonicSuspend(v4(),v4({p:'OTHER_EDITION'})).ok,false);
});
test('Factory V3 MGM v4 rejects dropped answers and completion evidence',()=>{
 const original={v:4,p:'MGM_RC4_SHA_BOUND',a:5,
  d:[0,1,2,3,4],s:{scenario02:1},g:['hotspot:0','hotspot:1'],
  h:{hotspot:1},vs:{intro:1},q:{answers:[1,null],passed:false},c:true};
 const state4=(overrides={})=>JSON.stringify({...original,...overrides});
 for(const bad of [
  {d:[0,1,2,3]}, {g:['hotspot:0']},{s:{}},{s:{scenario02:0}},
  {h:{}},{vs:{}},{q:{answers:[null,null],passed:false}},
  {c:false},{a:'5'},{s:1},{g:{}},{h:[]},{p:''},{v:3},
 ])assert.equal(observeMonotonicSuspend(state4(),state4(bad)).ok,false,
  'must reject '+JSON.stringify(bad));
});
test('Factory V3 MGM v4 never silently replaces legacy cursor schemas',()=>{
 const old=state({p:'legacy',s:1});
 const v4=JSON.stringify({v:4,p:'MGM_RC4_SHA_BOUND',a:1,d:[],s:{},g:[],
   h:{},vs:{},q:{answers:[]},c:false});
 assert.equal(observeMonotonicSuspend(old,v4).ok,false);
 assert.equal(observeMonotonicSuspend(v4,old).ok,false);
 assert.equal(observeMonotonicSuspend(v4,JSON.stringify({
   v:4,p:'MGM_RC4_SHA_BOUND',a:1,d:[],s:{},g:[],h:{},vs:{},c:false,
 })).ok,false);
});
