import type { ActiveCompletionManifest } from './lms-completion-manifest-evidence';

/**
 * Administrative recognition of prior edition units. This is not a claim that
 * the learner physically viewed them in the new edition. Certification and
 * assessment remain subject to normal LMS gates.
 */
export function buildScormAdministrativeCredit(input: {
  manifest: ActiveCompletionManifest;
  targetPosition: number;
  previousProgressPct: number;
  handoffId?: number | null;
  packageSha256: string;
}): {
  location: string; progressPct: number; creditedUnits: number;
  suspendData: string; cmiJson: string;
} {
  const {manifest,targetPosition,previousProgressPct,packageSha256,handoffId=null}=input;
  const total=manifest.requiredSlideIds.length;
  if (!manifest.packageVersion || typeof manifest.packageVersion !== 'string' ||
      total<2 || total>1000 || !Number.isSafeInteger(total) ||
      !Number.isSafeInteger(targetPosition) || targetPosition<2 || targetPosition>total ||
      !Number.isSafeInteger(previousProgressPct) ||
      previousProgressPct<1 || previousProgressPct>99 ||
      !/^[a-f0-9]{64}$/.test(packageSha256) ||
      (handoffId!==null && (!Number.isSafeInteger(handoffId) || handoffId<=0))) {
    throw new Error('SCORM_ADMIN_CREDIT_INVALID');
  }
  const creditedUnits=targetPosition-1;
  // The package V4 core requires contiguous completed-unit indices, matching
  // edition version and a valid cursor. No score, answers or pass are inserted.
  const suspendData=JSON.stringify({
    v:4,p:manifest.packageVersion,a:creditedUnits,
    d:Array.from({length:creditedUnits},(_,i)=>i),
    s:{},g:[],h:{},vs:{},c:false,
  });
  if(suspendData.length>3900)throw new Error('SCORM_ADMIN_CREDIT_TOO_LARGE');
  const location=String(targetPosition)+'/'+String(total);
  const cmiJson=JSON.stringify({
    'cmi.core.lesson_status':'incomplete',
    'cmi.core.lesson_location':location,
    'cmi.suspend_data':suspendData,
    'airtrust.total_slides':total,
    'airtrust.administrative_credit':{
      kind:'PREVIOUS_EDITION_UNITS_RECOGNIZED',
      credited_units:creditedUnits,previous_progress_pct:previousProgressPct,
      package_sha256:packageSha256,handoff_id:handoffId,
    },
  });
  return {location,progressPct:previousProgressPct,creditedUnits,suspendData,cmiJson};
}
