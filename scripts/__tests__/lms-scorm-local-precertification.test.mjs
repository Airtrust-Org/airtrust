import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {strToU8,zipSync} from 'fflate';
import {summarizeLocalEvidence,LOCAL_CASES} from '../ci/lms-scorm-local-precertification.mjs';
const manifest=strToU8('<manifest identifier="SYNTHETIC-LOCAL"/>');
const zip=Buffer.from(zipSync({'imsmanifest.xml':manifest,'index.html':strToU8('<h1>QA</h1>')}));
const sha=createHash('sha256').update(zip).digest('hex');
const manifestSha256=createHash('sha256').update(manifest).digest('hex');
const candidate={empresaId:6,cursoId:55,runtimeSha:'a'.repeat(40),manifestSha256};
const run=browser=>({
  source:'LOCAL_DISPOSABLE_D1_R2_ONLY',browser,packageSha256:sha,
  empresaId:candidate.empresaId,cursoId:candidate.cursoId,
  runtimeSha:candidate.runtimeSha,manifestSha256,
  enrollmentIsolation:'SAME_TENANT_ONLY',certificateDocument:'INCONCLUSIVE',
  crossTenantAccess:'PASS',cycleIsolation:'INCONCLUSIVE',
  cases:LOCAL_CASES.map(name=>({name,status:'PASS'})),
});
test('local verdict stays UNCERTIFIED even after all proved steps pass',()=>{
 const report=summarizeLocalEvidence(zip,[run('CHROMIUM'),run('WEBKIT')],candidate);
 assert.equal(report.status,'UNCERTIFIED');
 assert.equal(report.activationAuthorized,false);
 assert.equal(report.packageSha256,sha);
 assert.deepEqual(report.candidate,candidate);
 assert.equal(report.passedChecks,14);
 assert.ok(report.missing.includes('AUDITED_CYCLE_ROTATION'));
 assert.ok(report.missing.includes('CERTIFICATE_DOCUMENT'));
});
test('cannot mislabel tenant/cycle or certificate proof',()=>{
 const a=run('CHROMIUM');a.cases[6].status='INCONCLUSIVE';
 assert.throws(()=>summarizeLocalEvidence(zip,[a,run('WEBKIT')],candidate),/NOT_PROVEN/);
 const b=run('WEBKIT');b.certificateDocument='PASS';
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),b],candidate),/SCOPE_INVALID/);
});
test('rejects wrong ZIP SHA and duplicate browser',()=>{
 const a=run('WEBKIT');a.packageSha256='0'.repeat(64);
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),a],candidate),/ZIP_PROVENANCE/);
 assert.throws(()=>summarizeLocalEvidence(zip,[run('WEBKIT'),run('WEBKIT')],candidate),/BROWSER_UNIQUE/);
});
test('rejects fabricated or missing browser assertions',()=>{
 const a=run('CHROMIUM');a.cases.pop();
 assert.throws(()=>summarizeLocalEvidence(zip,[a,run('WEBKIT')],candidate),/CASE_SET/);
 const b=run('WEBKIT');b.cases[0].status='INCONCLUSIVE';
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),b],candidate),/NOT_PROVEN/);
});

test('rejects missing backend tenant isolation proof',()=>{
 const a=run('CHROMIUM');delete a.crossTenantAccess;
 assert.throws(()=>summarizeLocalEvidence(zip,[a,run('WEBKIT')],candidate),/TENANT_PROBE_MISSING/);
});

test('rejects missing cycle isolation and old-cycle status laundering',()=>{
 const a=run('WEBKIT');a.cycleIsolation='PASS';
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),a],candidate),/CYCLE_SCOPE_OVERCLAIM/);
});

test('rejects browser evidence detached from the exact course tenant or runtime',()=>{
 const wrongTenant=run('CHROMIUM');wrongTenant.empresaId=7;
 assert.throws(()=>summarizeLocalEvidence(zip,[wrongTenant,run('WEBKIT')],candidate),/CANDIDATE_PROVENANCE_MISMATCH/);
 const wrongCourse=run('WEBKIT');wrongCourse.cursoId=56;
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),wrongCourse],candidate),/CANDIDATE_PROVENANCE_MISMATCH/);
 const wrongRuntime=run('CHROMIUM');wrongRuntime.runtimeSha='b'.repeat(40);
 assert.throws(()=>summarizeLocalEvidence(zip,[wrongRuntime,run('WEBKIT')],candidate),/CANDIDATE_PROVENANCE_MISMATCH/);
 const wrongManifest=run('WEBKIT');wrongManifest.manifestSha256='0'.repeat(64);
 assert.throws(()=>summarizeLocalEvidence(zip,[run('CHROMIUM'),wrongManifest],candidate),/CANDIDATE_PROVENANCE_MISMATCH/);
});
