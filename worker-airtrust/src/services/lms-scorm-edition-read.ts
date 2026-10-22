import { detectLmsEditionMismatch, type LmsEditionMismatch } from './lms-edition-mismatch';
import { readScormActiveResumeProposal } from './lms-scorm-active-resume-readonly';
import type { ScormActiveResumePlan } from './lms-scorm-active-resume-plan';
import { readActiveScormHandoff } from './lms-scorm-active-handoff-read';

export async function readLmsScormEditionState(params:{
  db:D1Database;bucket:R2Bucket|null|undefined;empresaId:number;matriculaId:number;
  matricula:Record<string,unknown>;progressoScorm:Record<string,unknown>|null;
  handoffEnabled:boolean;
}):Promise<{mismatch:LmsEditionMismatch|null;proposal:ScormActiveResumePlan|null;
  handoffId:number|null;handoffBookmark:{position:number;total:number}|null;handoffAvailable:boolean}>{
  const m=params.matricula,p=params.progressoScorm;
  const cursoId=Number(m.curso_id),contentType=String(m.tipo_conteudo??'scorm');
  const activePrefix=typeof m.scorm_package_r2_prefix==='string'?m.scorm_package_r2_prefix:null;
  const cmiJson=typeof p?.cmi_json==='string'?p.cmi_json:null;
  const mismatch=await detectLmsEditionMismatch({
    db:params.db,bucket:params.bucket,
    contentType:m.status==='CONCLUIDO'?null:contentType,
    activePrefix,empresaId:params.empresaId,cursoId,
    cmiJson,suspendData:typeof p?.suspend_data==='string'?p.suspend_data:null,
    enrollmentStartedAt:typeof m.data_inicio==='string'?m.data_inicio:null,
  });
  const cycleId=Number(m.active_lms_cycle_id)||null;
  const proposal=contentType==='scorm'&&mismatch
    ? await readScormActiveResumeProposal({
        db:params.db,bucket:params.bucket,empresaId:params.empresaId,cursoId,
        cycleId,activePrefix,
        cycleStartedAt:typeof m.active_lms_cycle_started_at==='string'
          ? m.active_lms_cycle_started_at:null,cmiJson,
      })
    : null;
  const handoff=await readActiveScormHandoff({db:params.db,enabled:params.handoffEnabled,
    empresaId:params.empresaId,matriculaId:params.matriculaId,cycleId,activePrefix});
  const handoffAvailable=params.handoffEnabled&&Boolean(mismatch&&proposal&&!handoff&&
    proposal.status!=='INVALID_ACTIVE_PACKAGE'&&proposal.activePackageSha256);
  return {mismatch,proposal,handoffId:handoff?.id??null,
    handoffBookmark:handoff?.bookmark??null,handoffAvailable};
}
