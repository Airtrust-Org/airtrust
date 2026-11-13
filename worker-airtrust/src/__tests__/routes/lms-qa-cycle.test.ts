import { describe, expect, it } from 'vitest';
import { canResetCanonicalQaCycle, QA_CONFIRMATION } from '../../routes/lms-qa-cycle';

const canonical = {
  companyId:6,name:'AIRTRUST_QA_LMS_E2E_202611',
  matricula:'QA-LMS-202611',email:'qa.lms.202611@airtrust.online',
  courseId:32,expectedCourseId:32,status:'CONCLUIDO',currentCycleId:9001,
};
describe('governed canonical QA cycle endpoint identity gate',()=>{
  it('accepts only an exact canonical tenant-6 synthetic learner with terminal cycle',()=>{
    expect(QA_CONFIRMATION).toBe('AIRTRUST_QA_LMS_NEW_CYCLE');
    expect(canResetCanonicalQaCycle(canonical)).toBe(true);
    expect(canResetCanonicalQaCycle({...canonical,status:'REPROVADO'})).toBe(true);
  });
  it('refuses real employees, cross tenant users, wrong course and active enrollment',()=>{
    for(const other of [
      {...canonical,companyId:7},
      {...canonical,name:'REAL EMPLOYEE'},
      {...canonical,matricula:'QA-LMS-CHR-202611'},
      {...canonical,email:'real@airtrust.online'},
      {...canonical,courseId:33},
      {...canonical,currentCycleId:0},
      {...canonical,status:'EM_ANDAMENTO'},
      {...canonical,status:'CANCELADO'},
    ]) expect(canResetCanonicalQaCycle(other)).toBe(false);
  });
});
