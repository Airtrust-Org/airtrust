#!/usr/bin/env node
/**
 * Player 3 — seal a PRIVILEGED, READ-ONLY D1 inventory (provided on stdin).
 * This tool never connects to production, never changes a database and never
 * emits individual employee/enrollment IDs or plaintext CMI in stdout.
 *
 * The input must come from the reviewed SELECT contract in
 * player3-active-enrollments-readonly.sql via an authorized export process.
 * Do NOT store that plaintext input in GitHub or a shared workspace.
 */
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {openSync,writeFileSync,closeSync,constants} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';

const assert=(p,code)=>{if(!p) throw new Error('PLAYER3_INVENTORY_'+code);};
// Exact authorized tenant. Separate tenant requires separate reviewed workflow.
const AUTHORIZED_TENANT_ID=6;
export function normalizeD1Rows(input){
  const decoded=typeof input==='string'?JSON.parse(input):input;
  const blocks=Array.isArray(decoded)?decoded:[decoded];
  assert(blocks.length>0 && blocks.length<=1000,'INVALID_RESULT_BLOCKS');
  const rows=[];
  for(const block of blocks){
    assert(block && Array.isArray(block.results),'INVALID_D1_RESPONSE');
    for(const r of block.results){
      assert(r && typeof r==='object'&&!Array.isArray(r),'INVALID_ROW');
      for(const col of ['empresa_id','matricula_id','curso_id','funcionario_id']){
        assert(Number.isSafeInteger(r[col]) && r[col]>0,'INVALID_ID_'+col);
      }
      assert(r.empresa_id===AUTHORIZED_TENANT_ID,'CROSS_TENANT_EXTRACT_REJECTED');
      assert(['EM_ANDAMENTO','NAO_INICIADO'].includes(r.matricula_status),'INVALID_STATUS');
      assert(typeof r.matricula_progresso_pct==='number' &&
        r.matricula_progresso_pct>=0 && r.matricula_progresso_pct<=100,
      'INVALID_PERCENT');
      assert(r.ciclo_id===null || (Number.isSafeInteger(r.ciclo_id)&&r.ciclo_id>0),'INVALID_CYCLE');
      assert(r.scorm_suspend_data_PRIVATE==null ||
        typeof r.scorm_suspend_data_PRIVATE==='string','INVALID_BOOKMARK');
      assert(r.scorm_cmi_json_PRIVATE==null ||
        typeof r.scorm_cmi_json_PRIVATE==='string','INVALID_CMI');
      // History stays private and must remain in the same tenant/enrollment.
      if(r.ciclos_historicos_json_PRIVATE!==undefined &&
         r.ciclos_historicos_json_PRIVATE!==null){
        assert(typeof r.ciclos_historicos_json_PRIVATE==='string','INVALID_CYCLE_HISTORY');
        let history;
        try{history=JSON.parse(r.ciclos_historicos_json_PRIVATE);}catch{
          assert(false,'INVALID_CYCLE_HISTORY_JSON');
        }
        assert(Array.isArray(history)&&history.length<=1000,'INVALID_CYCLE_HISTORY');
        const ids=new Set();
        for(const cycle of history){
          assert(cycle && Number.isSafeInteger(cycle.id) && cycle.id>0 &&
            cycle.empresa_id===r.empresa_id && cycle.matricula_id===r.matricula_id,
            'CROSS_TENANT_OR_ENROLLMENT_CYCLE_HISTORY');
          assert(!ids.has(cycle.id),'DUPLICATE_CYCLE_HISTORY');
          ids.add(cycle.id);
        }
      }
      rows.push(r);
    }
  }
  assert(rows.length<=100000,'TOO_MANY_ENROLLMENTS');
  // D1/transport truncation must never silently discard students.
  // The SELECT includes COUNT(*) OVER () for the identical tenant/status scope.
  assert(rows.length>0,'EMPTY_SNAPSHOT_REQUIRES_INDEPENDENT_COUNT');
  assert(rows.every(r=>Number.isSafeInteger(r.inventory_total_expected) &&
    r.inventory_total_expected===rows.length),'INCOMPLETE_EXPORT');
  return rows;
}
export function summarize(rows){
  const identities=new Set(),tenants=new Set(),courses=new Set();
  let active=0,unstarted=0,conflicts=0,bookmarks=0,xapi=0;
  for(const row of rows){
    const id=row.empresa_id+':'+row.matricula_id;
    if(identities.has(id)) conflicts++;
    identities.add(id);
    tenants.add(row.empresa_id);
    courses.add(row.empresa_id+':'+row.curso_id);
    if(row.matricula_status==='EM_ANDAMENTO')active++;
    else unstarted++;
    if(row.ciclo_id==null || row.ciclo_status!==row.matricula_status ||
      row.ciclo_atual!==1 ||
      (row.ciclo_progresso_pct!=null &&
        Number(row.ciclo_progresso_pct)!==Number(row.matricula_progresso_pct))) conflicts++;
    if(row.scorm_suspend_data_PRIVATE||row.scorm_cmi_json_PRIVATE) bookmarks++;
    if(Number.isSafeInteger(row.xapi_statement_count)&&row.xapi_statement_count>0)xapi++;
  }
  return {
    enrollments:rows.length,active,unstarted,tenants:tenants.size,
    courses:courses.size,conflicts,with_scorm_resume_state:bookmarks,
    with_xapi_events:xapi,
    contains_individual_data:false,
  };
}
export function sealInventory(rows,key,keyId='player3-private'){
  assert(Array.isArray(rows) && rows.every(r=>r.empresa_id===AUTHORIZED_TENANT_ID),
    'CROSS_TENANT_EXTRACT_REJECTED');
  assert(rows.length>0 && rows.every(r=>r.inventory_total_expected===rows.length),
    'INCOMPLETE_EXPORT');
  assert(Buffer.isBuffer(key)&&key.length===32,'INVALID_KEY');
  assert(typeof keyId==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(keyId),'INVALID_KEY_ID');
  const summary=summarize(rows);
  const envelope={schema:'AIRTRUST_PLAYER3_PRIVATE_INVENTORY_V1',
    extracted_utc:new Date().toISOString(),source_contract:'player3-active-enrollments-readonly.sql',
    purpose:'RESUME_ONLY_NOT_COMPLETION',authorized_tenant_id:AUTHORIZED_TENANT_ID,
    rows,
  };
  const clear=Buffer.from(JSON.stringify(envelope),'utf8');
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('AIRTRUST_PLAYER3_PRIVATE_INVENTORY_V1:'+keyId,'utf8'));
  const ciphertext=Buffer.concat([cipher.update(clear),cipher.final()]);
  const out={
    schema:'AIRTRUST_PLAYER3_AES256GCM_V1',
    key_id:keyId,iv_b64:iv.toString('base64'),
    tag_b64:cipher.getAuthTag().toString('base64'),
    ciphertext_b64:ciphertext.toString('base64'),
    sha256_ciphertext:createHash('sha256').update(ciphertext).digest('hex'),
  };
  clear.fill(0);
  return {sealed:JSON.stringify(out)+'\n',summary};
}
async function main(){
  const args=process.argv.slice(2);
  assert(args.length===2&&args[0]==='--out','USAGE');
  const dest=args[1];
  assert(isAbsolute(dest),'OUTPUT_MUST_BE_ABSOLUTE');
  assert(!resolve(dest).includes('/.git/')&&!resolve(dest).includes('/SAAS/Airtrust/'),
    'OUTPUT_MUST_BE_OUTSIDE_REPO');
  const rawKey=process.env.AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64;
  assert(typeof rawKey==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(rawKey),'KEY_REQUIRED');
  const key=Buffer.from(rawKey,'base64');
  assert(key.length===32,'KEY_SIZE');
  const chunks=[];let bytes=0;
  for await(const chunk of process.stdin){
    bytes+=chunk.length;assert(bytes<=90*1024*1024,'INPUT_TOO_LARGE');chunks.push(chunk);
  }
  const rows=normalizeD1Rows(Buffer.concat(chunks).toString('utf8'));
  const result=sealInventory(rows,key,process.env.AIRTRUST_PLAYER3_SNAPSHOT_KEY_ID??'player3-private');
  const fd=openSync(dest,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
  try{writeFileSync(fd,result.sealed,{encoding:'utf8'});}finally{closeSync(fd);}
  process.stdout.write(JSON.stringify({
    ...result.summary,
    encrypted:true,readonly:true,mutations:0,
    snapshot_sha256:createHash('sha256').update(result.sealed).digest('hex'),
  })+'\n');
}
if(process.argv[1] && import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
  main().catch(error=>{process.stderr.write((error?.message||'PLAYER3_INVENTORY_FAILED')+'\n');
    process.exitCode=1;});
}
