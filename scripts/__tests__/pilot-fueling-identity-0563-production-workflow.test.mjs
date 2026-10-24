// source_reference: Schema V2 0563 production workflow review
// operational_decision: exact change_id must have physical preflight and postconditions
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('0563 production Schema V2 routes only reviewed change to both read-only validators',()=>{
 const workflow=readFileSync('.github/workflows/apply-schema-change-v2.yml','utf8');
 const needle="inputs.change_id == 'controle-voos-pilot-fueling-identity-0563'";
 assert.equal(workflow.split(needle).length-1,2);
 for(const side of ['preflight','postconditions']){
   const file=`scripts/schema-v2/validate-0563-production-${side}.sh`;
   assert.match(workflow,new RegExp(file.replaceAll('.','\\.')));
   const script=readFileSync(file,'utf8');
   assert.match(script,/\[\[ "\$target" == airtrust-db \]\]/);
   assert.match(script,/--env production --remote --json/);
   assert.match(script,/schema-ledger-0563/);
   assert.match(script,/client-identity-column/);
   assert.match(script,/unique-partial-index/);
   assert.match(script,/immutable-client-id-trigger/);
   assert.doesNotMatch(script,/--file|\b(DELETE FROM|DROP TABLE|UPDATE\s+cv_|INSERT INTO)\b/i);
 }
});
