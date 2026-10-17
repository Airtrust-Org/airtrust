import {beforeEach,describe,expect,it,vi} from 'vitest';
const {editionMismatchMock}=vi.hoisted(()=>({editionMismatchMock:vi.fn()}));
vi.mock('../../services/lms-edition-mismatch',()=>({detectLmsEditionMismatch:editionMismatchMock}));
import {reactivateCancelledMatriculaPreservingProgress,resetMatriculaForNewCycle} from '../../services/lms-matricula-cycle';

function fixture(overrides:Record<string,unknown>={}, withoutCurrentCycle=false, affectedRows=1){
 const original={id:384,empresa_id:6,curso_id:34,funcionario_id:77,
  status:'CANCELADO',deleted_at:null,qualificacao_historico_id:null,
  progresso_pct:87,data_inicio:'2026-10-01',tipo_conteudo:'scorm',
  scorm_package_r2_prefix:'lms/scorm/6/34/active',
  cmi_json:JSON.stringify({'cmi.core.lesson_location':'37/41'}),
  suspend_data:'learner-state',lesson_status:'incomplete',...overrides};
 const snapshot={...original,observacoes:null,data_matricula:null,
  data_conclusao:null,data_expiracao:null,score_final:null,tentativas:0};
 const writes:string[]=[];
 const recordedBinds:Array<{sql:string,args:unknown[]}>=[];
 const db={
  prepare:vi.fn((sql:string)=>({
   bind:(...args:unknown[])=>({
    first:async()=>{
     if(sql.includes('FROM lms_matriculas m')&&sql.includes('JOIN lms_cursos'))return original;
     if(sql.includes('FROM lms_matriculas')&&sql.includes('SELECT id,'))return snapshot;
     if(sql.includes('FROM lms_matricula_ciclos')&&sql.includes('SELECT id'))return withoutCurrentCycle?null:{id:99};
     if(sql.includes('FROM lms_matricula_ciclos')&&sql.includes('MAX(numero_ciclo)'))return {max_numero:1};
     throw Error('UNEXPECTED_SELECT:'+sql.slice(0,80));
    },
    run:async()=>{
     writes.push(sql);
     recordedBinds.push({sql,args});
     return {meta:{changes:affectedRows,last_row_id:101}};
    },
   }),
  })),
 } as unknown as D1Database;
 return {db,original,writes,recordedBinds};
}
describe('reactivar matrícula cancelada sem destruir SCORM',()=>{
 beforeEach(()=>{vi.clearAllMocks();editionMismatchMock.mockResolvedValue(null);});
 it('preserva progresso e CMI com estado EM_ANDAMENTO na mesma edição',async()=>{
  const x=fixture();
  const result=await reactivateCancelledMatriculaPreservingProgress(x.db,{
   empresaId:6,matriculaId:384,bucket:null,observacoes:'Reativação solicitada para mesmo curso'});
  expect(result).toEqual({status:'EM_ANDAMENTO',progressoPct:87,scormPreserved:true});
  const sql=x.writes.join('\n');
  expect(sql).toMatch(/UPDATE lms_matriculas/);
  expect(sql).toContain('status=?');
  expect(sql).not.toMatch(/UPDATE lms_progresso_scorm|DELETE FROM lms_progresso_scorm/);
  expect(sql).not.toMatch(/progresso_pct\s*=\s*0|cmi_json\s*=\s*NULL|suspend_data\s*=\s*NULL/);
  expect(editionMismatchMock).toHaveBeenCalledWith(expect.objectContaining({
   cursoId:34,empresaId:6,cmiJson:x.original.cmi_json,
  }));
 });
 it('aceita contagem D1 incluindo triggers sem abrir mão do UPDATE condicional',async()=>{
  const x=fixture({},false,2);
  const result=await reactivateCancelledMatriculaPreservingProgress(x.db,{
    empresaId:6,matriculaId:384,bucket:null});
  expect(result).toEqual({status:'EM_ANDAMENTO',progressoPct:87,scormPreserved:true});
 });
 it('recria ciclo ausente somente com origem aceita pelo CHECK do esquema',async()=>{
  const x=fixture({},true);
  const result=await reactivateCancelledMatriculaPreservingProgress(x.db,{
   empresaId:6,matriculaId:384,bucket:null,
  });
  expect(result).toEqual({status:'EM_ANDAMENTO',progressoPct:87,scormPreserved:true});
  const insert=x.recordedBinds.find(x=>x.sql.includes('INSERT INTO lms_matricula_ciclos'));
  expect(insert).toBeDefined();
  expect(insert?.args).toContain('MANUAL');
  expect(insert?.args).not.toContain('REATIVACAO_SEM_RESET');
  expect(x.writes.some(q=>q.includes('UPDATE lms_progresso_scorm'))).toBe(false);
 });
 it('bloqueia edição incompatível antes de qualquer escrita',async()=>{
  editionMismatchMock.mockResolvedValue({required:true,previous_total:41,active_total:37});
  const x=fixture();
  const result=await reactivateCancelledMatriculaPreservingProgress(x.db,{
   empresaId:6,matriculaId:384,bucket:null});
  expect(result).toBe('NEW_EDITION_REQUIRED');
  expect(x.writes).toHaveLength(0);
 });
 it('bloqueia matrícula já qualificada ou não cancelada',async()=>{
  for(const patch of [{qualificacao_historico_id:77},{status:'EM_ANDAMENTO'}]){
   const x=fixture(patch);
   expect(await reactivateCancelledMatriculaPreservingProgress(x.db,{
    empresaId:6,matriculaId:384,bucket:null})).toBe('NOT_ELIGIBLE');
   expect(x.writes).toHaveLength(0);
  }
 });
 it('preserva posição SCORM forte mesmo com porcentagem cadastral zerada',async()=>{
  const x=fixture({progresso_pct:0,ultimo_slide:40,lesson_location:'40/121',
   cmi_json:null,suspend_data:null,lesson_status:'not attempted'});
  const resumed=await reactivateCancelledMatriculaPreservingProgress(x.db,{
   empresaId:6,matriculaId:384,bucket:null,
  });
  expect(resumed).toEqual({status:'EM_ANDAMENTO',progressoPct:0,scormPreserved:true});
  expect(x.writes.some(q=>q.includes('UPDATE lms_progresso_scorm'))).toBe(false);
 });
 it('sem progresso continua NAO_INICIADO mas sem apagar dados',async()=>{
  const x=fixture({progresso_pct:0,cmi_json:null,suspend_data:null,
   lesson_status:'not attempted'});
  const result=await reactivateCancelledMatriculaPreservingProgress(x.db,{
   empresaId:6,matriculaId:384,bucket:null});
  expect(result).toEqual({status:'NAO_INICIADO',progressoPct:0,scormPreserved:true});
  expect(x.writes.some(s=>s.includes('lms_progresso_scorm'))).toBe(false);
 });
});

describe('central reset protection across Compliance, bulk and cron',()=>{
 beforeEach(()=>{vi.clearAllMocks();editionMismatchMock.mockResolvedValue(null);});
 it('automatic reset of CANCELADO routes through preservation, never clears existing SCORM',async()=>{
  const x=fixture();
  const id=await resetMatriculaForNewCycle(x.db,{empresaId:6,matriculaId:384,
   origin:'AUTO_RENOVACAO',observacoes:'Renovação da matriz'});
  expect(id).toBe(99);
  expect(x.writes.some(q=>q.includes('UPDATE lms_progresso_scorm')||
    q.includes('DELETE FROM lms_xapi_statements'))).toBe(false);
  expect(x.writes.join('\n')).not.toMatch(/progresso_pct\s*=\s*0/);
  expect(x.writes.some(q=>q.includes('UPDATE lms_matriculas'))).toBe(true);
 });
 it('central reset fails closed if cancelled matrícula already has qualification',async()=>{
  const x=fixture({qualificacao_historico_id:99});
  await expect(resetMatriculaForNewCycle(x.db,{empresaId:6,matriculaId:384}))
   .rejects.toThrow('LMS_CANCELLED_PROGRESS_PRESERVATION_REQUIRED');
  expect(x.writes).toHaveLength(0);
 });
});
