import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScormLearnerCompletionPlan} from '../qa/scorm-real-learner-completion.mjs';
const valid=()=>({schemaVersion:1,packageSha256:'a'.repeat(64),
  completion:{actions:[{op:'click',surface:'host',selector:'#completeCourse'}]},
  replayCompletion:{actions:[{op:'click',surface:'sco',selector:'#reopen'}]},
});
test('requires a legitimate visible learner completion control for the exact ZIP',()=>{
  assert.equal(validateScormLearnerCompletionPlan(valid()),true);
});
test('rejects absent, empty or oversized UI finalization plans',()=>{
  for(const value of [undefined,{actions:[]},{actions:Array(21).fill({op:'click',surface:'sco',selector:'#x'})}]){
    assert.throws(()=>validateScormLearnerCompletionPlan({...valid(),completion:value}),
      /LEARNER_COMPLETION_UI_MISSING/);
  }
});
test('rejects CMI injection, postMessage, evaluate and arbitrary API calls as completion',()=>{
  const template=valid();
  for(const action of [
    {op:'evaluate',surface:'sco',selector:'#completeCourse'},
    {op:'postMessage',surface:'host',selector:'#completeCourse'},
    {op:'request',surface:'host',selector:'/api/lms/matriculas/1/concluir'},
    {op:'click',surface:'outside',selector:'#completeCourse'},
    {op:'click',surface:'sco',selector:'#completeCourse',value:'100'},
    {op:'click',surface:'sco',selector:''},
  ]){
    assert.throws(()=>validateScormLearnerCompletionPlan({
      ...template,completion:{actions:[action]}}),/UNSAFE_COMPLETION_ACTION/);
  }
});
test('optional replay UI actions may not bypass DOM constraints',()=>{
  assert.equal(validateScormLearnerCompletionPlan({...valid(),replayCompletion:undefined}),true);
  assert.throws(()=>validateScormLearnerCompletionPlan({
    ...valid(),replayCompletion:{actions:[{op:'commit',surface:'host',selector:'#x'}]},
  }),/UNSAFE_COMPLETION_ACTION/);
});
test('refuses malformed package identity',()=>{
  assert.throws(()=>validateScormLearnerCompletionPlan({...valid(),packageSha256:'wrong'}),
    /EXACT_ZIP_IDENTITY_MISSING/);
});
