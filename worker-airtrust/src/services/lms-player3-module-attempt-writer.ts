/**
 * Player3 stage attempts: authenticated, hash-pinned private bank, atomic D1
 * insert. A stage pass NEVER closes an enrollment or issues a certificate.
 */
import type {Env} from '../types';
import {loadNativePrivateCourse} from './lms-native-content-loader';
import {nativeScopedSql} from './lms-native-catalog-legacy-guard';
import {NATIVE_ACTIVE_EMPLOYEE_JOIN,NATIVE_ACTIVE_USER_CONDITION} from './lms-native-active-learner-sql';
import {gradePlayer3ApprovedStage, type Player3ApprovedPolicy,
  type Player3PrivateBank} from '../lib/lms-player3/private-stage-grader';
import {readNativeLearnerSession} from './lms-native-readiness-repository';

export class Player3StageWriteError extends Error {
  constructor(public readonly code:string){super(code);this.name='Player3StageWriteError';}
}
const deny=(code:string):never=>{throw new Player3StageWriteError(code);};
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;

type Binding={vinculo_id:number;edicao_id:number;politica_id:number;source_sha256:string;
  policy_sha256:string;bank_sha256:string;r2_prefix:string};
type Stored={politica_id:number;tentativa_numero:number;event_id:string;
  answers_json:string;answers_sha256:string;score_pct:number;passed:number};
export type Player3StageReceipt=Readonly<{state:'APPLIED'|'IDEMPOTENT_REPLAY';
  stageId:string;attemptNumber:number;editionSha256:string;
  scorePct:number;stagePassed:boolean;completionSupported:false}>;

const BINDING=[
  'SELECT b.id vinculo_id,b.edicao_id,p.id politica_id,p.source_sha256,p.bank_sha256,p.policy_sha256,ed.r2_prefix',
  'FROM lms_native_matricula_edicoes b',
  'JOIN lms_player3_politicas p ON p.edicao_id=b.edicao_id AND p.empresa_id=b.empresa_id',
  "AND p.curso_id=b.curso_id AND p.estado='APPROVED'",
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.empresa_id=b.empresa_id',
  "AND ed.curso_id=b.curso_id AND ed.status='PUBLISHED'",
  'JOIN lms_matriculas m ON m.id=b.matricula_id AND m.empresa_id=b.empresa_id',
  "AND m.curso_id=b.curso_id AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL",
  'JOIN lms_matricula_ciclos cy ON cy.id=b.ciclo_id AND cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  "AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1 AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL",
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL",
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL',
  NATIVE_ACTIVE_USER_CONDITION,NATIVE_ACTIVE_EMPLOYEE_JOIN,
  'WHERE b.empresa_id=? AND b.matricula_id=? AND b.ciclo_id=? AND b.curso_id=?',
  "AND ed.artifact_sha256=? LIMIT 1",
].join(' ');

const INSERT=[
  'INSERT INTO lms_player3_tentativas_modulares',
  '(vinculo_id,politica_id,etapa_id,tentativa_numero,event_id,answers_json,answers_sha256,score_pct,passed)',
  'SELECT b.id,p.id,?,?,?,?,?,?,? FROM lms_native_matricula_edicoes b',
  "JOIN lms_player3_politicas p ON p.id=? AND p.edicao_id=b.edicao_id AND p.estado='APPROVED'",
  'AND p.empresa_id=b.empresa_id AND p.curso_id=b.curso_id',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.empresa_id=b.empresa_id',
  "AND ed.curso_id=b.curso_id AND ed.status='PUBLISHED'",
  'JOIN lms_matriculas m ON m.id=b.matricula_id AND m.empresa_id=b.empresa_id',
  "AND m.curso_id=b.curso_id AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL",
  'JOIN lms_matricula_ciclos cy ON cy.id=b.ciclo_id AND cy.matricula_id=m.id',
  'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
  "AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1 AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL",
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL",
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL',
  NATIVE_ACTIVE_USER_CONDITION,NATIVE_ACTIVE_EMPLOYEE_JOIN,
  'WHERE b.id=? AND b.empresa_id=? AND b.matricula_id=? AND b.ciclo_id=?',
  'AND b.curso_id=? AND ed.artifact_sha256=?',
].join(' ');
const EXACT='SELECT politica_id,tentativa_numero,event_id,answers_json,answers_sha256,score_pct,passed FROM lms_player3_tentativas_modulares WHERE vinculo_id=? AND etapa_id=? AND tentativa_numero=? LIMIT 1';
const LAST='SELECT MAX(tentativa_numero) number FROM lms_player3_tentativas_modulares WHERE vinculo_id=? AND etapa_id=?';
const PASSED_STAGES='SELECT DISTINCT etapa_id FROM lms_player3_tentativas_modulares WHERE vinculo_id=? AND politica_id=? AND passed=1 ORDER BY etapa_id LIMIT 101';

async function sha256(buffer:ArrayBuffer):Promise<string>{
  const raw=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(raw)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function getPrivate(bucket:R2Bucket,key:string,expected:string,limit:number):Promise<unknown>{
  if(!HASH.test(expected))deny('PRIVATE_HASH_NOT_PINNED');
  const object=await bucket.get(key);
  if(!object||object.size<2||object.size>limit)throw new Player3StageWriteError('PRIVATE_ASSET_UNAVAILABLE');
  const data=await object.arrayBuffer();
  if(data.byteLength!==object.size||await sha256(data)!==expected)deny('PRIVATE_ASSET_HASH_MISMATCH');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(data));}
  catch{deny('PRIVATE_ASSET_INVALID_JSON');}
}
function allowed(raw:string|undefined,tenant:number):boolean{
  return !!raw&&!raw.includes('*')&&raw.split(',').some(x=>x.trim()===String(tenant));
}
export function canWritePlayer3Stage(env:Env,tenant:number):boolean{
  return env.ENVIRONMENT==='staging'&&positive(tenant)&&
    allowed(env.NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS,tenant)&&
    allowed(env.NATIVE_LEARNER_WRITE_ENABLED_TENANTS,tenant)&&
    allowed(env.PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS,tenant);
}

export async function loadApprovedPlayer3StageContext(input:{
  env:Env;db:D1Database;bucket:R2Bucket;actorUserId:number;
  empresaId:number;matriculaId:number;
}){
  const {env,db,bucket,actorUserId,empresaId,matriculaId}=input;
  if(!canWritePlayer3Stage(env,empresaId) || !positive(actorUserId) || !positive(matriculaId)){
    throw new Player3StageWriteError('STAGE_CONTEXT_DISABLED_OR_INVALID');
  }
  const course=await loadNativePrivateCourse({env,db,bucket,empresaId,matriculaId,actorUserId});
  if(course.mode!=='LEARN')deny('STAGE_REVIEW_READ_ONLY');
  const binding=await db.prepare(nativeScopedSql(BINDING,env,empresaId)).bind(
    actorUserId,empresaId,matriculaId,course.cicloId,course.cursoId,
    course.editionHash).first<Binding>();
  const prefix='lms/native/'+empresaId+'/'+course.cursoId+'/'+course.editionHash+'/';
  if(!binding)throw new Player3StageWriteError('STAGE_POLICY_NOT_APPROVED');
  if(!positive(binding.vinculo_id)||!positive(binding.politica_id)||
    binding.r2_prefix!==prefix||
    ![binding.source_sha256,binding.policy_sha256,binding.bank_sha256].every(x=>HASH.test(x))){
    throw new Player3StageWriteError('STAGE_POLICY_NOT_APPROVED');
  }
  const [policyRaw,bankRaw]=await Promise.all([
    getPrivate(bucket,prefix+'player3-approved-policy.json',binding.policy_sha256,1024*1024),
    getPrivate(bucket,prefix+'player3-server-private-bank.json',binding.bank_sha256,4*1024*1024),
  ]);
  const policy=policyRaw as Player3ApprovedPolicy;
  const bank=bankRaw as Player3PrivateBank;
  if(!policy||!bank||policy.source_sha256!==binding.source_sha256||
     bank.source_sha256!==binding.source_sha256||
     policy.editionSha256!==course.editionHash)deny('STAGE_EDITION_MISMATCH');
  if(!Array.isArray(policy.stages)||policy.stages.length<1||
     policy.stages.length>100||
     policy.stages.some(stage=>!stage||!ID.test(stage.stageId))||
     new Set(policy.stages.map(stage=>stage.stageId)).size!==policy.stages.length){
    deny('STAGE_POLICY_NOT_APPROVED');
  }
  const authoredPositions=policy.stages.map(stage=>
    course.artifact.units.findIndex(unit=>
      unit.id===stage.stageId&&unit.kind==='assessment'));
  if(authoredPositions.some(index=>index<0)||
     authoredPositions.some((index,position)=>
       position>0&&index<=authoredPositions[position-1])){
    deny('STAGE_AUTHORED_CROSSWALK_INVALID');
  }
  return {course,binding,policy,bank};
}

export async function commitPlayer3StageAttempt(input:{
  env:Env;db:D1Database;bucket:R2Bucket;actorUserId:number;
  empresaId:number;matriculaId:number;stageId:string;eventId:string;
  attemptNumber:number;answers:readonly {questionId:string;optionId:string}[];
}):Promise<Player3StageReceipt>{
  const {env,db,bucket,actorUserId,empresaId,matriculaId,stageId,eventId,attemptNumber}=input;
  if(!canWritePlayer3Stage(env,empresaId))deny('STAGE_WRITES_DISABLED');
  if(!positive(actorUserId)||!positive(matriculaId)||!ID.test(stageId)||!ID.test(eventId)||
     !positive(attemptNumber)||attemptNumber>500||!Array.isArray(input.answers)||
     input.answers.length<1||input.answers.length>200||
     input.answers.some(x=>!x||Object.keys(x).length!==2||!ID.test(x.questionId)||!ID.test(x.optionId))){
    deny('STAGE_REQUEST_INVALID');
  }
  const {course,binding,policy,bank}=await loadApprovedPlayer3StageContext(input);
  let grade:ReturnType<typeof gradePlayer3ApprovedStage>;
  try{grade=gradePlayer3ApprovedStage(bank,policy,{stageId,answers:input.answers});}
  catch{throw new Player3StageWriteError('STAGE_EVIDENCE_INVALID');}
  const normalized=JSON.stringify([...input.answers].sort((a,b)=>
    a.questionId<b.questionId?-1:a.questionId>b.questionId?1:0));
  if(new TextEncoder().encode(normalized).byteLength>131072)deny('STAGE_TOO_LARGE');
  const digest=await sha256(new TextEncoder().encode(normalized).buffer as ArrayBuffer);
  const matches=(s:Stored|null)=>!!s&&s.politica_id===binding.politica_id&&
    s.tentativa_numero===attemptNumber&&s.event_id===eventId&&
    s.answers_json===normalized&&s.answers_sha256===digest&&
    s.score_pct===grade.scorePct&&s.passed===Number(grade.stagePassed);
  const receipt=(state:Player3StageReceipt['state']):Player3StageReceipt=>({
    state,stageId,attemptNumber,editionSha256:course.editionHash,
    scorePct:grade.scorePct,stagePassed:grade.stagePassed,completionSupported:false,
  });
  const existing=await db.prepare(EXACT).bind(binding.vinculo_id,stageId,attemptNumber).first<Stored>();
  if(existing){
    if(!matches(existing))deny('STAGE_REPLAY_CONFLICT');
    return receipt('IDEMPOTENT_REPLAY');
  }
  const passedResult=await db.prepare(PASSED_STAGES)
    .bind(binding.vinculo_id,binding.politica_id)
    .all<{etapa_id:string}>();
  if(!passedResult.success||!Array.isArray(passedResult.results)||
     passedResult.results.length>100||
     passedResult.results.some(row=>!row||!ID.test(row.etapa_id))){
    deny('STAGE_PASS_LEDGER_INVALID');
  }
  const passedStages=new Set(passedResult.results.map(row=>row.etapa_id));
  if(passedStages.has(stageId))deny('STAGE_ALREADY_PASSED');
  const policyIndex=policy.stages.findIndex(stage=>stage.stageId===stageId);
  if(policyIndex<0)deny('STAGE_EVIDENCE_INVALID');
  const missingPrerequisite=policy.stages.slice(0,policyIndex)
    .some(stage=>!passedStages.has(stage.stageId));
  if(missingPrerequisite)deny('STAGE_PREREQUISITE_NOT_PASSED');

  const authoredStageIndex=course.artifact.units.findIndex(unit=>
    unit.id===stageId && unit.kind==='assessment');
  if(authoredStageIndex<0)deny('STAGE_AUTHORED_CROSSWALK_INVALID');
  const priorLessonIds=course.artifact.units.slice(0,authoredStageIndex)
    .filter(unit=>unit.kind==='lesson').map(unit=>unit.id);
  const learner=await readNativeLearnerSession({
    env,db,actorUserId,artifact:course.artifact,
    scope:{empresaId,matriculaId,cursoId:course.cursoId,
      cicloId:course.cicloId,artifactHash:course.editionHash},
  });
  const seen=learner.summary.seenLessonIds;
  if(learner.summary.mode!=='LEARN'||
     learner.summary.editionHash!==course.editionHash||
     learner.summary.cicloId!==course.cicloId||
     !Array.isArray(seen)||
     priorLessonIds.some((lessonId,index)=>seen[index]!==lessonId)){
    deny('STAGE_CONTENT_PREREQUISITE_MISSING');
  }
  const last=await db.prepare(LAST).bind(binding.vinculo_id,stageId).first<{number:number|null}>();
  if(attemptNumber!==(last?.number??0)+1)deny('STAGE_SEQUENCE_CONFLICT');
  try{
    const result=await db.prepare(nativeScopedSql(INSERT,env,empresaId)).bind(
      stageId,attemptNumber,eventId,normalized,digest,grade.scorePct,Number(grade.stagePassed),
      binding.politica_id,actorUserId,binding.vinculo_id,
      empresaId,matriculaId,course.cicloId,course.cursoId,course.editionHash,
    ).run();
    if(result.success&&result.meta.changes===1)return receipt('APPLIED');
  }catch{/* Only an EXACT matching concurrent insert is accepted below. */}
  const persisted=await db.prepare(EXACT).bind(binding.vinculo_id,stageId,attemptNumber).first<Stored>();
  if(matches(persisted))return receipt('IDEMPOTENT_REPLAY');
  throw new Player3StageWriteError('STAGE_ATOMIC_COMMIT_CONFLICT');
}
