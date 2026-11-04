import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLearnerIdentity} from '../diagnose-learner-link.mjs';
const u={id:7,nome:'Yngrid Teste',empresa_id:6,active:1,perfil:'ALUNO',email:'y@test.invalid',funcionario_id:null};
const f={id:9,nome:'Yngrid Teste',empresa_id:6,ativo:1,status:'ATIVO',email:'y@test.invalid'};
const args={users:[u],staff:[f],access:{role:'student',perfis:['ALUNO']},permissions:[],tenantId:6,target:'Yngrid'};
test('unique email match is a candidate, never an automatic link',()=>{
 const x=assessLearnerIdentity(args);assert.equal(x.recommendation,'LINK_CANDIDATE_VERIFY_AND_AUTHORIZE');assert.equal(x.user_has_employee_link,false);
});
test('linked active employee is valid and deny is preserved',()=>{
 const x=assessLearnerIdentity({...args,users:[{...u,funcionario_id:9}],permissions:[{permissao:'funcionarios.edit',tipo:'DENY'}]});
 assert.equal(x.recommendation,'LINK_VALID_CHECK_RBAC');assert.equal(x.employee_edit_explicit_deny,true);
});
test('duplicate identity and wrong tenant do not become eligible',()=>{
 const dup=assessLearnerIdentity({...args,users:[u,{...u,id:11}]});
 assert.equal(dup.recommendation,'IDENTITY_REVIEW_REQUIRED');
 const cross=assessLearnerIdentity({...args,users:[{...u,funcionario_id:9}],staff:[{...f,empresa_id:7}]});
 assert.equal(cross.recommendation,'LINK_WRONG_TENANT_OR_DELETED');
});
