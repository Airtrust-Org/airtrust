import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildScormAdministrativeCredit } from '../../services/lms-scorm-administrative-credit';
import { buildScormLaunchState } from '../../services/lms-scorm-launch-state';
import { evaluateManifestStudyCoverage, type ActiveCompletionManifest } from '../../services/lms-completion-manifest-evidence';

const manifest=(n:number):ActiveCompletionManifest=>({
  packageVersion:'SOP_V3_CURRENT',
  requiredSlideIds:Array.from({length:n},(_,i)=>'slide-'+String(i+1)),
  assessmentMode:'NONE',workerApprovalRequired:true,
});

describe('global administrative credit for a changed SCORM edition',()=>{
  it('recognizes 41 new-edition units, opens the 42nd of 49, keeps historical 84%',()=>{
    const credited=buildScormAdministrativeCredit({
      manifest:manifest(49),targetPosition:42,previousProgressPct:84,
      packageSha256:'a'.repeat(64),handoffId:123,
    });
    expect(credited).toMatchObject({creditedUnits:41,location:'42/49',progressPct:84});
    const restored=buildScormLaunchState(credited.cmiJson,credited.suspendData,false,false);
    const cmi=JSON.parse(restored.initialCmiJson) as Record<string,string>;
    const state=JSON.parse(cmi['cmi.suspend_data']) as {a:number;d:number[];c:boolean};
    expect(restored.hasResumeState).toBe(true);
    expect(cmi['cmi.core.lesson_location']).toBe('42/49');
    expect(state.a).toBe(41);
    expect(state.d).toEqual(Array.from({length:41},(_,i)=>i));
    expect(state.c).toBe(false);
    expect(cmi['cmi.core.lesson_status']).toBe('incomplete');
    expect(cmi['cmi.core.score.raw']).toBeUndefined();
    expect(evaluateManifestStudyCoverage({
      manifest:manifest(49),cmiJson:credited.cmiJson,
    })).toMatchObject({recorded:41,verified:false});
  });

  it('never credits the entire final, a score or an invalid package',()=>{
    const good=buildScormAdministrativeCredit({
      manifest:manifest(49),targetPosition:49,previousProgressPct:98,
      packageSha256:'a'.repeat(64),
    });
    expect(good.creditedUnits).toBe(48);
    expect(good.cmiJson).not.toContain('passed');
    for(const invalid of [
      {targetPosition:50},{targetPosition:1},{previousProgressPct:0},
      {previousProgressPct:100},{packageSha256:'forged'},
      {manifest:{...manifest(49),packageVersion:null}},
    ]){
      expect(()=>buildScormAdministrativeCredit({
        manifest:manifest(49),targetPosition:42,previousProgressPct:84,
        packageSha256:'a'.repeat(64),...invalid,
      })).toThrow('SCORM_ADMIN_CREDIT_INVALID');
    }
  });

  it('the actual Factory V3 course engine reopens at slide 42 with 41 waived units',()=>{
    const credited=buildScormAdministrativeCredit({
      manifest:manifest(49),targetPosition:42,previousProgressPct:84,
      packageSha256:'b'.repeat(64),
    });
    const cmi=JSON.parse(credited.cmiJson) as Record<string,string>;
    const engine=readFileSync(resolve(process.cwd(),
      '../scripts/learning-factory/cores/AIRTRUST_FORMATIVE_V3_CORE.app.js.txt'),'utf8');
    const prefix=engine.slice(engine.indexOf('const C='),engine.indexOf('function completionReady()'));
    const invoke=new Function('window','document','location','URLSearchParams',
      prefix+';restore();return {view,active,done:[...done],mode,invalidEditionState};') as (
        w:unknown,d:unknown,l:unknown,u:typeof URLSearchParams,
      )=>{view:number;active:number;done:number[];mode:string;invalidEditionState:boolean};
    const windowMock={
      COURSE_DATA:{packageVersion:'SOP_V3_CURRENT',assessmentMode:'NONE',
        slides:manifest(49).requiredSlideIds.map(id=>({id,kind:'lesson'}))},
      Scorm:{get:(name:string)=>cmi[name]??''},
      location:{search:'',pathname:'/course/index.html'},
    };
    const state=invoke(windowMock,{referrer:''},{search:'',pathname:'/course/index.html'},URLSearchParams);
    expect(state).toMatchObject({view:41,active:41,mode:'journey',invalidEditionState:false});
    expect(state.done).toEqual(Array.from({length:41},(_,i)=>i));
  });

});
