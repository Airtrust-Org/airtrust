// source_reference: read-only prod preflight 2026-11-11; explicit FDM designation incident.
// operational_decision: 9 designated EAD opt-ins + 2 new FDM EAD links, never merge distinct #205.
// dry_run_required: reviewed production preflight; rollback_plan_required: Schema V2 forward-only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const sql=read('worker-airtrust/schema-v2/changes/0578_compliance_designations_ead_contract.sql');
const pre=read('scripts/schema-v2/validate-0578-production-preflight.sh');
const post=read('scripts/schema-v2/validate-0578-production-postconditions.sh');
test('signed schema V2 change matches approved SQL and plan',()=>{
 const m=JSON.parse(read('worker-airtrust/schema-v2/compliance-designation-ead-contract-0578.json'));
 assert.equal(m.changeId,'compliance-designation-ead-contract-0578');
 assert.equal(createHash('sha256').update(sql).digest('hex'),m.fileHash);
 assert.equal(createHash('sha256').update(read(m.planPath)).digest('hex'),m.planHash);
 assert.match(sql,/id IN \(587,656,657,658,659,660,669,674,705\)/);
 assert.match(sql,/qt\.codigo='FDM_GATE'/);
 assert.match(sql,/cc\.codigo IN \('FDM_COMITE','GATEKEEPER'\)/);
 assert.match(sql,/COALESCE\(auto_matricular_ead,0\) IN \(0,1\)/);
});
test('no mutation of historical training, LMS courses, identities, or other tenants',()=>{
 assert.doesNotMatch(sql,/UPDATE lms_cursos|UPDATE qualificacoes_historico|INSERT INTO lms_matriculas|UPDATE funcionarios/i);
 assert.match(sql,/WHERE empresa_id=6/);
 assert.match(sql,/WHERE cc.empresa_id=6/);
 assert.match(sql,/NOT EXISTS/);
 assert.match(sql,/1=\(SELECT COUNT\(\*\) FROM lms_cursos/);
});
test('governed workflow requires exactly scoped pre- and postconditions',()=>{
 const wf=read('.github/workflows/apply-schema-change-v2.yml');
 assert.match(wf,/validate-0578-production-preflight/);
 assert.match(wf,/validate-0578-production-postconditions/);
 assert.match(wf,/compliance-designation-ead-contract-0578/);
 assert.match(pre,/target_rules 9/);
 assert.match(pre,/fdm_ead_rules_absent 0/);
 assert.match(pre,/designated_manager 1/);
 assert.match(post,/opt_in_rules 9/);
 assert.match(post,/fdm_ead_conditions 2/);
 assert.match(post,/preserve_distinct_formal_model 2/);
});
