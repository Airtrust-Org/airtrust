'use strict';
/**
 * Observe a REAL HTTP response for one specific SCORM commit event.
 * A passive SCO finish must never be mistaken for user finalization.
 * Local QA helper only; no completion writes or trusted attestations.
 */
const EVENTS=new Set(['SCORM_FINISH','SCORM_USER_FINALIZE']);
function matchesScormEvent(response,event) {
  try {
    if(response.request().method()!=='POST'||
       new URL(response.url()).pathname!=='/api/lms/matriculas/scorm/commit')return false;
    return response.request().postDataJSON()?.commit_event===event;
  } catch {return false;}
}
async function observeScormCommit(page,event,action,{timeoutMs=25000}={}) {
  if(!EVENTS.has(event)||typeof action!=='function'||
     !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)
    throw Error('SCORM_QA_OBSERVATION_SCOPE_INVALID');
  // Register BEFORE triggering the learner action: the request can be fast.
  const responsePromise=page.waitForResponse(
    response=>matchesScormEvent(response,event),{timeout:timeoutMs});
  try {await action();}
  catch(error){responsePromise.catch(()=>{});throw error;}
  const response=await responsePromise;
  const finishedError=await response.finished();
  if(finishedError)throw Error('SCORM_QA_'+event+'_NETWORK_FAILED');
  if(!response.ok())throw Error('SCORM_QA_'+event+'_HTTP_'+response.status());
  return response.status();
}
module.exports={matchesScormEvent,observeScormCommit};
