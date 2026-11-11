// source_reference: ANAC 1167/2026 source baseline 2026-10-08, tenant 6.
 // operational_decision: register all remaining valid 2026/2027 proposed trainings without inactive employees or support-only renewals.
 // dry_run_required: production read-only prior to creating any qualifications planned.
 // rollback_plan_required: D1 Time Travel recovery, fail-closed hashes, authenticated readback.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { manifestValid, matchedHistorical, reportJSON } from '../anac1167-remaining-import.mjs';
const source=readFileSync(new URL('../anac1167-remaining-import.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../../.github/workflows/production-anac1167-remaining-training.yml',import.meta.url),'utf8');

test('manifest hash cannot be swapped for arbitrary roster',()=>{
 assert.throws(()=>manifestValid('{}'),/PRIVATE_MANIFEST_SHA_CHANGED/);
 assert.match(source,/PRIVATE_SHA='[0-9a-f]{64}'/);
 assert.match(workflow,/AIRTRUST_ANAC1167_REMAINING_GZIP_B64/);
 assert.doesNotMatch(workflow,/Filipe Passaroni|Romulo Harfield|Diego Bichara/);
});
test('every approved code and course type pinned, inactive omitted, no confirmation',()=>{
 assert.match(source,/EXPECTED=\{classes:20,participants:45,days:73,physical:16\}/);
 assert.match(source,/FORMER_EMPLOYEE_EXCLUSION_CHANGED/);
 assert.match(source,/n!==72/);
 assert.match(source,/p\.status==='PLANEJADO'/);
 assert.match(source,/qualificacao_tipo_id===QUAL\[i\]/);
 assert.match(source,/p\.codigo_turma\)/);
});
test('same-date completed histories are collisions and must abort before any create',()=>{
 const m={training_groups:[{payload:{participante_ids:[7],qualificacao_tipo_id:40,data_inicio:'2027-05-18'}}]};
 const history=[{funcionario_id:7,qualificacao_id:40,day:'2027-05-18',status:'CONCLUIDA'},
  {funcionario_id:6,qualificacao_id:40,day:'2027-05-18',status:'CONCLUIDA'}];
 assert.equal(matchedHistorical(m,history).length,1);
 assert.match(source,/check\(before\.existing_count===0&&before\.historical_collisions===0,'PREEXISTING_CLASS_OR_HISTORY'\)/);
 assert.ok(source.indexOf('check(before.existing_count===0')<source.lastIndexOf('for(const g of m.training_groups)'));
});
test('same-SHA dry-run controls apply, exact production environment and 8 gates',()=>{
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/verify-release-gates\.mjs/);
 assert.match(workflow,/ANAC1167_REVIEWED_STATE_HASH/);
 assert.match(workflow,/D1_RECOVERY_TIMESTAMP_UTC/);
 assert.match(workflow,/ANAC1167_REMAINING_APPLY_TENANT6_PROVISIONAL/);
 assert.match(workflow,/REVIEWED_COUNTS_INVALID/);
});
test('independent planned curricula, grouped readback and temporary delays',()=>{
 assert.match(source,/AW-F05-SEM/);
 assert.match(source,/AW-F06-SEM/);
 assert.match(source,/READBACK_MISSING_CLASSES/);
 assert.match(source,/HISTORIES_NOT_PLANNED|RB_HISTORY_INVALID/);
 assert.match(source,/Atomics\.wait\(delay,0,0,3000\)/);
 assert.doesNotMatch(source,/\/convocacoes\//);
});

test('proof is valid parseable JSON with terminal newline',()=>{
 const s=reportJSON({mode:'dry-run',existing_count:0});
 assert.deepEqual(JSON.parse(s),{mode:'dry-run',existing_count:0});
 assert.ok(s.endsWith(String.fromCharCode(10)));
 assert.equal(s.at(-2),'}');
});
