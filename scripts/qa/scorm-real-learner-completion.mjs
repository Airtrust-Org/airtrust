/**
 * A real learner must complete the course through the UI. Automated DOM
 * actions are deliberately constrained: no page.evaluate, network mutation,
 * injected postMessage, or SCO/CMI field writing.
 */
const bad=reason=>{throw Error('SCORM_REAL_LEARNER_DRIVER_'+reason);};
const safeSelector=s=>typeof s==='string'&&s.trim().length>0&&s.length<=240&&
  !/[\u0000-\u001f]/.test(s);
export function validateScormLearnerCompletionPlan(driver){
  if(!driver||driver.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(driver.packageSha256))
    bad('EXACT_ZIP_IDENTITY_MISSING');
  const stage=driver.completion;
  if(!stage||!Array.isArray(stage.actions)||stage.actions.length<1||
     stage.actions.length>20)bad('LEARNER_COMPLETION_UI_MISSING');
  const replay=driver.replayCompletion;
  if(replay!==undefined&&
    (!Array.isArray(replay.actions)||replay.actions.length<1||
      replay.actions.length>20))bad('REPLAY_UI_INVALID');
  for(const action of [...stage.actions,...(replay?.actions||[])]){
    if(!action||action.op!=='click'||!['sco','host'].includes(action.surface)||
      !safeSelector(action.selector)||Object.keys(action).sort().join(',')!==
      'op,selector,surface')bad('UNSAFE_COMPLETION_ACTION');
  }
  return true;
}
