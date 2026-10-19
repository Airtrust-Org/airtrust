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
