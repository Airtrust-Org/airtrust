import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {classifyScormQaFailure} from '../ci/lms-scorm-qa-failure-classifier.mjs';

const qa={source:'GOVERNED_STAGING_AUTHENTICATED_QA_V1'};
test('infrastructure, deadline and driver issues are inconclusive, never PACKAGE_DEFECT',()=>{
  for(const [code,expected] of [
    ['BROWSER_MISSING','INFRASTRUCTURE_ERROR'],
    ['QA_AUTH_FAILED','INFRASTRUCTURE_ERROR'],
    ['STAGING_SHA_MISMATCH','INFRASTRUCTURE_ERROR'],
    ['TEST_DEADLINE','TEST_TIMEOUT'],
    ['SESSION_TIMEOUT','TEST_TIMEOUT'],
    ['UNSUPPORTED_INTERACTION','DRIVER_UNSUPPORTED'],
    ['NO_AUTOMATION_ADAPTER','DRIVER_UNSUPPORTED'],
  ]){
    const result=classifyScormQaFailure({...qa,failureCode:code});
    assert.equal(result.category,expected);
    assert.equal(result.certification,'UNCERTIFIED');
    assert.equal(result.activationAuthorized,false);
    assert.equal(result.packageFaultConfirmed,false);
  }
});
test('missing content needs a verified inventory, not an unmatched DOM selector',()=>{
  assert.equal(classifyScormQaFailure({
    ...qa,failureCode:'ASSESSMENT_ABSENT'}).category,'FUNCTIONAL_NOT_PROVEN');
  const r=classifyScormQaFailure({
    ...qa,failureCode:'ASSESSMENT_ABSENT',contentInventoryVerified:true});
  assert.equal(r.category,'CONTENT_MISSING');
  assert.equal(r.packageFaultConfirmed,false);
});
test('only reproduced behavioral defects with healthy runtime are package faults',()=>{
  const input={...qa,failureCode:'ASSESSMENT_THRESHOLD_BYPASS',
    runtimeHealthy:true,contentInventoryVerified:true,driverSupported:true};
  assert.equal(classifyScormQaFailure(input).packageFaultConfirmed,false);
  assert.equal(classifyScormQaFailure({
    ...input,packageExecutionReproduced:true}).category,'PACKAGE_DEFECT');
  assert.equal(classifyScormQaFailure({
    ...input,packageExecutionReproduced:true,runtimeHealthy:false})
    .packageFaultConfirmed,false);
});
test('untrusted or incomplete evidence never produces certification',()=>{
  const missing=classifyScormQaFailure(null);
  assert.equal(missing.certification,'UNCERTIFIED');
  assert.equal(missing.category,'INFRASTRUCTURE_ERROR');
  const passLike=classifyScormQaFailure({...qa,failureCode:'',passed:true});
  assert.equal(passLike.certification,'UNCERTIFIED');
  assert.equal(passLike.category,'FUNCTIONAL_NOT_PROVEN');
});
