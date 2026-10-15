/**
 * Server-only approved official stage proof loader for Player3 terminal.
 * A browser cannot provide any attempt ID, grade or answer key.
 * Returns stable, hash-regraded receipts for a future ATOMIC D1 completion
 * preflight. No route, D1/R2 writes or certificate side effects.
 */
import type {Env} from '../types';
import {
  loadApprovedPlayer3StageContext,Player3StageWriteError,
} from './lms-player3-module-attempt-writer';
import {gradePlayer3ApprovedStage} from '../lib/lms-player3/private-stage-grader';
import type {Player3TerminalStageReceipt} from './lms-player3-terminal-transaction-guard';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const POS=(x:number)=>Number.isSafeInteger(x)&&x>0;
type Row={
  id:number;politica_id:number;etapa_id:string;tentativa_numero:number;
  event_id:string;answers_json:string;answers_sha256:string;
  score_pct:number;passed:number;
};
const PROOFS=[
  'SELECT t.id,t.politica_id,t.etapa_id,t.tentativa_numero,t.event_id,',
  't.answers_json,t.answers_sha256,t.score_pct,t.passed',
  'FROM lms_player3_tentativas_modulares t',
  'WHERE t.vinculo_id=? AND t.politica_id=? AND t.passed=1',
  'AND t.tentativa_numero=(SELECT MIN(a.tentativa_numero)',
  'FROM lms_player3_tentativas_modulares a',
  'WHERE a.vinculo_id=t.vinculo_id AND a.politica_id=t.politica_id',
  'AND a.etapa_id=t.etapa_id AND a.passed=1)',
  'ORDER BY t.etapa_id LIMIT 101',
].join(' ');
const deny=(code:string):never=>{throw new Player3StageWriteError(code);};
async function digest(s:string):Promise<string>{
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function preparePlayer3VerifiedPassProofs(input:{
  env:Env;db:D1Database;bucket:R2Bucket;actorUserId:number;
  empresaId:number;matriculaId:number;
}){
  // The helper enforces staging opt-in, private R2 integrity, active learner,
  // exact tenant/current cycle and published edition before any ledger read.
  const {course,binding,policy,bank}=await loadApprovedPlayer3StageContext(input);
  if(!Array.isArray(policy?.stages)||policy.stages.length<1||
    policy.stages.length>100||policy.certificationApproved!==true){
    deny('PLAYER3_TERMINAL_POLICY_NOT_APPROVED');
  }
  const required=new Set<string>();
  for(const stage of policy.stages){
    if(!stage||!ID.test(stage.stageId)||required.has(stage.stageId)||
       !Array.isArray(stage.requiredQuestionIds)||stage.requiredQuestionIds.length<1){
      deny('PLAYER3_TERMINAL_POLICY_INVALID');
    }
    required.add(stage.stageId);
  }
  let rows:Row[];
  try{
    const result=await input.db.prepare(PROOFS)
      .bind(binding.vinculo_id,binding.politica_id).all<Row>();
    if(result.success!==true||!Array.isArray(result.results)){
      deny('PLAYER3_TERMINAL_PROOFS_READ_FAILED');
    }
    rows=result.results;
  }catch{throw new Player3StageWriteError('PLAYER3_TERMINAL_PROOFS_READ_FAILED');}
  if(!Array.isArray(rows)||rows.length!==required.size||rows.length>100){
    deny('PLAYER3_TERMINAL_OFFICIAL_PROOFS_MISSING');
  }
  const receipts:Player3TerminalStageReceipt[]=[];
  const consumed=new Set<string>();
  for(const row of rows){
    if(!row||!POS(row.id)||row.politica_id!==binding.politica_id||
       !ID.test(row.etapa_id)||!required.has(row.etapa_id)||
       consumed.has(row.etapa_id)||!ID.test(row.event_id)||
       !POS(row.tentativa_numero)||row.tentativa_numero>500||
       !SHA.test(row.answers_sha256)||typeof row.answers_json!=='string'||
       row.answers_json.length<2||row.answers_json.length>131072||
       !Number.isInteger(row.score_pct)||row.score_pct<0||row.score_pct>100||
       row.passed!==1||await digest(row.answers_json)!==row.answers_sha256){
      deny('PLAYER3_TERMINAL_PROOFS_INVALID');
    }
    let answers:unknown;
    try{answers=JSON.parse(row.answers_json);}
    catch{deny('PLAYER3_TERMINAL_PROOFS_INVALID');}
    let verdict:ReturnType<typeof gradePlayer3ApprovedStage>;
    try{
      verdict=gradePlayer3ApprovedStage(bank,policy,{
        stageId:row.etapa_id,answers:answers as {questionId:string;optionId:string}[],
      });
    }catch{throw new Player3StageWriteError('PLAYER3_TERMINAL_REGRADING_FAILED');}
    if(!verdict.stagePassed||row.score_pct!==verdict.scorePct){
      deny('PLAYER3_TERMINAL_REGRADING_FAILED');
    }
    consumed.add(row.etapa_id);
    receipts.push({
      stageId:row.etapa_id,attemptId:row.id,
      attemptNumber:row.tentativa_numero,answersHash:row.answers_sha256,
      scorePct:row.score_pct,
    });
  }
  if(consumed.size!==required.size)deny('PLAYER3_TERMINAL_PROOFS_MISSING');
  // No answer arrays or learner identity are included in the exported proofs.
  return {
    course,binding,
    sourceHash:binding.source_sha256,
    bankHash:binding.bank_sha256,
    policyHash:binding.policy_sha256,
    officialStages:receipts,
  };
}
