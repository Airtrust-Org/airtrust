/**
 * Player 3 — enrollment continuity contract (pure, no DB writes).
 * Source of truth is the authenticated point-in-time D1 snapshot, NOT a browser
 * percentage. This planner never awards SCORM visits, exam passes or certificates.
 */
export type LegacyEnrollment = Readonly<{
  empresa_id: number; matricula_id: number; curso_id: number; funcionario_id: number;
  matricula_status: string; matricula_progresso_pct: number | null;
  matricula_updated_at: string | null;
  ciclo_id: number | null; ciclo_numero: number | null; ciclo_status: string | null;
  ciclo_progresso_pct: number | null; ciclo_atual: number | null;
  ciclo_updated_at: string | null;
  curso_version_tag: string | null; scorm_versao: string | null;
  ultimo_slide: number | null; ultima_pagina: number | null;
  scorm_id: number | null; scorm_lesson_status: string | null;
  scorm_completion_status: string | null; scorm_success_status: string | null;
  scorm_score_raw: number | null; scorm_last_commit_at: string | null;
  /** Serialized values are preserved ONLY in a separately secured private vault. */
  scorm_suspend_data_sha256: string | null;
  scorm_cmi_json_sha256: string | null;
  /** Server-signed metadata from a private, versioned extraction; optional. */
  verified_completed_source_units?: readonly string[];
}>;
export type DestinationEdition = Readonly<{
  empresa_id: number; curso_id: number; source_version_tag: string | null;
  edition_sha256: string;
  /** Stable IDs ONLY when backed by a reviewed equivalence crosswalk. */
  certified_source_unit_ids: readonly string[];
  target_unit_ids: readonly string[];
  units_by_source_id: Readonly<Record<string,string>>;
}>;
export type ContinuityPlan = Readonly<{
  empresa_id:number; matricula_id:number; funcionario_id:number;
  curso_id:number; ciclo_id:number|null; source_progress_pct:number;
  legacy_cycle_progress_pct:number|null; last_slide:number|null;
  target_edition_sha256:string|null; target_resume_unit_id:string|null;
  disposition:'EXACT_RESTORE'|'UNIT_CROSSWALK'|'ADMIN_EQUIVALENCE_REVIEW'|'NO_PROGRESS'|'SOURCE_CONFLICT';
  preserves_legacy_progress:true; grants_completed:false; grants_certification:false;
  reason:string; source_updated_at:string|null;
}>;
const digest=/^[a-f0-9]{64}$/;
const key=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function positive(v:unknown): v is number {
  return typeof v==='number' && Number.isSafeInteger(v) && v>0;
}
function percentage(v:unknown):v is number {
  return typeof v==='number' && Number.isFinite(v) && v>=0 && v<=100;
}
function nonnegative(v:unknown):v is number {
  return typeof v==='number' && Number.isSafeInteger(v) && v>=0;
}
export class ContinuityError extends Error {
  constructor(readonly code:string){super(code);this.name='ContinuityError';}
}
function reject(code:string):never {throw new ContinuityError(code);}
export function planContinuity(source:LegacyEnrollment,destination:DestinationEdition|null):ContinuityPlan {
  if (![source.empresa_id,source.matricula_id,source.curso_id,source.funcionario_id].every(positive) ||
      !['EM_ANDAMENTO','NAO_INICIADO'].includes(source.matricula_status) ||
      !percentage(source.matricula_progresso_pct) ||
      (source.ciclo_progresso_pct!==null && !percentage(source.ciclo_progresso_pct)) ||
      (source.ultimo_slide!==null && !nonnegative(source.ultimo_slide)) ||
      (source.ultima_pagina!==null && !nonnegative(source.ultima_pagina)) ||
      (source.scorm_id!==null && !positive(source.scorm_id)) ||
      (source.scorm_suspend_data_sha256!==null && !digest.test(source.scorm_suspend_data_sha256)) ||
      (source.scorm_cmi_json_sha256!==null && !digest.test(source.scorm_cmi_json_sha256)) ||
      (source.verified_completed_source_units!==undefined &&
        (!Array.isArray(source.verified_completed_source_units) ||
         source.verified_completed_source_units.some(id=>typeof id!=='string'||!key.test(id)) ||
         new Set(source.verified_completed_source_units).size!==source.verified_completed_source_units.length))) {
    reject('INVALID_SOURCE');
  }
  if (destination && (!positive(destination.empresa_id) || !positive(destination.curso_id) ||
      !digest.test(destination.edition_sha256) ||
      !Array.isArray(destination.certified_source_unit_ids) ||
      !Array.isArray(destination.target_unit_ids) ||
      new Set(destination.target_unit_ids).size!==destination.target_unit_ids.length ||
      destination.target_unit_ids.some(id=>!key.test(id)) ||
      Object.entries(destination.units_by_source_id).some(([from,to])=>!key.test(from)||!key.test(to)))) {
    reject('INVALID_DESTINATION');
  }
  if (destination && (source.empresa_id!==destination.empresa_id ||
      source.curso_id!==destination.curso_id)) reject('CROSS_TENANT_OR_COURSE');
  const base = {
    empresa_id:source.empresa_id, matricula_id:source.matricula_id,
    funcionario_id:source.funcionario_id, curso_id:source.curso_id,
    ciclo_id:source.ciclo_id, source_progress_pct:source.matricula_progresso_pct,
    legacy_cycle_progress_pct:source.ciclo_progresso_pct,
    last_slide:source.ultimo_slide, target_edition_sha256:destination?.edition_sha256??null,
    target_resume_unit_id:null as string|null,
    preserves_legacy_progress:true as const, grants_completed:false as const,
    grants_certification:false as const, source_updated_at:source.matricula_updated_at,
  };
  const result=(disposition:ContinuityPlan['disposition'],reason:string,resume:string|null=null):ContinuityPlan=>({
    ...base,target_resume_unit_id:resume,disposition,reason,
  });
  if (!positive(source.ciclo_id) || !positive(source.ciclo_numero) ||
      source.ciclo_atual!==1 || source.ciclo_status!==source.matricula_status ||
      (source.ciclo_progresso_pct!==null && source.ciclo_progresso_pct!==source.matricula_progresso_pct)) {
    return result('SOURCE_CONFLICT','CYCLE_STATUS_OR_PROGRESS_MISMATCH');
  }
  const hasLegacyState=source.scorm_id!==null ||
    source.ultimo_slide!==null && source.ultimo_slide>0 ||
    source.ultima_pagina!==null && source.ultima_pagina>0;
  if (source.matricula_progresso_pct===0 && !hasLegacyState &&
      (!source.verified_completed_source_units || source.verified_completed_source_units.length===0)) {
    return result('NO_PROGRESS','PRESERVE_UNSTARTED');
  }
  if (!destination) return result('ADMIN_EQUIVALENCE_REVIEW','MISSING_TARGET_EDITION');
  if (destination.source_version_tag!==source.curso_version_tag) {
    return result('ADMIN_EQUIVALENCE_REVIEW','SOURCE_VERSION_CHANGED');
  }
  const evidence=source.verified_completed_source_units;
  if (!evidence?.length) return result('ADMIN_EQUIVALENCE_REVIEW','PERCENTAGE_NOT_UNIT_EVIDENCE');
  const mapped=evidence.map(id=>destination.units_by_source_id[id]);
  if (mapped.some(id=>!id || !destination.target_unit_ids.includes(id))) {
    return result('ADMIN_EQUIVALENCE_REVIEW','UNMAPPED_SOURCE_UNIT');
  }
  // Only a reviewed complete, stable crosswalk can authorize resume position.
  if (destination.certified_source_unit_ids.some(id=>!destination.units_by_source_id[id])) {
    return result('ADMIN_EQUIVALENCE_REVIEW','INCOMPLETE_CROSSWALK');
  }
  if (!new Set(mapped).size || new Set(mapped).size!==mapped.length) {
    return result('ADMIN_EQUIVALENCE_REVIEW','NON_INJECTIVE_CROSSWALK');
  }
  const targetCompleted=new Set(mapped);
  const next=destination.target_unit_ids.find(id=>!targetCompleted.has(id)) ?? null;
  // Even if all units are mapped, do NOT auto-close; official assessment remains
  // a separate server-verified evidence gate.
  return result(destination.target_unit_ids.every(id=>Object.values(destination.units_by_source_id).includes(id))
    && evidence.every(id=>destination.units_by_source_id[id]===id)
    ? 'EXACT_RESTORE' : 'UNIT_CROSSWALK',
  next?'RESUME_AT_NEXT_VERIFIED_UNIT':'ALL_UNITS_VISITED_ASSESSMENT_PENDING',next);
}

/** Detect duplicates and fail closed instead of overwriting an enrollment. */
export function buildContinuityPlans(
  sources:readonly LegacyEnrollment[], editions:readonly DestinationEdition[],
): ContinuityPlan[] {
  if (!Array.isArray(sources) || !Array.isArray(editions) || sources.length>100000 ||
      editions.length>10000) reject('INVALID_BATCH');
  const seen=new Set<string>(), target=new Map<string,DestinationEdition>();
  for(const edition of editions) {
    const key=edition.empresa_id+':'+edition.curso_id;
    if (target.has(key)) reject('DUPLICATE_TARGET_EDITION');
    target.set(key,edition);
  }
  return sources.map(row=>{
    const id=row.empresa_id+':'+row.matricula_id;
    if (seen.has(id)) reject('DUPLICATE_ENROLLMENT');
    seen.add(id);
    return planContinuity(row,target.get(row.empresa_id+':'+row.curso_id)??null);
  });
}

/**
 * Compare successive READ-ONLY inventories. Counts only: callers must keep
 * per-student evidence encrypted. Any drift demands a new review before cutover.
 * Enrollments absent from the active query may have completed/cancelled; they
 * are NOT eligible for a blind restore.
 */
export type ContinuityDelta = Readonly<{
  previous_count:number; current_count:number; new_enrollments:number;
  advanced:number; unchanged:number; missing:number; changed_cycles:number;
  regressed:number; stale_snapshot_rows:number; cutover_requires_reconciliation:boolean;
}>;
export function compareContinuityInventories(
  previous:readonly LegacyEnrollment[], current:readonly LegacyEnrollment[],
):ContinuityDelta {
  const makeMap=(rows:readonly LegacyEnrollment[])=>{
    const mapped=new Map<string,LegacyEnrollment>();
    for(const row of rows){
      if(!positive(row.empresa_id)||!positive(row.matricula_id)) reject('INVALID_SNAPSHOT_ID');
      const k=row.empresa_id+':'+row.matricula_id;
      if(mapped.has(k))reject('DUPLICATE_SNAPSHOT_ID');
      mapped.set(k,row);
    }
    return mapped;
  };
  const old=makeMap(previous),next=makeMap(current);
  let fresh=0,advanced=0,unchanged=0,missing=0,changedCycles=0,regressed=0,stale=0;
  for(const [id,before] of old){
    const after=next.get(id);
    if(!after){missing++;continue;}
    if(after.curso_id!==before.curso_id||
      after.funcionario_id!==before.funcionario_id||
      after.ciclo_id!==before.ciclo_id||
      after.ciclo_numero!==before.ciclo_numero){changedCycles++;continue;}
    if(after.matricula_progresso_pct<before.matricula_progresso_pct){regressed++;continue;}
    if(before.matricula_updated_at && after.matricula_updated_at &&
      after.matricula_updated_at<before.matricula_updated_at){stale++;continue;}
    if(before.scorm_last_commit_at && after.scorm_last_commit_at &&
      after.scorm_last_commit_at<before.scorm_last_commit_at){stale++;continue;}
    if(after.matricula_progresso_pct>before.matricula_progresso_pct||
      after.matricula_updated_at!==before.matricula_updated_at||
      after.scorm_last_commit_at!==before.scorm_last_commit_at||
      after.scorm_cmi_json_sha256!==before.scorm_cmi_json_sha256||
      after.scorm_suspend_data_sha256!==before.scorm_suspend_data_sha256){advanced++;continue;}
    unchanged++;
  }
  for(const id of next.keys())if(!old.has(id))fresh++;
  return {
    previous_count:previous.length,current_count:current.length,
    new_enrollments:fresh,advanced,unchanged,missing,
    changed_cycles:changedCycles,regressed,stale_snapshot_rows:stale,
    cutover_requires_reconciliation:fresh+advanced+missing+changedCycles+regressed+stale>0,
  };
}
