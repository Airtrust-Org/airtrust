import {describe,it,expect} from 'vitest';
import {isEligibleForHistoricEditionCredit,HISTORICAL_EDITION_CREDIT_REASON}
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
