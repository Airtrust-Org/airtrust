/**
 * Observe semantic suspend/resume without accepting lost SCO progress.
 * A package may reserialize a cursor checkpoint on open (e.g., append a
 * newly rendered slide to completed IDs). Equality of ZIP CMI bytes is NOT
 * required; the learner cursor and every earlier completion must survive.
 * This is only a focused learner-state check, not SCORM certification.
 */
export function observeMonotonicSuspend(beforeRaw,afterRaw){
  let before,after;
  try{
    before=JSON.parse(beforeRaw);after=JSON.parse(afterRaw);
  }catch{return {ok:false,reason:'SUSPEND_NOT_VALID_JSON'};}
  if(!before||!after||typeof before!=='object'||typeof after!=='object')
    return {ok:false,reason:'SUSPEND_NOT_OBJECT'};
  // This dedicated two-step QA fixture has no course assessment state.
  // Admit only its exact scope and shape, never arbitrary JSON cursors.
  const QA_SCOPE = 'AIRTRUST_SCORM_RESUME_QA_V1';
  if (before.scope === QA_SCOPE || after.scope === QA_SCOPE) {
    const valid = x => x.scope === QA_SCOPE &&
      Object.keys(x).sort().join(',') === 'position,scope' &&
      Number.isSafeInteger(x.position) && [1,2].includes(x.position);
    if (!valid(before) || !valid(after) || before.position !== after.position)
      return {ok:false,reason:'RESUME_CURSOR_DRIFT'};
    return {ok:true,reason:beforeRaw===afterRaw?'BYTE_IDENTICAL':'MONOTONIC_CHECKPOINT'};
  }
  // Factory V3 MGM writes suspend schema v4. Its numeric resume cursor is
  // "a"; "s" is a keyed scenario-answer map, and "c" is a boolean completion
  // flag. Interpreting "s" as the numeric cursor falsely rejects actual D1
  // readback even when the learner resumes on exactly the persisted slide.
  // The strict schema below is diagnostic only, never a certification grant.
  if (before.v===4 || after.v===4) {
    const record = value => value!==null&&typeof value==='object'&&!Array.isArray(value);
    const keys=['a','c','d','g','h','p','q','s','v','vs'].join(',');
    const valid = value => record(value)&&
      Object.keys(value).sort().join(',')===keys &&
      value.v===4&&typeof value.p==='string'&&value.p.length>0&&
      Number.isSafeInteger(value.a)&&value.a>=0 &&
      Array.isArray(value.d)&&value.d.every(n=>Number.isSafeInteger(n)&&n>=0)&&
      Array.isArray(value.g)&&value.g.every(x=>typeof x==='string'&&x.length>0)&&
      record(value.s)&&record(value.h)&&record(value.vs)&&record(value.q)&&
      typeof value.c==='boolean';
    if (!valid(before)||!valid(after))
      return {ok:false,reason:'V4_SUSPEND_SCHEMA_INVALID'};
    if (before.p!==after.p)
      return {ok:false,reason:'PACKAGE_VERSION_DRIFT_P'};
    if (before.a!==after.a)
      return {ok:false,reason:'RESUME_CURSOR_DRIFT'};
    for (const key of ['d','g']) {
      if(before[key].some(x=>!after[key].some(y=>JSON.stringify(x)===JSON.stringify(y))))
        return {ok:false,reason:'COMPLETION_LOST_'+key.toUpperCase()};
    }
    // A resumed lesson can add evidence, but must never discard answers,
    // hotspot selection, media checkpoints, or any answered assessment item.
    const preserved=(previous,current)=>{
      if(previous===null)return current!==undefined;
      if(Array.isArray(previous))return Array.isArray(current)&&
        previous.every((value,i)=>preserved(value,current[i]));
      if(record(previous))return record(current)&&
        Object.entries(previous).every(([k,value])=>Object.hasOwn(current,k)&&
          preserved(value,current[k]));
      return Object.is(previous,current);
    };
    for(const key of ['s','h','vs','q']){
      if(!preserved(before[key],after[key]))
        return {ok:false,reason:'STATE_LOST_'+key.toUpperCase()};
    }
    if(before.c&&!after.c)return {ok:false,reason:'COMPLETION_FLAG_DOWNGRADE'};
    return {ok:true,reason:beforeRaw===afterRaw?'BYTE_IDENTICAL':'MONOTONIC_CHECKPOINT'};
  }
  // Two real on-wire schemas are supported. Newer certification fixtures use
  // `s` as cursor while F5 Unified packages persist the 0-based cursor in
  // numeric `c`. In CFIT, `c` is instead a boolean completion flag, so
  // prefer `s` whenever it exists and never reinterpret boolean `c`.
  const cursor=(state)=>{
    if(Object.prototype.hasOwnProperty.call(state,'s'))
      return Number.isSafeInteger(state.s)&&state.s>=0?{key:'s',value:state.s}:null;
    return Number.isSafeInteger(state.c)&&state.c>=0?{key:'c',value:state.c}:null;
  };
  const beforeCursor=cursor(before),afterCursor=cursor(after);
  if(!beforeCursor||!afterCursor||beforeCursor.key!==afterCursor.key||
      beforeCursor.value!==afterCursor.value)
    return {ok:false,reason:'RESUME_CURSOR_DRIFT'};
  if(before.v!==after.v)return {ok:false,reason:'SUSPEND_VERSION_DRIFT'};
  // Real ZIPs differ in on-wire serialization: course #15 uses an array
  // for scenario IDs; CFIT #41 uses an object keyed by scenario identity.
  // Enforce inclusion in BOTH forms rather than accepting a dropped entry.
  for(const key of ['d','sc','g']){
    const old=before[key]??[],now=after[key]??[];
    if(Array.isArray(old)&&Array.isArray(now)){
      if(old.some(id=>!now.some(current=>JSON.stringify(current)===JSON.stringify(id))))
        return {ok:false,reason:'COMPLETION_LOST_'+key.toUpperCase()};
    }else if(old&&now&&typeof old==='object'&&typeof now==='object'&&
      !Array.isArray(old)&&!Array.isArray(now)){
      for(const [id,value] of Object.entries(old)){
        if(!(id in now)||value===true&&now[id]!==true||
          value!==false&&JSON.stringify(value)!==JSON.stringify(now[id]))
          return {ok:false,reason:'COMPLETION_LOST_'+key.toUpperCase()};
      }
    }else return {ok:false,reason:'COMPLETION_TYPE_CHANGED_'+key.toUpperCase()};
  }
  if(before.c===true&&after.c!==true)
    return {ok:false,reason:'COMPLETION_FLAG_DOWNGRADE'};
  for(const key of ['p','cv']){
    if(typeof before[key]==='string'&&before[key]!==after[key])
      return {ok:false,reason:'PACKAGE_VERSION_DRIFT_'+key.toUpperCase()};
  }
  const oldQuizzes=before.mq??{},newQuizzes=after.mq??{};
  if(!oldQuizzes||!newQuizzes||typeof oldQuizzes!=='object'||
    typeof newQuizzes!=='object'||Array.isArray(oldQuizzes)||Array.isArray(newQuizzes))
    return {ok:false,reason:'QUIZ_STATE_INVALID'};
  for(const key of Object.keys(oldQuizzes)){
    const b=oldQuizzes[key],a=newQuizzes[key];
    if(!b||!a||typeof b!=='object'||typeof a!=='object')
      return {ok:false,reason:'QUIZ_STATE_REMOVED'};
    if(b.passed===true&&a.passed!==true)
      return {ok:false,reason:'QUIZ_PASS_DOWNGRADE'};
    if(b.resultShown===true&&a.resultShown!==true)
      return {ok:false,reason:'QUIZ_RESULT_LOST'};
    if(Number.isFinite(Number(b.attempts))&&Number(a.attempts)<Number(b.attempts))
      return {ok:false,reason:'QUIZ_ATTEMPTS_DECREASED'};
    if(Number.isFinite(Number(b.score))&&Number(a.score)<Number(b.score))
      return {ok:false,reason:'QUIZ_SCORE_DOWNGRADE'};
    if(Array.isArray(b.answers)&&(!Array.isArray(a.answers)||
      b.answers.some((answer,i)=>a.answers[i]!==answer)))
      return {ok:false,reason:'QUIZ_ANSWERS_LOST'};
  }
  return {ok:true,reason:beforeRaw===afterRaw?'BYTE_IDENTICAL':'MONOTONIC_CHECKPOINT'};
}
