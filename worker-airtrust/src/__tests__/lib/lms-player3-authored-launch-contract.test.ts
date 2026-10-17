import {describe,expect,it} from 'vitest';
import {approvedAuthoredLaunch} from '../../lib/lms-player3/authored-launch-contract';

const sha=(letter:string)=>letter.repeat(64);
const good={
  environment:'staging',tenant:6,course:57,editionSha256:sha('a'),
  sourceSha256:sha('b'),originBinding:'https://isolated.example',
  launchTenantAllowlist:'6',
  learnerContent:{
    schema:'AIRTRUST_PLAYER3_AUTHORED_LAUNCH_V1',
    sourceSha256:sha('b'),contentSha256:sha('c'),
    sourceStageCrosswalkSha256:sha('d'),
    orderedUnitIdsSha256:sha('e'),
    answersStripped:true,legacyScormDisabled:true,
    reviewedImmutableRelease:true,
  },
};
describe('Player3 authored launch policy (OFF by default)',()=>{
  it('constructs deterministic, edition-bound path without credentials',()=>{
    const out=approvedAuthoredLaunch(good);
    expect(out.contentOrigin).toBe('https://isolated.example');
    expect(out.contentUrl).toBe(
      'https://isolated.example/player3/6/57/'+sha('a')+'/'+sha('c')+'/index.html');
    expect(out.contentUrl).not.toContain('?');
  });
  it('rejects production and tenant mismatches before any launch',()=>{
    for(const override of [
      {environment:'production'}, {environment:'development'},
      {tenant:7}, {launchTenantAllowlist:undefined},
      {launchTenantAllowlist:'*'}, {originBinding:'http://isolated.example'},
      {originBinding:'https://isolated.example/evil'},
      {editionSha256:sha('X')},
    ]){
      expect(()=>approvedAuthoredLaunch({...good,...override})).toThrow();
    }
  });
  it('does not accept review-only, version drift, absent approvals, or extra keys',()=>{
    const v=good.learnerContent;
    for(const altered of [
      {...v,reviewedImmutableRelease:false},
      {...v,answersStripped:false},
      {...v,legacyScormDisabled:false},
      {...v,sourceSha256:sha('9')},
      {...v,contentSha256:'bad'},
      {...v,sourceStageCrosswalkSha256:null},
      {...v,orderedUnitIdsSha256:null},
      {...v,url:'https://attacker.example'},
      null,
    ]){
      expect(()=>approvedAuthoredLaunch({
        ...good,learnerContent:altered,
      })).toThrow('PLAYER3_AUTHORED_SOURCE_NOT_APPROVED');
    }
  });
});
