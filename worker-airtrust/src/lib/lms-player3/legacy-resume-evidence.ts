/**
 * Player3: read-only extraction of resume evidence from LEGACY, persisted D1
 * SCORM suspend_data. Never accepts this structure from a browser request,
 * never produces an approved assessment or completed enrollment.
 *
 * Supported observed source families:
 * - course_data.js v2/v3/v4: d=[visited zero-based slide indices]
 * - compact v4: no d, only a=bookmark (administrative carry-forward)
 * - other proprietary formats: REVIEW_REQUIRED, not guessed.
 */
export type LegacyResumeEvidence=Readonly<{
  classification:'VISITED_UNITS'|'BOOKMARK_ONLY'|'REVIEW_REQUIRED';
  active_unit_id:string|null;
  visited_unit_ids:readonly string[];
  source_package_version:string;
  reason:string;
  grants_assessment_pass:false;
  grants_completion:false;
}>;
export type LegacyResumeSource=Readonly<{
  persisted_suspend_data:string|null;
  expected_package_version:string;
  /** Ordered original unit IDs, verified against the source package hash. */
  ordered_source_unit_ids:readonly string[];
  /** Required for historical A10 bitmaps which do not embed a package version. */
  source_archive_sha256?:string;
  verified_published_archive_sha256?:string;
}>;
const UNIT=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function response(source:LegacyResumeSource,
  classification:LegacyResumeEvidence['classification'],
  reason:string,active:string|null=null,visited:readonly string[]=[]):LegacyResumeEvidence{
  return {classification,active_unit_id:active,visited_unit_ids:visited,
    source_package_version:source.expected_package_version,reason,
    grants_assessment_pass:false,grants_completion:false};
}
export function extractPersistedScormResume(source:LegacyResumeSource):LegacyResumeEvidence{
  if(!source || typeof source.expected_package_version!=='string' ||
     !source.expected_package_version.trim() ||
     !Array.isArray(source.ordered_source_unit_ids) ||
     source.ordered_source_unit_ids.length===0 ||
     source.ordered_source_unit_ids.length>500 ||
     source.ordered_source_unit_ids.some(id=>typeof id!=='string'||!UNIT.test(id)) ||
     new Set(source.ordered_source_unit_ids).size!==source.ordered_source_unit_ids.length){
    throw new Error('PLAYER3_INVALID_SOURCE_MANIFEST');
  }
  const raw=source.persisted_suspend_data;
  if(typeof raw!=='string'||!raw.trim())return response(source,'REVIEW_REQUIRED','NO_SUSPEND_DATA');
  if(raw.length>64000)return response(source,'REVIEW_REQUIRED','SUSPEND_DATA_OVERSIZE');
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{return response(source,'REVIEW_REQUIRED','INVALID_SUSPEND_JSON');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    return response(source,'REVIEW_REQUIRED','UNKNOWN_SUSPEND_FORMAT');
  const data=parsed as Record<string,unknown>;
  const units=source.ordered_source_unit_ids;
  if(data.s==='A10'){
    const digest=/^[a-f0-9]{64}$/;
    if(!source.source_archive_sha256 || !source.verified_published_archive_sha256 ||
       !digest.test(source.source_archive_sha256) ||
       source.source_archive_sha256!==source.verified_published_archive_sha256){
      return response(source,'REVIEW_REQUIRED','UNVERIFIED_A10_EDITION');
    }
    if(!Number.isInteger(data.c)||Number(data.c)<0||Number(data.c)>=units.length ||
       typeof data.v!=='string'||data.v.length>Math.ceil(units.length/6)){
      return response(source,'REVIEW_REQUIRED','INVALID_A10_BOOKMARK_OR_BITMAP');
    }
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const seen:string[]=[];
    for(let k=0;k<data.v.length;k++){
      const mask=alphabet.indexOf(data.v[k]);
      if(mask<0)return response(source,'REVIEW_REQUIRED','INVALID_A10_BITMAP');
      for(let j=0;j<6;j++)if(mask&(1<<j)){
        const index=k*6+j;
        if(index>=units.length)return response(source,'REVIEW_REQUIRED','INVALID_A10_BITMAP');
        seen.push(units[index]);
      }
    }
    return response(source,'VISITED_UNITS','A10_VERIFIED_SOURCE_EDITION',
      units[Number(data.c)],seen);
  }
  if(![2,3,4].includes(data.v as number))
    return response(source,'REVIEW_REQUIRED','UNKNOWN_SUSPEND_FORMAT');
  if(data.p!==source.expected_package_version)
    return response(source,'REVIEW_REQUIRED','SOURCE_VERSION_MISMATCH');
  const bookmark=typeof data.a==='string'
    ? units.indexOf(data.a) : data.a;
  if(!Number.isInteger(bookmark)||Number(bookmark)<0||Number(bookmark)>=units.length)
    return response(source,'REVIEW_REQUIRED','INVALID_BOOKMARK');
  const active=units[Number(bookmark)];
  // Residuos model V4 records completed slide IDs under c[], not d[].
  // d{} in that model is a collection of scenario decisions and is never a
  // visited slide set. It cannot be interpreted as progress.
  if(data.v===4 && Array.isArray(data.c) &&
     data.d && typeof data.d==='object' && !Array.isArray(data.d)){
    if(data.c.length>units.length || data.c.some(id=>typeof id!=='string'||
       !units.includes(id)) || new Set(data.c).size!==data.c.length){
      return response(source,'REVIEW_REQUIRED','INVALID_V4_COMPLETED_SLIDES',active);
    }
    return response(source,'VISITED_UNITS','V4_COMPLETED_SLIDE_IDS',
      active,data.c as string[]);
  }
  // Compact V4 and historical variants intentionally omit visited sets.
  // Do NOT infer prior visits from position or a reported CMI percent.
  if(!Object.prototype.hasOwnProperty.call(data,'d'))
    return response(source,'BOOKMARK_ONLY','NO_VISITED_SET',active);
  if(!Array.isArray(data.d)||data.d.length>units.length)
    return response(source,'REVIEW_REQUIRED','INVALID_VISITED_SET',active);
  const visited:string[]=[];
  for(const entry of data.d){
    const i=typeof entry==='string'?units.indexOf(entry):entry;
    if(!Number.isInteger(i)||Number(i)<0||Number(i)>=units.length)
      return response(source,'REVIEW_REQUIRED','INVALID_VISITED_SET',active);
    visited.push(units[Number(i)]);
  }
  if(new Set(visited).size!==visited.length)
    return response(source,'REVIEW_REQUIRED','DUPLICATE_VISITED_UNIT',active);
  // A learner's reported passed/completed state and module quiz answers are
  // *not* a proof of certification, even if embedded in suspend_data.
  return response(source,'VISITED_UNITS','SAVED_VISIT_SET',active,visited);
}
