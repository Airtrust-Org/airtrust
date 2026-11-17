import {describe,expect,it,vi} from 'vitest';
import {
  PRODUCTION_EXAM_SCHEMA_FLAG,hasLmsExamSchema,isLmsExamSurfaceEnabled,
} from '../../lib/lms-exams/lms-exam-activation';

const staging = {
  ENVIRONMENT:'staging',
  LMS_EXAM_QUESTION_ADMIN_STAGING:'REVIEWED_SCHEMA_ONLY',
  LMS_EXAM_LEARNER_STAGING:'REVIEWED_SCHEMA_ONLY',
};
const production = {
  ENVIRONMENT:'production',
  LMS_EXAM_PRODUCTION_TENANTS:'6',
  LMS_EXAM_QUESTION_ADMIN_PRODUCTION:PRODUCTION_EXAM_SCHEMA_FLAG,
  LMS_EXAM_LEARNER_PRODUCTION:PRODUCTION_EXAM_SCHEMA_FLAG,
};

describe('LMS exam production activation — fail closed',()=>{
  it('retains explicit staging gating',()=>{
    expect(isLmsExamSurfaceEnabled(staging,'admin',6)).toBe(true);
    expect(isLmsExamSurfaceEnabled(staging,'learner',6)).toBe(true);
    expect(isLmsExamSurfaceEnabled({...staging,LMS_EXAM_LEARNER_STAGING:undefined},'learner',6)).toBe(false);
  });
  it('enables only the exact reviewed flag for the exact production tenant',()=>{
    expect(isLmsExamSurfaceEnabled(production,'admin',6)).toBe(true);
    expect(isLmsExamSurfaceEnabled(production,'learner',6)).toBe(true);
    expect(isLmsExamSurfaceEnabled(production,'learner',7)).toBe(false);
    expect(isLmsExamSurfaceEnabled({...production,LMS_EXAM_LEARNER_PRODUCTION:undefined},'learner',6)).toBe(false);
    expect(isLmsExamSurfaceEnabled({...production,LMS_EXAM_QUESTION_ADMIN_PRODUCTION:'true'},'admin',6)).toBe(false);
  });
  it.each(['','*','all','6,6','6, 7','06','0','6,a','6,0','999999999999999999999'])(
    'denies unsafe tenant allowlist %s',value=>{
      expect(isLmsExamSurfaceEnabled({...production,LMS_EXAM_PRODUCTION_TENANTS:value},'admin',6)).toBe(false);
    });
  it('rejects unknown environments, invalid IDs and missing bindings',()=>{
    expect(isLmsExamSurfaceEnabled({...production,ENVIRONMENT:'development'},'admin',6)).toBe(false);
    expect(isLmsExamSurfaceEnabled(production,'admin',0)).toBe(false);
    expect(isLmsExamSurfaceEnabled(null,'admin',6)).toBe(false);
  });
  it('checks all six D1 tables without writing any rows',async()=>{
    const prepare=vi.fn().mockReturnValue({first:vi.fn().mockResolvedValue({total:6})});
    expect(await hasLmsExamSchema({prepare} as unknown as D1Database)).toBe(true);
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0][0]).toContain('sqlite_master');
    expect(await hasLmsExamSchema({prepare:()=>({first:async()=>({total:5})})} as unknown as D1Database)).toBe(false);
    expect(await hasLmsExamSchema({prepare:()=>{throw Error('unavailable')}} as unknown as D1Database)).toBe(false);
  });
});
