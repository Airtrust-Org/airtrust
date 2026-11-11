import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {classify,summarize} from '../audit-designation-lms-linkage.mjs';
const route=readFileSync(new URL('../../../worker-airtrust/src/routes/compliance-treinamentos-conditions.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../../src/react-app/components/compliance/TrainingComplianceConditionsEditor.tsx',import.meta.url),'utf8');
test('read-only audit distinguishes EAD, manual, unavailable and deliberately unconfigured',()=>{
 assert.equal(classify({categoria:'Treinamentos Operacionais',course_count:0}),'MANUAL_OR_NON_EAD');
 assert.equal(classify({categoria:'EAD',course_count:0}),'EAD_MISSING_COURSE');
 assert.equal(classify({categoria:'EAD',course_count:2}),'EAD_AMBIGUOUS_COURSE');
 assert.equal(classify({categoria:'EAD',course_count:1,auto_matricular_ead:0,modalidade_requerida:'EAD'}),'EAD_AUTOMATION_DISABLED');
 assert.equal(classify({categoria:'EAD',course_count:1,auto_matricular_ead:1,modalidade_requerida:null}),'EAD_AUTOMATION_DISABLED');
 assert.equal(classify({categoria:'EAD',course_count:1,auto_matricular_ead:1,modalidade_requerida:'EAD'}),'EAD_AUTOMATION_CONFIGURED');
 const output=summarize([{rule_id:42,qualificacao_tipo_id:201,condicao_id:32,categoria:'EAD',course_count:1,auto_matricular_ead:0,modalidade_requerida:null}]);
 assert.equal(output.gaps[0].condition_id,32);
});
test('assignment API reports lack of automatic contract and preserves tenant isolation',()=>{
 assert.match(route,/inspectAssignedConditionEnrollmentContract/);
 assert.match(route,/tr\.empresa_id=\?/);
 assert.match(route,/lc\.empresa_id=tr\.empresa_id/);
 assert.match(route,/qt\.categoria/);
 assert.match(route,/autoEnrollmentWarning=contractGap/);
 assert.match(route,/AUTO_ENROLLMENT_DEFERRED/);
});
test('screen never claims full success when automatic enrollment remains unconfigured',()=>{
 assert.match(ui,/if\(!incomplete\) showToast\.success/);
 assert.match(ui,/NO_EAD_POLICY/);
 assert.match(ui,/UNMAPPED_MANDATORY_QUALIFICATION/);
 assert.match(ui,/matrícula automática não confirmada/);
});

test('reassigning existing designation records an UPDATE, not fabricated INSERT',()=>{
 assert.match(route,/const wasExisting = Boolean\(id\)/);
 assert.match(route,/acao: wasExisting \? 'UPDATE' : 'INSERT'/);
});
