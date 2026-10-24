export type ActiveScormHandoffRead = Readonly<{
  id:number;
  bookmark:{position:number;total:number}|null;
}>;

export async function readActiveScormHandoff(params:{
  db:D1Database; enabled:boolean; empresaId:number; matriculaId:number;
  cycleId:number|null; activePrefix:string|null;
}):Promise<ActiveScormHandoffRead|null>{
  const {db,enabled,empresaId,matriculaId,cycleId,activePrefix}=params;
  if(!enabled||!cycleId||!activePrefix)return null;
  const receipt=await db.prepare(`
    SELECT h.id,h.resume_plan_json FROM lms_scorm_edition_handoffs h
    JOIN lms_scorm_package_versions p ON p.empresa_id=h.empresa_id
      AND p.curso_id=h.curso_id AND p.package_sha256=h.target_package_sha256
      AND p.r2_prefix=h.target_package_prefix AND p.status='ACTIVE'
    WHERE h.empresa_id=? AND h.matricula_id=? AND h.ciclo_id=?
      AND h.target_package_prefix=? ORDER BY h.id DESC LIMIT 1`)
    .bind(empresaId,matriculaId,cycleId,activePrefix)
    .first<{id:number;resume_plan_json:string}>();
  if(!receipt)return null;
  let bookmark:{position:number;total:number}|null=null;
  try{
    const plan=JSON.parse(receipt.resume_plan_json) as Record<string,unknown>;
    const position=Number(plan.targetPosition),total=Number(plan.activeTotal);
    if(plan.canMarkComplete===false&&plan.canTransferScore===false&&
      Number.isSafeInteger(position)&&Number.isSafeInteger(total)&&
      position>=1&&total>=position&&total<=1000)bookmark={position,total};
  }catch{bookmark=null;}
  return {id:receipt.id,bookmark};
}
