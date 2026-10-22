import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Env} from '../../types';

const marker=vi.hoisted(()=>({isNative:vi.fn()}));
vi.mock('../../services/lms-native-catalog-legacy-guard',()=>({
  isNativeForLegacyLmsPath:marker.isNative,
}));

import {readPlayer3ScormQaSnapshot} from
  '../../services/lms-player3-scorm-qa-evidence-reader';

const env={
  ENVIRONMENT:'staging',
  NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:'6',
  PLAYER3_QA_READ_ENABLED_TENANTS:'6',
} as unknown as Env;
type Row={
  empresa_id:number;matricula_id:number;curso_id:number;
  tipo_conteudo:string;status:string;progresso_pct:number;
  ciclo_id:number;ciclo_status:string;
  qualificacao_historico_id:number|null;ciclo_historico_id:number|null;
  historico_validado_id:number|null;historico_status:string|null;
  documento_id:number|null;lesson_status:string|null;
};
let row:Row|null;
const prepared=vi.fn((sql:string)=>({
  bind:vi.fn((..._args:unknown[])=>({
    first:vi.fn(async()=>row),
  })),
}));
const db={prepare:prepared} as unknown as D1Database;
const read=(opts:Partial<{
  env:Env;empresaId:number;matriculaId:number;actorUserId:number;
}>={})=>readPlayer3ScormQaSnapshot({
  env:opts.env??env,db,empresaId:opts.empresaId??6,
  matriculaId:opts.matriculaId??911,actorUserId:opts.actorUserId??44,
});
describe('Player3 staging SCORM QA read-only projection',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    marker.isNative.mockResolvedValue(false);
    row={
      empresa_id:6,matricula_id:911,curso_id:34,
      tipo_conteudo:'scorm',status:'EM_ANDAMENTO',progresso_pct:75,
      ciclo_id:1000,ciclo_status:'EM_ANDAMENTO',
      qualificacao_historico_id:null,ciclo_historico_id:null,
      historico_validado_id:null,historico_status:null,
      documento_id:null,lesson_status:'failed',
    };
  });
  it('reads real server CMI, tenant and current-cycle evidence without writes',async()=>{
    expect(await read()).toEqual({
      empresa_id:6,matricula_id:911,ciclo_id:1000,
      status:'EM_ANDAMENTO',progresso_pct:75,lesson_status:'failed',
      qualificacao_historico_id:null,certificate_id:null,
    });
    expect(prepared).toHaveBeenCalledTimes(1);
    const sql=String(prepared.mock.calls[0][0]);
    expect(sql).toMatch(/SELECT/);
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\b/i);
    expect(marker.isNative).toHaveBeenCalledWith(env,6,34,'scorm');
  });
  it('requires a linked completed qualification and document for certificate claims',async()=>{
    row={...row!,status:'CONCLUIDO',ciclo_status:'CONCLUIDO',
      progresso_pct:100,lesson_status:'passed',
      qualificacao_historico_id:77,ciclo_historico_id:77,
      historico_validado_id:77,historico_status:'CONCLUIDA',documento_id:90};
    expect(await read()).toMatchObject({
      status:'CONCLUIDO',lesson_status:'passed',
      qualificacao_historico_id:77,certificate_id:90,
    });
    row.documento_id=null;
    await expect(read()).rejects.toThrow('SCORM_QA_TERMINAL_EVIDENCE_MISSING');
  });
  it('never certifies a failed, stale or incomplete SCORM attempt despite D1 CONCLUIDO',async()=>{
    const passed={...row!,status:'CONCLUIDO',ciclo_status:'CONCLUIDO',
      progresso_pct:100,lesson_status:'passed',
      qualificacao_historico_id:77,ciclo_historico_id:77,
      historico_validado_id:77,historico_status:'CONCLUIDA',documento_id:90};
    for(const forged of [
      {...passed,lesson_status:'failed'},
      {...passed,lesson_status:null},
      {...passed,lesson_status:'completed'},
      {...passed,progresso_pct:99},
    ]){
      row=forged;
      await expect(read()).rejects.toThrow('SCORM_QA_TERMINAL_CMI_INCONSISTENT');
    }
  });
  it('fails closed on missing or other-tenant enrollments and Native-marker courses',async()=>{
    row=null;
    await expect(read()).rejects.toThrow('SCORM_QA_SCOPE_OR_CYCLE_INVALID');
    row={empresa_id:7,matricula_id:911,curso_id:34,tipo_conteudo:'scorm',
      status:'NAO_INICIADO',progresso_pct:0,ciclo_id:1000,ciclo_status:'NAO_INICIADO',
      qualificacao_historico_id:null,ciclo_historico_id:null,
      historico_validado_id:null,historico_status:null,
      documento_id:null,lesson_status:null};
    await expect(read()).rejects.toThrow('SCORM_QA_SCOPE_OR_CYCLE_INVALID');
    row.empresa_id=6;
    marker.isNative.mockResolvedValue(true);
    await expect(read()).rejects.toThrow('SCORM_QA_NATIVE_MARKER_FORBIDDEN');
  });
  it('denies production, wildcard flags and forged actors before D1 access',async()=>{
    const deny=[
      {...env,ENVIRONMENT:'production'},
      {...env,PLAYER3_QA_READ_ENABLED_TENANTS:'*'},
      {...env,NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:''},
    ] as Env[];
    for(const testEnv of deny){
      await expect(read({env:testEnv})).rejects.toThrow('SCORM_QA_DISABLED_OR_INVALID');
    }
    await expect(read({actorUserId:0})).rejects.toThrow('SCORM_QA_DISABLED_OR_INVALID');
    expect(prepared).not.toHaveBeenCalled();
  });
});
