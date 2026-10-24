import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {plan,PAIRS} from '../production/lms-ten-historical-edition-credit.mjs';
const workflow=readFileSync(new URL('../../.github/workflows/production-lms-historical-edition-manager-credit.yml',import.meta.url),'utf8');
const row=([id,course])=>({id,curso_id:course,empresa_id:6,funcionario_id:id+42,
 status:'EM_ANDAMENTO',progresso_pct:100,data_conclusao:null,qualificacao_historico_id:null,
 deleted_at:null,updated_at:'2026-10-15T11:20:00',observacoes:'history',
 gerar_qualificacao_ao_concluir:1,qualificacao_tipo_id:course,
 lesson_status:'incomplete',success_status:null,score_raw:65,score_max:100,
 cycle_id:id+900,cycle_count:1,cycle_status:'EM_ANDAMENTO',cycle_progress:100,
 cycle_completed:null,cycle_updated_at:'2026-10-15T11:20:00',scorm_count:1});
test('all and only ten fixed tenant 6 matched course enrollments qualify',()=>{
 const p=plan(PAIRS.map(row));
 assert.equal(p.allowed.length,10);assert.deepEqual(p.blocked,[]);
 assert.equal(p.qualifications.length,10);
 assert.match(p.hash,/^[0-9a-f]{64}$/);
});
test('no history credit for foreign tenant, failed SCORM, missing cycle or expired state',()=>{
 for(const patch of [{empresa_id:7},{success_status:'failed'},{scorm_count:0},{cycle_count:0},
  {status:'CONCLUIDO'},{progresso_pct:99},{qualificacao_historico_id:1}]){
  const rows=PAIRS.map(row);Object.assign(rows[0],patch);
  const p=plan(rows);assert.equal(p.allowed.length,9);assert.equal(p.blocked.length,1);
 }
});
test('any missing row is reported as blocked and source is bounded by exact IDs',()=>{
 const p=plan(PAIRS.slice(0,9).map(row));
 assert.equal(p.blocked.length,1);assert.equal(p.blocked[0].reasons[0],'NOT_FOUND');
 assert.throws(()=>plan([...PAIRS.map(row),row([9999,20])]),/PLAN_IDENTITY/);
});
test('workflow requires reviewed SHA eight gates recovery and never deploys Worker',()=>{
 for(const s of ['verify-release-gates.mjs','time-travel info','reviewed_dry_run_id',
  'environment: production','lms-ten-historical-edition-credit.mjs'])assert.ok(workflow.includes(s),s);
 assert.ok(!workflow.includes('deploy-airtrust.yml'));
});
