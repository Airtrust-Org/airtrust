import {describe,it,expect} from 'vitest';
import {isEligibleForHistoricEditionCredit,HISTORICAL_EDITION_CREDIT_REASON,
 ADMIN_EDITION_CREDIT_20261103_REASON}
 from '../../lib/lms/lms-historical-edition-admin-credit';
const base={empresaId:6,matriculaId:2106,cursoId:68,isAdmin:true,
 reason:HISTORICAL_EDITION_CREDIT_REASON+': manager attests completion of old edition',
 status:'EM_ANDAMENTO',progressoPct:100,qualificationId:null,isScorm:true,
 currentCourseActive:true,hasScormEvidence:true,lessonStatus:'incomplete',successStatus:null};
describe('finite-scope old-edition administrative qualification credit',()=>{
 it('requires tenant, exact enrollment/course, administrator and provenance',()=>{
  expect(isEligibleForHistoricEditionCredit(base)).toBe(true);
  for(const change of [{empresaId:7},{matriculaId:2110},{cursoId:7},{isAdmin:false},
   {reason:'arbitrary approval'},{isScorm:false},{currentCourseActive:false}]){
   expect(isEligibleForHistoricEditionCredit({...base,...change})).toBe(false);
  }
 });
 it('never re-issues qualification, credits incomplete history or explicit failure',()=>{
  for(const change of [{progressoPct:99},{status:'CONCLUIDO'},{qualificationId:123},
   {hasScormEvidence:false},{lessonStatus:'failed'},{successStatus:'failed'}]){
   expect(isEligibleForHistoricEditionCredit({...base,...change})).toBe(false);
  }
 });
 it('matches only the ten individually approved enrollments and course bindings',()=>{
  for(const [matriculaId,cursoId] of [[2106,68],[384,34],[201,28],[608,43],[2139,68],
   [610,43],[544,7],[624,43],[700,55],[2052,68]]){
   expect(isEligibleForHistoricEditionCredit({...base,matriculaId,cursoId})).toBe(true);
  }
 });
});
describe('2026-11-03 attestation for enrollments stuck at 99-100% by platform errors',()=>{
 const attested={...base,matriculaId:2378,cursoId:71,
  reason:ADMIN_EDITION_CREDIT_20261103_REASON+': titular do programa atesta falha de plataforma'};
 it('accepts exactly the three listed enrollments with their own provenance',()=>{
  for(const [matriculaId,cursoId] of [[857,3],[1219,7],[2378,71]]){
   expect(isEligibleForHistoricEditionCredit({...attested,matriculaId,cursoId})).toBe(true);
  }
 });
 it('rejects any other enrollment, course binding, tenant, non-admin or other reason',()=>{
  for(const change of [{matriculaId:1263,cursoId:65},{matriculaId:857,cursoId:71},{empresaId:7},
   {isAdmin:false},{reason:'arbitrary approval'},{reason:HISTORICAL_EDITION_CREDIT_REASON+': x'},
   {reason:ADMIN_EDITION_CREDIT_20261103_REASON}]){
   expect(isEligibleForHistoricEditionCredit({...attested,...change})).toBe(false);
  }
 });
 it('keeps every safety rule: no re-issue, no partial history, no explicit failure',()=>{
  for(const change of [{progressoPct:99},{status:'CONCLUIDO'},{qualificationId:9},
   {hasScormEvidence:false},{lessonStatus:'failed'},{successStatus:'failed'},{isScorm:false},
   {currentCourseActive:false}]){
   expect(isEligibleForHistoricEditionCredit({...attested,...change})).toBe(false);
  }
 });
 it('does not widen the earlier allowlist: the new reason is invalid for it',()=>{
  expect(isEligibleForHistoricEditionCredit({...base,reason:ADMIN_EDITION_CREDIT_20261103_REASON+': x'})).toBe(false);
 });
});
