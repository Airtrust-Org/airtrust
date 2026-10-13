import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {summarizeLocalEvidence,LOCAL_CASES} from '../ci/lms-scorm-local-precertification.mjs';
const zip=Buffer.from('synthetic ZIP SHA input');
const sha=createHash('sha256').update(zip).digest('hex');
const run=browser=>({
  source:'LOCAL_DISPOSABLE_D1_R2_ONLY',browser,packageSha256:sha,
  enrollmentIsolation:'SAME_TENANT_ONLY',certificateDocument:'INCONCLUSIVE',
  crossTenantAccess:'PASS',
  cases:[...LOCAL_CASES.map(name=>({name,status:'PASS'})),
    {name:'TENANT_CYCLE_ISOLATION',status:'INCONCLUSIVE'}],
});
test('local verdict stays UNCERTIFIED even after all proved steps pass',()=>{
 const report=summarizeLocalEvidence(zip,[run('CHROMIUM'),run('WEBKIT')]);
 assert.equal(report.status,'UNCERTIFIED');
 assert.equal(report.activationAuthorized,false);
 assert.equal(report.packageSha256,sha);
 assert.equal(report.passedChecks,14);
 assert.ok(report.missing.includes('CERTIFICATE_DOCUMENT'));
});
test('cannot mislabel tenant/cycle or certificate proof',()=>{
 const a=run('CHROMIUM');a.cases[7].status='PASS';
 assert.throws(()=>summarizeLocalEvidence(zip,[a,run('WEBKIT')]),/CROSS_TENANT/);
 const b=run('WEBKIT');b.certificateDocument='PASS';
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),b]),/SCOPE_INVALID/);
});
test('rejects wrong ZIP SHA and duplicate browser',()=>{
 const a=run('WEBKIT');a.packageSha256='0'.repeat(64);
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),a]),/ZIP_PROVENANCE/);
 assert.throws(()=>summarizeLocalEvidence(zip,[run('WEBKIT'),run('WEBKIT')]),/BROWSER_UNIQUE/);
});
test('rejects fabricated or missing browser assertions',()=>{
 const a=run('CHROMIUM');a.cases.pop();
 assert.throws(()=>summarizeLocalEvidence(zip,[a,run('WEBKIT')]),/CASE_SET/);
 const b=run('WEBKIT');b.cases[0].status='INCONCLUSIVE';
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),b]),/NOT_PROVEN/);
});

test('rejects missing backend tenant isolation proof',()=>{
 const a=run('CHROMIUM');delete a.crossTenantAccess;
 assert.throws(()=>summarizeLocalEvidence(zip,[a,run('WEBKIT')]),/TENANT_PROBE_MISSING/);
});
