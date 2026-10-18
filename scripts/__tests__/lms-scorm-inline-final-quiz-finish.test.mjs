import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const src=fs.readFileSync(path.join(root,'scripts/validation/production-lms-active-course-certification-readonly.mjs'),'utf8');
const start=src.indexOf('frame.evaluate(({ plan, location, allowAdaptiveRetry, requiredDecisionSlideIndices }) => {');
const end=src.indexOf('}, { plan: answerPlan, location: currentLocation, allowAdaptiveRetry, requiredDecisionSlideIndices }).catch',start);
assert.ok(start>=0&&end>start);
const callback=src.slice(start+'frame.evaluate('.length,end+1);
function fixture({question='4',answered='4',finish=true}={}) {
 const dom=new JSDOM(`<!doctype html><html><body><main><h1>Questão ${question} de 4</h1><span>Respondidas ${answered}/4</span>
 <button class="answer selected" data-quiz-choice="3">Resposta já registrada</button>
 <button class="qbtn" data-quiz-nextq disabled>Próxima questão</button>
 ${finish?'<button id="completeBtn">Concluir avaliação</button>':''}
 </main></body></html>`,{url:'https://qa.invalid',runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.document.body.innerText=`Questão ${question} de 4 Respondidas ${answered}/4`;
 dom.window.Element.prototype.getBoundingClientRect=()=>({width:140,height:28,left:5,right:145,top:10,bottom:38});
 const clicked=[];
 dom.window.document.querySelectorAll('button').forEach(x=>x.addEventListener('click',()=>clicked.push(x.id||x.className)));
 const action=dom.window.eval('('+callback+')');
 const step=()=>action({plan:[{slideIndex:10,indices:[3]}],location:'10/42',allowAdaptiveRetry:false,requiredDecisionSlideIndices:[]});
 return {step,clicked,close:()=>dom.window.close()};
}
test('when final question and all four answers registered, click authored finish instead of disabled NextQ',()=>{
 const f=fixture();
 try{assert.equal(f.step().type,'inline-quiz-finish');assert.deepEqual(f.clicked,['completeBtn']);}
 finally{f.close();}
});
test('do not submit quiz before complete authored answer count',()=>{
 const f=fixture({answered:'3'});
 try{assert.equal(f.step().type,'inline-quiz-question-gate-blocked');assert.equal(f.clicked.length,0);}
 finally{f.close();}
});
test('do not synthesize finish when author did not expose a final action',()=>{
 const f=fixture({finish:false});
 try{assert.equal(f.step().type,'inline-quiz-question-gate-blocked');assert.equal(f.clicked.length,0);}
 finally{f.close();}
});
test('stop repeated finish if course refuses to leave the quiz',()=>{
 const f=fixture();
 try{for(let i=0;i<3;i++)assert.equal(f.step().type,'inline-quiz-finish');assert.equal(f.step().type,'inline-quiz-finish-no-progress');assert.equal(f.clicked.length,3);}
 finally{f.close();}
});
