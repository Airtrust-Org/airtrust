// source_reference: F1 governed synthetic QA cleanup (no external D1/R2 access).
// operational_decision: all storage is an isolated in-memory fake; no remote writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertRunIdentity, ownedPdfKey, buildOwnedPdfSql, cleanupOwnedPdfs,
  createCloudflareR2Storage, proveCloudflareR2CleanupCapability, validateR2CleanupPlan,
  QA_TENANT, QA_BUCKET,
} from '../staging/cleanup-qa-training-compliance-r2.mjs';

const code='QA-COMP-LIFE-39349812345';
const marker='QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_39349812345';
const pdf=id=>({
  documento_id: 100+id,
  empresa_id:999014,funcionario_id:200+id,historico_id:300+id,
  employee_code:code+'-E1',tenant_code:QA_TENANT,course_marker:marker,
  expected_marker:marker,
  r2_key:`certificados/empresa-999014/funcionario-${200+id}/historico-${300+id}/1e43ca78-5c79-4f13-9327-a16d7eef000${id}.pdf`,
});
const bucket=initial=>{
  const keys=new Set(initial);
  const calls=[];
  return {
    keys,calls,
    exists:async key=>{calls.push(['head',key]);return keys.has(key);},
    delete:async key=>{calls.push(['delete',key]); keys.delete(key);},
  };
};

test('rejects mismatched run ID, tenant, employee, marker and key before deleting anything',async()=>{
  assert.throws(()=>assertRunIdentity(code,marker+'1'),/QA_RUN_ID_MISMATCH|INVALID/);
  const variants=[
    {...pdf(1),tenant_code:'real_company'},
    {...pdf(1),empresa_id:999015},
    {...pdf(1),employee_code:'real_employee'},
    {...pdf(1),course_marker:'real_course'},
    {...pdf(1),r2_key:'certificados/empresa-999014/funcionario-201/historico-301/forged.pdf'},
  ];
  for (const x of variants) {
    const r=bucket([pdf(1).r2_key]);
    await assert.rejects(cleanupOwnedPdfs([pdf(1),x],code,marker,r,true));
    assert.equal(r.calls.length,0,'must validate all rows before R2 write');
    assert.ok(r.keys.has(pdf(1).r2_key));
  }
  assert.equal(QA_BUCKET,'airtrust-storage-staging');
});

test('dry-run reports only, never probes or deletes objects',async()=>{
  const r=bucket([pdf(1).r2_key]);
  assert.deepEqual(await cleanupOwnedPdfs([pdf(1)],code,marker,r,false),
    {checked:1,deleted:0,dryRun:true});
  assert.deepEqual(r.calls,[]);
});

test('deletes exact owned PDFs and verifies readback without listing prefix',async()=>{
  const foreign='certificados/empresa-999015/funcionario-21/historico-99/foreign.pdf';
  const r=bucket([pdf(1).r2_key,pdf(2).r2_key,foreign]);
  assert.deepEqual(await cleanupOwnedPdfs([pdf(1),pdf(2)],code,marker,r,true),
    {checked:2,deleted:2,dryRun:false});
  assert.deepEqual(await cleanupOwnedPdfs([pdf(1),pdf(2)],code,marker,r,true),
    {checked:2,deleted:0,dryRun:false});
  assert.deepEqual([...r.keys],[foreign]);
  assert.equal(r.calls.filter(([operation])=>operation==='delete').length,2);
});

test('fails intermediate R2 delete and safely resumes without touching other objects',async()=>{
  const r=bucket([pdf(1).r2_key,pdf(2).r2_key,'foreign']);
  const realDelete=r.delete;
  let first=true;
  r.delete=async key=>{
    if (key===pdf(2).r2_key && first) {first=false;throw Error('STORAGE_UNAVAILABLE');}
    return realDelete(key);
  };
  await assert.rejects(cleanupOwnedPdfs([pdf(1),pdf(2)],code,marker,r,true),
    /STORAGE_UNAVAILABLE/);
  assert.equal(r.keys.has(pdf(1).r2_key),false);
  assert.equal(r.keys.has(pdf(2).r2_key),true);
  await cleanupOwnedPdfs([pdf(1),pdf(2)],code,marker,r,true);
  assert.deepEqual([...r.keys],['foreign']);
});

test('readback residual aborts and duplicate/mass-deletion candidates fail closed',async()=>{
  const r=bucket([pdf(1).r2_key]);
  r.delete=async()=>{};
  await assert.rejects(cleanupOwnedPdfs([pdf(1)],code,marker,r,true),
    /QA_R2_DELETE_READBACK_FAILED/);
  await assert.rejects(cleanupOwnedPdfs([pdf(1),pdf(1)],code,marker,r,true),
    /QA_PDF_DUPLICATE_KEY/);
  await assert.rejects(cleanupOwnedPdfs(Array(17).fill(pdf(1)),code,marker,r,true),
    /QA_PDF_COUNT_REJECTED/);
});

test('D1 source query and cleanup contract preserve immutable archive while retiring owned objects',()=>{
  const q=buildOwnedPdfSql(code,marker);
  for (const token of [
    "e.codigo='qa_examiner_training'", "c.observacoes='"+marker+"'",
    'h.certificado_arquivo_id=d.id','h.lms_matricula_id','h.qualificacao_id=c.qualificacao_tipo_id',
    "d.tipo='application/pdf'",'LIMIT 17'
  ]) assert.ok(q.includes(token),token);
  const fixture=readFileSync('scripts/staging/seed-qa-training-compliance-lifecycle.mjs','utf8');
  assert.match(fixture,/UPDATE pasta_virtual\s+SET deleted_at=/);
  assert.match(fixture,/UPDATE documentos\s+SET deleted_at=/);
  assert.match(fixture,/UPDATE lms_matricula_ciclos\s+SET ciclo_atual=0,deleted_at=/);
  assert.match(fixture,/DELETE FROM lms_xapi_statements\s+WHERE archived_cycle_id IS NULL/);
  assert.doesNotMatch(fixture,/DELETE FROM lms_ciclo_evidencias/);
  assert.doesNotMatch(fixture,/UPDATE lms_ciclo_evidencias/);
});

test('workflow proves existing staging Worker token before seed and cleans D1 even on R2 failure',()=>{
  const w=readFileSync('.github/workflows/staging-training-compliance-lifecycle-qa.yml','utf8');
  const before=w.indexOf('Prove R2 object cleanup with existing staging Worker API token before seed');
  const seed=w.indexOf('Validate schemas and seed lifecycle fixture');
  const plan=w.indexOf('Prepare exact run-owned R2 cleanup plan with read-only D1');
  const r2=w.indexOf('Delete only verified run-owned certificate PDF keys');
  const d1=w.indexOf('Soft-delete only this run');
  const verify=w.indexOf('Enforce R2 deletion verification');
  assert.ok(before>0 && before<seed);
  assert.ok(w.includes('secrets.CLOUDFLARE_WORKER_API_TOKEN'));
  assert.ok(w.includes('--preflight --code="$QA_LIFECYCLE_CODE" --marker="$QA_LIFECYCLE_MARKER"'));
  assert.ok(!w.includes('secrets.QA_LIFECYCLE_R2_ACCESS_KEY_ID'));
  assert.ok(!w.includes('secrets.QA_LIFECYCLE_R2_SECRET_ACCESS_KEY'));
  assert.ok(r2>seed && plan>seed && r2>plan && d1>r2 && verify>d1);
  const planStep=w.slice(plan,r2), deleteStep=w.slice(r2,d1);
  assert.ok(planStep.includes('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN'));
  assert.ok(!planStep.includes('secrets.CLOUDFLARE_WORKER_API_TOKEN'));
  assert.ok(deleteStep.includes('secrets.CLOUDFLARE_WORKER_API_TOKEN'));
  assert.ok(!deleteStep.includes('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN'));
  assert.ok(deleteStep.includes('--apply --code="$QA_LIFECYCLE_CODE"'));
  assert.match(w,/id: r2_cleanup\s+continue-on-error: true/);
  assert.match(w,/name: Soft-delete only this run's synthetic D1 artifacts\s+if: always\(\)/);
  assert.match(w,/test "\$R2_CLEANUP_OUTCOME" = success/);
  assert.match(w,/group: airtrust-staging-mutations-and-scorm-qa/);
});

const accountId = 'a'.repeat(32);
const token = 'existing-staging-worker-token';
function fakeRest({denyWrites=false, keepAfterDelete=false}={}) {
  const keys = new Set();
  const calls = [];
  const fetchImpl = async (url,opts) => {
    const key = url.split('/objects/')[1];
    calls.push({method:opts.method,key,range:opts.headers.Range});
    assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+accountId+'/r2/buckets/airtrust-storage-staging/objects/'));
    assert.equal(opts.headers.Authorization,'Bearer '+token);
    let status;
    if (opts.method === 'GET') status = keys.has(key) ? 206 : 404;
    else if (denyWrites) status = 403;
    else if (opts.method === 'PUT') { keys.add(key);status=200; }
    else if (opts.method === 'DELETE') { if (!keepAfterDelete) keys.delete(key);status=200; }
    else throw Error('UNEXPECTED_METHOD');
    return {status,ok:status>=200&&status<300,
      headers:{get:()=>null},body:{cancel:async()=>{}},
      json:async()=>({success:true})};
  };
  return {keys,calls,fetchImpl};
}

test('existing Worker token R2 adapter supports exact-object read, delete, and 404 readback',async()=>{
  const r=fakeRest();
  const key=pdf(1).r2_key;
  r.keys.add(key);
  const client=createCloudflareR2Storage({accountId,token,fetchImpl:r.fetchImpl});
  assert.deepEqual(await cleanupOwnedPdfs([pdf(1)],code,marker,client,true),
    {checked:1,deleted:1,dryRun:false});
  assert.deepEqual(r.calls.map(x=>x.method),['GET','DELETE','GET']);
  assert.equal(r.calls[0].range,'bytes=0-0');
  assert.equal(r.keys.size,0);
  await assert.rejects(()=>client.delete('certificados/empresa-1/../../elsewhere'),
    /QA_R2_OBJECT_KEY_DENIED/);
  assert.throws(()=>createCloudflareR2Storage({accountId,token:''}),/TOKEN_REQUIRED/);
});

test('run-isolated capability preflight writes only its own canary, deletes it, and verifies absence',async()=>{
  const r=fakeRest();
  const z=await proveCloudflareR2CleanupCapability({accountId,token,runId:'39349812345',
    fetchImpl:r.fetchImpl});
  assert.equal(z.result,'PASS');
  assert.equal(z.capability,'R2_REST_READ_WRITE_DELETE');
  assert.deepEqual(r.calls.map(x=>x.method),['PUT','GET','DELETE','GET']);
  assert.ok(r.calls.every(x=>x.key==='__airtrust_qa_preflight__/compliance/39349812345/capability.txt'));
  assert.equal(r.keys.size,0);
});

test('preflight is fail-closed if existing token cannot write to R2',async()=>{
  const r=fakeRest({denyWrites:true});
  await assert.rejects(()=>proveCloudflareR2CleanupCapability({accountId,token,runId:'39349812345',
    fetchImpl:r.fetchImpl}),/QA_R2_REST_WRITE_DENIED/);
  assert.deepEqual(r.calls.map(x=>x.method),['PUT']);
  assert.equal(r.keys.size,0);
});

test('preflight never accepts R2 delete without absence on readback',async()=>{
  const r=fakeRest({keepAfterDelete:true});
  await assert.rejects(()=>proveCloudflareR2CleanupCapability({accountId,token,runId:'39349812345',
    fetchImpl:r.fetchImpl}),/QA_R2_PREFLIGHT_CANARY_REMAINS/);
  assert.equal(r.keys.size,1);
  assert.equal(r.calls.filter(x=>x.method==='DELETE').length,2);
});

test('D1 plan is bound to exact run marker and ownership before R2-scoped cleanup',()=>{
  const plan={code,marker,rows:[pdf(1),pdf(2)]};
  assert.deepEqual(validateR2CleanupPlan(plan,code,marker),plan.rows);
  assert.throws(()=>validateR2CleanupPlan({...plan,code:code+'1'},code,marker),/QA_R2_RUN_PLAN_INVALID/);
  assert.throws(()=>validateR2CleanupPlan({...plan,marker:marker+'1'},code,marker),/QA_R2_RUN_PLAN_INVALID/);
  assert.throws(()=>validateR2CleanupPlan({...plan,rows:[pdf(1),pdf(1)]},code,marker),/QA_PDF_DUPLICATE_KEY/);
  assert.throws(()=>validateR2CleanupPlan({...plan,rows:[pdf(1),{...pdf(2),tenant_code:'other'}]},code,marker),/QA_PDF_OWNER_MISMATCH/);
});
