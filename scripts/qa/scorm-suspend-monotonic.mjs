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
  if(!Number.isSafeInteger(before.s)||!Number.isSafeInteger(after.s)||
      before.s!==after.s||before.s<0)
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
