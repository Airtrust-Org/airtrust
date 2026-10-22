import {describe,expect,it,vi} from 'vitest';
import {applyPlayer3ResumeCredit,Player3ResumeCreditWriteError} from
  '../../services/lms-player3-resume-credit-writer';
import type {ResumeCreditIntent} from '../../lib/lms-player3/admin-resume-credit';

const intent:ResumeCreditIntent={
  kind:'AIRTRUST_PLAYER3_ADMIN_RESUME_CREDIT_V1',empresa_id:6,matricula_id:30,
  curso_id:20,funcionario_id:40,ciclo_id:50,original_progress_pct:80,
  original_edition_sha256:'f'.repeat(64),new_edition_sha256:'b'.repeat(64),
  resume_unit_id:'unit-33',source_snapshot_sha256:'c'.repeat(64),
  front_c_decision_key:'a'.repeat(64),front_c_t0_sha256:'d'.repeat(64),
  front_c_latest_row_sha256:'e'.repeat(64),source_updated_at:'2026-10-22T12:00:00Z',
  source_scorm_commit_at:null,actor_user_id:90,approver_user_id:91,
  approved_at:'2026-10-22T12:30:00Z',justification:'Revisão independente para restabelecer apenas a posição de retomada.',
  advances_navigation_only:true,grants_assessment_pass:false,grants_completion:false,
  grants_certificate:false,
};
const stored={id:901,idempotency_key:intent.front_c_decision_key,
  decision_key:intent.front_c_decision_key,empresa_id:6,curso_id:20,matricula_id:30,
  ciclo_id:50,funcionario_id:40,binding_id:80,source_snapshot_sha256:intent.source_snapshot_sha256,
  source_t0_sha256:intent.front_c_t0_sha256,source_row_sha256:intent.front_c_latest_row_sha256,
  original_edition_sha256:intent.original_edition_sha256,destination_edition_sha256:intent.new_edition_sha256,
  source_updated_at:intent.source_updated_at,source_scorm_commit_at:null,
  historical_progress_pct:80,resume_unit_id:'unit-33',manager_user_id:90,
  second_reviewer_user_id:91,approved_at:intent.approved_at,justification:intent.justification};

function dbHarness(opts:{batchError?:Error;row?:typeof stored|null}={}){
  const statements:{sql:string;bindings:unknown[]}[]=[];
  const prepare=vi.fn((sql:string)=>({bind:(...bindings:unknown[])=>{
    const statement={sql,bindings}; statements.push(statement);
    return { ...statement, first:async()=>opts.row===undefined?stored:opts.row };
  }}));
  const batch=vi.fn(async()=>{
    if(opts.batchError)throw opts.batchError;
    return [{success:true,meta:{changes:1}},{success:true,meta:{changes:1}},
      {success:true,meta:{changes:1}}];
  });
  return {db:{prepare,batch} as never,prepare,batch,statements};
}

describe('Player3 append-only resume credit writer',()=>{
  it('writes one tenant/cycle-bound atomic batch and returns position only',async()=>{
    const f=dbHarness();
    await expect(applyPlayer3ResumeCredit({db:f.db,intent,bindingId:80})).resolves.toMatchObject({
      state:'APPLIED',creditId:901,empresaId:6,matriculaId:30,cicloId:50,
      resumeUnitId:'unit-33',historicalProgressPct:80,
      grantsAssessmentPass:false,grantsCompletion:false,grantsQualification:false,grantsCertificate:false,
    });
    expect(f.batch).toHaveBeenCalledTimes(1);
    expect(f.statements).toHaveLength(4);
    expect(f.statements[0].sql).toContain('lms_player3_resume_credit_intents');
    expect(f.statements[0].sql).toContain('usuarios_empresas_perfis');
    expect(f.statements[1].sql).toContain('INSERT INTO lms_player3_resume_credit_ledger');
    expect(f.statements[2].sql).toContain('DELETE FROM lms_player3_resume_credit_intents');
    expect(f.statements[0].bindings).toContain('2026-10-22T12:00:00Z');
    expect(f.statements[1].bindings).toContain('unit-33');
    expect(f.statements[1].bindings).toContain('a'.repeat(64));
  });

  it('recognizes only a byte-for-byte compatible retry after an idempotency conflict',async()=>{
    const f=dbHarness({batchError:new Error('UNIQUE constraint failed'),row:stored});
    await expect(applyPlayer3ResumeCredit({db:f.db,intent,bindingId:80}))
      .resolves.toMatchObject({state:'IDEMPOTENT_REPLAY',creditId:901});
    const conflict=dbHarness({batchError:new Error('UNIQUE constraint failed'),
      row:{...stored,resume_unit_id:'different-unit'}});
    await expect(applyPlayer3ResumeCredit({db:conflict.db,intent,bindingId:80}))
      .rejects.toMatchObject({code:'PLAYER3_RESUME_CREDIT_IDEMPOTENCY_CONFLICT'});
  });

  it('rejects self-approval, completion claims, and malformed context before D1 access',async()=>{
    for(const invalid of [
      {...intent,approver_user_id:intent.actor_user_id},
      {...intent,grants_completion:true as false},
      {...intent,empresa_id:0},
    ]){
      const f=dbHarness();
      await expect(applyPlayer3ResumeCredit({db:f.db,intent:invalid,bindingId:80}))
        .rejects.toBeInstanceOf(Player3ResumeCreditWriteError);
      expect(f.prepare).not.toHaveBeenCalled();
      expect(f.batch).not.toHaveBeenCalled();
    }
  });
});
