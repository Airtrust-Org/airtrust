import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root,'scripts/validation/production-lms-active-course-certification-readonly.mjs'),'utf8');
const startMarker = 'frame.evaluate(({ plan, location, allowAdaptiveRetry, requiredDecisionSlideIndices }) => {';
const endMarker = '}, { plan: answerPlan, location: currentLocation, allowAdaptiveRetry, requiredDecisionSlideIndices }).catch';
const start = source.indexOf(startMarker), end = source.indexOf(endMarker,start);
assert.ok(start >= 0 && end > start,'real runtime driver callback required');
const callback = source.slice(start+'frame.evaluate('.length,end+1);

function makePage(markup,location,answerPlan=[]) {
  const dom = new JSDOM('<!doctype html><html><body><main>'+markup+'</main></body></html>',{
    url:'https://qa.invalid',runScripts:'outside-only',pretendToBeVisual:true,
  });
  dom.window.Element.prototype.getBoundingClientRect=function(){
    const offscreen=this.hasAttribute('data-offscreen');
    return {width:140,height:24,top:offscreen?1500:10,left:10,right:150,bottom:offscreen?1524:34};
  };
  dom.window.Element.prototype.scrollIntoView = function(){this.setAttribute('data-scrolled','yes');};
  const clicks=[];
  dom.window.document.querySelectorAll('button,input').forEach(el=>el.addEventListener('click',()=>{
    clicks.push(el.hasAttribute('data-quiz-choice')?'answer-'+el.dataset.quizChoice:el.id||el.type);
    if(el.hasAttribute('data-quiz-choice')) {
      dom.window.document.querySelectorAll('[data-quiz-choice]').forEach(c=>c.classList.remove('selected'));
      el.classList.add('selected');
    }
  }));
  const callbackFn=dom.window.eval('('+callback+')');
  const step=()=>callbackFn({plan:answerPlan,location,allowAdaptiveRetry:false,requiredDecisionSlideIndices:[]});
  return {dom,step,clicks,close:()=>dom.window.close()};
}
test('legacy data-next requires a real authored answer selection before navigation (#25/#26)',()=>{
  const f=makePage('<button data-quiz-choice="0" class="choice">A</button><button data-quiz-choice="1" class="choice">B</button><button data-next="1">Próxima questão</button>','11/126',[{slideIndex:11,indices:[1]}]);
  try{
    assert.equal(f.step().type,'inline-quiz-authored-answer');
    assert.deepEqual(f.clicks,['answer-1']);
    assert.equal(f.step().type,'inline-quiz-next');
    assert.deepEqual(f.clicks,['answer-1','button']);
  }finally{f.close();}
});
test('legacy data-next cannot invent an answer when no authored mapping exists',()=>{
  const f=makePage('<button data-quiz-choice="0" class="choice">A</button><button data-next="1">Próxima</button>','11/102');
  try{assert.equal(f.step().type,'inline-quiz-authored-answer-missing');assert.deepEqual(f.clicks,[]);}finally{f.close();}
});
test('repeated data-next at unchanged question reports driver stall instead of 3600 steps',()=>{
  const f=makePage('<button data-quiz-choice="0" class="choice selected">A</button><button data-next="1">Próxima</button>','11/126',[{slideIndex:11,indices:[0]}]);
  try {
    for(let i=0;i<4;i++)assert.equal(f.step().type,'inline-quiz-next');
    assert.equal(f.step().type,'inline-quiz-no-progress-after-answer');
    assert.equal(f.clicks.length,4);
  }finally{f.close();}
});
test('native checklist controls below viewport receive genuine clicks (#29)',()=>{
  const f=makePage('<label><input type="checkbox" data-offscreen="yes" id="c1"/>Primeiro</label><label><input type="checkbox" data-offscreen="yes" id="c2"/>Segundo</label><button type="button" id="next" disabled>Próximo</button>','10/56');
  try {
    assert.equal(f.step().type,'checklist-checkbox');
    assert.equal(f.step().type,'checklist-checkbox');
    assert.equal(f.dom.window.document.querySelectorAll('input:checked').length,2);
    assert.equal(f.clicks.join(','),'c1,c2');
    assert.equal(f.dom.window.document.querySelector('#next').disabled,true);
  }finally{f.close();}
});
test('checkbox hidden by ancestor cannot be marked, unlike visible authored checklist',()=>{
  const f=makePage('<section hidden><input type="checkbox" id="hidden"/></section><label><input type="checkbox" id="shown" />Visible</label><button id="next" disabled>Próximo</button>','10/56');
  try{
    assert.equal(f.step().type,'checklist-checkbox');
    assert.deepEqual(f.clicks,['shown']);
    assert.equal(f.dom.window.document.querySelector('#hidden').checked,false);
  }finally{f.close();}
});
