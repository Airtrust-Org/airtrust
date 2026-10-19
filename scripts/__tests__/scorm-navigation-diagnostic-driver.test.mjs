import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNavigationDiagnostic} from '../qa/scorm-navigation-diagnostic-driver.mjs';
const sha='a'.repeat(64),files={'index.html':new Uint8Array([1,2])};
const valid=()=>({kind:'LOCAL_NAVIGATION_DIAGNOSTIC_ONLY',
 activationAuthorized:false,packageSha256:sha,launchFile:'index.html',
 requiredContent:[{selector:'#count'}],
 resume:{actions:[{op:'click',selector:'#next'}],
  assertion:{selector:'#count',state:'visible'}}});
test('diagnostic navigation profile allows a SHA-pinned real ZIP without claiming certification',()=>{
 assert.equal(validateNavigationDiagnostic(valid(),sha,files),true);
});
test('refuses ZIP drift, missing launch, active authorization or unknown scope',()=>{
 for(const d of [
  {...valid(),packageSha256:'b'.repeat(64)},
  {...valid(),launchFile:'../secret.html'},
  {...valid(),activationAuthorized:true},
  {...valid(),kind:'GOVERNED_STAGING_AUTHENTICATED_QA_V1'},
 ]){
  assert.throws(()=>validateNavigationDiagnostic(d,sha,files));
 }
});
test('cannot represent an assessment verdict or certificate',()=>{
 for(const invalid of [
  {pass:{actions:[{op:'click',selector:'#next'}]}},
  {fail:{actions:[{op:'click',selector:'#next'}]}},
  {requiresAssessment:false},{certified:true},{scoredOutcome:'passed'},
 ]){
  assert.throws(()=>validateNavigationDiagnostic({...valid(),...invalid},sha,files));
 }
});
test('requires bounded visible navigation; blocks arbitrary filling and mass clicking',()=>{
 for(const d of [
  {...valid(),requiredContent:[]},
  {...valid(),resume:{...valid().resume,actions:[{op:'fill',selector:'#score',value:'100'}]}},
  {...valid(),resume:{...valid().resume,actions:Array(6).fill({op:'click',selector:'#next'})}},
  {...valid(),resume:{...valid().resume,assertion:{selector:'#count',state:'hidden'}}},
 ]){
  assert.throws(()=>validateNavigationDiagnostic(d,sha,files));
 }
});
