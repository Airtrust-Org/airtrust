import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStrictLinkCandidate,linkCandidateHash} from '../repair-yngrid-employee-link.mjs';
const u={id:71,empresa_id:6,nome:'Yngrid Fonseca',email:'yngrid@example.invalid',
  active:1,perfil:'ADMIN',funcionario_id:null};
const f={id:81,empresa_id:6,nome:'Yngrid Fonseca',email:'yngrid@example.invalid',
  ativo:1,status:'ATIVO'};
const access={role:'admin',perfis:['ADMIN']};
const args={users:[u],staff:[f],access,target:'Yngrid'};
test('single-tenant admin, unique same-email active employee yields exact candidate',()=>{
 const x=selectStrictLinkCandidate(args);
 assert.deepEqual(x,{tenantId:6,userId:71,employeeId:81,normalizedEmail:'yngrid@example.invalid'});
 const h=linkCandidateHash(x,'a'.repeat(40));
 assert.match(h,/^[0-9a-f]{64}$/);
 assert.notEqual(h,linkCandidateHash({...x,employeeId:82},'a'.repeat(40)));
 assert.notEqual(h,linkCandidateHash(x,'b'.repeat(40)));
});
test('rejects duplicate active users and multi-company membership',()=>{
 assert.throws(()=>selectStrictLinkCandidate({...args,users:[u,{...u,id:72}]}),/USER_NOT_UNIQUE/);
 assert.throws(()=>selectStrictLinkCandidate({...args,users:[u,{...u,empresa_id:7}]}),/GLOBAL_IDENTITY_MULTITENANT/);
});
test('rejects pre-existing different user link and employee already claimed',()=>{
 assert.throws(()=>selectStrictLinkCandidate({...args,users:[{...u,funcionario_id:999}]}),/EXISTING_USER_LINK/);
 assert.throws(()=>selectStrictLinkCandidate({...args,users:[u,{...u,id:72,nome:'Other',email:'other@example.invalid',funcionario_id:81}]}),/EMPLOYEE_LINK_CONFLICT/);
});
test('rejects inactive employee, duplicate emails and cross tenant',()=>{
 assert.throws(()=>selectStrictLinkCandidate({...args,staff:[{...f,ativo:0}]}),/EMPLOYEE_NOT_UNIQUE/);
 assert.throws(()=>selectStrictLinkCandidate({...args,staff:[f,{...f,id:82}]}),/EMPLOYEE_NOT_UNIQUE/);
 assert.throws(()=>selectStrictLinkCandidate({...args,staff:[{...f,empresa_id:7}]}),/EMPLOYEE_NOT_UNIQUE/);
});
test('rejects role elevation, changed profiles or ambiguous email',()=>{
 assert.throws(()=>selectStrictLinkCandidate({...args,access:{role:'student',perfis:['ALUNO']}}),/TENANT_ROLE_NOT_ADMIN/);
 assert.throws(()=>selectStrictLinkCandidate({...args,access:{role:'admin',perfis:['ADMIN','ALUNO']}}),/TENANT_PROFILES_CHANGED/);
 assert.throws(()=>selectStrictLinkCandidate({...args,users:[{...u,perfil:'GESTOR'}]}),/USER_ROLE_CHANGED/);
 assert.throws(()=>selectStrictLinkCandidate({...args,staff:[{...f,email:'wrong@example.invalid'}]}),/EMPLOYEE_NOT_UNIQUE/);
});
