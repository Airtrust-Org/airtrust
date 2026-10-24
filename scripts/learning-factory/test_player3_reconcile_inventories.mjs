import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sealInventory} from './player3-seal-active-inventory.mjs';
import {
  openInventory,reconcileRows,reconcileInventories,sealReconciliation,
} from './player3-reconcile-encrypted-inventories.mjs';

const KEY=randomBytes(32), EDITION='RC8';
const make=(id,pct,extra={})=>({
  inventory_total_expected:1,extraction_utc:'2026-10-14 13:00:00',
  empresa_id:6,matricula_id:id,curso_id:52,funcionario_id:id+3000,
  matricula_status:'EM_ANDAMENTO',matricula_progresso_pct:pct,
  matricula_updated_at:'2026-10-14 13:00:00',
  ciclo_id:id+6000,ciclo_numero:1,ciclo_status:'EM_ANDAMENTO',
  ciclo_atual:1,ciclo_progresso_pct:pct,
  ciclo_updated_at:'2026-10-14 13:00:00',
  curso_version_tag:EDITION,scorm_versao:'1.2',
  tipo_conteudo:'scorm',catalog_current_scorm_sha256:'test-sha-active',
  catalog_current_scorm_version:'RC8.1',
  ultimo_slide:9,ultima_pagina:9,
  scorm_last_commit_at:'2026-10-14 12:59:00',
  scorm_suspend_data_PRIVATE:'{"a":"module_2"}',
  scorm_cmi_json_PRIVATE:'{"location":"module_2"}',
  xapi_statement_count:0,xapi_last_event_at:null,
  ...extra,
});
const encrypt=(rows,keyId='player3-cutover-2026')=>{
  const sized=rows.map(row=>({...row,inventory_total_expected:rows.length}));
  return sealInventory(sized,KEY,keyId).sealed;
};
const open=(rows,keyId)=>openInventory(encrypt(rows,keyId),KEY);

test('opens only the authorized original AES-GCM inventory and keeps full source evidence private',()=>{
  const row=make(991911,80);
  const sealed=encrypt([row]);
  assert.ok(!sealed.includes('"matricula_id":991911'));
  assert.ok(!sealed.includes('module_2'));
  const opened=openInventory(sealed,KEY);
  assert.equal(opened.rows[0].matricula_progresso_pct,80);
  assert.equal(opened.rows[0].scorm_suspend_data_PRIVATE,row.scorm_suspend_data_PRIVATE);
  assert.match(opened.artifact_sha256,/^[a-f0-9]{64}$/);
  assert.throws(()=>openInventory(sealed,randomBytes(32)),/PLAYER3_RECONCILE_DECRYPT_OR_AUTH_FAILED/);
});
test('rejects tampering, cross-tenant rows, truncated and duplicate inventories',()=>{
  const sealed=JSON.parse(encrypt([make(911,80)]));
  sealed.sha256_ciphertext='a'.repeat(64);
  assert.throws(()=>openInventory(JSON.stringify(sealed),KEY),/CIPHERTEXT_INVALID/);
  assert.throws(()=>encrypt([make(913,20,{empresa_id:7})]),/CROSS_TENANT/);
  assert.throws(()=>openInventory(encrypt([make(913,20)]).replace('"schema":"AIRTRUST_PLAYER3_AES256GCM_V1"','"schema":"BAD"'),KEY),/ENVELOPE_INVALID/);
  assert.throws(()=>reconcileRows([make(911,20),make(911,20)],[]),/DUPLICATE_ENROLLMENT/);
});
test('preserves 20%, 50%, 80%, 99% and never invents a resume unit or certification',()=>{
  const previous=[make(811,20),make(812,50),make(813,80),make(814,99)];
  const current=[make(811,50),make(812,80),make(813,99),make(814,99)];
  const plan=reconcileRows(previous,current);
  assert.deepEqual(plan.decisions.map(d=>d.historical_pct_to_preserve),[50,80,99,99]);
  assert.equal(plan.summary.dispositions.PROGRESS_ADVANCED_REVIEW,3);
  assert.equal(plan.summary.dispositions.UNCHANGED_REVIEW,1);
  for(const d of plan.decisions){
    assert.equal(d.may_apply_automatically,false);
    assert.equal(d.resume_unit_id,null);
    assert.equal(d.target_edition_sha256,null);
    assert.equal(d.grants_exam_pass,false);
    assert.equal(d.grants_completion,false);
    assert.equal(d.grants_certificate,false);
    assert.equal(d.grants_qualification,false);
    assert.equal(d.modifies_enrollment,false);
  }
});
test('never resets a regressed snapshot: old 99%, new 20% needs review',()=>{
  const d=reconcileRows([make(821,99)],[make(821,20)]).decisions[0];
  assert.equal(d.disposition,'PERCENT_REGRESSION_REVIEW');
  assert.equal(d.historical_pct_to_preserve,99);
  assert.equal(d.current_reported_pct,20);
});
test('blocks cycle drift, status drift, source version drift and stale timestamps',()=>{
  const a=make(831,80);
  assert.equal(reconcileRows([a],[{...a,ciclo_id:999}]).decisions[0].disposition,
    'CYCLE_CHANGED_REVIEW');
  assert.equal(reconcileRows([a],[{...a,matricula_status:'NAO_INICIADO',ciclo_status:'NAO_INICIADO'}])
    .decisions[0].disposition,'SOURCE_CONFLICT_REVIEW');
  assert.equal(reconcileRows([a],[{...a,curso_version_tag:'RC9'}])
    .decisions[0].disposition,'SOURCE_EDITION_CHANGED_REVIEW');
  assert.equal(reconcileRows([a],[{...a,matricula_updated_at:'2026-10-13 12:00:00'}])
    .decisions[0].disposition,'STALE_T1_REVIEW');
  assert.equal(reconcileRows([a],[{...a,ciclo_progresso_pct:17}])
    .decisions[0].disposition,'SOURCE_CONFLICT_REVIEW');
});
test('missing course and active catalog-package changes are human-review exceptions',()=>{
  const a=make(839,80);
  const missing={...a,tipo_conteudo:null,curso_version_tag:null};
  assert.equal(reconcileRows([a],[missing]).decisions[0].disposition,
    'MISSING_CATALOG_COURSE_REVIEW');
  const changed={...a,catalog_current_scorm_sha256:'test-sha-new'};
  assert.equal(reconcileRows([a],[changed]).decisions[0].disposition,
    'SOURCE_EDITION_CHANGED_REVIEW');
  assert.equal(reconcileRows([a],[changed]).decisions[0].catalog_package_is_cycle_verified,false);
});
test('does not infer completion from a missing active enrollment',()=>{
  const result=reconcileRows([make(841,80)],[]);
  assert.equal(result.summary.dispositions.MISSING_FROM_ACTIVE_INVENTORY_REVIEW,1);
  assert.equal(result.decisions[0].historical_pct_to_preserve,80);
  assert.equal(result.decisions[0].grants_completion,false);
  assert.equal(reconcileRows([],[make(842,0)]).decisions[0].disposition,
    'NEW_ENROLLMENT_REVIEW');
});
test('detects a new SCORM bookmark even if the percentage is unchanged',()=>{
  const a=make(851,80);
  const b={...a,scorm_suspend_data_PRIVATE:'{"a":"module_3"}'};
  assert.equal(reconcileRows([a],[b]).decisions[0].disposition,'EVIDENCE_UPDATED_REVIEW');
});
test('same-percent grades, attempts and lifecycle changes are never called unchanged',()=>{
  const a=make(853,80,{
    matricula_score_final:70,matricula_tentativas:1,
    ciclo_score_final:70,ciclo_tentativas:1,scorm_score_raw:70,
    scorm_id:314,matricula_data_inicio:'2026-10-12 12:00:00',
    matricula_data_conclusao:null,
  });
  const changed=[
    ['matricula_score_final',90],['matricula_tentativas',2],
    ['ciclo_score_final',90],['ciclo_tentativas',2],
    ['scorm_score_raw',90],['scorm_id',315],
    ['matricula_data_inicio','2026-10-13 12:00:00'],
    ['matricula_data_conclusao','2026-10-14 14:00:00'],
  ];
  for(const [field,value] of changed){
    const result=reconcileRows([a],[{...a,[field]:value}]);
    assert.equal(result.decisions[0].disposition,'EVIDENCE_UPDATED_REVIEW',field);
    assert.equal(result.decisions[0].grants_completion,false,field);
  }
  // Switching the active content transport requires edition review even
  // if a catalog revision tag was not correctly incremented.
  const transportChange=reconcileRows([a],[{...a,tipo_conteudo:'native'}]);
  assert.equal(transportChange.decisions[0].disposition,'SOURCE_EDITION_CHANGED_REVIEW');
});

test('preserves historic cycles for authorized tenant and detects same-percent history changes',()=>{
  const a=make(855,80,{ciclos_historicos_json_PRIVATE:JSON.stringify([
    {id:900,empresa_id:6,matricula_id:855,numero_ciclo:1,
      ciclo_atual:0,status:'CONCLUIDO',progresso_pct:100},
    {id:901,empresa_id:6,matricula_id:855,numero_ciclo:2,
      ciclo_atual:1,status:'EM_ANDAMENTO',progresso_pct:80},
  ])});
  assert.equal(open([a]).rows[0].ciclos_historicos_json_PRIVATE,
    a.ciclos_historicos_json_PRIVATE);
  const b={...a,ciclos_historicos_json_PRIVATE:a.ciclos_historicos_json_PRIVATE
    .replace('"progresso_pct":100','"progresso_pct":99')};
  assert.equal(reconcileRows([a],[b]).decisions[0].disposition,
    'EVIDENCE_UPDATED_REVIEW');
  const outsider={...a,ciclos_historicos_json_PRIVATE:a.ciclos_historicos_json_PRIVATE
    .replace('"empresa_id":6','"empresa_id":7')};
  assert.throws(()=>encrypt([outsider]),/CROSS_TENANT_OR_ENROLLMENT_CYCLE_HISTORY/);
});
test('historical cycle array ordering cannot create false advances or new decision keys',()=>{
  const h=[
    {id:905,empresa_id:6,matricula_id:856,numero_ciclo:2,progresso_pct:80},
    {id:904,empresa_id:6,matricula_id:856,numero_ciclo:1,progresso_pct:100},
  ];
  const a=make(856,80,{ciclos_historicos_json_PRIVATE:JSON.stringify(h)});
  const b={...a,ciclos_historicos_json_PRIVATE:JSON.stringify([...h].reverse())};
  const regular=reconcileRows([a],[a]).decisions[0];
  const reordered=reconcileRows([a],[b]).decisions[0];
  assert.equal(reordered.disposition,'UNCHANGED_REVIEW');
  assert.equal(regular.decision_key,reordered.decision_key);
  assert.equal(regular.latest_row_sha256,reordered.latest_row_sha256);
});
test('retry is idempotent for the same evidence without relying on ciphertext randomness',()=>{
  const a=[make(861,80)];
  const b=[make(861,99)];
  const first=reconcileRows(a,b);
  const retry=reconcileRows(a,b);
  assert.deepEqual(first,retry);
  assert.match(first.decisions[0].decision_key,/^[a-f0-9]{64}$/);
});
test('produces an encrypted private admin review plan with no individual data in aggregate output',()=>{
  const t0=open([make(871,80)]),t1=open([make(871,99)]);
  const plan=reconcileInventories(t0,t1);
  assert.equal(plan.summary.reconciled_keys,1);
  assert.equal(plan.summary.contains_individual_data,false);
  const text=sealReconciliation(plan,KEY,t0.key_id);
  assert.ok(!text.includes('"matricula_id":871'));
  assert.ok(!text.includes('"original_progress_pct":99'));
  const e=JSON.parse(text),cipher=createDecipheriv('aes-256-gcm',KEY,Buffer.from(e.iv_b64,'base64'));
  cipher.setAAD(Buffer.from('AIRTRUST_PLAYER3_PRIVATE_RECONCILIATION_V1:'+e.key_id));
  cipher.setAuthTag(Buffer.from(e.tag_b64,'base64'));
  const clear=JSON.parse(Buffer.concat([cipher.update(Buffer.from(e.ciphertext_b64,'base64')),cipher.final()]).toString());
  assert.equal(clear.decisions[0].historical_pct_to_preserve,99);
  assert.equal(clear.decisions[0].matricula_id,871);
  assert.equal(clear.decisions[0].requires_independent_admin_review,true);
  assert.equal(clear.intent,'ADMIN_REVIEW_ONLY_NO_WRITES_NO_CERTIFICATION');
});
test('private CLI reconciles encrypted T0/T1 end-to-end without overwrite or PII stdout',()=>{
  const dir=mkdtempSync(join(tmpdir(),'player3-c-fixture-'));
  try {
    const t0=join(dir,'t0.enc.json'),t1=join(dir,'t1.enc.json');
    const out=join(dir,'review.enc.json');
    writeFileSync(t0,encrypt([make(889,50)]),{mode:0o600});
    writeFileSync(t1,encrypt([make(889,80)]),{mode:0o600});
    const args=[fileURLToPath(new URL('./player3-reconcile-encrypted-inventories.mjs',import.meta.url)),
      '--t0',t0,'--t1',t1,'--out',out];
    const options={env:{...process.env,AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64:KEY.toString('base64')},
      stdio:['ignore','pipe','pipe']};
    const stdout=execFileSync(process.execPath,args,options).toString('utf8');
    const summary=JSON.parse(stdout);
    assert.equal(summary.dispositions.PROGRESS_ADVANCED_REVIEW,1);
    assert.equal(summary.mutations,0);
    assert.ok(!stdout.includes('"matricula_id":889'));
    const encrypted=readFileSync(out,'utf8');
    assert.equal(JSON.parse(encrypted).schema,'AIRTRUST_PLAYER3_ENCRYPTED_RECONCILIATION_V1');
    assert.equal(statSync(out).mode&0o777,0o600);
    assert.throws(()=>execFileSync(process.execPath,args,options));
    assert.equal(readFileSync(out,'utf8'),encrypted);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('rejects reversed T0/T1 time, changed key identity, and older SCORM commit',()=>{
  const t0=open([make(881,80)]),t1=open([make(881,99)]);
  const futureT0=new Date(Date.parse(t1.extracted_utc)+60_000).toISOString();
  assert.throws(()=>reconcileInventories({...t0,extracted_utc:futureT0},t1),
    /SNAPSHOT_ORDER_INVALID/);
  assert.throws(()=>reconcileInventories(t0,{...t1,key_id:'other-key'}),
    /KEY_ID_CHANGED/);
  const old=make(881,80);
  const next={...make(881,99),scorm_last_commit_at:'2026-10-13 23:59:59'};
  assert.equal(reconcileRows([old],[next]).decisions[0].disposition,'STALE_T1_REVIEW');
});
