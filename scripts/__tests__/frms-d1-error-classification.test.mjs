import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {classifyFrmsD1Error, validatedPhase, FRMS_INVENTORY_PHASES} from '../production/frms-d1-error-classification.mjs';

test('classifies D1 errors without disclosing provider SQL, PII, token or response payload',()=>{
  const examples=[
    [{errors:[{code:7500,message:'SQLITE_ERROR: no such column: f.missing_col SELECT private.account_key'}]},'D1_SCHEMA_COLUMN_MISSING'],
    [{errors:[{code:7500,message:'SQLITE_ERROR: no such table: frms_fake'}]},'D1_SCHEMA_TABLE_MISSING'],
    [{errors:[{code:7500,message:'near "WHERE": syntax error SELECT secret'}]},'D1_SQL_SYNTAX_REJECTED'],
    [{errors:[{code:7500,message:'Database is busy'}]},'D1_TEMPORARY_UNAVAILABLE'],
    [{errors:[{code:7500,message:'anonymous internal provider error'}]},'D1_CF_CODE_7500'],
  ];
  for (const [response,category] of examples) {
    const actual=classifyFrmsD1Error(400,response);
    assert.equal(actual,category);
    assert.doesNotMatch(actual,/SELECT|private|secret|token|account_key|f\.missing_col|frms_fake/i);
  }
});
test('handles permissions, rate limit, and unknown errors using only fixed labels',()=>{
  assert.equal(classifyFrmsD1Error(403,{errors:[{code:7500,message:'raw secret'}]}),'D1_ACCESS_DENIED');
  assert.equal(classifyFrmsD1Error(429,{}),'D1_RATE_LIMITED');
  assert.equal(classifyFrmsD1Error(502,{errors:[]}),'D1_HTTP_502');
  assert.equal(classifyFrmsD1Error(null,{}),'D1_READ_REJECTED');
});
test('accepts only reviewed phase labels',()=>{
  for(const phase of FRMS_INVENTORY_PHASES)assert.equal(validatedPhase(phase),phase);
  assert.equal(validatedPhase('SELECT personal_data FROM users'),'unclassified');
  assert.equal(validatedPhase(null),'unclassified');
});
