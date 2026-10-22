/**
 * Default-OFF, staging-only canonical Native completion.
 * This endpoint is NOT AVAILABLE until the 0550/0551/0552 contract has been
 * reviewed, applied via Schema V2 and E2E validated with authorized artifacts.
 *
 * The browser supplies NO employee, course version, grade, status or
 * qualification metadata. Auth/JWT+tenant come from the parent lms-native.ts.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { getEmpresaIdSafe } from './escalas-shared';
import { canProvisionNative } from '../services/lms-native-enrollment-provisioner';
import { prepareNativeTerminalGuard } from '../services/lms-native-terminal-preparer';
import { completeLmsMatricula, LmsCompletionRejectedError } from '../services/lms-completion';

const app=new Hono<{Bindings:Env}>();
const ID=/^[1-9][0-9]{0,15}$/;
export function canCompleteNative(env:Env,tenant:number):boolean{
  // During the Player3 module pilot, the legacy Native single-attempt
  // terminal cannot certify an edition governed by independent stage proofs.
  // Until the Player3 canonical terminal verifies every required module,
  // keep these two completion authorities mutually exclusive (fail-closed).
  const modular=env.PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS;
  if(modular && (modular.includes('*') ||
    modular.split(',').some(raw=>raw.trim()===String(tenant))))return false;
  const allowlist=env.NATIVE_COMPLETION_WRITE_ENABLED_TENANTS;
  return canProvisionNative(env,tenant) && !!allowlist && !allowlist.includes('*') &&
    allowlist.split(',').some(p=>p.trim()===String(tenant));
}

app.post('/matriculas/:matriculaId/concluir',async c=>{
  c.header('Cache-Control','private, no-store');
  const empresaId=getEmpresaIdSafe(c);
  if(!canCompleteNative(c.env,empresaId)){
    return c.json({success:false,code:'NATIVE_COMPLETION_NOT_ENABLED'},404);
  }
  const raw=c.req.param('matriculaId');
  if(!ID.test(raw)){
    return c.json({success:false,code:'NATIVE_COMPLETION_INVALID_ID'},400);
  }
  if(c.req.raw.body ||
     (c.req.header('content-length') && c.req.header('content-length')!=='0')){
    return c.json({success:false,code:'NATIVE_COMPLETION_BODY_NOT_ALLOWED'},400);
  }
  const rawActor=c.get('userId' as never) as unknown;
  const actorUserId=typeof rawActor==='number'?rawActor:
    typeof rawActor==='string'?Number(rawActor):NaN;
  if(!Number.isSafeInteger(actorUserId)||actorUserId<=0){
    return c.json({success:false,code:'NATIVE_COMPLETION_ACCESS_DENIED'},403);
  }
  const matriculaId=Number(raw);
  try{
    const plan=await prepareNativeTerminalGuard({
      env:c.env,empresaId,matriculaId,actorUserId,
    });
    if(!plan.ready){
      return c.json({success:false,code:'NATIVE_COMPLETION_NOT_READY'},409);
    }
    const {canonical,terminalAnchor}=plan;
    const result=await completeLmsMatricula({
      db:c.env.DB,env:c.env,
      empresaId,matriculaId,cursoId:canonical.cursoId,
      funcionarioId:canonical.funcionarioId,
      cursoTitulo:canonical.cursoTitulo,
      gerarQualificacaoAoConcluir:canonical.gerarQualificacaoAoConcluir,
      qualificacaoTipoId:canonical.qualificacaoTipoId,
      qualificacaoCodigo:canonical.qualificacaoCodigo,
      qualificacaoNome:canonical.qualificacaoNome,
      qualificacaoCategoria:canonical.qualificacaoCategoria,
      qualificacaoCategoriaId:canonical.qualificacaoCategoriaId,
      qualificacaoCategoriaCodigo:canonical.qualificacaoCategoriaCodigo,
      validade:canonical.validade,
      vencimentoFimMes:canonical.vencimentoFimMes,
      dataConclusao:new Date().toISOString().slice(0,10),
      existingHistoricoId:canonical.existingHistoricoId,
      scoreFinal:canonical.evidenceSnapshot.scorePct,
      progressoPct:100,
      action:'LMS_NATIVE_CANONICAL_CONCLUIDA',
      actorUserId,
      ipAddress:c.req.header('cf-connecting-ip')??undefined,
      userAgent:c.req.header('user-agent')??undefined,
      nativeTerminalAnchor:terminalAnchor,
    });
    // A canonical writer must return a receipt for THIS enrollment and the
    // qualification contract preflighted for THIS course. Never report HTTP
    // 200 for a failed, absent or cross-enrollment qualification result.
    const qualificationExpected=canonical.gerarQualificacaoAoConcluir;
    const verifiedReceipt=result.matriculaId===matriculaId && (
      qualificationExpected
        ? (result.outcome==='qualification_created' ||
           result.outcome==='qualification_reused') &&
          Number.isSafeInteger(result.qualificacaoHistoricoId) &&
          (result.qualificacaoHistoricoId ?? 0)>0
        : result.outcome==='qualification_not_required' &&
          result.qualificacaoHistoricoId===null
    );
    if(!verifiedReceipt){
      return c.json({success:false,code:'NATIVE_COMPLETION_RECEIPT_UNCONFIRMED'},503);
    }
    // Historical qualification + certificate generation are distinct:
    // do not promise a document was issued by this HTTP response.
    return c.json({success:true,data:{
      matricula_id:matriculaId,
      status:'CONCLUIDO',
      qualification_outcome:result.outcome,
      certificate_state:qualificationExpected
        ? 'REQUIRES_VERIFICATION' : 'NOT_APPLICABLE',
    }},200);
  }catch(error){
    if(error instanceof LmsCompletionRejectedError){
      return c.json({success:false,code:'NATIVE_COMPLETION_TRANSACTION_REJECTED'},409);
    }
    return c.json({success:false,code:'NATIVE_COMPLETION_UNAVAILABLE'},503);
  }
});

export default app;
