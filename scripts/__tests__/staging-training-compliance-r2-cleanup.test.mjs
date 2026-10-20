// source_reference: F1 governed synthetic QA cleanup (no external D1/R2 access).
// operational_decision: all storage is an isolated in-memory fake; no remote writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertRunIdentity, ownedPdfKey, buildOwnedPdfSql, cleanupOwnedPdfs,
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

test('workflow checks dedicated credential before seed and cleans D1 even on R2 failure',()=>{
  const w=readFileSync('.github/workflows/staging-training-compliance-lifecycle-qa.yml','utf8');
  const before=w.indexOf('Require dedicated staging QA R2 cleanup credentials');
  const seed=w.indexOf('Validate schemas and seed lifecycle fixture');
  const r2=w.indexOf('Delete only verified run-owned certificate PDF keys');
  const d1=w.indexOf('Soft-delete only this run');
  const verify=w.indexOf('Enforce R2 deletion verification');
  assert.ok(before>0 && before<seed);
  assert.ok(r2>seed && d1>r2 && verify>d1);
  assert.match(w,/id: r2_cleanup\s+continue-on-error: true/);
  assert.match(w,/name: Soft-delete only this run's synthetic D1 artifacts\s+if: always\(\)/);
  assert.match(w,/test "\$R2_CLEANUP_OUTCOME" = success/);
  assert.match(w,/group: airtrust-staging-mutations-and-scorm-qa/);
});
