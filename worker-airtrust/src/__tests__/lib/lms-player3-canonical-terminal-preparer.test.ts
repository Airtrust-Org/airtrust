import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Env} from '../../types';
import {preparePlayer3VerifiedPassProofs}
  from '../../services/lms-player3-terminal-proof-preparer';
import {readNativeLearnerSession}
  from '../../services/lms-native-readiness-repository';
import {requireActiveQualificationCategoryById}
  from '../../services/qualification-category-contract';
import {preparePlayer3CanonicalTerminal}
  from '../../services/lms-player3-canonical-terminal-preparer';

vi.mock('../../services/lms-player3-terminal-proof-preparer',()=>({
  preparePlayer3VerifiedPassProofs:vi.fn(),
}));
vi.mock('../../services/lms-native-readiness-repository',()=>({
  readNativeLearnerSession:vi.fn(),
}));
vi.mock('../../services/qualification-category-contract',()=>({
  requireActiveQualificationCategoryById:vi.fn(),
}));
const hash='a'.repeat(64);
const metadata={
  funcionario_id:69,curso_titulo:'Doutrinamento RC8.1',
  gerar_qualificacao_ao_concluir:1,
  qualificacao_tipo_id:7,qualificacao_tipo_ativo_id:7,
  qualificacao_categoria_id:8,qualificacao_codigo:'TRN',
  qualificacao_nome:'Treinamento',qualificacao_categoria:'EAD',
  qualificacao_validade:12,qualificacao_vencimento_fim_mes:0,
  qualificacao_historico_id:null,
};
const anchor={
  course:{
    mode:'LEARN',editionHash:hash,cursoId:80,cicloId:1000,
    artifact:{units:[
      {id:'welcome',kind:'lesson'}, {id:'mod1',kind:'assessment'},
      {id:'procedures',kind:'lesson'}, {id:'mod2',kind:'assessment'},
    ]},
  },
  binding:{vinculo_id:200,edicao_id:81,politica_id:301},
  sourceHash:'b'.repeat(64),bankHash:'c'.repeat(64),policyHash:'d'.repeat(64),
  officialStages:[
    {stageId:'mod1',attemptId:11,attemptNumber:1,
      answersHash:'e'.repeat(64),scorePct:80},
    {stageId:'mod2',attemptId:12,attemptNumber:2,
      answersHash:'f'.repeat(64),scorePct:100},
  ],
};
const input={
  env:{ENVIRONMENT:'staging'} as Env,
  db:{} as D1Database,bucket:{} as R2Bucket,
  actorUserId:42,empresaId:6,matriculaId:911,
};
function makeDb(data:object|null=metadata){
  const sqls:string[]=[];
  const db={
    prepare:vi.fn((sql:string)=>{
      sqls.push(sql);
      return {bind:vi.fn((...args:unknown[])=>({
        first:vi.fn(async()=>{
          expect(args).toEqual([42,200,81,6,911,1000,80,hash]);
          return data;
        }),
      }))};
    }),
  };
  return{db:db as unknown as D1Database,sqls};
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(preparePlayer3VerifiedPassProofs).mockResolvedValue(anchor as never);
  vi.mocked(readNativeLearnerSession).mockResolvedValue({
    summary:{
      mode:'LEARN',editionHash:hash,cicloId:1000,
      seenLessonIds:['welcome','procedures'],nextSequence:3,
    },
  } as never);
  vi.mocked(requireActiveQualificationCategoryById).mockResolvedValue({
    id:8,empresaId:6,nome:'EAD',codigo:'EAD',lmsIntegrada:true,
  } as never);
});
describe('Player3 terminal metadata and proof preparation',()=>{
  it('builds an exclusively server-derived canonical snapshot and first-statement guard',async()=>{
    const {db,sqls}=makeDb();
    const proof=await preparePlayer3CanonicalTerminal({...input,db});
    expect(proof).toMatchObject({
      ready:true,completionSupported:false,
      canonical:{
        empresaId:6,matriculaId:911,cursoId:80,cicloId:1000,
        funcionarioId:69,gerarQualificacaoAoConcluir:true,
        qualificacaoCategoriaId:8,qualificacaoTipoId:7,
      },
      terminalAnchor:{
        recordedEventCount:2,requiredLessonIds:['welcome','procedures'],
        edicaoId:81,politicaId:301,
      },
    });
    expect(sqls[0]).toContain('m.status');
    expect(proof.atomicGuard.sql.startsWith('SELECT json')).toBe(true);
    expect(proof.atomicGuard.sql).toContain('lms_player3_tentativas_modulares');
    expect(proof.atomicGuard.sql).not.toContain('INSERT INTO');
    expect(JSON.stringify(proof)).not.toMatch(/correctOptionId|PRIVATE/);
  });
  it('fails if any authenticated lesson is missing even after both exams pass',async()=>{
    vi.mocked(readNativeLearnerSession).mockResolvedValueOnce({
      summary:{
        mode:'LEARN',editionHash:hash,cicloId:1000,
        seenLessonIds:['welcome'],nextSequence:2,
      },
    } as never);
    await expect(preparePlayer3CanonicalTerminal({...input,db:makeDb().db}))
      .rejects.toMatchObject({code:'PLAYER3_TERMINAL_CONTENT_INCOMPLETE'});
  });
  it('fails on changed edition, cycle or active learner mode',async()=>{
    for(const revised of [
      {editionHash:'b'.repeat(64)},
      {cicloId:1001},
      {mode:'REVIEW'},
    ]){
      vi.mocked(readNativeLearnerSession).mockResolvedValueOnce({
        summary:{
          mode:'LEARN',editionHash:hash,cicloId:1000,
          seenLessonIds:['welcome','procedures'],nextSequence:3,
          ...revised,
        },
      } as never);
      await expect(preparePlayer3CanonicalTerminal({...input,db:makeDb().db}))
        .rejects.toMatchObject({code:'PLAYER3_TERMINAL_CONTENT_INCOMPLETE'});
    }
  });
  it('never accepts an unqualified employee/course row or forged course mapping',async()=>{
    for(const data of [
      null,{...metadata,gerar_qualificacao_ao_concluir:2},
      {...metadata,funcionario_id:0},
      {...metadata,qualificacao_tipo_ativo_id:null},
    ])await expect(preparePlayer3CanonicalTerminal({...input,db:makeDb(data).db}))
      .rejects.toHaveProperty('code');
  });
  it('requires LMS-integrated and tenant-matching qualification category',async()=>{
    vi.mocked(requireActiveQualificationCategoryById).mockResolvedValueOnce({
      id:8,empresaId:7,lmsIntegrada:true,
    } as never);
    await expect(preparePlayer3CanonicalTerminal({...input,db:makeDb().db}))
      .rejects.toMatchObject({code:'PLAYER3_TERMINAL_QUALIFICATION_INVALID'});
  });
  it('returns no qualification fields for courses not configured to generate one',async()=>{
    const safe={...metadata,gerar_qualificacao_ao_concluir:0,
      qualificacao_tipo_id:null,qualificacao_tipo_ativo_id:null,
      qualificacao_categoria_id:null};
    const state=await preparePlayer3CanonicalTerminal({...input,db:makeDb(safe).db});
    expect(state.canonical).toMatchObject({
      gerarQualificacaoAoConcluir:false,
      qualificacaoTipoId:null,qualificacaoCategoriaId:null,
    });
    expect(requireActiveQualificationCategoryById).not.toHaveBeenCalled();
  });
});
