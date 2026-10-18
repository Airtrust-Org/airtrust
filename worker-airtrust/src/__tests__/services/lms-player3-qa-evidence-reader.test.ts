import {createHash} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Env} from '../../types';
const stubs=vi.hoisted(()=>({
  context:vi.fn(),session:vi.fn(),certificate:vi.fn(),grade:vi.fn(),
}));
vi.mock('../../services/lms-player3-module-attempt-writer',async original=>{
  const actual=await original<typeof import('../../services/lms-player3-module-attempt-writer')>();
  return {...actual,loadApprovedPlayer3StageContext:stubs.context};
});
vi.mock('../../services/lms-native-readiness-repository',()=>({
  readNativeLearnerSession:stubs.session,
}));
vi.mock('../../services/lms-player3-certificate-status',()=>({
  readPlayer3CertificateStatus:stubs.certificate,
}));
vi.mock('../../lib/lms-player3/private-stage-grader',()=>({
  gradePlayer3ApprovedStage:stubs.grade,
}));
import {readPlayer3QaSnapshot} from '../../services/lms-player3-qa-evidence-reader';

type Row={
  politica_id:number;etapa_id:string;tentativa_numero:number;event_id:string;
  answers_json:string;answers_sha256:string;score_pct:number;passed:number;
};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const attempt=(num:number,optionId:string):Row=>{
  const answers_json=JSON.stringify([{questionId:'q1',optionId}]);
  return {politica_id:15,etapa_id:'stage1',tentativa_numero:num,
    event_id:'event-'+num,answers_json,answers_sha256:sha(answers_json),
    score_pct:optionId==='correct'?100:20,passed:optionId==='correct'?1:0};
};
let rows:Row[];
let metadata:Record<string,unknown>;
const env={
  ENVIRONMENT:'staging',
  NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:'6',
  PLAYER3_QA_READ_ENABLED_TENANTS:'6',
} as unknown as Env;
const db={
  prepare:vi.fn((sql:string)=>{
    const isLedger=sql.includes('lms_player3_tentativas_modulares');
    return {bind:vi.fn((..._args:unknown[])=>({
      first:vi.fn(async()=>isLedger?null:{...metadata}),
      all:vi.fn(async()=>({success:true,results:rows})),
    }))};
  }),
};
const call=()=>readPlayer3QaSnapshot({
  env,db:db as unknown as D1Database,bucket:{} as R2Bucket,
  empresaId:6,actorUserId:44,matriculaId:911,
});
describe('Native Player3 read-only QA evidence reconciliation',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    rows=[attempt(1,'wrong'),attempt(2,'correct')];
    metadata={
      status:'EM_ANDAMENTO',progresso_pct:45,
      qualificacao_historico_id:null,funcionario_id:88,
      ciclo_id:1000,ciclo_status:'EM_ANDAMENTO',
    };
    stubs.context.mockResolvedValue({
      course:{editionHash:'a'.repeat(64),cicloId:1000,cursoId:77,artifact:{}},
      binding:{vinculo_id:200,politica_id:15},
      policy:{schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',certificationApproved:true,
        stages:[{stageId:'stage1'}]},
      bank:{},
    });
    stubs.session.mockResolvedValue({summary:{seenLessonIds:['lesson1']}});
    stubs.certificate.mockResolvedValue({
      ciclo_id:1000,matricula_status:'EM_ANDAMENTO',
      historico_id:null,certificate_state:'ENROLLMENT_NOT_COMPLETED',
      documento_id:null,
    });
    stubs.grade.mockImplementation((_bank:unknown,_policy:unknown,submitted:{
      answers:{optionId:string}[]
    })=>({
      scorePct:submitted.answers[0].optionId==='correct'?100:20,
      stagePassed:submitted.answers[0].optionId==='correct',
    }));
  });
  it('preserves the actual failure and retry, regraded server-side without leaking answers',async()=>{
    const snapshot=await call();
    expect(snapshot).toMatchObject({
      empresa_id:6,matricula_id:911,ciclo_id:1000,
      status:'EM_ANDAMENTO',progresso_pct:45,
      completed_unit_ids:['lesson1'],
      attempts:[
        {stage_id:'stage1',attempt_number:1,passed:false,score_pct:20},
        {stage_id:'stage1',attempt_number:2,passed:true,score_pct:100},
      ],
      qualificacao_historico_id:null,certificate_id:null,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/answers|optionId|questionId|privateBank/i);
    expect(stubs.context).toHaveBeenCalledWith(expect.objectContaining({
      empresaId:6,matriculaId:911,actorUserId:44,readOnlyQa:true,
    }));
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });
  it('verifies canonical completed status, qualification and archived PDF receipt',async()=>{
    metadata={...metadata,status:'CONCLUIDO',ciclo_status:'CONCLUIDO',
      progresso_pct:100,qualificacao_historico_id:77};
    stubs.certificate.mockResolvedValueOnce({
      ciclo_id:1000,matricula_status:'CONCLUIDO',
      historico_id:77,certificate_state:'PDF_HEADER_VERIFIED',documento_id:99,
    });
    const result=await call();
    expect(result).toMatchObject({
      status:'CONCLUIDO',progresso_pct:100,
      qualificacao_historico_id:77,certificate_id:99,
    });
  });
  it('rejects tampered grade, missing attempt and old policy evidence',async()=>{
    const invalid=[
      (r:Row[])=>{r[0].score_pct=100;},
      (r:Row[])=>{r[1].tentativa_numero=3;},
      (r:Row[])=>{r[0].answers_sha256='0'.repeat(64);},
      (r:Row[])=>{r[0].politica_id=99;},
      (r:Row[])=>{r[1].event_id=r[0].event_id;},
      (r:Row[])=>{r.push(attempt(3,'wrong'));},
    ];
    for(const tamper of invalid){
      rows=[attempt(1,'wrong'),attempt(2,'correct')];
      tamper(rows);
      await expect(call()).rejects.toThrow();
    }
  });
  it('rejects missing records or a truncated history rather than fabricate a partial snapshot',async()=>{
    rows=Array.from({length:201},(_,i)=>attempt(i+1,'wrong'));
    await expect(call()).rejects.toThrow('QA_SNAPSHOT_LEDGER_UNAVAILABLE');
    rows=[attempt(1,'wrong')];
    metadata.ciclo_status='CONCLUIDO';
    await expect(call()).rejects.toThrow('QA_SNAPSHOT_METADATA_INVALID');
  });
  it('checks the exact tenant flag before any data access',async()=>{
    const forbidden={...env,PLAYER3_QA_READ_ENABLED_TENANTS:'*'} as Env;
    await expect(readPlayer3QaSnapshot({
      env:forbidden,db:db as unknown as D1Database,
      bucket:{} as R2Bucket,empresaId:6,actorUserId:44,matriculaId:911,
    })).rejects.toThrow('QA_SNAPSHOT_DISABLED_OR_INVALID');
    expect(stubs.context).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });
});