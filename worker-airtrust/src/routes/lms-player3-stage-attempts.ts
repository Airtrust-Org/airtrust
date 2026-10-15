/**
 * Player3 staging-only module assessment endpoint.
 * Auth inherited from lms-native parent. No browser grade, course/tenant,
 * edition, enrollment-cycle or answer key accepted in the request body.
 */
import {Hono} from 'hono';
import {z} from 'zod';
import type {Env} from '../types';
import {getEmpresaIdSafe} from './escalas-shared';
import {
  canWritePlayer3Stage,commitPlayer3StageAttempt,Player3StageWriteError,
} from '../services/lms-player3-module-attempt-writer';
import {NativeAdmissionError} from '../services/lms-native-enrollment-access';
import {NativeContentLoadError} from '../services/lms-native-content-loader';
import {readPlayer3ModuleSession} from '../services/lms-player3-module-progress-reader';
import {readPlayer3JointPreflight} from '../services/lms-player3-joint-preflight';
import {loadApprovedPlayer3StageContext} from '../services/lms-player3-module-attempt-writer';
import {approvedAuthoredLaunch} from '../lib/lms-player3/authored-launch-contract';
import {readNativeLearnerSession} from '../services/lms-native-readiness-repository';
import {verifiedAuthoredNavigation} from '../lib/lms-player3/verified-authored-navigation';

const app=new Hono<{Bindings:Env}>();
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const ENROLLMENT=/^[1-9][0-9]{0,15}$/;
const MAX_BYTES=128*1024;
const Attempt=z.object({
  eventId:z.string().regex(ID),
  attemptNumber:z.number().int().min(1).max(500),
  answers:z.array(z.object({
    questionId:z.string().regex(ID),
    optionId:z.string().regex(ID),
  }).strict()).min(1).max(200),
}).strict();

async function readBoundedJson(c: {req:{raw:Request;header(name:string):string|undefined}}):Promise<unknown>{
  if(!c.req.header('content-type')?.toLowerCase().startsWith('application/json')){
    throw new Error('INVALID_CONTENT_TYPE');
  }
  const header=c.req.header('content-length');
  if(header&&(!/^\d+$/.test(header)||Number(header)>MAX_BYTES)){
    throw new Error('BODY_TOO_LARGE');
  }
  const reader=c.req.raw.body?.getReader();
  if(!reader)throw new Error('MISSING_BODY');
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_BYTES){
        void reader.cancel().catch(()=>undefined);
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));
}

/**
 * Explicitly gated staging launch for the *original* authored HTML5 player.
 * Unlike /curso, this cannot serve a review ZIP or arbitrary client URL.
 * The independent, D1-pinned APPROVED policy must name a reviewed immutable
 * source delivery. Default OFF; no D1/R2 write or certification occurs here.
 */
app.get('/matriculas/:matriculaId/etapas/lancamento',async c=>{
  c.header('Cache-Control','private, no-store');
  c.header('X-Content-Type-Options','nosniff');
  const empresaId=getEmpresaIdSafe(c);
  const launchAllowlist=c.env.PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS;
  if(!canWritePlayer3Stage(c.env,empresaId)||
     !launchAllowlist||launchAllowlist.includes('*')||
     !launchAllowlist.split(',').some(v=>v.trim()===String(empresaId))){
    return c.json({success:false,code:'PLAYER3_AUTHORED_LAUNCH_NOT_ENABLED'},404);
  }
  const rawId=c.req.param('matriculaId');
  if(!ENROLLMENT.test(rawId)){
    return c.json({success:false,code:'PLAYER3_INVALID_CONTEXT'},400);
  }
  const rawActor=c.get('userId' as never) as unknown;
  const actorUserId=typeof rawActor==='number'?rawActor:
    typeof rawActor==='string'?Number(rawActor):NaN;
  if(!Number.isSafeInteger(actorUserId)||actorUserId<=0){
    return c.json({success:false,code:'PLAYER3_ACCESS_DENIED'},403);
  }
  try{
    const matriculaId=Number(rawId);
    const {course,binding,policy,bank}=await loadApprovedPlayer3StageContext({
      env:c.env,db:c.env.DB,bucket:c.env.BUCKET,
      empresaId,matriculaId,actorUserId,
    });
    const launch=approvedAuthoredLaunch({
      environment:c.env.ENVIRONMENT,tenant:empresaId,course:course.cursoId,
      editionSha256:course.editionHash,sourceSha256:binding.source_sha256,
      originBinding:c.env.PLAYER3_AUTHORED_CONTENT_ORIGIN,
      launchTenantAllowlist:launchAllowlist,
      learnerContent:policy.learnerContent,
    });
    // The resume location is server-derived from the already pinned Native
    // edition AND its ordered original IDs, with a SHA approved in the policy.
    // Never accept a slide counter/bookmark from the iframe or the request.
    const {summary:nativeSession}=await readNativeLearnerSession({
      env:c.env,db:c.env.DB,actorUserId,artifact:course.artifact,
      scope:{empresaId,matriculaId,cursoId:course.cursoId,
        cicloId:course.cicloId,artifactHash:course.editionHash},
    });
    const state=await readPlayer3ModuleSession({
      env:c.env,db:c.env.DB,bucket:c.env.BUCKET,
      empresaId,matriculaId,actorUserId,
    });
    if(state.editionSha256!==course.editionHash||
       state.cycleId!==course.cicloId||
       !Array.isArray(state.stages)||state.stages.length!==policy.stages.length){
      throw Error('PLAYER3_AUTHORED_SESSION_EDITION_CONFLICT');
    }
    // The cursor must be derived from BOTH immutable evidence streams:
    // ordered lesson checkpoints and independently regraded passed modules.
    const navigation=await verifiedAuthoredNavigation({
      units:course.artifact.units,
      approvedOrderedUnitIdsSha256:launch.orderedUnitIdsSha256,
      session:nativeSession,cycleId:course.cicloId,
      editionSha256:course.editionHash,
      passedOfficialStageIds:state.stages.filter(row=>row.passed).map(row=>row.stageId),
    });
    const pending=state.stages.find(row=>!row.passed);
    if(Boolean(pending)===state.allOfficialStagesPassed){
      throw Error('PLAYER3_AUTHORED_SESSION_POLICY_CONFLICT');
    }
    const policyStage=pending&&policy.stages.find(p=>p.stageId===pending.stageId);
    // Official questions are not released merely because a stage is next.
    // The same authorial-prefix rule is enforced by the Worker POST writer;
    // the launch projection must not disclose the exam ahead of progress.
    const stageIndex=pending?course.artifact.units.findIndex(unit=>
      unit.id===pending.stageId&&unit.kind==='assessment'):-1;
    if(pending&&stageIndex<0)throw Error('PLAYER3_AUTHORED_STAGE_NOT_FOUND');
    const priorLessons=pending?course.artifact.units.slice(0,stageIndex)
      .filter(unit=>unit.kind==='lesson').map(unit=>unit.id):[];
    const canPresentStage=!!pending&&priorLessons.every((id,index)=>
      nativeSession.seenLessonIds[index]===id);
    let assessment:null|{stage_id:string;title:string;
      questions:{id:string;prompt:string;options:{id:string;text:string}[]}[]}=null;
    if(canPresentStage&&pending){
      if(!policyStage||!Array.isArray(policyStage.requiredQuestionIds)||
         policyStage.requiredQuestionIds.length<1||
         policyStage.requiredQuestionIds.length>100){
        throw Error('PLAYER3_AUTHORED_STAGE_POLICY_INVALID');
      }
      const questions=policyStage.requiredQuestionIds.map((id:string)=>{
        const source=course.artifact.questions.find(q=>q.id===id);
        const hidden=bank.questions.find(q=>q.id===id&&q.stageId===pending.stageId);
        if(!source||!hidden||!Array.isArray(source.options)||
           source.options.length<2||source.options.length>12||
           source.options.length!==hidden.options.length||
           source.options.some((o,i)=>o.id!==hidden.options[i])){
          throw Error('PLAYER3_AUTHORED_QUESTIONS_NOT_CROSSWALKED');
        }
        return {id:source.id,prompt:source.prompt,
          options:source.options.map(o=>({id:o.id,text:o.text}))};
      });
      if(new Set(questions.map((q:{id:string})=>q.id)).size!==questions.length){
        throw Error('PLAYER3_AUTHORED_DUPLICATE_QUESTION');
      }
      assessment={stage_id:pending.stageId,title:pending.stageId,questions};
    }
    return c.json({success:true,data:{
      empresa_id:empresaId,matricula_id:matriculaId,
      curso_id:course.cursoId,ciclo_id:course.cicloId,
      edition_sha256:course.editionHash,
      content_url:launch.contentUrl,content_origin:launch.contentOrigin,
      assessment_presentation:'authored-html5',
      resume_next_unit_id:navigation.resumeNextUnitId,
      checkpoint_unit_ids:navigation.checkpointUnitIds,
      last_visited_unit_id:navigation.lastVisitedUnitId,
      official_stages_passed:state.allOfficialStagesPassed,
      completion_supported:false,pending_assessment:assessment,
    }},200);
  }catch{
    // Never fall back to review-only or legacy SCORM on an invalid launch.
    return c.json({success:false,code:'PLAYER3_AUTHORED_LAUNCH_UNAVAILABLE'},409);
  }
});

app.post('/matriculas/:matriculaId/etapas/:stageId/tentativas',async c=>{
  c.header('Cache-Control','private, no-store');
  const empresaId=getEmpresaIdSafe(c);
  if(!canWritePlayer3Stage(c.env,empresaId)){
    return c.json({success:false,code:'PLAYER3_STAGE_NOT_ENABLED'},404);
  }
  const rawId=c.req.param('matriculaId');
  const stageId=c.req.param('stageId');
  if(!ENROLLMENT.test(rawId)||!ID.test(stageId)){
    return c.json({success:false,code:'PLAYER3_INVALID_CONTEXT'},400);
  }
  const rawActor=c.get('userId' as never) as unknown;
  const actorUserId=typeof rawActor==='number'?rawActor:
    typeof rawActor==='string'?Number(rawActor):NaN;
  if(!Number.isSafeInteger(actorUserId)||actorUserId<=0){
    return c.json({success:false,code:'PLAYER3_ACCESS_DENIED'},403);
  }
  let input;
  try{input=Attempt.parse(await readBoundedJson(c));}
  catch{return c.json({success:false,code:'PLAYER3_INVALID_INPUT'},400);}
  try{
    const result=await commitPlayer3StageAttempt({
      db:c.env.DB,env:c.env,bucket:c.env.BUCKET,
      empresaId,actorUserId,matriculaId:Number(rawId),stageId,
      eventId:input.eventId,attemptNumber:input.attemptNumber,answers:input.answers,
    });
    return c.json({success:true,data:{
      state:result.state,
      stage_id:result.stageId,
      attempt_number:result.attemptNumber,
      edition_sha256:result.editionSha256,
      score_pct:result.scorePct,
      stage_passed:result.stagePassed,
      completion_supported:false,
    }},result.state==='APPLIED'?201:200);
  }catch(error){
    if(error instanceof NativeAdmissionError){
      return c.json({success:false,code:error.code},error.status);
    }
    if(error instanceof NativeContentLoadError){
      return c.json({success:false,code:'PLAYER3_EDITION_UNAVAILABLE'},409);
    }
    if(error instanceof Player3StageWriteError){
      return c.json({success:false,code:error.code},409);
    }
    return c.json({success:false,code:'PLAYER3_STAGE_UNAVAILABLE'},503);
  }
});
/** Read authenticated, re-graded modular receipt state after reconnect/reopen. */
app.get('/matriculas/:matriculaId/etapas/sessao',async c=>{
  c.header('Cache-Control','private, no-store');
  const empresaId=getEmpresaIdSafe(c);
  if(!canWritePlayer3Stage(c.env,empresaId)){
    return c.json({success:false,code:'PLAYER3_SESSION_NOT_ENABLED'},404);
  }
  const rawId=c.req.param('matriculaId');
  if(!ENROLLMENT.test(rawId)){
    return c.json({success:false,code:'PLAYER3_INVALID_CONTEXT'},400);
  }
  const rawActor=c.get('userId' as never) as unknown;
  const actorUserId=typeof rawActor==='number'?rawActor:
    typeof rawActor==='string'?Number(rawActor):NaN;
  if(!Number.isSafeInteger(actorUserId)||actorUserId<=0){
    return c.json({success:false,code:'PLAYER3_ACCESS_DENIED'},403);
  }
  try{
    const data=await readPlayer3ModuleSession({
      db:c.env.DB,env:c.env,bucket:c.env.BUCKET,empresaId,
      matriculaId:Number(rawId),actorUserId,
    });
    return c.json({success:true,data},200);
  }catch(error){
    if(error instanceof NativeAdmissionError){
      return c.json({success:false,code:error.code},error.status);
    }
    if(error instanceof NativeContentLoadError){
      return c.json({success:false,code:'PLAYER3_EDITION_UNAVAILABLE'},409);
    }
    if(error instanceof Player3StageWriteError){
      return c.json({success:false,code:error.code},409);
    }
    return c.json({success:false,code:'PLAYER3_SESSION_UNAVAILABLE'},503);
  }
});
/** Read-only diagnostic, never an LMS completion or certificate API. */
app.get('/matriculas/:matriculaId/etapas/prontidao',async c=>{
  c.header('Cache-Control','private, no-store');
  c.header('X-Content-Type-Options','nosniff');
  const empresaId=getEmpresaIdSafe(c);
  if(!canWritePlayer3Stage(c.env,empresaId)){
    return c.json({success:false,code:'PLAYER3_READINESS_NOT_ENABLED'},404);
  }
  const rawId=c.req.param('matriculaId');
  if(!ENROLLMENT.test(rawId)){
    return c.json({success:false,code:'PLAYER3_INVALID_CONTEXT'},400);
  }
  const rawActor=c.get('userId' as never) as unknown;
  const actorUserId=typeof rawActor==='number'?rawActor:
    typeof rawActor==='string'?Number(rawActor):NaN;
  if(!Number.isSafeInteger(actorUserId)||actorUserId<=0){
    return c.json({success:false,code:'PLAYER3_ACCESS_DENIED'},403);
  }
  try{
    const result=await readPlayer3JointPreflight({
      env:c.env,db:c.env.DB,bucket:c.env.BUCKET,
      empresaId,matriculaId:Number(rawId),actorUserId,
    });
    return c.json({success:true,data:{
      matricula_id:Number(rawId),
      ...result,
      // A ready-for-atomic-preflight result must never claim completion.
      completion_supported:false,
    }},200);
  }catch(error){
    if(error instanceof NativeAdmissionError){
      return c.json({success:false,code:error.code},error.status);
    }
    // No private evidence or database errors may leak to the student.
    return c.json({success:false,code:'PLAYER3_READINESS_UNAVAILABLE'},409);
  }
});

export default app;
