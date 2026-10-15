/**
 * Player3 official module resume. Returns ONLY navigation/grade receipts, not
 * submitted options, private policy or answer keys. Recalculates each selected
 * winning/latest attempt with the approved, immutable server-private bank.
 */
import type {Env} from '../types';
import {loadApprovedPlayer3StageContext,Player3StageWriteError} from './lms-player3-module-attempt-writer';
import {gradePlayer3ApprovedStage} from '../lib/lms-player3/private-stage-grader';

const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const HASH=/^[a-f0-9]{64}$/;
type Row={politica_id:number;etapa_id:string;tentativa_numero:number;event_id:string;
  answers_json:string;answers_sha256:string;score_pct:number;passed:number};
export type Player3ModuleSession=Readonly<{
  editionSha256:string;cycleId:number;allOfficialStagesPassed:boolean;
  completionSupported:false;
  stages:readonly Readonly<{stageId:string;attempts:number;lastScorePct:number|null;
    passed:boolean;nextAttemptNumber:number|null}>[];
}>;

const LAST_AND_FIRST_PASS=[
  'SELECT t.politica_id,t.etapa_id,t.tentativa_numero,t.event_id,',
  't.answers_json,t.answers_sha256,t.score_pct,t.passed',
  'FROM lms_player3_tentativas_modulares t WHERE t.vinculo_id=? AND (',
  't.tentativa_numero=(SELECT MAX(a.tentativa_numero)',
  'FROM lms_player3_tentativas_modulares a WHERE a.vinculo_id=t.vinculo_id',
  'AND a.etapa_id=t.etapa_id)',
  'OR (t.passed=1 AND t.tentativa_numero=(SELECT MIN(a.tentativa_numero)',
  'FROM lms_player3_tentativas_modulares a WHERE a.vinculo_id=t.vinculo_id',
  'AND a.etapa_id=t.etapa_id AND a.passed=1)))',
  'ORDER BY t.etapa_id,t.tentativa_numero LIMIT 401',
].join(' ');
async function hash(value:string):Promise<string>{
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const error=(code:string):never=>{throw new Player3StageWriteError(code);};
export async function readPlayer3ModuleSession(input:{
  env:Env;db:D1Database;bucket:R2Bucket;actorUserId:number;
  empresaId:number;matriculaId:number;
}):Promise<Player3ModuleSession>{
  const {course,binding,policy,bank}=await loadApprovedPlayer3StageContext(input);
  if(!policy||policy.schema!=='AIRTRUST_PLAYER3_GRADE_POLICY_V1'||
      policy.certificationApproved!==true||
      !Array.isArray(policy.stages)||policy.stages.length<1||
      policy.stages.length>100)error('STAGE_SESSION_POLICY_INVALID');
  const valid=new Set<string>();
  for(const stage of policy.stages){
    if(!stage||!ID.test(stage.stageId)||valid.has(stage.stageId)||
       !Number.isInteger(stage.masteryScore)||stage.masteryScore<1||
       stage.masteryScore>100||
       !Array.isArray(stage.requiredQuestionIds)||stage.requiredQuestionIds.length<1){
      error('STAGE_SESSION_POLICY_INVALID');
    }
    valid.add(stage.stageId);
  }
  let response;
  try{
    response=await input.db.prepare(LAST_AND_FIRST_PASS)
      .bind(binding.vinculo_id).all<Row>();
  }catch{error('STAGE_SESSION_LEDGER_UNAVAILABLE');}
  const rows=response?.results;
  if(!Array.isArray(rows)||rows.length>200)throw new Player3StageWriteError('STAGE_SESSION_LEDGER_INVALID');
  const observed=new Map<string,{
    latest:number;latestScore:number|null;passed:boolean;
  }>();
  for(const row of rows){
    if(!row||row.politica_id!==binding.politica_id||
       !ID.test(row.etapa_id)||!valid.has(row.etapa_id)||
       !ID.test(row.event_id)||!Number.isSafeInteger(row.tentativa_numero)||
       row.tentativa_numero<1||row.tentativa_numero>500||
       !Number.isInteger(row.score_pct)||row.score_pct<0||row.score_pct>100||
       ![0,1].includes(row.passed)||
       typeof row.answers_json!=='string'||row.answers_json.length<2||
       row.answers_json.length>131072||!HASH.test(row.answers_sha256)||
       await hash(row.answers_json)!==row.answers_sha256){
      error('STAGE_SESSION_LEDGER_INVALID');
    }
    let answers:unknown;
    try{answers=JSON.parse(row.answers_json);}catch{error('STAGE_SESSION_LEDGER_INVALID');}
    let verdict:ReturnType<typeof gradePlayer3ApprovedStage>;
    try{
      verdict=gradePlayer3ApprovedStage(bank,policy,{
        stageId:row.etapa_id,
        answers:answers as {questionId:string;optionId:string}[],
      });
    }catch{throw new Player3StageWriteError('STAGE_SESSION_GRADE_INCONSISTENT');}
    if(verdict.scorePct!==row.score_pct||
       Number(verdict.stagePassed)!==row.passed){
      error('STAGE_SESSION_GRADE_INCONSISTENT');
    }
    const current=observed.get(row.etapa_id)??{
      latest:0,latestScore:null,passed:false,
    };
    observed.set(row.etapa_id,{
      latest:Math.max(current.latest,row.tentativa_numero),
      latestScore:row.tentativa_numero>current.latest
        ?row.score_pct:current.latestScore,
      passed:current.passed||verdict.stagePassed,
    });
  }
  const stages=policy.stages.map(stage=>{
    const v=observed.get(stage.stageId);
    return {
      stageId:stage.stageId,attempts:v?.latest??0,
      lastScorePct:v?.latestScore??null,
      passed:v?.passed??false,
      nextAttemptNumber:(v?.passed??false)?null:
        (v?.latest??0)<500?(v?.latest??0)+1:null,
    };
  });
  return {
    editionSha256:course.editionHash,cycleId:course.cicloId,
    allOfficialStagesPassed:stages.every(s=>s.passed),
    completionSupported:false,stages,
  };
}
