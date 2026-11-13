/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildScormFunctionalDriverScript } from '../../lib/lms/lms-scorm-functional-driver';

type LegacySlide = { id: string; layout: string; required?: boolean; objectives?: unknown[]; options?: Array<{correct:boolean}> };
type LegacyQuestion = {q:string;options:string[];answer:number};
type TestGlobal = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g=globalThis as TestGlobal;

function createLegacySCO(options: {invalidQuiz?:boolean;wrongStatus?:boolean;noNext?:boolean;nonemptyStart?:boolean;unknownCourse?:boolean}={}) {
  const slides:LegacySlide[]=[
    {id:'objectives',layout:'objectives',required:true,objectives:[{},{}]},
    {id:'scenario',layout:'scenario',options:[{correct:false},{correct:true}]},
    ...Array.from({length:22},(_,i)=>({id:'content-'+i,layout:'cover'})),
    {id:'quiz',layout:'quiz'},
  ];
  const questions:LegacyQuestion[]=Array.from({length:20},(_,i)=>({
    q:'Question '+i,options:['A','B','C'],answer:i%3,
  }));
  if(options.invalidQuiz)questions[0].answer=99;
  const course={id:options.unknownCourse?'OTHER_COURSE':'REGULACAO_ANAC_SCORM12_REV13_AIRTRUST_V4_PNG',
    questionCount:20,passingScore:70};
  let current=0,quizIndex=0,quizComplete=false,quizScore=0,finishCalls=0,clickCount=0;
  let status='incomplete',rawScore='0';
  const completed=new Set<string>();
  if(options.nonemptyStart)completed.add('objectives');
  const interactions=new Map<string,Set<number>>();
  const answers:number[]=[];
  const sync=()=>Object.assign(g,{
    COURSE:course,SLIDES:slides,QUIZ:questions,current,completed,interactions,
    quizIndex,quizComplete,quizScore,quizAnswers:answers,
    Scorm:{get:(key:string)=>key==='cmi.core.lesson_status'?status:key==='cmi.core.score.raw'?rawScore:''},
  });
  const render=()=>{
    g.document.body.innerHTML='';
    if(!options.noNext){
      const next=g.document.createElement('button');next.id='nextBtn';
      next.addEventListener('click',()=>{
        clickCount++;
        if(current<slides.length-1){
          const slide=slides[current];
          if(slide.layout==='scenario'&&!completed.has(slide.id))return;
          if(slide.required&&(interactions.get(slide.id)?.size??0)<(slide.objectives?.length??0))return;
          completed.add(slide.id);current++;sync();render();
        }else if(quizComplete&&quizScore>=70)finishCalls++;
      });
      g.document.body.append(next);
    }
    const slide=slides[current];
    if(slide.layout==='objectives'){
      for(let i=0;i<2;i++){
        const button=g.document.createElement('button');button.dataset.touch=String(i);
        button.addEventListener('click',()=>{
          clickCount++;
          if(!interactions.has(slide.id))interactions.set(slide.id,new Set());
          interactions.get(slide.id)?.add(i);sync();render();
        });
        g.document.body.append(button);
      }
    }
    if(slide.layout==='scenario'){
      const choice=g.document.createElement('button');choice.dataset.opt='1';
      choice.addEventListener('click',()=>{clickCount++;completed.add(slide.id);sync();render();});
      g.document.body.append(choice);
    }
    if(slide.layout==='quiz'&&!quizComplete){
      const q=questions[quizIndex];
      for(let i=0;i<q.options.length;i++){
        const button=g.document.createElement('button');button.dataset.quiz=String(i);
        button.addEventListener('click',()=>{clickCount++;answers[quizIndex]=i;sync();render();});
        g.document.body.append(button);
      }
      const nextQuestion=g.document.createElement('button');nextQuestion.id='quizNext';
      nextQuestion.disabled=answers[quizIndex]===undefined;
      nextQuestion.addEventListener('click',()=>{
        clickCount++;
        if(answers[quizIndex]===undefined)return;
        if(quizIndex<questions.length-1){quizIndex++;sync();render();}
        else {
          quizScore=Math.round(answers.filter((a,i)=>a===questions[i].answer).length/questions.length*100);
          quizComplete=true;completed.add('quiz');
          status=options.wrongStatus?'incomplete':quizScore>=70?'passed':'failed';
          rawScore=String(quizScore);sync();render();
        }
      });
      g.document.body.append(nextQuestion);
    }
  };
  sync();render();
  return {state:()=>({current,done:[...completed],quizComplete,quizScore,finishCalls,clickCount,
    interactions:[...(interactions.get('objectives')??[])],answers:[...answers],status,rawScore})};
}
function drive(){
  return new Function('return '+buildScormFunctionalDriverScript())() as
    {supported:boolean;completed:boolean;steps:number;reason:string|null};
}
describe('ANAC #23 legacy real-control functional driver',()=>{
  beforeEach(()=>{
    g.document.body.innerHTML='';
    for(const k of ['COURSE','SLIDES','QUIZ','current','completed','interactions',
      'quizIndex','quizComplete','quizScore','quizAnswers','Scorm'])delete g[k];
  });
  it('completes 25 slides, 20 correct answers and exactly one real finish click',()=>{
    const sco=createLegacySCO();
    expect(drive()).toMatchObject({supported:true,completed:true,reason:null});
    const state=sco.state();
    expect(state.current).toBe(24);
    expect(state.done).toHaveLength(25);
    expect(state.quizComplete).toBe(true);
    expect(state.quizScore).toBe(100);
    expect(state.status).toBe('passed');
    expect(state.rawScore).toBe('100');
    expect(state.finishCalls).toBe(1);
    expect(state.interactions).toEqual([0,1]);
    expect(state.answers).toHaveLength(20);
    expect(state.clickCount).toBeGreaterThan(45);
    expect(buildScormFunctionalDriverScript()).not.toContain('LMSSetValue(');
  });
  it('rejects incorrect author answer key before clicking anything',()=>{
    const sco=createLegacySCO({invalidQuiz:true});
    expect(drive()).toMatchObject({supported:true,completed:false,reason:'LEGACY_ANAC23_AUTHORING_CONTRACT_INVALID'});
    expect(sco.state().clickCount).toBe(0);
  });
  it('rejects unproven SCORM status despite 100 percent quiz score',()=>{
    const sco=createLegacySCO({wrongStatus:true});
    expect(drive()).toMatchObject({supported:true,completed:false,reason:'LEGACY_ANAC23_COMPLETION_EVIDENCE_MISSING'});
    expect(sco.state().finishCalls).toBe(0);
  });
  it('does not certify a previously resumed or pre-completed state',()=>{
    const sco=createLegacySCO({nonemptyStart:true});
    expect(drive()).toMatchObject({supported:true,completed:false,reason:'LEGACY_ANAC23_AUTHORING_CONTRACT_INVALID'});
    expect(sco.state().finishCalls).toBe(0);
  });
  it('requires package-authored next button',()=>{
    const sco=createLegacySCO({noNext:true});
    expect(drive()).toMatchObject({supported:true,completed:false,reason:'LEGACY_ANAC23_AUTHORING_CONTRACT_INVALID'});
    expect(sco.state().finishCalls).toBe(0);
  });
  it('does not broaden legacy support to unknown packages',()=>{
    const sco=createLegacySCO({unknownCourse:true});
    expect(drive()).toMatchObject({supported:false,completed:false,reason:'NO_FACTORY_M8_DRIVER'});
    expect(sco.state().finishCalls).toBe(0);
  });
});
