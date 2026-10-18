/**
 * Private Native-only QA ledger projection: staging + exact tenant allowlist.
 * Does not enable Native, the authored player, writes or course completion.
 * Authentication is inherited from the lms-native parent.
 */
import {Hono} from 'hono';
import type {Env} from '../types';
import {getEmpresaIdSafe} from './escalas-shared';
import {canReadPlayer3QaEvidence} from '../services/lms-player3-module-attempt-writer';
import {readPlayer3QaSnapshot} from '../services/lms-player3-qa-evidence-reader';

const app=new Hono<{Bindings:Env}>();
app.get('/matriculas/:matriculaId/etapas/qa-evidencias',async c=>{
  c.header('Cache-Control','private, no-store');
  c.header('X-Content-Type-Options','nosniff');
  const empresaId=getEmpresaIdSafe(c);
  // Deliberately before querying D1/R2; production and unlisted tenants 404.
  if(!canReadPlayer3QaEvidence(c.env,empresaId)){
    return c.json({success:false,code:'PLAYER3_QA_NOT_ENABLED'},404);
  }
  const rawId=c.req.param('matriculaId');
  if(!/^[1-9][0-9]{0,15}$/.test(rawId)||
     !Number.isSafeInteger(Number(rawId))){
    return c.json({success:false,code:'PLAYER3_QA_INVALID_ID'},400);
  }
  const rawActor=c.get('userId' as never) as unknown;
  const actorUserId=typeof rawActor==='number'?rawActor:
    typeof rawActor==='string'?Number(rawActor):NaN;
  if(!Number.isSafeInteger(actorUserId)||actorUserId<=0){
    return c.json({success:false,code:'PLAYER3_QA_ACCESS_DENIED'},403);
  }
  try{
    const data=await readPlayer3QaSnapshot({
      env:c.env,db:c.env.DB,bucket:c.env.BUCKET,
      empresaId,matriculaId:Number(rawId),actorUserId,
    });
    return c.json({success:true,data},200);
  }catch{
    // Do not turn a missing edition, broken evidence ledger or cross-tenant
    // lookup into a partial/optimistic snapshot; never echo secrets/answers.
    return c.json({success:false,code:'PLAYER3_QA_SNAPSHOT_UNAVAILABLE'},409);
  }
});
export default app;