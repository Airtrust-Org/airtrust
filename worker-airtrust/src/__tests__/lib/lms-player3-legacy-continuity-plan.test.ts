import {describe,expect,it} from 'vitest';
import {planLegacyResumeMigration} from '../../lib/lms-player3/legacy-continuity-plan';
import type {LegacyEnrollment,DestinationEdition} from '../../lib/lms-player3/continuity';
const legacy:LegacyEnrollment={
  empresa_id:6,matricula_id:911,curso_id:57,funcionario_id:221,
  matricula_status:'EM_ANDAMENTO',matricula_progresso_pct:80,
  matricula_updated_at:'2026-10-14T15:00:00',
  ciclo_id:14,ciclo_numero:1,ciclo_status:'EM_ANDAMENTO',
  ciclo_progresso_pct:80,ciclo_atual:1,ciclo_updated_at:'2026-10-14T15:00:00',
  curso_version_tag:'RC8',scorm_versao:'1.2',
  ultimo_slide:3,ultima_pagina:3,scorm_id:99,
  scorm_lesson_status:'incomplete',scorm_completion_status:null,
  scorm_success_status:null,scorm_score_raw:null,
  scorm_last_commit_at:'2026-10-14T15:00:00',
  scorm_suspend_data_sha256:'a'.repeat(64),
  scorm_cmi_json_sha256:'b'.repeat(64),
};
const original={
  expected_package_version:'package-RC8',
  ordered_source_unit_ids:['first','second','third','fourth'],
  persisted_suspend_data:JSON.stringify({v:3,p:'package-RC8',a:2,d:[0,1]}),
};
const target:DestinationEdition={
  empresa_id:6,curso_id:57,source_version_tag:'RC8',
  edition_sha256:'c'.repeat(64),
  target_unit_ids:['first','second','third','fourth'],
  certified_source_unit_ids:['first','second','third','fourth'],
  units_by_source_id:{first:'first',second:'second',third:'third',fourth:'fourth'},
};
describe('Player3 CMI to continuity composition',()=>{
  it('maps real visited indexes to resume position without awarding certification',()=>{
    const result=planLegacyResumeMigration(legacy,original,target);
    expect(result.requires_administrative_equivalence).toBe(false);
    expect(result.source_evidence).toMatchObject({
      classification:'VISITED_UNITS',visited_unit_ids:['first','second']});
    expect(result.plan).toMatchObject({
      disposition:'EXACT_RESTORE',source_progress_pct:80,
      target_resume_unit_id:'third',grants_completed:false,grants_certification:false});
  });
  it('routes bookmark-only to reviewed administrative equivalence',()=>{
    const result=planLegacyResumeMigration(legacy,{
      ...original,persisted_suspend_data:JSON.stringify({
        v:4,p:'package-RC8',a:2}),
    },target);
    expect(result.requires_administrative_equivalence).toBe(true);
    expect(result.source_evidence).toMatchObject({
      classification:'BOOKMARK_ONLY',active_unit_id:'third'});
    expect(result.plan).toMatchObject({
      disposition:'ADMIN_EQUIVALENCE_REVIEW',source_progress_pct:80,
      grants_completed:false});
  });
  it('never treats a forged SCORM passed status as an actual completion',()=>{
    const result=planLegacyResumeMigration({
      ...legacy,scorm_lesson_status:'passed',scorm_score_raw:100,
      matricula_progresso_pct:99,ciclo_progresso_pct:99},
      {...original,persisted_suspend_data:JSON.stringify({
        v:3,p:'package-RC8',a:3,d:[0,1,2,3],q:{passed:true}})},target);
    expect(result.plan).toMatchObject({
      source_progress_pct:99,target_resume_unit_id:null,grants_completed:false,
      grants_certification:false});
    expect(result.source_evidence.grants_assessment_pass).toBe(false);
  });
});
