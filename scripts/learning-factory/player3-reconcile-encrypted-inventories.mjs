#!/usr/bin/env node
/**
 * Player 3, Front C: offline T0/T1 reconciliation of PRIVATE encrypted D1
 * inventory files. No network, no DB writes, no automatic learning credit.
 * Individual records are emitted only inside a new AES-256-GCM sealed file.
 */
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {readFileSync,openSync,writeFileSync,closeSync,constants} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeD1Rows} from './player3-seal-active-inventory.mjs';

const TENANT=6;
const SHA=/^[a-f0-9]{64}$/;
const stamp=(v)=>v==null?null:Date.parse(v.replace(' ','T')+(v.includes('Z')?'':'Z'));
const digest=(v)=>createHash('sha256').update(v).digest('hex');
const stable=(v)=>JSON.stringify(v,(_key,obj)=>
  obj && !Array.isArray(obj) && typeof obj==='object'
    ? Object.fromEntries(Object.keys(obj).sort().map(k=>[k,obj[k]])):obj);
const fail=(code)=>{throw new Error('PLAYER3_RECONCILE_'+code);};
const validDate=(v)=>typeof v==='string' && Number.isFinite(stamp(v));

/** Decrypt only on a controlled, access-limited executor; never log rows. */
export function openInventory(sealedText,key) {
  if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY_INVALID');
  let envelope;
  try {envelope=JSON.parse(sealedText);}catch {fail('ENVELOPE_INVALID');}
  if(envelope?.schema!=='AIRTRUST_PLAYER3_AES256GCM_V1' ||
      typeof envelope.key_id!=='string' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(envelope.key_id) ||
      !SHA.test(envelope.sha256_ciphertext) ||
      typeof envelope.iv_b64!=='string' ||
      typeof envelope.tag_b64!=='string' ||
      typeof envelope.ciphertext_b64!=='string')fail('ENVELOPE_INVALID');
  const ciphertext=Buffer.from(envelope.ciphertext_b64,'base64');
  const iv=Buffer.from(envelope.iv_b64,'base64');
  const tag=Buffer.from(envelope.tag_b64,'base64');
  if(iv.length!==12||tag.length!==16||
      digest(ciphertext)!==envelope.sha256_ciphertext)fail('CIPHERTEXT_INVALID');
  let plain;
  try{
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(Buffer.from('AIRTRUST_PLAYER3_PRIVATE_INVENTORY_V1:'+envelope.key_id));
    decipher.setAuthTag(tag);
    plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
    const doc=JSON.parse(plain.toString('utf8'));
    if(doc?.schema!=='AIRTRUST_PLAYER3_PRIVATE_INVENTORY_V1' ||
       doc.authorized_tenant_id!==TENANT ||
       doc.purpose!=='RESUME_ONLY_NOT_COMPLETION' ||
       doc.source_contract!=='player3-active-enrollments-readonly.sql' ||
       !validDate(doc.extracted_utc))fail('SOURCE_CONTRACT_INVALID');
    // Reapply the sealing boundary, including full row count and tenant check.
    const rows=normalizeD1Rows([{results:doc.rows}]);
    return {rows,extracted_utc:doc.extracted_utc,
      key_id:envelope.key_id,artifact_sha256:digest(sealedText)};
  }catch(error){
    if(error?.message?.startsWith('PLAYER3_'))throw error;
    fail('DECRYPT_OR_AUTH_FAILED');
  }finally{plain?.fill(0);}
}
// SQLite json_group_array has no guaranteed ordering without an explicit
// aggregate order. Canonicalize private history before diff/idempotency hashing.
function canonicalRow(row){
  const raw=row.ciclos_historicos_json_PRIVATE;
  if(raw===undefined||raw===null)return row;
  if(typeof raw!=='string')fail('CYCLE_HISTORY_INVALID');
  let history;
  try{history=JSON.parse(raw);}catch{fail('CYCLE_HISTORY_INVALID');}
  if(!Array.isArray(history)||history.length>1000)fail('CYCLE_HISTORY_INVALID');
  const ids=new Set();
  for(const entry of history){
    if(!entry || !Number.isSafeInteger(entry.id)||entry.id<=0 ||
      entry.empresa_id!==row.empresa_id ||
      entry.matricula_id!==row.matricula_id ||
      ids.has(entry.id))fail('CYCLE_HISTORY_SCOPE_INVALID');
    ids.add(entry.id);
  }
  return {...row,ciclos_historicos_json_PRIVATE:stable(
    [...history].sort((a,b)=>a.id-b.id))};
}
const rowKey=(row)=>row.empresa_id+':'+row.matricula_id;
function indexRows(rows){
  const map=new Map();
  for(const row of rows){
    if(row.empresa_id!==TENANT)fail('TENANT_MISMATCH');
    const k=rowKey(row);
    if(map.has(k))fail('DUPLICATE_ENROLLMENT');
    if(typeof row.matricula_progresso_pct!=='number' ||
      !Number.isFinite(row.matricula_progresso_pct) ||
      row.matricula_progresso_pct<0 || row.matricula_progresso_pct>100)
      fail('PERCENT_INVALID');
    map.set(k,canonicalRow(row));
  }
  return map;
}
const cycleBad=(r)=>!r || !Number.isSafeInteger(r.ciclo_id) ||
  r.ciclo_id<1 || !Number.isSafeInteger(r.ciclo_numero) ||
  r.ciclo_numero<1 || r.ciclo_atual!==1 ||
  r.ciclo_status!==r.matricula_status ||
  (r.ciclo_progresso_pct!=null && r.ciclo_progresso_pct!==r.matricula_progresso_pct) ||
  (r.matricula_status==='NAO_INICIADO' && r.matricula_progresso_pct>0);
const older=(before,now)=>before!=null &&
  (now==null||!validDate(before)||!validDate(now)||stamp(now)<stamp(before));
// Detect changes to canonical scoring, attempts, and lifecycle evidence even
// when the displayed percentage and bookmark stay fixed. Never classify an
// altered grade as unchanged ahead of independent administrative review.
const changedEvidence=(a,b)=>[
  'matricula_updated_at','ciclo_updated_at','scorm_last_commit_at',
  'matricula_score_final','matricula_tentativas',
  'matricula_data_inicio','matricula_data_conclusao',
  'ciclo_score_final','ciclo_tentativas',
  'scorm_id','scorm_score_raw',
  'ultimo_slide','ultima_pagina','scorm_suspend_data_PRIVATE',
  'scorm_cmi_json_PRIVATE','xapi_statement_count','xapi_last_event_at',
  'scorm_lesson_status','scorm_completion_status','scorm_success_status',
  'ciclos_historicos_json_PRIVATE',
].some(k=>a[k]!==b[k]);

/**
 * Dry-run: retain both historical and latest percentages; a book-mark is
 * evidence for human review, never proof of unit visit, exam or completion.
 */
export function reconcileRows(t0Rows,t1Rows){
  const old=indexRows(t0Rows),latest=indexRows(t1Rows);
  const ids=[...new Set([...old.keys(),...latest.keys()])].sort();
  const result=[];
  const totals={};
  for(const id of ids){
    const a=old.get(id),b=latest.get(id);
    let disposition;
    if(!b)disposition='MISSING_FROM_ACTIVE_INVENTORY_REVIEW';
    else if(!b.tipo_conteudo || (a && !a.tipo_conteudo))
      disposition='MISSING_CATALOG_COURSE_REVIEW';
    else if(!a)disposition='NEW_ENROLLMENT_REVIEW';
    else if(a.empresa_id!==b.empresa_id ||
      a.funcionario_id!==b.funcionario_id || a.curso_id!==b.curso_id)
      disposition='IDENTITY_CONFLICT_REVIEW';
    else if(a.ciclo_id!==b.ciclo_id || a.ciclo_numero!==b.ciclo_numero)
      disposition='CYCLE_CHANGED_REVIEW';
    else if(cycleBad(a)||cycleBad(b))disposition='SOURCE_CONFLICT_REVIEW';
    else if(a.tipo_conteudo!==b.tipo_conteudo ||
      a.curso_version_tag!==b.curso_version_tag ||
      a.scorm_versao!==b.scorm_versao ||
      a.catalog_current_scorm_sha256!==b.catalog_current_scorm_sha256 ||
      a.catalog_current_scorm_version!==b.catalog_current_scorm_version)
      disposition='SOURCE_EDITION_CHANGED_REVIEW';
    else if(a.matricula_status!==b.matricula_status)
      disposition='STATUS_CHANGED_REVIEW';
    else if(older(a.matricula_updated_at,b.matricula_updated_at) ||
      older(a.ciclo_updated_at,b.ciclo_updated_at) ||
      older(a.scorm_last_commit_at,b.scorm_last_commit_at))
      disposition='STALE_T1_REVIEW';
    else if(b.matricula_progresso_pct<a.matricula_progresso_pct)
      disposition='PERCENT_REGRESSION_REVIEW';
    else if(b.matricula_progresso_pct>a.matricula_progresso_pct)
      disposition='PROGRESS_ADVANCED_REVIEW';
    else if(changedEvidence(a,b))disposition='EVIDENCE_UPDATED_REVIEW';
    else disposition='UNCHANGED_REVIEW';
    const row=b??a;
    const previousPct=a?.matricula_progresso_pct??null;
    const currentPct=b?.matricula_progresso_pct??null;
    const historicalPct=Math.max(previousPct??0,currentPct??0);
    // This identifier is stable across equivalent retries; it is PRIVATE.
    const decisionKey=digest('PLAYER3_CUTOVER_PLAN_V1:'+stable({
      empresa_id:row.empresa_id,matricula_id:row.matricula_id,
      ciclo_id:row.ciclo_id,old:a??null,current:b??null,
    }));
    result.push({
      decision_key:decisionKey,empresa_id:row.empresa_id,
      matricula_id:row.matricula_id,funcionario_id:row.funcionario_id,
      curso_id:row.curso_id,ciclo_id:row.ciclo_id,
      ciclo_numero:row.ciclo_numero,source_version_tag:row.curso_version_tag,
      scorm_version:row.scorm_versao,
      catalog_current_scorm_sha256:row.catalog_current_scorm_sha256??null,
      catalog_current_scorm_version:row.catalog_current_scorm_version??null,
      catalog_package_is_cycle_verified:false,disposition,
      previous_reported_pct:previousPct,current_reported_pct:currentPct,
      historical_pct_to_preserve:historicalPct,
      prior_row_sha256:a?digest(stable(a)):null,
      latest_row_sha256:b?digest(stable(b)):null,
      source_updated_at:b?.matricula_updated_at??null,
      scorm_last_commit_at:b?.scorm_last_commit_at??null,
      target_edition_sha256:null,resume_unit_id:null,
      requires_source_edition_verification:true,
      requires_independent_admin_review:true,
      may_apply_automatically:false,
      modifies_enrollment:false,grants_exam_pass:false,
      grants_completion:false,grants_qualification:false,
      grants_certificate:false,
    });
    totals[disposition]=(totals[disposition]??0)+1;
  }
  return {decisions:result,summary:{
    t0_enrollments:t0Rows.length,t1_enrollments:t1Rows.length,
    reconciled_keys:result.length,dispositions:totals,
    contains_individual_data:false,has_automatic_migration:false,
    mutations:0,grants_completion:false,grants_certificate:false,
  }};
}
export function reconcileInventories(t0,t1){
  if(t0.key_id!==t1.key_id)fail('KEY_ID_CHANGED');
  if(!validDate(t0.extracted_utc)||!validDate(t1.extracted_utc) ||
      stamp(t1.extracted_utc)<stamp(t0.extracted_utc))fail('SNAPSHOT_ORDER_INVALID');
  const result=reconcileRows(t0.rows,t1.rows);
  return {...result,provenance:{
    t0_sha256:t0.artifact_sha256,t1_sha256:t1.artifact_sha256,
    t0_extracted_utc:t0.extracted_utc,t1_extracted_utc:t1.extracted_utc,
    source_contract:'player3-active-enrollments-readonly.sql',
    authorized_tenant_id:TENANT,
  }};
}
export function sealReconciliation(plan,key,keyId) {
  if(!Buffer.isBuffer(key)||key.length!==32||typeof keyId!=='string' ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(keyId))fail('KEY_INVALID');
  const plaintext=Buffer.from(JSON.stringify({
    schema:'AIRTRUST_PLAYER3_PRIVATE_RECONCILIATION_V1',
    intent:'ADMIN_REVIEW_ONLY_NO_WRITES_NO_CERTIFICATION',...plan,
  }));
  try {
    const iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from('AIRTRUST_PLAYER3_PRIVATE_RECONCILIATION_V1:'+keyId));
    const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    return JSON.stringify({
      schema:'AIRTRUST_PLAYER3_ENCRYPTED_RECONCILIATION_V1',
      key_id:keyId,iv_b64:iv.toString('base64'),
      tag_b64:cipher.getAuthTag().toString('base64'),
      ciphertext_b64:ciphertext.toString('base64'),
      sha256_ciphertext:digest(ciphertext),
    })+'\n';
  }finally{plaintext.fill(0);}
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==6 || args[0]!=='--t0' || args[2]!=='--t1' ||
    args[4]!=='--out')fail('USAGE');
  const [t0Path,t1Path,out]=[args[1],args[3],args[5]];
  if(![t0Path,t1Path,out].every(isAbsolute) ||
    resolve(out).includes('/SAAS/Airtrust/') || resolve(out).includes('/.git/') ||
    new Set([resolve(t0Path),resolve(t1Path),resolve(out)]).size!==3)
    fail('UNSAFE_PATH');
  const raw=process.env.AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64;
  if(typeof raw!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(raw))fail('KEY_REQUIRED');
  const key=Buffer.from(raw,'base64');
  if(key.length!==32)fail('KEY_INVALID');
  const t0=openInventory(readFileSync(t0Path,'utf8'),key);
  const t1=openInventory(readFileSync(t1Path,'utf8'),key);
  const plan=reconcileInventories(t0,t1);
  const sealed=sealReconciliation(plan,key,t0.key_id);
  const fd=openSync(out,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
    (constants.O_NOFOLLOW??0),0o600);
  try{writeFileSync(fd,sealed,'utf8');}finally{closeSync(fd);}
  process.stdout.write(JSON.stringify({...plan.summary,encrypted:true,
    reconciliation_sha256:digest(sealed)})+'\n');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{
    const code=typeof error?.message==='string' &&
      error.message.startsWith('PLAYER3_')?error.message:'PLAYER3_RECONCILE_FAILED';
    process.stderr.write(code+'\n');process.exitCode=1;
  });
