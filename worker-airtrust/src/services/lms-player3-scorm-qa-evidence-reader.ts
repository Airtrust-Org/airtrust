/**
 * Staging-only, authenticated, read-only SCORM 1.2 QA projection.
 * Native Player3 ledgers must never be interpreted as SCORM evidence.
 * This reader performs SELECTs only, and never repairs orphan certificates.
 */
import type {Env} from '../types';
import {canReadPlayer3QaEvidence} from './lms-player3-module-attempt-writer';
import {isNativeForLegacyLmsPath} from './lms-native-catalog-legacy-guard';
import {NATIVE_ACTIVE_EMPLOYEE_JOIN,NATIVE_ACTIVE_USER_CONDITION}
  from './lms-native-active-learner-sql';

const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;

type Row={
  empresa_id:number;matricula_id:number;curso_id:number;
  tipo_conteudo:string;status:string;progresso_pct:number;
  ciclo_id:number;ciclo_status:string;
  qualificacao_historico_id:number|null;ciclo_historico_id:number|null;
  historico_validado_id:number|null;historico_status:string|null;
  documento_id:number|null;
  lesson_status:string|null;
};
export type Player3ScormQaSnapshot=Readonly<{
  empresa_id:number;matricula_id:number;ciclo_id:number;
  status:string;progresso_pct:number;lesson_status:string|null;
  qualificacao_historico_id:number|null;certificate_id:number|null;
}>;

const SQL=[
  'SELECT m.empresa_id,m.id AS matricula_id,m.curso_id,',
  'c.tipo_conteudo,m.status,m.progresso_pct,',
  'cy.id AS ciclo_id,cy.status AS ciclo_status,',
  'm.qualificacao_historico_id,',
  'cy.qualificacao_historico_id AS ciclo_historico_id,',
  'qh.id AS historico_validado_id,qh.status AS historico_status,',
  'd.id AS documento_id,p.lesson_status',
  'FROM lms_matriculas m',
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  "AND c.tipo_conteudo='scorm' AND c.deleted_at IS NULL",
  'JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
  'AND cy.deleted_at IS NULL',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id',
  'AND u.deleted_at IS NULL',NATIVE_ACTIVE_USER_CONDITION,
  NATIVE_ACTIVE_EMPLOYEE_JOIN,
  'LEFT JOIN lms_progresso_scorm p ON p.matricula_id=m.id',
  'AND p.empresa_id=m.empresa_id',
  'LEFT JOIN qualificacoes_historico qh',
  'ON qh.id=m.qualificacao_historico_id',
  'AND qh.empresa_id=m.empresa_id',
  'AND qh.funcionario_id=m.funcionario_id AND qh.deleted_at IS NULL',
  'LEFT JOIN documentos d ON d.id=qh.certificado_arquivo_id',
  'AND d.empresa_id=m.empresa_id',
  'AND d.funcionario_id=m.funcionario_id AND d.deleted_at IS NULL',
  'WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL',
  'LIMIT 1',
].join(' ');

export class Player3ScormQaEvidenceError extends Error{
  constructor(public readonly code:string){super(code);this.name='Player3ScormQaEvidenceError';}
}
function fail(code:string):never{throw new Player3ScormQaEvidenceError(code);}

export async function readPlayer3ScormQaSnapshot(input:{
  env:Env;db:D1Database;empresaId:number;matriculaId:number;actorUserId:number;
}):Promise<Player3ScormQaSnapshot>{
  const {env,db,empresaId,matriculaId,actorUserId}=input;
  if(!canReadPlayer3QaEvidence(env,empresaId)||
     !positive(matriculaId)||!positive(actorUserId)){
    fail('SCORM_QA_DISABLED_OR_INVALID');
  }
  const row=await db.prepare(SQL).bind(actorUserId,matriculaId,empresaId).first<Row>();
  if(!row||row.empresa_id!==empresaId||row.matricula_id!==matriculaId||
     !positive(row.curso_id)||row.tipo_conteudo!=='scorm'||
     !positive(row.ciclo_id)||row.ciclo_status!==row.status||
     !['NAO_INICIADO','EM_ANDAMENTO','CONCLUIDO'].includes(row.status)||
     !Number.isFinite(row.progresso_pct)||row.progresso_pct<0||
     row.progresso_pct>100){
    fail('SCORM_QA_SCOPE_OR_CYCLE_INVALID');
  }
  // A course with a Native activation marker is never a legacy SCORM fixture.
  if(await isNativeForLegacyLmsPath(env,empresaId,row.curso_id,row.tipo_conteudo)){
    fail('SCORM_QA_NATIVE_MARKER_FORBIDDEN');
  }
  if(row.lesson_status!==null&&typeof row.lesson_status!=='string'){
    fail('SCORM_QA_CMI_INVALID');
  }
  const qualified=row.status==='CONCLUIDO';
  if(qualified&&(!positive(row.qualificacao_historico_id)||
     row.ciclo_historico_id!==row.qualificacao_historico_id||
     row.historico_validado_id!==row.qualificacao_historico_id||
     row.historico_status!=='CONCLUIDA'||!positive(row.documento_id))){
    fail('SCORM_QA_TERMINAL_EVIDENCE_MISSING');
  }
  // In-progress fixtures never inherit certificates from an older cycle.
  if(!qualified&&row.ciclo_historico_id!==null&&
     row.ciclo_historico_id===row.qualificacao_historico_id){
    fail('SCORM_QA_UNEXPECTED_ACTIVE_HISTORY');
  }
  return {
    empresa_id:empresaId,matricula_id:matriculaId,ciclo_id:row.ciclo_id,
    status:row.status,progresso_pct:row.progresso_pct,
    lesson_status:row.lesson_status,
    qualificacao_historico_id:qualified?row.qualificacao_historico_id:null,
    certificate_id:qualified?row.documento_id:null,
  };
}
