/**
 * Player3 joint content + modular-exam readiness, evaluated only over Worker-
 * verified, edition-bound receipts. NOT a completion authorization or proof
 * of visual HTML5 rendering: its content receipt still needs a real browser
 * integration and atomic terminal guard.
 */
import type {Player3ModuleSession} from '../../services/lms-player3-module-progress-reader';

const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA=/^[a-f0-9]{64}$/;

export type Player3JointReadiness = Readonly<{
  readyForAtomicTerminalPreflight:boolean;
  reason:'READY_FOR_TERMINAL_PREFLIGHT'|'EDITION_OR_CYCLE_MISMATCH'|
    'INVALID_EVIDENCE'|'CONTENT_NOT_FINISHED'|'OFFICIAL_STAGES_NOT_PASSED'|
    'REVIEW_READ_ONLY';
  editionSha256:string;
  cycleId:number;
  totalRequiredLessons:number;
  verifiedLessons:number;
  officialStageCount:number;
  officialStagesPassed:number;
  completionSupported:false;
}>;

export function assessPlayer3JointReadiness(input:{
  mode:'LEARN'|'REVIEW';
  editionSha256:string;cycleId:number;
  requiredLessonIds:readonly string[];
  recordedLessonIds:readonly string[];
  moduleSession:Player3ModuleSession;
}):Player3JointReadiness{
  const {mode,editionSha256,cycleId,requiredLessonIds,recordedLessonIds,moduleSession}=input;
  const shape=Array.isArray(requiredLessonIds)&&Array.isArray(recordedLessonIds)&&
    Array.isArray(moduleSession?.stages)&&
    requiredLessonIds.length>0&&requiredLessonIds.length<=500&&
    recordedLessonIds.length<=10000&&
    // REVIEW is read-only and may deliberately omit the module ledger.
    // LEARN still requires at least one actual official stage.
    (moduleSession.stages.length>0||mode==='REVIEW')&&
    moduleSession.stages.length<=100&&
    [requiredLessonIds,recordedLessonIds].every(items=>items.every(id=>typeof id==='string'&&ID.test(id)))&&
    requiredLessonIds.length===new Set(requiredLessonIds).size&&
    recordedLessonIds.length===new Set(recordedLessonIds).size&&
    moduleSession.stages.every(s=>s&&typeof s.stageId==='string'&&ID.test(s.stageId)&&
      typeof s.passed==='boolean'&&Number.isSafeInteger(s.attempts)&&
      s.attempts>=0&&s.attempts<=500&&
      ((s.passed&&s.attempts>0)||!s.passed)&&
      (s.lastScorePct===null||Number.isInteger(s.lastScorePct)&&
       s.lastScorePct>=0&&s.lastScorePct<=100))&&
    new Set(moduleSession.stages.map(s=>s.stageId)).size===moduleSession.stages.length&&
    moduleSession.allOfficialStagesPassed===
      (moduleSession.stages.length>0&&moduleSession.stages.every(s=>s.passed))&&
    moduleSession.completionSupported===false;
  const verifiedLessons=recordedLessonIds.filter(x=>requiredLessonIds.includes(x)).length;
  const passes=moduleSession.stages.filter(x=>x?.passed).length;
  const base={editionSha256,cycleId,totalRequiredLessons:requiredLessonIds.length,
    verifiedLessons,officialStageCount:moduleSession.stages.length,
    officialStagesPassed:passes,completionSupported:false as const};
  const verdict=(reason:Player3JointReadiness['reason']):Player3JointReadiness=>({
    ...base,readyForAtomicTerminalPreflight:reason==='READY_FOR_TERMINAL_PREFLIGHT',reason,
  });
  if(!SHA.test(editionSha256)||!Number.isSafeInteger(cycleId)||cycleId<=0||
     !shape||recordedLessonIds.some(x=>!requiredLessonIds.includes(x)))return verdict('INVALID_EVIDENCE');
  if(moduleSession.editionSha256!==editionSha256||moduleSession.cycleId!==cycleId){
    return verdict('EDITION_OR_CYCLE_MISMATCH');
  }
  if(mode!=='LEARN')return verdict('REVIEW_READ_ONLY');
  if(verifiedLessons!==requiredLessonIds.length)return verdict('CONTENT_NOT_FINISHED');
  if(passes!==moduleSession.stages.length)return verdict('OFFICIAL_STAGES_NOT_PASSED');
  return verdict('READY_FOR_TERMINAL_PREFLIGHT');
}
