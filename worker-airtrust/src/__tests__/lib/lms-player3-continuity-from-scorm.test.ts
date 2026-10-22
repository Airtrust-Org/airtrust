import { describe, expect, it } from 'vitest';
import { proposeLegacyScormResume } from '../../lib/lms-player3/continuity-from-scorm';
import type {
  LegacyEnrollment, DestinationEdition,
} from '../../lib/lms-player3/continuity';

const courseIds = ['intro','module1','module2','module3'];
const sha = 'a'.repeat(64);
const enrollment: LegacyEnrollment = {
  empresa_id:6, matricula_id:911, curso_id:57, funcionario_id:33,
  matricula_status:'EM_ANDAMENTO',matricula_progresso_pct:80,
  matricula_updated_at:'2026-10-14 13:00:00',
  ciclo_id:554, ciclo_numero:1,ciclo_status:'EM_ANDAMENTO',
  ciclo_progresso_pct:80,ciclo_atual:1,ciclo_updated_at:'2026-10-14 13:00:00',
  curso_version_tag:'RC8',scorm_versao:'1.2',
  ultimo_slide:3,ultima_pagina:3,scorm_id:900,
  scorm_lesson_status:'incomplete',scorm_completion_status:null,
  scorm_success_status:null,scorm_score_raw:100,
  scorm_last_commit_at:'2026-10-14 12:59:00',
  scorm_suspend_data_sha256:sha,scorm_cmi_json_sha256:sha,
};
const destination: DestinationEdition = {
  empresa_id:6,curso_id:57,source_version_tag:'RC8',
  edition_sha256:'b'.repeat(64),
  certified_source_unit_ids:courseIds,
  target_unit_ids:courseIds,
  units_by_source_id:Object.fromEntries(courseIds.map(id=>[id,id])),
};
const sourceEdition = {
  empresa_id:6,curso_id:57,source_edition_sha256:sha,
  course_version_tag:'RC8',
  source_package_version:'V0.1.3-RC8.1',
  ordered_source_unit_ids:courseIds,
};
const suspend = JSON.stringify({
  v:3,p:sourceEdition.source_package_version,a:2,d:[0,1],
  c:true,score:100,moduleAssessments:{passed:true},
});
const run = (modifications: Record<string,unknown> = {}) =>
  proposeLegacyScormResume({
    enrollment,destination,sourceEdition,
    persistedSuspendData:suspend,...modifications,
  });

describe('Player3 recovery from persisted SCORM without false certifications',()=>{
  it('proposes a faithful bookmark and leaves official assessment untouched',()=>{
    const result=run();
    expect(result.proposed_resume_unit_id).toBe('module2');
    expect(result.evidence).toMatchObject({
      classification:'VISITED_UNITS',
      visited_unit_ids:['intro','module1'],
    });
    expect(result.continuity).toMatchObject({
      disposition:'ADMIN_EQUIVALENCE_REVIEW',source_progress_pct:80,
      grants_completed:false,grants_certification:false,
    });
    expect(result).toMatchObject({
      review_required:true,grants_completed:false,
      grants_exam_pass:false,grants_certificate:false,
    });
  });
  it('does not treat client-claimed 100 score/complete as real certification',()=>{
    expect(run().grants_exam_pass).toBe(false);
    expect(run().grants_completed).toBe(false);
  });
  it('does not inject unverified SCORM visits into server-verified credits',()=>{
    const input={...enrollment,verified_completed_source_units:courseIds};
    expect(run({enrollment:input}).continuity.disposition)
      .toBe('ADMIN_EQUIVALENCE_REVIEW');
  });
  it('review a compact bookmark-only package without fabricated visits',()=>{
    const result=run({persistedSuspendData:JSON.stringify({
      v:4,p:sourceEdition.source_package_version,a:3,
    })});
    expect(result.evidence.classification).toBe('BOOKMARK_ONLY');
    expect(result.evidence.visited_unit_ids).toEqual([]);
    expect(result.proposed_resume_unit_id).toBe('module3');
  });
  it('does not propose a unit for cross-tenant, unreviewed crosswalk or version mismatch',()=>{
    expect(()=>run({sourceEdition:{...sourceEdition,empresa_id:7}}))
      .toThrow('PLAYER3_SOURCE_EDITION_NOT_PINNED');
    expect(run({destination:{...destination,units_by_source_id:{intro:'intro'}}})
      .proposed_resume_unit_id).toBeNull();
    expect(run({persistedSuspendData:JSON.stringify({
      v:3,p:'old-release',a:2,d:[0],
    })}).proposed_resume_unit_id).toBeNull();
  });
  it('rejects a review-only, partial, or mismatched certified source crosswalk',()=>{
    // The A factory deliberately delivers source-unit review maps without
    // approval. Existing key mappings alone cannot make them authoritative.
    for(const certified of [
      [],['intro','module1'],['intro','module1','module2','outsider'],
      ['intro','module1','module2','module2'],
    ]){
      const proposal=run({destination:{
        ...destination,certified_source_unit_ids:certified,
      }});
      expect(proposal.proposed_resume_unit_id).toBeNull();
      expect(proposal.review_required).toBe(true);
      expect(proposal.grants_exam_pass).toBe(false);
      expect(proposal.grants_completed).toBe(false);
      expect(proposal.grants_certificate).toBe(false);
    }
    expect(run().proposed_resume_unit_id).toBe('module2');
  });
  it('does not emit advice from a conflicted current cycle or stale target',()=>{
    expect(run({enrollment:{...enrollment,ciclo_progresso_pct:23}})
      .proposed_resume_unit_id).toBeNull();
    expect(run({destination:{...destination,source_version_tag:'RC9'}})
      .proposed_resume_unit_id).toBeNull();
  });
  it('does not create a suggestion when the destination is unavailable',()=>{
    const result=run({destination:null});
    expect(result.continuity.reason).toBe('MISSING_TARGET_EDITION');
    expect(result.proposed_resume_unit_id).toBeNull();
  });
  it('CFIT 32/37 resumes at source unit 33 without converting navigation into evidence',()=>{
    const cfitUnits=Array.from({length:37},(_,index)=>
      'cfit-'+String(index+1).padStart(2,'0'));
    const result=proposeLegacyScormResume({
      enrollment:{...enrollment,matricula_id:932,matricula_progresso_pct:86,
        ciclo_progresso_pct:86,ultimo_slide:32,ultima_pagina:32},
      sourceEdition:{...sourceEdition,ordered_source_unit_ids:cfitUnits},
      destination:{...destination,target_unit_ids:cfitUnits,
        certified_source_unit_ids:cfitUnits,
        units_by_source_id:Object.fromEntries(cfitUnits.map(id=>[id,id]))},
      persistedSuspendData:JSON.stringify({v:3,p:sourceEdition.source_package_version,
        a:32,d:Array.from({length:32},(_,index)=>index)}),
    });
    expect(result.proposed_resume_unit_id).toBe('cfit-33');
    expect(result.evidence.visited_unit_ids).toHaveLength(32);
    expect(result.continuity.source_progress_pct).toBe(86);
    expect(result).toMatchObject({grants_exam_pass:false,grants_completed:false,
      grants_certificate:false,review_required:true});
  });
});
