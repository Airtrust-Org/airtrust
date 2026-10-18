/**
 * Staging-only, learner-owned QA snapshot for Native Player 3.
 * Historical grading is reconciled against the integrity-pinned private bank.
 * This service never returns answers, option IDs, bank content or R2 object keys;
 * all operations are SELECT, hash/read verification or R2 GET.
 */
import type {Env} from '../types';
import {NATIVE_ACTIVE_EMPLOYEE_JOIN,NATIVE_ACTIVE_USER_CONDITION}
  from './lms-native-active-learner-sql';
import {nativeScopedSql} from './lms-native-catalog-legacy-guard';
import {readNativeLearnerSession} from './lms-native-readiness-repository';
import {readPlayer3CertificateStatus} from './lms-player3-certificate-status';
import {gradePlayer3ApprovedStage} from '../lib/lms-player3/private-stage-grader';
import {canReadPlayer3QaEvidence,loadApprovedPlayer3StageContext}
  from './lms-player3-module-attempt-writer';

export class Player3QaEvidenceError extends Error {
  constructor(public readonly code:string){super(code);this.name='Player3QaEvidenceError';}
}
const fail=(code:string):never=>{throw new Player3QaEvidenceError(code);};
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const HASH=/^[a-f0-9]{64}$/;
const positive=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>0;

type Metadata={
  status:string;progresso_pct:number;qualificacao_historico_id:number|null;
  funcionario_id:number;ciclo_id:number;ciclo_status:string;
};
type AttemptRow={
  politica_id:number;etapa_id:string;tentativa_numero:number;event_id:string;
  answers_json:string;answers_sha256:string;score_pct:number;passed:number;
};
export type Player3QaSnapshot=Readonly<{
  empresa_id:number;matricula_id:number;ciclo_id:number;
  edition_sha256:string;status:string;progresso_pct:number;
  completed_unit_ids:readonly string[];
  attempts:readonly Readonly<{
    stage_id:string;attempt_number:number;passed:boolean;score_pct:number
  }>[];
  qualificacao_historico_id:number|null;certificate_id:number|null;
}>;

const META_SQL=[
  'SELECT m.status,m.progresso_pct,m.qualificacao_historico_id,',
  'm.funcionario_id,cy.id ciclo_id,cy.status ciclo_status',
  'FROM lms_matriculas m',
  'JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
  'AND cy.deleted_at IS NULL',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id',
  'AND u.deleted_at IS NULL',NATIVE_ACTIVE_USER_CONDITION,
  NATIVE_ACTIVE_EMPLOYEE_JOIN,
  'WHERE m.id=? AND m.empresa_id=? AND m.curso_id=?',
  'AND m.deleted_at IS NULL AND cy.status=m.status LIMIT 1',
].join(' ');
const ATTEMPTS_SQL=[
  'SELECT politica_id,etapa_id,tentativa_numero,event_id,',
  'answers_json,answers_sha256,score_pct,passed',
  'FROM lms_player3_tentativas_modulares',
  'WHERE vinculo_id=? ORDER BY etapa_id,tentativa_numero LIMIT 201',
].join(' ');

async function digest(value:string):Promise<string>{
  const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');
}

/** No controller-supplied tenant, user, edition, completion or grade is trusted. */
export async function readPlayer3QaSnapshot(input:{
  env:Env;db:D1Database;bucket:R2Bucket;
  empresaId:number;matriculaId:number;actorUserId:number;
}):Promise<Player3QaSnapshot>{
  const {env,db,bucket,empresaId,matriculaId,actorUserId}=input;
  if(!canReadPlayer3QaEvidence(env,empresaId)||!positive(matriculaId)||
     !positive(actorUserId))fail('QA_SNAPSHOT_DISABLED_OR_INVALID');
  const {course,binding,policy,bank}=await loadApprovedPlayer3StageContext({
    ...input,readOnlyQa:true,
  });
  if(policy.schema!=='AIRTRUST_PLAYER3_GRADE_POLICY_V1'||
     policy.certificationApproved!==true||!Array.isArray(policy.stages)||
     policy.stages.length<1||policy.stages.length>100){
    fail('QA_SNAPSHOT_POLICY_UNAVAILABLE');
  }
  const approvedStages=new Set(policy.stages.map(s=>s.stageId));
  if(approvedStages.size!==policy.stages.length||
     policy.stages.some(s=>!ID.test(s.stageId)))fail('QA_SNAPSHOT_POLICY_INVALID');

  async function metadata():Promise<Metadata>{
    const row=await db.prepare(nativeScopedSql(META_SQL,env,empresaId))
      .bind(actorUserId,matriculaId,empresaId,course.cursoId).first<Metadata>();
    if(!row||!positive(row.funcionario_id)||row.ciclo_id!==course.cicloId||
       !['NAO_INICIADO','EM_ANDAMENTO','CONCLUIDO'].includes(row.status)||
       row.status!==row.ciclo_status||
       !Number.isFinite(row.progresso_pct)||row.progresso_pct<0||
       row.progresso_pct>100||
       (row.qualificacao_historico_id!==null&&
        !positive(row.qualificacao_historico_id))){
      fail('QA_SNAPSHOT_METADATA_INVALID');
    }
    return row as Metadata;
  }
  const before=await metadata();
  const [session,rowsResult,certificate]=await Promise.all([
    readNativeLearnerSession({
      env,db,actorUserId,artifact:course.artifact,
      scope:{empresaId,matriculaId,cursoId:course.cursoId,
        cicloId:course.cicloId,artifactHash:course.editionHash},
    }),
    db.prepare(ATTEMPTS_SQL).bind(binding.vinculo_id).all<AttemptRow>(),
    readPlayer3CertificateStatus({
      env,empresaId,matriculaId,funcionarioId:before.funcionario_id,
    }),
  ]);
  if(rowsResult?.success!==true||!Array.isArray(rowsResult.results)||
     rowsResult.results.length>200)fail('QA_SNAPSHOT_LEDGER_UNAVAILABLE');
  const counters=new Map<string,number>();
  const passedStages=new Set<string>();
  const eventIds=new Set<string>();
  const attempts:Player3QaSnapshot['attempts'][number][]=[];
  for(const row of rowsResult.results){
    if(!row||row.politica_id!==binding.politica_id||
       !ID.test(row.etapa_id)||!approvedStages.has(row.etapa_id)||
       !ID.test(row.event_id)||eventIds.has(row.event_id)||
       !Number.isSafeInteger(row.tentativa_numero)||
       row.tentativa_numero<1||row.tentativa_numero>500||
       row.tentativa_numero!==(counters.get(row.etapa_id)??0)+1||
       passedStages.has(row.etapa_id)||
       !Number.isInteger(row.score_pct)||row.score_pct<0||row.score_pct>100||
       (row.passed!==0&&row.passed!==1)||
       typeof row.answers_json!=='string'||
       row.answers_json.length<2||row.answers_json.length>131072||
       !HASH.test(row.answers_sha256)||
       await digest(row.answers_json)!==row.answers_sha256){
      fail('QA_SNAPSHOT_LEDGER_INVALID');
    }
    let answers:unknown;
    try{answers=JSON.parse(row.answers_json);}
    catch{fail('QA_SNAPSHOT_LEDGER_INVALID');}
    let graded:ReturnType<typeof gradePlayer3ApprovedStage>;
    try{
      graded=gradePlayer3ApprovedStage(bank,policy,{
        stageId:row.etapa_id,
        answers:answers as {questionId:string;optionId:string}[],
      });
    }catch{throw new Player3QaEvidenceError('QA_SNAPSHOT_GRADE_INVALID');}
    if(graded.scorePct!==row.score_pct||
       Number(graded.stagePassed)!==row.passed){
      fail('QA_SNAPSHOT_GRADE_CONFLICT');
    }
    eventIds.add(row.event_id);
    counters.set(row.etapa_id,row.tentativa_numero);
    if(graded.stagePassed)passedStages.add(row.etapa_id);
    attempts.push({stage_id:row.etapa_id,
      attempt_number:row.tentativa_numero,
      passed:graded.stagePassed,score_pct:graded.scorePct});
  }
  const after=await metadata();
  if(JSON.stringify(before)!==JSON.stringify(after)||
     certificate.ciclo_id!==course.cicloId||
     certificate.matricula_status!==after.status||
     (certificate.historico_id!==null&&
      certificate.historico_id!==after.qualificacao_historico_id)){
    fail('QA_SNAPSHOT_CONCURRENT_CHANGE');
  }
  // A document id is exposed only after the existing protected reader verifies
  // its tenant scope and R2 PDF header; the full stream still requires E2E GET.
  const certId=certificate.certificate_state==='PDF_HEADER_VERIFIED'
    ?certificate.documento_id:null;
  if(certId!==null&&!positive(certId))fail('QA_SNAPSHOT_DOCUMENT_INVALID');
  return {
    empresa_id:empresaId,matricula_id:matriculaId,ciclo_id:course.cicloId,
    edition_sha256:course.editionHash,
    status:after.status,progresso_pct:after.progresso_pct,
    completed_unit_ids:[...session.summary.seenLessonIds],
    attempts,qualificacao_historico_id:after.qualificacao_historico_id,
    certificate_id:certId,
  };
}