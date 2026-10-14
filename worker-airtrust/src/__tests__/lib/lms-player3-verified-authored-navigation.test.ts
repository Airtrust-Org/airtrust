import {describe,expect,it} from 'vitest';
import {verifiedAuthoredNavigation} from '../../lib/lms-player3/verified-authored-navigation';

const sha=(s:string)=>s.repeat(64);
const units=[
  {id:'unit21',kind:'lesson'},
  {id:'unit22',kind:'lesson'},
  {id:'exam1',kind:'assessment'},
  {id:'unit23',kind:'lesson'},
] as const;
const session={
  editionHash:sha('a'),cicloId:333,mode:'LEARN',
  nextSequence:2,seenLessonIds:['unit21'],
  lastVisitedUnitId:'unit21',totalLessons:3,latestAttempt:null,
} as const;
async function digest(ids:string[]){
  const hash=await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(ids)));
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const input=async()=>({
  units:units as never,
  approvedOrderedUnitIdsSha256:await digest(units.map(x=>x.id)),
  session:session as never,
  cycleId:333,editionSha256:sha('a'),
});
describe('Worker-authoritative authored restart cursor',()=>{
  it('returns NEXT original unit and only source-backed lesson IDs',async()=>{
    expect(await verifiedAuthoredNavigation(await input())).toEqual({
      resumeNextUnitId:'unit22',checkpointUnitIds:['unit21','unit22','unit23'],
      lastVisitedUnitId:'unit21',
    });
  });
  it('allows unstarted to show first page, without fabricating a visit',async()=>{
    expect(await verifiedAuthoredNavigation({...await input(),session:{
      ...session,nextSequence:1,seenLessonIds:[],lastVisitedUnitId:null,
    } as never})).toMatchObject({resumeNextUnitId:'unit21',
      lastVisitedUnitId:null});
  });
  it('rejects changed order, duplicated IDs, stale cycle and false bookmarks',async()=>{
    const good=await input();
    for(const v of [
      {...good,units:[...units].reverse() as never},
      {...good,units:[units[0],units[0]] as never},
      {...good,cycleId:999},
      {...good,session:{...session,lastVisitedUnitId:'fake'} as never},
      {...good,session:{...session,seenLessonIds:[]} as never},
      {...good,approvedOrderedUnitIdsSha256:sha('9')},
    ]){
      await expect(verifiedAuthoredNavigation(v)).rejects.toThrow();
    }
  });
  it('stays at final page rather than resetting to first on final bookmark',async()=>{
    const good=await input();
    expect(await verifiedAuthoredNavigation({...good,session:{
      ...session,seenLessonIds:['unit21','unit22','unit23'],
      lastVisitedUnitId:'unit23',nextSequence:4,
    } as never})).toMatchObject({resumeNextUnitId:'unit23'});
  });
});
