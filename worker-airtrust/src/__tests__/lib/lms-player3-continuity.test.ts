import {describe,expect,it} from 'vitest';
import {
  planContinuity,buildContinuityPlans,compareContinuityInventories,ContinuityError,
  type LegacyEnrollment,type DestinationEdition,
} from '../../lib/lms-player3/continuity';
const SHA='a'.repeat(64);
const legacy:LegacyEnrollment={
  empresa_id:6,matricula_id:911,curso_id:57,funcionario_id:321,
  matricula_status:'EM_ANDAMENTO',matricula_progresso_pct:80,
  matricula_updated_at:'2026-10-14 13:00:00',
  ciclo_id:1002,ciclo_numero:1,ciclo_status:'EM_ANDAMENTO',
  ciclo_atual:1,ciclo_progresso_pct:80,ciclo_updated_at:'2026-10-14 13:00:00',
  curso_version_tag:'RC8',scorm_versao:'1.2',
  ultimo_slide:34,ultima_pagina:34,
  scorm_id:880,scorm_lesson_status:'incomplete',
  scorm_completion_status:null,scorm_success_status:null,
  scorm_score_raw:null,scorm_last_commit_at:'2026-10-14 12:59:00',
  scorm_suspend_data_sha256:SHA,scorm_cmi_json_sha256:SHA,
};
const dest:DestinationEdition={
  empresa_id:6,curso_id:57,source_version_tag:'RC8',edition_sha256:'b'.repeat(64),
  certified_source_unit_ids:['mod1','mod2','mod3'],
  target_unit_ids:['mod1','mod2','mod3'],
  units_by_source_id:{mod1:'mod1',mod2:'mod2',mod3:'mod3'},
};
describe('Player 3 individual enrollment continuity',()=>{
  it('preserves 80 percent without inventing completion or a slide visit',()=>{
    expect(planContinuity(legacy,dest)).toMatchObject({
      disposition:'ADMIN_EQUIVALENCE_REVIEW',source_progress_pct:80,
      grants_completed:false,grants_certification:false,
      target_resume_unit_id:null,
    });
  });
  it('resumes from the next server-verified mapped unit only',()=>{
    const plan=planContinuity({...legacy,verified_completed_source_units:['mod1','mod2']},dest);
    expect(plan).toMatchObject({
      disposition:'EXACT_RESTORE',target_resume_unit_id:'mod3',
      source_progress_pct:80,grants_completed:false,
    });
  });
  it('accepts a reviewed re-edition crosswalk without losing original percentage',()=>{
    const edited={...dest,target_unit_ids:['new1','new2','new3'],
      units_by_source_id:{mod1:'new1',mod2:'new2',mod3:'new3'}};
    expect(planContinuity({...legacy,verified_completed_source_units:['mod1','mod2']},edited))
      .toMatchObject({disposition:'UNIT_CROSSWALK',
        target_resume_unit_id:'new3',source_progress_pct:80});
  });
  it('never concludes the training even if the old snapshot claims 99 or 100',()=>{
    for(const pct of [99,100]){
      const plan=planContinuity({...legacy,matricula_progresso_pct:pct,
        ciclo_progresso_pct:pct,
        verified_completed_source_units:['mod1','mod2','mod3']},dest);
      expect(plan.grants_completed).toBe(false);
      expect(plan.target_resume_unit_id).toBeNull();
    }
  });
  it('sends divergent cycle status or percent to manual review',()=>{
    expect(planContinuity({...legacy,ciclo_progresso_pct:60},dest))
      .toMatchObject({disposition:'SOURCE_CONFLICT',reason:'CYCLE_STATUS_OR_PROGRESS_MISMATCH'});
    expect(planContinuity({...legacy,ciclo_atual:0},dest).disposition).toBe('SOURCE_CONFLICT');
  });
  it('does not map an unreviewed edition or unmapped unit',()=>{
    expect(planContinuity({...legacy,verified_completed_source_units:['mod1']},
      {...dest,source_version_tag:'RC9'}).disposition).toBe('ADMIN_EQUIVALENCE_REVIEW');
    expect(planContinuity({...legacy,verified_completed_source_units:['missing']},dest))
      .toMatchObject({disposition:'ADMIN_EQUIVALENCE_REVIEW',reason:'UNMAPPED_SOURCE_UNIT'});
  });
  it('does not map across tenants or courses',()=>{
    expect(()=>planContinuity(legacy,{...dest,empresa_id:9})).toThrow(ContinuityError);
    expect(()=>planContinuity(legacy,{...dest,curso_id:59})).toThrow(ContinuityError);
  });
  it('rejects duplicate source enrollments and ambiguous course destinations',()=>{
    expect(()=>buildContinuityPlans([legacy,legacy],[dest])).toThrow(ContinuityError);
    expect(()=>buildContinuityPlans([legacy],[dest,dest])).toThrow(ContinuityError);
  });
  it('preserves a genuinely unstarted record as unstarted',()=>{
    expect(planContinuity({...legacy,matricula_status:'NAO_INICIADO',
      matricula_progresso_pct:0,ciclo_status:'NAO_INICIADO',
      ciclo_progresso_pct:0,ultimo_slide:0,ultima_pagina:0,scorm_id:null},dest))
      .toMatchObject({disposition:'NO_PROGRESS',source_progress_pct:0});
  });
  it('detects students continuing lessons between T0 and cutover',()=>{
    const newer={...legacy,matricula_progresso_pct:85,ciclo_progresso_pct:85,
      matricula_updated_at:'2026-10-15 13:00:00',
      scorm_last_commit_at:'2026-10-15 12:59:00'};
    expect(compareContinuityInventories([legacy],[newer])).toMatchObject({
      advanced:1,regressed:0,missing:0,cutover_requires_reconciliation:true,
    });
  });
  it('does not mistake a completed/removed active enrollment for a restart',()=>{
    expect(compareContinuityInventories([legacy],[])).toMatchObject({
      missing:1,cutover_requires_reconciliation:true,
    });
    expect(compareContinuityInventories([],[legacy])).toMatchObject({
      new_enrollments:1,cutover_requires_reconciliation:true,
    });
  });
  it('blocks stale, wrong-cycle and regressed snapshots',()=>{
    expect(compareContinuityInventories([legacy],[{...legacy,ciclo_id:777}]).changed_cycles).toBe(1);
    expect(compareContinuityInventories([legacy],[{...legacy,
      matricula_progresso_pct:75,ciclo_progresso_pct:75}]).regressed).toBe(1);
    expect(compareContinuityInventories([legacy],[{...legacy,
      matricula_updated_at:'2026-10-13 13:00:00'}]).stale_snapshot_rows).toBe(1);
  });
  it('requires review for Front C grade/attempt/SCORM differences even at the same 99%',()=>{
    const old={...legacy,matricula_progresso_pct:99,ciclo_progresso_pct:99,
      matricula_score_final:80,matricula_tentativas:1,
      ciclo_score_final:80,ciclo_tentativas:1,
      tipo_conteudo:'scorm',
      catalog_current_scorm_sha256:'b'.repeat(64),
      scorm_score_raw:80,scorm_success_status:'unknown',
      ciclos_historicos_sha256:'c'.repeat(64),
    };
    for(const change of [
      {matricula_score_final:85},{matricula_tentativas:2},
      {ciclo_score_final:90},{ciclo_tentativas:2},
      {scorm_score_raw:95},{scorm_success_status:'passed'},
      {matricula_data_conclusao:'2026-10-15'},
      {ciclos_historicos_sha256:'d'.repeat(64)},
    ]){
      expect(compareContinuityInventories([old],[{...old,...change}]))
        .toMatchObject({unchanged:0,changed_evidence:1,
          cutover_requires_reconciliation:true});
    }
  });
  it('rejects changed catalog edition or effective format independently of progress',()=>{
    const old={...legacy,tipo_conteudo:'scorm',curso_version_tag:'RC8',
      catalog_current_scorm_sha256:'b'.repeat(64),
      catalog_current_scorm_version:'scorm-rc8'};
    for(const change of [
      {tipo_conteudo:'native'},
      {curso_version_tag:'RC9'},
      {catalog_current_scorm_sha256:'d'.repeat(64)},
      {catalog_current_scorm_version:'scorm-rc9'},
    ]){
      expect(compareContinuityInventories([old],[{...old,...change}]))
        .toMatchObject({unchanged:0,changed_editions:1,
          cutover_requires_reconciliation:true});
    }
  });
  it('classifies unchanged-percent status and stale cycle as non-eligible',()=>{
    expect(compareContinuityInventories([legacy],[{...legacy,
      matricula_status:'CONCLUIDO',ciclo_status:'CONCLUIDO'}]))
      .toMatchObject({unchanged:0,changed_statuses:1,
        cutover_requires_reconciliation:true});
    expect(compareContinuityInventories([legacy],[{...legacy,
      ciclo_updated_at:'2026-10-13 13:00:00'}]))
      .toMatchObject({unchanged:0,stale_snapshot_rows:1,
        cutover_requires_reconciliation:true});
    expect(compareContinuityInventories([legacy],[{...legacy,
      ciclo_status:'CONCLUIDO'}]))
      .toMatchObject({unchanged:0,changed_cycles:1,
        cutover_requires_reconciliation:true});
  });
  it('allows identical snapshots without triggering unnecessary migration',()=>{
    expect(compareContinuityInventories([legacy],[legacy])).toMatchObject({
      unchanged:1,advanced:0,cutover_requires_reconciliation:false,
    });
  });

  it('fails closed on invalid identifiers or malformed evidence',()=>{
    expect(()=>planContinuity({...legacy,matricula_id:0},dest)).toThrow(ContinuityError);
    expect(()=>planContinuity({...legacy,scorm_cmi_json_sha256:'bad'},dest)).toThrow(ContinuityError);
    expect(()=>planContinuity({...legacy,
      verified_completed_source_units:['mod1','mod1']},dest)).toThrow(ContinuityError);
  });
});
