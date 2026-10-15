/**
 * Player3 authored cursor: read-only projection derived from the exact,
 * immutable Native edition and the Worker-verified event ledger. The order
 * digest is signed by the approved private policy, not by the iframe.
 * A visit cursor is NOT evidence of lesson completion or exam approval.
 */
import type {NativeUnit} from '../lms/lms-native-course-contract';
import type {NativeSessionSummary} from '../../services/lms-native-readiness-repository';
import {AuthoredLaunchError} from './authored-launch-contract';

const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA=/^[a-f0-9]{64}$/;
const reject=(reason:string):never=>{throw new AuthoredLaunchError(reason);};

export async function verifiedAuthoredNavigation(input:{
  units:readonly NativeUnit[];
  approvedOrderedUnitIdsSha256:string;
  session:NativeSessionSummary;
  cycleId:number;editionSha256:string;
}):Promise<Readonly<{
  resumeNextUnitId:string;
  checkpointUnitIds:readonly string[];
  lastVisitedUnitId:string|null;
}>>{
  const {units,session,cycleId,editionSha256}=input;
  if(!Array.isArray(units)||units.length<1||units.length>500||
     !SHA.test(input.approvedOrderedUnitIdsSha256)||
     !SHA.test(editionSha256)||
     session.editionHash!==editionSha256||session.cicloId!==cycleId||
     session.mode!=='LEARN'||!Number.isSafeInteger(session.nextSequence)||
     session.nextSequence<1||session.nextSequence>10001){
    return reject('PLAYER3_NAV_SCOPE_INVALID');
  }
  const ids=units.map(unit=>unit?.id);
  if(ids.some(id=>typeof id!=='string'||!ID.test(id))||
     new Set(ids).size!==ids.length){
    return reject('PLAYER3_NAV_ORDER_INVALID');
  }
  const hashed=await crypto.subtle.digest(
    'SHA-256',new TextEncoder().encode(JSON.stringify(ids)));
  const digest=[...new Uint8Array(hashed)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==input.approvedOrderedUnitIdsSha256){
    return reject('PLAYER3_NAV_SOURCE_ORDER_NOT_CERTIFIED');
  }
  const lessons=units.filter(unit=>unit.kind==='lesson').map(unit=>unit.id);
  const lessonSet=new Set(lessons);
  const seen=session.seenLessonIds;
  const expectedLast=Array.isArray(seen)&&seen.length?seen[seen.length-1]:null;
  if(!Array.isArray(seen)||
     seen.length>lessons.length||
     new Set(seen).size!==seen.length||
     seen.some(id=>!lessonSet.has(id))||
     seen.some((id,index)=>id!==lessons[index])||
     session.nextSequence!==seen.length+1||
     session.lastVisitedUnitId!==expectedLast){
    return reject('PLAYER3_NAV_LEDGER_CONFLICT');
  }
  const lastIndex=session.lastVisitedUnitId===null
    ?-1:ids.indexOf(session.lastVisitedUnitId);
  // Resume at the NEXT authored source unit, not at the last checkpoint.
  // At the end, keep the last authored screen instead of resetting to page 1.
  const next=ids[Math.min(lastIndex+1,ids.length-1)];
  return {resumeNextUnitId:next,checkpointUnitIds:lessons,
    lastVisitedUnitId:session.lastVisitedUnitId};
}
