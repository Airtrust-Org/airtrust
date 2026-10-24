import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=fs.readFileSync(path.join(root,'scripts/validation/production-lms-active-course-certification-readonly.mjs'),'utf8');
const start=source.indexOf('frame.evaluate(({ plan, location, allowAdaptiveRetry, requiredDecisionSlideIndices }) => {');
const end=source.indexOf('}, { plan: answerPlan, location: currentLocation, allowAdaptiveRetry, requiredDecisionSlideIndices }).catch',start);
assert.ok(start>=0&&end>start,'test must extract executable in-frame callback');
const cb=source.slice(start+'frame.evaluate('.length,end+1);
function page(){
 const dom=new JSDOM('<!doctype html><html><body><main><button class="choice correct" data-quiz-choice="0" disabled>Resposta correta registrada</button><button id="next">Próximo</button></main></body></html>',{url:'https://qa.invalid',runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.Element.prototype.getBoundingClientRect=()=>({width:120,height:30,top:10,bottom:40,left:10,right:130});
 dom.window.document.body.innerText='Questão 1 de 1';
 const calls=[];
 dom.window.document.querySelector('#next').addEventListener('click',()=>calls.push('next'));
 const fn=dom.window.eval('('+cb+')');
 return {step:(loc='11/126')=>fn({plan:[],location:loc,allowAdaptiveRetry:false,requiredDecisionSlideIndices:[]}),calls,close:()=>dom.window.close()};
}
test('unchanged formative question stops after six Next attempts, without marking SCO complete',()=>{
 const f=page();
 try{
  for(let i=0;i<6;i++)assert.equal(f.step().type,'next');
  const blocked=f.step();
  assert.equal(blocked.type,'navigation-stall-no-progress');
  assert.equal(blocked.repeated_next,6);
  assert.equal(f.calls.length,6);
 }finally{f.close();}
});
test('new actual lesson location resets the Next loop counter',()=>{
 const f=page();
 try{
  for(let i=0;i<6;i++)f.step('11/126');
  assert.equal(f.step('12/126').type,'next');
  assert.equal(f.calls.length,7);
 }finally{f.close();}
});
