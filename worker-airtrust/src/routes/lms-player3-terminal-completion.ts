/**
 * Player3 certification terminal: separate from Native V1 single final exam.
 * Staging only, SIX independent exact-tenant gates, default OFF.
 *
 * No browser-submitted grades, course metadata, evidence or certificate.
 * A server-owned, regraded immutable snapshot is asserted inside the SAME
 * D1.batch as qualification + enrollment + cycle and terminal intent consumption.
 *
 * Do not enable until 0552/0553 + reviewed 0554/0555 are governed and applied,
 * SHA-pinned private content is approved, and staging recovery is ready.
 */
import {Hono} from 'hono';
import type {Env} from '../types';
import {getEmpresaIdSafe} from './escalas-shared';
import {canWritePlayer3Stage,Player3StageWriteError} from
  '../services/lms-player3-module-attempt-writer';
import {canReadNativeCatalogActivation} from
  '../services/lms-native-catalog-legacy-guard';
import {preparePlayer3CanonicalTerminal} from
  '../services/lms-player3-canonical-terminal-preparer';
import {completeLmsMatricula,LmsCompletionRejectedError} from
  '../services/lms-completion';

const app=new Hono<{Bindings:Env}>();
const ENROLLMENT=/^[1-9][0-9]{0,15}$/;

export function canCompletePlayer3(env:Env,tenant:number):boolean{
  const raw=env.PLAYER3_TERMINAL_WRITE_ENABLED_TENANTS;
  return canWritePlayer3Stage(env,tenant) &&
    canReadNativeCatalogActivation(env,tenant) &&
    !!raw && !raw.includes('*') &&
    raw.split(',').some(value=>value.trim()===String(tenant));
}

app.post('/matriculas/:matriculaId/etapas/concluir',async c=>{
  c.header('Cache-Control','private, no-store');
  c.header('X-Content-Type-Options','nosniff');
  const empresaId=getEmpresaIdSafe(c);
  // Before touching D1/R2 or accepting any payload.
  if(!canCompletePlayer3(c.env,empresaId)){
    return c.json({success:false,code:'PLAYER3_TERMINAL_NOT_ENABLED'},404);
  }
  const raw=c.req.param('matriculaId');
  if(!ENROLLMENT.test(raw)){
    return c.json({success:false,code:'PLAYER3_TERMINAL_INVALID_ID'},400);
  }
  if(c.req.raw.body || (c.req.header('content-length') &&
     c.req.header('content-length')!=='0')){
    return c.json({success:false,code:'PLAYER3_TERMINAL_BODY_NOT_ALLOWED'},400);
  }
  const actor=c.get('userId' as never) as unknown;
  const actorUserId=typeof actor==='number'?actor:
    typeof actor==='string'?Number(actor):NaN;
  if(!Number.isSafeInteger(actorUserId)||actorUserId<=0){
    return c.json({success:false,code:'PLAYER3_TERMINAL_ACCESS_DENIED'},403);
  }
  const matriculaId=Number(raw);
  try{
    const {canonical,terminalAnchor}=await preparePlayer3CanonicalTerminal({
      env:c.env,db:c.env.DB,bucket:c.env.BUCKET,
      actorUserId,empresaId,matriculaId,
    });
    const result=await completeLmsMatricula({
      db:c.env.DB,env:c.env,empresaId,matriculaId,
      cursoId:canonical.cursoId,funcionarioId:canonical.funcionarioId,
      cursoTitulo:canonical.cursoTitulo,
      gerarQualificacaoAoConcluir:canonical.gerarQualificacaoAoConcluir,
      qualificacaoTipoId:canonical.qualificacaoTipoId,
      qualificacaoCodigo:canonical.qualificacaoCodigo,
      qualificacaoNome:canonical.qualificacaoNome,
      qualificacaoCategoria:canonical.qualificacaoCategoria,
      qualificacaoCategoriaId:canonical.qualificacaoCategoriaId,
      qualificacaoCategoriaCodigo:canonical.qualificacaoCategoriaCodigo,
      validade:canonical.validade,vencimentoFimMes:canonical.vencimentoFimMes,
      dataConclusao:new Date().toISOString().slice(0,10),
      existingHistoricoId:canonical.existingHistoricoId,
      scoreFinal:null,progressoPct:100,
      action:'LMS_PLAYER3_CANONICAL_CONCLUIDA',
      actorUserId,ipAddress:c.req.header('cf-connecting-ip')??undefined,
      userAgent:c.req.header('user-agent')??undefined,
      player3TerminalAnchor:terminalAnchor,
    });
    const qualificationExpected=canonical.gerarQualificacaoAoConcluir;
    const receiptValid=result.matriculaId===matriculaId &&
      (qualificationExpected
        ? (result.outcome==='qualification_created' ||
           result.outcome==='qualification_reused') &&
          Number.isSafeInteger(result.qualificacaoHistoricoId) &&
          (result.qualificacaoHistoricoId??0)>0
        : result.outcome==='qualification_not_required' &&
          result.qualificacaoHistoricoId===null);
    if(!receiptValid){
      return c.json({success:false,code:'PLAYER3_TERMINAL_RECEIPT_UNCONFIRMED'},503);
    }
    // Certificate generation is POST-COMMIT; verify the real document
    // separately. Never tell the learner a PDF exists merely from 200.
    return c.json({success:true,data:{
      matricula_id:matriculaId,status:'CONCLUIDO',
      qualification_outcome:result.outcome,
      certificate_state:qualificationExpected
        ? 'REQUIRES_VERIFICATION':'NOT_APPLICABLE',
    }},200);
  }catch(error){
    if(error instanceof Player3StageWriteError ||
       error instanceof LmsCompletionRejectedError){
      return c.json({success:false,code:'PLAYER3_TERMINAL_PRECONDITION_REJECTED'},409);
    }
    return c.json({success:false,code:'PLAYER3_TERMINAL_UNAVAILABLE'},503);
  }
});
export default app;
