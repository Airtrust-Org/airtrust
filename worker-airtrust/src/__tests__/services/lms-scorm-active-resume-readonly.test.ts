import { describe, expect, it, vi } from 'vitest';
import { readScormActiveResumeProposal } from '../../services/lms-scorm-active-resume-readonly';

const root='lms/scorm/6/119/';
function bucketWith(slides: Record<string,string[]>) {
  return { get: vi.fn(async (key:string) => slides[key]
    ? {size:200,text:async()=>JSON.stringify({content:{requiredSlides:slides[key]}})}
    : null)} as unknown as R2Bucket;
}
function database(prefix:string|null, error=false, handoff:{r2_prefix:string;package_sha256:string}|null=null, handoffError=false) {
  return {prepare:vi.fn((sql:string)=>({bind:vi.fn(()=>({first:vi.fn(async()=>{
    if(sql.includes('FROM lms_scorm_edition_handoffs')) {
      if(handoffError)throw new Error('handoff history unavailable');
      return handoff;
    }
    if(error)throw new Error('history unavailable');
    if(sql.includes('FROM lms_scorm_package_audit_log'))return prefix
      ? {r2_prefix:prefix,package_sha256:'a'.repeat(64)} : null;
    if(sql.includes('FROM lms_scorm_package_versions'))return {package_sha256:'b'.repeat(64)};
    return null;
  })}))}))} as unknown as D1Database;
}
describe('read-only ACTIVE SCORM resume',()=>{
  it('maps CFIT 32/37 to a 41-unit active edition without D1 writes',async()=>{
    const old=Array.from({length:37},(_,i)=>'unit'+(i+1));
    const active=[...old.slice(0,20),'new1','new2',...old.slice(20),'new3','new4'];
    const bucket=bucketWith({[root+'old/airtrust-completion-manifest.json']:old,
      [root+'new/airtrust-completion-manifest.json']:active});
    const db=database(root+'old/');
    const result=await readScormActiveResumeProposal({
      db,bucket,empresaId:6,cursoId:119,activePrefix:root+'new/',
      cycleId:812,
      cycleStartedAt:'2026-09-01T10:00:00Z',
      handoffHistoryEnabled:true,
      cmiJson:JSON.stringify({'cmi.core.lesson_location':'32/37',
        'airtrust.viewed_slides':Array.from({length:32},(_,i)=>i+1)}),
    });
    expect(result).toMatchObject({status:'MATCHED_ANCHOR',targetSlideId:'unit32',
      targetPosition:34,cycleId:812,activePackageSha256:'b'.repeat(64),
      previousPackageSha256:'a'.repeat(64),canMarkComplete:false,canTransferScore:false});
    expect(result?.unmatchedNavigationUnitIds).toContain('new1');
    expect(result?.pendingReviewUnitIds).toContain('unit32');
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });

  it('suggests navigation only when historical package metadata is unavailable',async()=>{
    const active=Array.from({length:61},(_,i)=>'ethics'+(i+1));
    const result=await readScormActiveResumeProposal({
      db:database(null,true),
      bucket:bucketWith({[root+'new/airtrust-completion-manifest.json']:active}),
      empresaId:6,cursoId:119,activePrefix:root+'new/',
      cycleStartedAt:'2026-09-01',cmiJson:JSON.stringify({
        'cmi.core.lesson_location':'2/61'}),
    });
    expect(result).toMatchObject({status:'SUGGESTED_ANCHOR',targetPosition:2,
      canTransferScore:false,canMarkComplete:false});
    expect(result?.matchedNavigationUnitIds).toEqual([]);
  });

  it('uses the previous handoff target, not cycle-start package, after a second edition update',async()=>{
    const active=['unit1','unit2','unit3'];
    const bucket=bucketWith({
      [root+'prior/airtrust-completion-manifest.json']:['old1','old2','old3'],
      [root+'middle/airtrust-completion-manifest.json']:['unit1','unit2','unit3'],
      [root+'active/airtrust-completion-manifest.json']:active,
    });
    const db=database(root+'prior/',false,{r2_prefix:root+'middle/',package_sha256:'c'.repeat(64)});
    const result=await readScormActiveResumeProposal({
      db,bucket,empresaId:6,cursoId:119,activePrefix:root+'active/',
      cycleId:812,cycleStartedAt:'2026-09-01T10:00:00Z',handoffHistoryEnabled:true,
      cmiJson:JSON.stringify({'cmi.core.lesson_location':'2/3','airtrust.viewed_slides':[1,2]}),
    });
    expect(result).toMatchObject({status:'MATCHED_ANCHOR',targetSlideId:'unit2',
      previousPackageSha256:'c'.repeat(64),activePackageSha256:'b'.repeat(64)});
    expect(bucket.get).toHaveBeenCalledWith(root+'middle/airtrust-completion-manifest.json');
  });

  it('does not infer the cycle-start edition when enabled handoff provenance is unreadable',async()=>{
    const bucket=bucketWith({
      [root+'prior/airtrust-completion-manifest.json']:['unit1','unit2','unit3'],
      [root+'active/airtrust-completion-manifest.json']:['unit1','unit2','unit3'],
    });
    const result=await readScormActiveResumeProposal({
      db:database(root+'prior/',false,null,true),bucket,empresaId:6,cursoId:119,
      activePrefix:root+'active/',cycleId:812,cycleStartedAt:'2026-09-01',
      handoffHistoryEnabled:true,
      cmiJson:JSON.stringify({'cmi.core.lesson_location':'2/3','airtrust.viewed_slides':[1,2]}),
    });
    expect(result).toMatchObject({status:'SUGGESTED_ANCHOR',targetPosition:2,
      previousPackageSha256:null,canTransferScore:false,canMarkComplete:false});
    expect(bucket.get).not.toHaveBeenCalledWith(root+'prior/airtrust-completion-manifest.json');
  });

  it('rejects a foreign tenant prefix before any R2 read',async()=>{
    const bucket=bucketWith({});
    const result=await readScormActiveResumeProposal({
      db:database(null),bucket,empresaId:6,cursoId:119,
      activePrefix:'lms/scorm/7/119/_candidates/evil/',
      cycleStartedAt:null,cmiJson:null,
    });
    expect(result).toBeNull();
    expect(bucket.get).not.toHaveBeenCalled();
  });
});
