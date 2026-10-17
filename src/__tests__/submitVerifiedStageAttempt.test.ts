import {describe,expect,it,vi} from 'vitest';
import {makePlayer3VerifiedStageSubmitter} from
  '@/react-app/pages/lms/player3/submitVerifiedStageAttempt';
import type {P3ExamContext,P3ExamAnswer} from
  '@/react-app/pages/lms/player3/Player3AssessmentModal';

const context:P3ExamContext={
  empresaId:6,matriculaId:911,cicloId:800,editionSha256:'a'.repeat(64),
  stageId:'module-1',title:'Doutrinamento Módulo 1',
  questions:[{id:'q1',prompt:'Questão',options:[
    {id:'o0',text:'A'},{id:'o1',text:'B'},
  ]}],
};
const answers:P3ExamAnswer[]=[{questionId:'q1',optionId:'o0'}];
const json=(data:unknown,status=200)=>new Response(
  JSON.stringify({success:true,data}),
  {status,headers:{'content-type':'application/json'}},
);
const stage=(extra:Record<string,unknown>={})=>({
  stageId:'module-1',attempts:0,lastScorePct:null,
  passed:false,nextAttemptNumber:1,...extra,
});
const session=(extra:Record<string,unknown>={})=>({
  editionSha256:context.editionSha256,cycleId:context.cicloId,
  completionSupported:false,allOfficialStagesPassed:false,
  stages:[stage()],...extra,
});
const receipt=(extra:Record<string,unknown>={})=>({
  state:'APPLIED',stage_id:'module-1',attempt_number:1,
  edition_sha256:context.editionSha256,score_pct:80,
  stage_passed:true,completion_supported:false,...extra,
});

function transport(responses:Response[]){
  let n=0;
  const request=vi.fn(async (url:string,init:RequestInit)=>{
    void url; void init;
    const response=responses[n++];
    if(!response)throw new Error('unexpected request');
    return response;
  });
  const submit=makePlayer3VerifiedStageSubmitter(context,request,'/api');
  return {request,submit};
}

describe('Player 3 — official assessment transport and regraded Worker receipt',()=>{
  it('submits only stable attempt identifiers and answers; attests success after re-read',async()=>{
    const {request,submit}=transport([
      json(session()),json(receipt(),201),
      json(session({stages:[stage({
        attempts:1,lastScorePct:80,passed:true,nextAttemptNumber:2,
      })]})),
    ]);
    const verified=await submit(answers);
    expect(verified).toMatchObject({
      empresa_id:6,matricula_id:911,ciclo_id:800,
      edition_sha256:context.editionSha256,
      stage_id:'module-1',attempt_number:1,stage_passed:true,
      score_pct:80,persisted:true,
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0][0]).toBe('/api/lms/native/matriculas/911/etapas/sessao');
    expect(request.mock.calls[1][0]).toBe('/api/lms/native/matriculas/911/etapas/module-1/tentativas');
    const post=request.mock.calls[1][1];
    expect(post.method).toBe('POST');
    const input=JSON.parse(String(post.body));
    expect(input).toMatchObject({attemptNumber:1,answers});
    expect(input.eventId).toMatch(/^p3-[a-f0-9]{32}$/);
    expect(Object.keys(input).sort()).toEqual(['answers','attemptNumber','eventId']);
    expect(request.mock.calls[2][0]).toMatch(/\/etapas\/sessao$/);
  });
  it('retains real failed verdict without unlocking module or reporting completion',async()=>{
    const {submit}=transport([
      json(session()),json(receipt({score_pct:30,stage_passed:false}),201),
      json(session({stages:[stage({
        attempts:1,lastScorePct:30,passed:false,nextAttemptNumber:2,
      })]})),
    ]);
    expect(await submit(answers)).toMatchObject({
      stage_passed:false,score_pct:30,persisted:true,
    });
  });
  it('allows a new attempt only after an authentic failed grade is re-read',async()=>{
    const fail={
      ...receipt(),attempt_number:1,score_pct:30,stage_passed:false,
    };
    const pass={
      ...receipt(),attempt_number:2,score_pct:80,stage_passed:true,
    };
    const {request,submit}=transport([
      json(session()),json(fail,201),
      json(session({stages:[stage({
        attempts:1,lastScorePct:30,passed:false,nextAttemptNumber:2,
      })]})),
      json(session({stages:[stage({
        attempts:1,lastScorePct:30,passed:false,nextAttemptNumber:2,
      })]})),
      json(pass,201),
      json(session({stages:[stage({
        attempts:2,lastScorePct:80,passed:true,nextAttemptNumber:3,
      })]})),
    ]);
    const failed=await submit(answers);
    expect(failed).toMatchObject({
      attempt_number:1,score_pct:30,stage_passed:false,persisted:true,
    });
    const passed=await submit(answers);
    expect(passed).toMatchObject({
      attempt_number:2,score_pct:80,stage_passed:true,persisted:true,
    });
    expect(request).toHaveBeenCalledTimes(6);
    const first=JSON.parse(String(request.mock.calls[1][1].body));
    const second=JSON.parse(String(request.mock.calls[4][1].body));
    expect(first.attemptNumber).toBe(1);
    expect(second.attemptNumber).toBe(2);
    expect(second.eventId).not.toBe(first.eventId);
    await expect(submit(answers)).rejects.toThrow('REOPEN_TO_RECONCILE');
    expect(request).toHaveBeenCalledTimes(6);
  });
  it('rejects fabricated POST grade, edition and attempt number',async()=>{
    for(const changed of [
      {score_pct:120},{edition_sha256:'b'.repeat(64)},
      {stage_id:'module-2'},{attempt_number:2},
      {completion_supported:true},
    ]){
      const {request,submit}=transport([json(session()),json(receipt(changed),201)]);
      await expect(submit(answers)).rejects.toThrow('INVALID_OFFICIAL_RECEIPT');
      expect(request).toHaveBeenCalledTimes(2);
    }
  });
  it('never unlocks from POST alone when the regraded Worker ledger disagrees',async()=>{
    const {submit}=transport([
      json(session()),json(receipt(),201),
      json(session({stages:[stage()]})),
    ]);
    await expect(submit(answers)).rejects.toThrow('LEDGER_RECHECK_FAILED');
    await expect(submit(answers)).rejects.toThrow('REOPEN_TO_RECONCILE');
  });
  it('locks ambiguous network writes instead of issuing a new event/attempt',async()=>{
    const calls=vi.fn(async (_url:string,init:RequestInit)=>{
      if(init.method==='GET')return json(session());
      throw new Error('network dropped after Worker commit');
    });
    const submit=makePlayer3VerifiedStageSubmitter(context,calls,'/api');
    await expect(submit(answers)).rejects.toThrow('network dropped');
    await expect(submit(answers)).rejects.toThrow('REOPEN_TO_RECONCILE');
    expect(calls).toHaveBeenCalledTimes(2);
  });
  it('rejects wrong cycle and stages already passed before any POST',async()=>{
    const bad=transport([json(session({cycleId:999}))]);
    await expect(bad.submit(answers)).rejects.toThrow('SESSION_SCOPE_OR_LEDGER_INVALID');
    expect(bad.request).toHaveBeenCalledTimes(1);
    const done=transport([json(session({stages:[stage({
      attempts:1,lastScorePct:90,passed:true,nextAttemptNumber:2,
    })]}))]);
    await expect(done.submit(answers)).rejects.toThrow('STAGE_NOT_RETRYABLE');
    expect(done.request).toHaveBeenCalledTimes(1);
  });
  it('prevents forged or duplicate client choices before sending a request',async()=>{
    const {request,submit}=transport([]);
    await expect(submit([{questionId:'q1',optionId:'guess'}]))
      .rejects.toThrow('ANSWER_SELECTION_INVALID');
    await expect(submit([{questionId:'wrong',optionId:'o0'}]))
      .rejects.toThrow('ANSWER_SELECTION_INVALID');
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects missing/invalid stage policy, bypass and unapproved browser context',async()=>{
    expect(()=>makePlayer3VerifiedStageSubmitter({...context,cicloId:0},
      vi.fn(),'/api')).toThrow('UNAPPROVED_CONTEXT');
    expect(()=>makePlayer3VerifiedStageSubmitter(context,
      vi.fn(),'https://bad.example/?token=fake')).toThrow('UNAPPROVED_CONTEXT');
    // A valid-looking HTTPS staging host is still forbidden if it is not
    // the API origin configured by AirTrust. No JWT can be sent there.
    const malicious=vi.fn();
    expect(()=>makePlayer3VerifiedStageSubmitter(context,
      malicious,'https://staging-evil.example/api')).toThrow('UNAPPROVED_CONTEXT');
    expect(malicious).not.toHaveBeenCalled();
    const x=transport([json(session({stages:[stage({stageId:'other'})]}))]);
    await expect(x.submit(answers)).rejects.toThrow('STAGE_MISSING_FROM_POLICY');
  });
});
