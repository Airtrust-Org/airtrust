import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
const mocks=vi.hoisted(()=>({ preflight:vi.fn() }));
vi.mock('../../services/lms-native-canonical-completion-preflight',()=>({
  preflightNativeCanonicalCompletion:mocks.preflight,
}));
import { prepareNativeTerminalGuard } from '../../services/lms-native-terminal-preparer';
const sha='a'.repeat(64), answerSha='b'.repeat(64);
const goodProof={
  ready:true,reason:'READY',
  canonical:{
    empresaId:6,matriculaId:101,cicloId:1001,cursoId:31,funcionarioId:51,
    editionHash:sha,cursoTitulo:'Native',
    gerarQualificacaoAoConcluir:true,qualificacaoTipoId:44,
    qualificacaoCategoriaId:45,qualificacaoCodigo:'EAD',
    qualificacaoCategoriaCodigo:'EAD',qualificacaoNome:'EAD',
    qualificacaoCategoria:'EAD',validade:12,existingHistoricoId:null,
    evidenceSnapshot:{
      eventCount:8,distinctLessonCount:6,latestAttemptNumber:2,scorePct:85,
    },
  },
};
const goodRow={
  binding_id:202,edicao_id:7,tentativa_id:88,
  tentativa_numero:2,answers_sha256:answerSha,score_pct:85,
  assessment_satisfied:1,
};
function harness(row:unknown=goodRow){
  const query={sql:'',bindings:[] as unknown[]};
  const first=vi.fn(async()=>row);
  const prepare=vi.fn((sql:string)=>({
    bind:(...bindings:unknown[])=>{
      query.sql=sql;query.bindings=bindings;
      return {first};
    },
  }));
  const env={ENVIRONMENT:'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS:'6',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:'6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS:'6',
    DB:{prepare} as unknown as D1Database,
  } as Env;
  const call=()=>prepareNativeTerminalGuard({
    env,empresaId:6,matriculaId:101,actorUserId:900,
  });
  return {call,env,prepare,first,query};
}
describe('Native terminal preparation only, no canonical writes',()=>{
  beforeEach(()=>mocks.preflight.mockReset().mockResolvedValue(goodProof));
  it('returns exact verified revision and an atomic SELECT-only D1 guard',async()=>{
    const h=harness();
    const result=await h.call();
    expect(result.ready).toBe(true);
    if (!result.ready) return;
    expect(result.atomicGuard.sql).toMatch(/^SELECT json\(CASE WHEN/);
    expect(result.atomicGuard.bindings).toEqual([
      900,101,6,31,51,1001,202,7,sha,88,2,answerSha,85,8,6,1,44,1,45,
    ]);
    expect(h.query.bindings).toEqual([900,101,6,51,31,1001,sha,2]);
    expect(h.query.sql).toContain('u.active=1');
    expect(h.query.sql).toContain('f.empresa_id=m.empresa_id');
    expect(h.query.sql).toContain('newer.tentativa_numero>att.tentativa_numero');
    expect(h.query.sql).toContain('ed.status=\'PUBLISHED\'');
    expect(h.query.sql).not.toMatch(/(?:UPDATE|DELETE|INSERT)\s+(?:INTO|lms_)/);
    expect(h.prepare).toHaveBeenCalledTimes(1);
  });
  it('never queries evidence if persisted readiness or qualification is denied',async()=>{
    mocks.preflight.mockResolvedValueOnce({
      ready:false,reason:'QUALIFICATION_MAPPING_INCOMPLETE',
    });
    const h=harness();
    await expect(h.call()).resolves.toEqual({
      ready:false,reason:'QUALIFICATION_MAPPING_INCOMPLETE',
    });
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it('requires exact staging tenant allowlists before reading private evidence',async()=>{
    const h=harness();
    h.env.ENVIRONMENT='production';
    await expect(h.call()).resolves.toMatchObject({ready:false});
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
    h.env.ENVIRONMENT='staging';
    h.env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS='60';
    await expect(h.call()).resolves.toMatchObject({ready:false});
    expect(mocks.preflight).not.toHaveBeenCalled();
  });
  it('rejects changed attempt number, hash or grade instead of using stale readiness',async()=>{
    for(const row of [
      null,{...goodRow,tentativa_numero:3},
      {...goodRow,answers_sha256:'invalid'},
      {...goodRow,score_pct:32},
      {...goodRow,assessment_satisfied:0},
      {...goodRow,binding_id:0},
    ]){
      const h=harness(row);
      await expect(h.call()).resolves.toEqual({
        ready:false,reason:'NATIVE_TERMINAL_EVIDENCE_CHANGED',
      });
    }
  });
  it('fails closed if pinned attempt lookup throws',async()=>{
    const h=harness();
    h.first.mockRejectedValueOnce(Error('SQL unavailable'));
    await expect(h.call()).resolves.toEqual({
      ready:false,reason:'NATIVE_TERMINAL_EVIDENCE_LOOKUP_FAILED',
    });
  });
  it('rejects invalid employee, actor or enrollment before any D1 lookups',async()=>{
    const h=harness();
    const out=await prepareNativeTerminalGuard({
      env:h.env,empresaId:6,matriculaId:0,actorUserId:900,
    });
    expect(out.ready).toBe(false);
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
  });
});
