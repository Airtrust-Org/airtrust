#!/usr/bin/env node
// Purely local evidence; not a trusted per-ZIP activation certificate.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const LOCAL_CASES=['FIRST_ACCESS','SUSPEND_RESUME',
  'ASSESSMENT_INSUFFICIENT','ASSESSMENT_APPROVED','EXPLICIT_FINALIZATION',
  'REOPEN_COMPLETED','NO_STATUS_DOWNGRADE'];

export function summarizeLocalEvidence(zipBytes,runs){
  const sha=createHash('sha256').update(zipBytes).digest('hex');
  if(!Array.isArray(runs)||runs.length!==2)throw Error('BROWSER_COUNT_INVALID');
  for(const browser of ['CHROMIUM','WEBKIT']){
    const rows=runs.filter(r=>r?.browser===browser);
    if(rows.length!==1)throw Error('BROWSER_UNIQUE_REQUIRED:'+browser);
    const row=rows[0];
    if(row.source!=='LOCAL_DISPOSABLE_D1_R2_ONLY'||
       row.packageSha256!==sha)throw Error('ZIP_PROVENANCE_MISMATCH:'+browser);
    if(row.crossTenantAccess!=='PASS')throw Error('TENANT_PROBE_MISSING:'+browser);
    // No audited old-cycle rotation was exercised; never claim cycle isolation.
    if(row.cycleIsolation!=='INCONCLUSIVE')throw Error('CYCLE_SCOPE_OVERCLAIM:'+browser);
    if(row.enrollmentIsolation!=='SAME_TENANT_ONLY'||
       row.certificateDocument!=='INCONCLUSIVE')throw Error('SCOPE_INVALID:'+browser);
    const cases=row.cases;
    if(!Array.isArray(cases)||cases.length!==LOCAL_CASES.length||
       new Set(cases.map(c=>c?.name)).size!==LOCAL_CASES.length)throw Error('CASE_SET_INVALID:'+browser);
    for(const name of LOCAL_CASES){
      if(cases.find(c=>c?.name===name)?.status!=='PASS')
        throw Error('NOT_PROVEN:'+browser+':'+name);
    }

  }
  return {schemaVersion:1,source:'LOCAL_DISPOSABLE_ZIP_ONLY',
    packageSha256:sha,status:'UNCERTIFIED',activationAuthorized:false,
    checkedBrowsers:['CHROMIUM','WEBKIT'],passedChecks:14,
    missing:['REAL_STAGING_CANDIDATE','AUDITED_CYCLE_ROTATION',
      'CERTIFICATE_DOCUMENT','TRUSTED_HARNESS_PROVENANCE']};
}

function main(){
  const dir=join('worker-airtrust','.wrangler','scorm-browser-qa');
  const fixture=JSON.parse(readFileSync(join(dir,'fixture.json'),'utf8'));
  if(fixture.fixtureKind!=='LOCAL_DISPOSABLE_ZIP' ||
     !fixture.zipPath.endsWith('/worker-airtrust/.wrangler/scorm-browser-qa/candidate.zip'))
    throw Error('LOCAL_FIXTURE_INVALID');
  const zip=readFileSync(fixture.zipPath);
  const expected=createHash('sha256').update(zip).digest('hex');
  if(expected!==fixture.packageSha256)throw Error('ZIP_SHA_DRIFT');
  const runs=['chromium','webkit'].map(browser=>
    JSON.parse(readFileSync(join(dir,'evidence-'+browser+'.json'),'utf8')));
  const summary=summarizeLocalEvidence(zip,runs);
  const out=join('qa-state','lms-scorm-local-precertification.json');
  mkdirSync(dirname(out),{recursive:true});
  writeFileSync(out,JSON.stringify(summary,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:summary.status,sha:summary.packageSha256,
    missing:summary.missing,report:out}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
