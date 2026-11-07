/**
 * AirTrust LMS — learner exam runtime (default-off).
 *
 * Answers 503 unless ENVIRONMENT is staging and LMS_EXAM_LEARNER_STAGING is set.
 * Authorization: JWT + tenant, then the exam gate recomputes ownership and study
 * readiness on the server. Passing here is EVIDENCE only: the learner then calls
 * the existing POST /api/lms/matriculas/:id/finalizar, the single completion writer.
 */
import {Hono} from 'hono';
import {auth} from '../middleware/auth';
import {getEmpresaId} from '../middleware/tenant';
import type {Env} from '../types';
import {loadExamGate} from '../services/lms-exams/exam-gate';
import {
  ExamAttemptError,getExamAttemptScope,saveExamResponse,startExamAttempt,submitExamAttempt,
} from '../services/lms-exams/exam-attempt-store';
import {exact,examErrorCode,examHttpStatus,parseBoundedJson,positive} from './lms-exam-route-helpers';

const routes=new Hono<{Bindings:Env}>();

routes.use('*',async(c,next)=>{
  const flag=Reflect.get(c.env,'LMS_EXAM_LEARNER_STAGING');
  if(c.env.ENVIRONMENT!=='staging'||flag!=='REVIEWED_SCHEMA_ONLY'){
    return c.json({success:false,code:'EXAM_RUNTIME_NOT_ACTIVATED'},503);
  }
  await next();
});
routes.use('*',auth());
routes.use('*',async(c,next)=>{
  await next();
  c.header('Cache-Control','no-store, private');
  c.header('Pragma','no-cache');
});
routes.onError((error,c)=>{
  const code=examErrorCode(error);
  if(code)return c.json({success:false,code},examHttpStatus(code));
  throw error;
});

function userId(c:Parameters<typeof getEmpresaId>[0]):number{
  const id=Number((c.get as (key:string)=>unknown)('userId'));
  if(!Number.isSafeInteger(id)||id<1)throw new ExamAttemptError('EXAM_LEARNER_SCOPE_INVALID');
  return id;
}
function ids(c:Parameters<typeof getEmpresaId>[0],matriculaId:string){
  return {empresaId:getEmpresaId(c),userId:userId(c),matriculaId:positive(matriculaId)};
}

/**
 * Enforce that a learner's attempt remains in the active, authorized cycle
 * and the currently served SCORM edition. Progress/cancellation can change
 * after start; old attempt IDs are never a bypass of the study gate.
 */
async function currentAttemptLearner(
  env:Env,learner:Readonly<{empresaId:number;userId:number}>,attemptId:string
) {
  const attempt=await getExamAttemptScope(env.DB,learner,attemptId);
  const gate=await loadExamGate(env,{
    ...learner,matriculaId:attempt.scope.matriculaId,
  });
  const scope=gate.scope;
  if (!scope ||
      scope.cursoId!==attempt.scope.cursoId ||
      scope.cicloId!==attempt.scope.cicloId ||
      scope.packageSha256!==attempt.scope.packageSha256 ||
      gate.state==='NOT_AVAILABLE' || gate.state==='STUDY_PENDING' ||
      (attempt.state==='IN_PROGRESS' && gate.state!=='READY')) {
    throw new ExamAttemptError('EXAM_ATTEMPT_NOT_CURRENT');
  }
  return learner;
}

routes.get('/matriculas/:matriculaId/prova',async c=>{
  const gateIds=ids(c,c.req.param('matriculaId'));
  const gate=await loadExamGate(c.env,gateIds);
  // Read-only readback: lets the UI offer certificate retry only when it is actually missing.
  let certificate:'ISSUED'|'MISSING'|'NOT_APPLICABLE'|undefined;
  if(gate.state==='COMPLETED'){
    const row=await c.env.DB.prepare(
      'SELECT qh.id AS qualification_id, qh.certificado_arquivo_id AS arq FROM lms_matriculas m '+
      'LEFT JOIN qualificacoes_historico qh ON qh.id=m.qualificacao_historico_id '+
      'AND qh.empresa_id=m.empresa_id AND qh.deleted_at IS NULL '+
      'WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL LIMIT 1'
    ).bind(gateIds.matriculaId,gateIds.empresaId).first<{qualification_id:number|null;arq:number|null}>();
    certificate=row?.qualification_id?(row.arq?'ISSUED':'MISSING'):'NOT_APPLICABLE';
  }
  return c.json({success:true,data:{
    state:gate.state,missing:gate.missing,attemptsUsed:gate.attemptsUsed,
    hasOpenAttempt:gate.hasOpenAttempt,...(certificate?{certificate}:{}),
    // After a pass the learner finalizes through the canonical endpoint.
    finalizeRequired:gate.state==='PASSED',
  }});
});

routes.post('/matriculas/:matriculaId/tentativas',async c=>{
  const gate=await loadExamGate(c.env,ids(c,c.req.param('matriculaId')));
  if(gate.state!=='READY'||!gate.scope){
    const code=gate.state==='PASSED'?'EXAM_ALREADY_PASSED':
      gate.state==='STUDY_PENDING'?'EXAM_STUDY_NOT_COMPLETE':'EXAM_NOT_BOUND_TO_EDITION';
    return c.json({success:false,code,missing:gate.missing},409);
  }
  const key=c.req.header('Idempotency-Key')||'';
  const data=await startExamAttempt(c.env.DB,gate.learner,gate.scope,key);
  return c.json({success:true,data},201);
});

routes.put('/tentativas/:attemptId/respostas',async c=>{
  const body=await parseBoundedJson(c);
  exact(body,['questionId','choiceId']);
  const learner=await currentAttemptLearner(c.env,{empresaId:getEmpresaId(c),userId:userId(c)},c.req.param('attemptId'));
  const data=await saveExamResponse(c.env.DB,
    learner,c.req.param('attemptId'),
    body.questionId as string,body.choiceId as string);
  return c.json({success:true,data});
});

routes.post('/tentativas/:attemptId/enviar',async c=>{
  const learner=await currentAttemptLearner(c.env,{empresaId:getEmpresaId(c),userId:userId(c)},c.req.param('attemptId'));
  const data=await submitExamAttempt(c.env.DB,
    learner,c.req.param('attemptId'));
  return c.json({success:true,data});
});

export default routes;
