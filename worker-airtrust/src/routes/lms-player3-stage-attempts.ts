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
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

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
export default app;
